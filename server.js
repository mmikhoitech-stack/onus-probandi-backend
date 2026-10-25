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

// Database Pool
const { Pool } = pg;
const db = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false }
});

// OpenAI (Bypassed for now)
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
      
      // BYPASS OPENAI BILLING
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
    res.send("Ingestion started! Check the Render logs to see the progress.");
    ingestCase('https://www.saflii.org/za/cases/ZACC/2023/12.html').then(() => {
      console.log('Background ingestion complete.');
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// --- THE NEW RAG DRAFTING ROUTE ---
app.post('/api/draft', async (req, res) => {
    const { prompt, agentType } = req.body; 
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    if (!DEEPSEEK_API_KEY) return res.status(500).json({ error: 'DEEPSEEK_API_KEY is not configured.' });

    try {
        // 1. Retrieve relevant case law from the database
        // Since we used dummy vectors, we just grab the most recent chunks for now
        const dbResult = await db.query('SELECT chunk_text FROM case_law_chunks LIMIT 3');
        
        let retrievedCases = "No cases found in database.";
        if (dbResult.rows.length > 0) {
            retrievedCases = dbResult.rows.map(row => row.chunk_text).join('\n\n');
        }

        // 2. Set the AI Persona
        let systemPrompt = "You are an expert South African legal AI. Draft highly professional legal documents. Use the provided case law context to support your draft.";
        if (agentType === 'litigation') systemPrompt = "You are an expert South African litigator. Draft a formal legal document based on facts. Use the provided case law to support your argument.";
        if (agentType === 'research') systemPrompt = "You are a South African legal researcher. Summarize the provided case law clearly.";
        if (agentType === 'review') systemPrompt = "You are a senior South African attorney. Review the clause for risks using the provided case law.";

        // 3. Send to DeepSeek
        const deepseekResponse = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: systemPrompt }, 
                    { role: "user", content: `Here is the retrieved case law context:\n\n${retrievedCases}\n\nBased on this law, please draft: ${prompt}` }
                ]
            })
        });

        if (!deepseekResponse.ok) throw new Error(`DeepSeek API failed: ${deepseekResponse.status}`);
        const deepseekData = await deepseekResponse.json();
        const draftedDocument = deepseekData.choices[0].message.content;

        // 4. Send BOTH the cases and the draft back to the frontend
        res.json({ 
            success: true, 
            cases_retrieved: retrievedCases, 
            draft: draftedDocument 
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to draft document.", details: error.message });
    }
});

// Ludus Simulation Route
app.post('/api/simulate', async (req, res) => {
    const { profession, scenarioType, message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });
    if (!DEEPSEEK_API_KEY) return res.status(500).json({ error: 'DEEPSEEK_API_KEY is missing.' });

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

        if (!deepseekResponse.ok) throw new Error(`DeepSeek API failed: ${deepseekResponse.status}`);
        const deepseekData = await deepseekResponse.json();
        res.json({ reply: deepseekData.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ error: "Failed to simulate scenario.", details: error.message });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
