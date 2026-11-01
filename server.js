import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';
import { OpenAI } from 'openai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// Database Connection
const { Pool } = pg;
const db = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false }
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- INGESTION LOGIC ---
async function ingestCase(url) {
  try {
    console.log(`Fetching: ${url}`);
    const response = await gotScraping(url);
    const $ = cheerio.load(response.body);
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    const chunks = text.match(/[\s\S]{1,1000}/g) || [text]; 

    for (const chunk of chunks) {
      if (chunk.trim().length < 50) continue;
      
      console.log("Bypassing OpenAI. Generating dummy vector...");
      const embedding = new Array(1536).fill(0); 

      await db.query(
        `INSERT INTO case_law_chunks (case_url, chunk_text, embedding) VALUES ($1, $2, $3)`,
        [url, chunk, JSON.stringify(embedding)]
      );
    }
    console.log(`Successfully ingested: ${url}`);
  } catch (error) {
    console.error(`Failed to ingest ${url}:`, error.message);
  }
}

// --- ROUTES ---

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// 1. Batch Scraper Route
app.get('/api/ingest', async (req, res) => {
  try {
    await db.query('CREATE EXTENSION IF NOT EXISTS vector;');
    await db.query(`
      CREATE TABLE IF NOT EXISTS case_law_chunks (
        id SERIAL PRIMARY KEY,
        case_url TEXT,
        chunk_text TEXT,
        embedding vector(1536)
      );
    `);
    
    res.send("Law Library Batch Ingestion started! Check the Render logs.");
    
    const urlsToIngest = [
      'https://www.saflii.org/za/cases/ZACC/1995/3.html',   
      'https://www.saflii.org/za/cases/ZACC/2001/6.html',   
      'https://www.saflii.org/za/cases/ZACC/2007/13.html',  
      'https://www.saflii.org/za/cases/ZASCA/2020/12.html', 
      'https://www.saflii.org/za/cases/ZALAC/2006/12.html', 
      'https://www.saflii.org/za/cases/ZACC/2012/13.html',  
      'https://www.saflii.org/za/cases/ZACC/2020/1.html'    
    ];

    for (const url of urlsToIngest) {
      await ingestCase(url);
      console.log("Sleeping for 5 seconds...");
      await new Promise(r => setTimeout(r, 5000)); 
    }
    console.log("Batch ingestion complete.");
  } catch (error) {
    console.error("Batch ingestion error:", error);
  }
});

// 2. Search Route
app.post('/api/search', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });
  try {
    const result = await db.query(
      `SELECT DISTINCT case_url FROM case_law_chunks WHERE chunk_text ILIKE $1 LIMIT 10`,
      [`%${query}%`]
    );
    const cases = result.rows.map(row => ({ url: row.case_url }));
    res.json(cases);
  } catch (error) {
    res.status(500).json({ error: "Search failed." });
  }
});

// 3. AI Drafting Route
app.post('/api/draft', async (req, res) => {
    const { prompt, agentType } = req.body; 
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    
    try {
        let systemPrompt = "You are an expert South African legal AI. Draft highly professional legal documents.";
        if (agentType === 'litigation') systemPrompt = "You are an expert South African litigator. Draft a formal legal document based on facts.";
        if (agentType === 'research') systemPrompt = "You are a South African legal researcher. Summarize case law clearly.";
        if (agentType === 'review') systemPrompt = "You are a senior South African attorney. Review the clause for risks.";

        const deepseekResponse = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }]
            })
        });

        const data = await deepseekResponse.json();
        res.json({ success: true, draft: data.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ error: "Failed to draft document." });
    }
});

// 4. Ludus Simulation Route
app.post('/api/simulate', async (req, res) => {
    const { profession, scenarioType, message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });
    
    try {
        let systemPrompt = `You are an AI client in a professional simulation for the field of: ${profession}. Scenario: ${scenarioType}. Respond realistically.`;
        systemPrompt += " \n\nAt the very end, add: '--- EXAMINER NOTE: [Score out of 10 and explain why based on industry standards]'.";

        const deepseekResponse = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: message }]
            })
        });

        const data = await deepseekResponse.json();
        res.json({ reply: data.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ error: "Failed to simulate scenario." });
    }
});

// 5. Perplexity Live Research Route
app.post('/api/live-research', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`
      },
      body: JSON.stringify({
        model: "sonar", 
        messages: [
            { role: "system", content: "You are a South African legal research assistant. Provide accurate, cited answers based on the latest available case law." },
            { role: "user", content: query }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Perplexity failed");
    
    res.json({ answer: data.choices[0].message.content });
  } catch (error) {
    console.error("Perplexity Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Start Server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
