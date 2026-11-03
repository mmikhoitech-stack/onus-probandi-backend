import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// Database Connection
const { Pool } = pg;
const db = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false }
});

// --- INGESTION LOGIC (The Data Factory) ---
async function ingestUrl(url, sourceType) {
  try {
    console.log(`Fetching [${sourceType}]: ${url}`);
    const response = await gotScraping(url);
    const $ = cheerio.load(response.body);
    
    // Basic text extraction (will need specific rules for different sites later)
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    const chunks = text.match(/[\s\S]{1,1000}/g) || [text]; 

    for (const chunk of chunks) {
      if (chunk.trim().length < 50) continue;
      
      const embedding = new Array(1536).fill(0); 

      await db.query(
        `INSERT INTO case_law_chunks (case_url, chunk_text, embedding) VALUES ($1, $2, $3)`,
        [`[${sourceType}] ${url}`, chunk, JSON.stringify(embedding)]
      );
    }
    console.log(`Successfully ingested [${sourceType}]: ${url}`);
  } catch (error) {
    console.error(`Failed to ingest ${url}:`, error.message);
  }
}

// --- ROUTES ---

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// 1. THE DATA FACTORY TRIGGER
app.get('/api/ingest-all', async (req, res) => {
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
    
    res.send("Data Factory started! Check Render logs. This will take a few minutes.");
    
    // YOUR PLANNED SOURCES
    const sourcesToIngest = [
      { type: 'SAFLII', url: 'https://www.saflii.org/za/cases/ZACC/1995/3.html' }, // Makwanyane
      { type: 'SAFLII', url: 'https://www.saflii.org/za/cases/ZACC/2007/13.html' }, // Sidumo
      { type: 'SAFLII', url: 'https://www.saflii.org/za/cases/ZACC/2020/1.html' },  // AMCU
      { type: 'SAFLII', url: 'https://www.saflii.org/za/cases/ZALAC/2006/12.html' },// Labour Court
      // LAW GUIDE (Test URL - might require specific scraping rules later)
      { type: 'LawGuide', url: 'https://lawguide.co.za/legal-guides/employment-law/' } 
    ];

    for (const source of sourcesToIngest) {
      await ingestUrl(source.url, source.type);
      console.log("Sleeping 5s to respect servers...");
      await new Promise(r => setTimeout(r, 5000)); 
    }
    console.log("Batch ingestion complete. Data Factory is growing.");
  } catch (error) {
    console.error("Batch ingestion error:", error);
  }
});

// 2. DEEPSEEK LIVE RESEARCH (Free Web Search)
app.post('/api/live-research', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });

  try {
    const searchResponse = await fetch('https://api.deepseek.com/v1/tools/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ query: query, count: 5, need_content: true })
    });

    const searchData = await searchResponse.json();
    if (!searchResponse.ok) throw new Error(searchData.error?.message || "Search failed");

    const resultsText = searchData.results.map(r => `Title: ${r.title}\nURL: ${r.url}\nSummary: ${r.summary || r.snippet}`).join('\n\n');

    const chatResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a South African legal research assistant. Answer the question using ONLY the provided search results. Cite URLs." },
          { role: "user", content: `Search Results:\n${resultsText}\n\nQuestion: ${query}` }
        ]
      })
    });

    const chatData = await chatResponse.json();
    res.json({ answer: chatData.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. AI DRAFTING
app.post('/api/draft', async (req, res) => {
    const { prompt, agentType } = req.body; 
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    try {
        let systemPrompt = "You are an expert South African legal AI. Draft highly professional legal documents.";
        if (agentType === 'litigation') systemPrompt = "You are an expert South African litigator.";
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }]
            })
        });
        const data = await response.json();
        res.json({ success: true, draft: data.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ error: "Failed to draft document." });
    }
});

// 4. DATABASE SEARCH
app.post('/api/search', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });
  try {
    const result = await db.query(
      `SELECT DISTINCT case_url FROM case_law_chunks WHERE chunk_text ILIKE $1 LIMIT 10`,
      [`%${query}%`]
    );
    res.json(result.rows.map(row => ({ url: row.case_url })));
  } catch (error) {
    res.status(500).json({ error: "Search failed." });
  }
});

// 5. LUDUS SIMULATOR
app.post('/api/simulate', async (req, res) => {
    const { profession, scenarioType, message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });
    try {
        let systemPrompt = `You are an AI client in a ${profession} simulation (${scenarioType}). Respond realistically.`;
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: message }]
            })
        });
        const data = await response.json();
        res.json({ reply: data.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ error: "Failed to simulate scenario." });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
