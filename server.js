
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

// --- 2. DEEPSEEK LIVE RESEARCH (Onus Probandi) ---
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

// --- 3. AI DRAFTING (Onus Probandi) ---
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

// --- 4. DATABASE SEARCH (Onus Probandi) ---
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

// --- 5. LUDUS SIMULATOR ---
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

// --- 6. HARVEY-STYLE WORKFLOW (Onus Probandi) ---
app.post('/api/workflow', upload.array('documents', 10), async (req, res) => {
    const { prompt } = req.body;
    const files = req.files;

    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded.' });
    if (!prompt) return res.status(400).json({ error: 'Prompt is required.' });

    try {
        let allDocumentsText = "";

        for (const file of files) {
            let text = "";
            const dataBuffer = fs.readFileSync(file.path);

            if (file.mimetype === 'application/pdf') {
                const pdfData = await pdf(dataBuffer);
                text = pdfData.text;
            } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.originalname.endsWith('.docx')) {
                const mammothResult = await mammoth.extractRawText({ buffer: dataBuffer });
                text = mammothResult.value;
            } else {
                text = "Unsupported file format.";
            }

            fs.unlinkSync(file.path);
            allDocumentsText += `\n\n--- START OF DOCUMENT: ${file.originalname} ---\n${text}\n--- END OF DOCUMENT ---\n`;
        }

        const systemPrompt = `You are a senior South African attorney. You have been provided with the text of ${files.length} legal documents. Your task is: ${prompt}. Read the documents carefully. If asked to compare, create a structured summary or table. Cite the specific document names when making points.`;

        const deepseekResponse = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: systemPrompt }, 
                    { role: "user", content: `Here are the documents:\n\n${allDocumentsText}` }
                ]
            })
        });

        const data = await deepseekResponse.json();
        res.json({ success: true, result: data.choices[0].message.content });

    } catch (error) {
        res.status(500).json({ error: "Failed to run workflow." });
    }
});

// --- 7. LUDUS AI LECTURER (Multiple Files & Past Papers) ---
app.post('/api/ludus/lecture', upload.array('documents', 5), async (req, res) => {
    const { question } = req.body;
    const files = req.files;

    if (!files || files.length === 0) return res.status(400).json({ error: 'Please upload a study guide or past paper.' });
    if (!question) return res.status(400).json({ error: 'Please ask a question.' });

    try {
        let allExtractedText = "";

        // Loop through all uploaded files (Study Guide + Past Papers)
        for (const file of files) {
            let extractedText = "";
            const dataBuffer = fs.readFileSync(file.path);

            if (file.mimetype === 'application/pdf') {
                const pdfData = await pdf(dataBuffer);
                extractedText = pdfData.text;
            } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.originalname.endsWith('.docx')) {
                const mammothResult = await mammoth.extractRawText({ buffer: dataBuffer });
                extractedText = mammothResult.value;
            } else {
                extractedText = "Unsupported format.";
            }

            fs.unlinkSync(file.path);
            allExtractedText += `\n\n--- START OF DOCUMENT: ${file.originalname} ---\n${extractedText}\n--- END OF DOCUMENT ---\n`;
        }

        const systemPrompt = `You are a highly experienced South African Law Professor. 
        You are teaching a student using the following study material and past exam papers:\n\n${allExtractedText}\n\n
        You must teach the student based ONLY on this material. 
        If past papers are included, analyze the patterns and tell the student what to expect.
        Format your response as a structured lecture: 
        1. Introduction (Briefly explain the topic)
        2. Main Principles (Break down the law clearly)
        3. Past Paper Analysis (If past papers are uploaded, highlight recurring questions)
        4. Exam Tip (How to answer this in an exam).
        Be authoritative, clear, and thorough.`;

        const deepseekResponse = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: systemPrompt }, 
                    { role: "user", content: question }
                ]
            })
        });

        const data = await deepseekResponse.json();
        res.json({ lecture: data.choices[0].message.content });

    } catch (error) {
        res.status(500).json({ error: "Lecture failed to generate." });
    }
});

// --- START SERVER ---
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
