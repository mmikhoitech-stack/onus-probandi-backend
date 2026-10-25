import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Client } from 'pg';
import { gotScraping } from 'got-scraping'; // NEW STEALTH SCRAPER
import * as cheerio from 'cheerio';
import { OpenAI } from 'openai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// Initialize DB and OpenAI
const db = new Client({
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false }
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- INGESTION LOGIC (Using got-scraping to bypass 403) ---
async function ingestCase(url) {
  try {
    console.log(`Fetching: ${url}`);
    
    // gotScraping automatically mimics a real browser's TLS fingerprint and headers
    const response = await gotScraping(url);
    
    const $ = cheerio.load(response.body);
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    const chunks = text.match(/[\s\S]{1,1000}/g) || [text]; 

    for (const chunk of chunks) {
      if (chunk.trim().length < 50) continue;
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: chunk,
      });
      const embedding = embeddingResponse.data[0].embedding;
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

// Trigger Ingestion Route
app.get('/api/ingest', async (req, res) => {
  try {
    await db.connect();
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
    
    // Run in background
    ingestCase('https://www.saflii.org/za/cases/ZACC/2023/12.html').then(() => {
      console.log('Background ingestion complete.');
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Drafting Route (Onus Probandi)
app.post('/api/draft', async (req, res) => {
    const { prompt, agentType } = req.body; 
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    if (!DEEPSEEK_API_KEY) return res.status(500).json({ error: 'DEEPSEEK_API_KEY is not configured.' });

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

        if (!deepseekResponse.ok) throw new Error(`DeepSeek API failed: ${deepseekResponse.status}`);
        const deepseekData = await deepseekResponse.json();
        const draftedDocument = deepseekData.choices[0].message.content;

        res.json({ success: true, cases_retrieved: "DeepSeek internal knowledge used.", draft: draftedDocument });
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
