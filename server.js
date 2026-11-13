const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// 1. Database Connection (Render Internal URL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com') 
    ? { rejectUnauthorized: false } // Required for Render external, safe for internal too
    : false
});

// Test DB connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to database:', err.stack);
  } else {
    console.log('✅ Successfully connected to PostgreSQL database');
    release();
  }
});

// 2. The AI Prompt Configuration
const systemPrompt = `You are a senior South African attorney at a boutique South African law firm. You have 20 years of experience.

YOUR TASK:
You will receive an incoming email and, optionally, the extracted text of an attached document. You must:
1. Identify every legal issue raised in the email and attachment.
2. List every piece of information, document, or fact that is missing and would be needed before giving final advice.
3. Draft a professional reply in the firm's voice, addressed to the sender, that acknowledges the matter, deals with what can be dealt with, and requests the missing information.

You are drafting CORRESPONDENCE only, not a legal opinion. An attorney will review and sign off before it is sent.`;

// 3. API Endpoints
app.get('/', (req, res) => {
  res.send('Onus Probandi Backend is running successfully!');
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { emailText } = req.body;
    
    if (!emailText) {
      return res.status(400).json({ error: 'emailText is required' });
    }

    // Call DeepSeek API (Make sure DEEPSEEK_API_KEY is in your Render Environment Variables)
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: emailText }
        ]
      })
    });

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error('❌ Error during AI analysis:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. THE CRITICAL RENDER PORT BINDING
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
