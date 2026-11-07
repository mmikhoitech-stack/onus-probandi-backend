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
const upload = multer({ dest: 'uploads/', limits: { fileSize: 50 * 1024 * 1024 } });
const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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
app.post('/api/draft', memoryUpload.any(), async (req, res) => {
    const { prompt, agentType, firmVoice } = req.body; 
    const files = req.files;
    
    if (!prompt && (!files || files.length === 0)) return res.status(400).json({ error: 'Prompt or file is required' });
    
    try {
        let extractedText = "";
        if (files && files.length > 0) {
            for (const file of files) {
                if (file.mimetype === 'application/pdf') {
                    const pdfData = await pdf(file.buffer);
                    extractedText += pdfData.text + "\n\n";
                } else if (file.originalname.endsWith('.docx')) {
                    const mammothResult = await mammoth.extractRawText({ buffer: file.buffer });
                    extractedText += mammothResult.value + "\n\n";
                }
            }
        }

        let systemPrompt = "You are an expert South African legal AI. Draft highly professional legal documents.";
        if (agentType === 'litigation') systemPrompt = "You are an expert South African litigator.";
        
        if (firmVoice === 'aggressive') systemPrompt += " Use a forceful, aggressive, and uncompromising tone.";
        else if (firmVoice === 'conciliatory') systemPrompt += " Use a calm, conciliatory, and solution-oriented tone.";
        else if (firmVoice === 'formal') systemPrompt += " Use highly formal, archaic High Court language.";

        const userContent = (files && files.length > 0)
            ? `Here is the document text:\n\n${extractedText}\n\nBased on this document, please do the following: ${prompt}`
            : prompt;

        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }]
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

// --- 6. HARVEY-STYLE WORKFLOW (Review Table Generation) ---
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
            } else if (file.originalname.endsWith('.docx')) {
                const mammothResult = await mammoth.extractRawText({ buffer: dataBuffer });
                text = mammothResult.value;
            } else {
                text = "Unsupported file format.";
            }

            fs.unlinkSync(file.path);
            allDocumentsText += `\n\n--- START OF DOCUMENT: ${file.originalname} ---\n${text}\n--- END OF DOCUMENT ---\n`;
        }

        const systemPrompt = `You are a senior South African attorney. You have been provided with the text of ${files.length} legal documents. Your task is: ${prompt}. Read the documents carefully. If asked to compare, ALWAYS create a structured Markdown Table. Cite the specific document names when making points.`;

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

// --- 7. LUDUS AI LECTURER (Your Custom System Prompt) ---
app.post('/api/ludus/lecture', memoryUpload.any(), async (req, res) => {
    const { question, chatHistory } = req.body;
    const files = req.files;

    try {
        let extractedText = "";
        
        // Loop through all uploaded files (Study Guide + Past Papers)
        if (files && files.length > 0) {
            for (const file of files) {
                let text = "";
                if (file.mimetype === 'application/pdf') {
                    const pdfData = await pdf(file.buffer);
                    text = pdfData.text;
                } else if (file.originalname.endsWith('.docx')) {
                    const mammothResult = await mammoth.extractRawText({ buffer: file.buffer });
                    text = mammothResult.value;
                }
                extractedText += `\n\n--- START OF DOCUMENT: ${file.originalname} ---\n${text}\n--- END OF DOCUMENT ---\n`;
            }
        }

        // --- YOUR SPECIFIC SYSTEM PROMPT ---
        const systemPrompt = `ROLE AND PERSONA:
        You are a Senior Law Professor and Bar Exam Coach in South African law. 
        
        CRITICAL INSTRUCTION FOR AUDIO OUTPUT: 
        Write in clear, flowing paragraphs. DO NOT use any Markdown formatting (No asterisks, No hashtags, No dashes, No bullet points). Use natural spoken transitions.

        CONTEXT AND STUDENT PROFILE:
        The user is an LLB student. They do NOT have the physical textbook. You must explicitly bridge the gap by providing the common-law rules and definitions. 
        They have uploaded their Study Guide and multiple Past Exam Papers. 

        YOUR MANDATORY TASKS FOR EVERY LECTURE:
        1. Extracting Compulsory Cases: Look at the Study Guide and explicitly name every compulsory case related to the topic. Explain the facts and the ratio decidendi.
        2. Exam Prediction: Analyze all the Past Exam Papers provided. Identify repeating themes, common scenarios, or specific questions that are highly likely to appear in the upcoming exam. Tell the student what to focus on.
        3. The 3-Layer Overlay: Teach the (1) Common Law Rule, (2) The Case Law, and (3) The Constitutional Overlay (Section 39(2), Ubuntu, public policy).
        4. Critical Application: Apply the law to a hypothetical past-paper scenario using IRAC.

        STUDY MATERIALS PROVIDED:
        \n\n${extractedText}\n\n

        TONE: 
        Authoritative, rigorous, encouraging, and conversational.`;

        let messages = [{ role: "system", content: systemPrompt }];
        
        if (chatHistory) {
            const parsedHistory = JSON.parse(chatHistory);
            messages = messages.concat(parsedHistory);
        }
        
        messages.push({ role: "user", content: question });

        const deepseekResponse = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: messages
            })
        });

        const data = await deepseekResponse.json();
        res.json({ lecture: data.choices[0].message.content });

    } catch (error) {
        console.error("Lecture Error:", error); 
        res.status(500).json({ error: error.message || "Lecture failed to generate." });
    }
});

// --- START SERVER ---
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
