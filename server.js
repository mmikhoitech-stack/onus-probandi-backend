import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import multer from 'multer';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// Setup Multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Database Connection
const { Pool } = pg;
const db = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false }
});

// --- 1. HEALTH CHECK ---
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// --- 2. DEEPSEEK LIVE RESEARCH ---
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
          { role: "system", content: "You are a South African legal research assistant. Answer using ONLY the provided web search results. Cite the URLs." },
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

// --- 3. AI DRAFTING (Text Only) ---
app.post('/api/draft', async (req, res) => {
    const { prompt, agentType, firmVoice } = req.body; 
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    
    try {
        let systemPrompt = "You are an expert South African legal AI. Draft highly professional legal documents.";
        if (agentType === 'litigation') systemPrompt = "You are an expert South African litigator.";
        
        if (firmVoice === 'aggressive') systemPrompt += " Use a forceful, aggressive, and uncompromising tone.";
        else if (firmVoice === 'conciliatory') systemPrompt += " Use a calm, conciliatory, and solution-oriented tone.";
        else if (firmVoice === 'formal') systemPrompt += " Use highly formal, archaic High Court language.";
        
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

// --- 4. UPLOAD DOCUMENT & DRAFT ---
app.post('/api/upload-and-draft', upload.single('document'), async (req, res) => {
    const { prompt, firmVoice } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No document uploaded.' });
    if (!prompt) return res.status(400).json({ error: 'Instructions are required.' });

    try {
        let documentText = "";
        const dataBuffer = fs.readFileSync(file.path);

        // Extract text based on file type
        if (file.mimetype === 'application/pdf') {
            const pdfData = await pdf(dataBuffer);
            documentText = pdfData.text;
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.originalname.endsWith('.docx')) {
            const mammothResult = await mammoth.extractRawText({ buffer: dataBuffer });
            documentText = mammothResult.value;
        } else {
            documentText = "Unsupported file format.";
        }

        fs.unlinkSync(file.path); // Clean up temp file

        let systemPrompt = "You are a senior South African legal AI. Read the provided court document carefully and draft the requested response based on the facts within the document.";
        if (firmVoice === 'aggressive') systemPrompt += " Use a forceful, aggressive, and uncompromising tone.";
        else if (firmVoice === 'formal') systemPrompt += " Use highly formal, archaic High Court language.";

        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: systemPrompt }, 
                    { role: "user", content: `Here is the uploaded court document:\n\n${documentText}\n\n---\n\nMy instructions for drafting: ${prompt}` }
                ]
            })
        });

        const data = await response.json();
        res.json({ success: true, draft: data.choices[0].message.content });

    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({ error: "Failed to process document." });
    }
});

// --- 5. DATABASE SEARCH ---
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

// --- 6. LUDUS SIMULATOR ---
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

// --- START SERVER ---
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
