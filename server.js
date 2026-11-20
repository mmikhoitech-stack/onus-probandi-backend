require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const OpenAI = require('openai');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// DeepSeek/OpenAI Setup
const deepseek = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || 'PASTE_YOUR_KEY_HERE',
    baseURL: 'https://api.deepseek.com/v1'
});

// Database Setup (PostgreSQL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Database connection error:', err.message);
    } else {
        console.log('✅ Connected to PostgreSQL');
    }
});

// --- ROUTES ---

// 1. THE FIX: Email fetch route (Stops the 500 Error)
// This MUST be here so the dashboard doesn't crash.
app.get('/api/emails', async (req, res) => {
    try {
        // Right now, we return an empty list to stop the crash.
        res.status(200).json([]);
    } catch (error) {
        console.error("Email fetch error:", error);
        res.status(200).json([]);
    }
});

// 2. AI Drafting Route
app.post('/api/agents/email-draft', upload.single('attachment'), async (req, res) => {
    try {
        const emailText = req.body.emailText || '';
        if (!emailText) {
            return res.status(400).json({ error: 'Please provide email text to draft.' });
        }

        const completion = await deepseek.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: "You are a South African legal AI assistant. Draft a professional reply." },
                { role: "user", content: `Draft a reply to this email: ${emailText}` }
            ],
        });

        res.status(200).json({ draft: completion.choices[0].message.content });
    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ error: 'Failed to generate draft.' });
    }
});

// 3. Health Check Route
app.get('/', (req, res) => {
    res.send("Onus Probandi Backend is Live and Running");
});

// Start Server
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
