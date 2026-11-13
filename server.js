const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ==========================================
// 1. DATABASE CONNECTION
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com') 
    ? { rejectUnauthorized: false } 
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

// Initialize the Email Table automatically
pool.query(`
  CREATE TABLE IF NOT EXISTS internal_emails (
      id SERIAL PRIMARY KEY,
      sender_email VARCHAR(255) NOT NULL,
      recipient_email VARCHAR(255) NOT NULL,
      subject VARCHAR(255),
      body TEXT,
      case_reference VARCHAR(100),
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`).then(() => console.log('✅ Internal Email Table is ready')).catch(err => console.error('DB Init Error:', err));

// ==========================================
// 2. AI LEGAL ASSISTANT (DeepSeek)
// ==========================================
const systemPrompt = `You are a senior South African attorney at a boutique South African law firm. You have 20 years of experience.

YOUR TASK:
You will receive an incoming email and, optionally, the extracted text of an attached document. You must:
1. Identify every legal issue raised in the email and attachment.
2. List every piece of information, document, or fact that is missing and would be needed before giving final advice.
3. Draft a professional reply in the firm's voice, addressed to the sender, that acknowledges the matter, deals with what can be dealt with, and requests the missing information.

You are drafting CORRESPONDENCE only, not a legal opinion. An attorney will review and sign off before it is sent.`;

app.get('/', (req, res) => {
  res.send('Onus Probandi Ferrari Engine is running smoothly!');
});

// AI Analysis Endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    const { emailText } = req.body;
    
    if (!emailText) {
      return res.status(400).json({ error: 'emailText is required' });
    }

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

// ==========================================
// 3. NEW: INTERNAL EMAIL FACILITY (NO MICROSOFT)
// ==========================================

// A. Send an Email
app.post('/api/emails/send', async (req, res) => {
  try {
    const { sender_email, recipient_email, subject, body, case_reference } = req.body;
    
    if (!sender_email || !recipient_email || !body) {
      return res.status(400).json({ error: 'Sender, recipient, and body are required.' });
    }

    const result = await pool.query(
      `INSERT INTO internal_emails (sender_email, recipient_email, subject, body, case_reference) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [sender_email, recipient_email, subject, body, case_reference]
    );

    res.status(201).json({ message: 'Email sent successfully', email: result.rows[0] });
  } catch (error) {
    console.error('Send Error:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// B. Get Inbox
app.get('/api/emails/inbox/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const result = await pool.query(
      `SELECT * FROM internal_emails WHERE recipient_email = $1 ORDER BY created_at DESC`,
      [email]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch inbox' });
  }
});

// C. Get Sent Items
app.get('/api/emails/sent/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const result = await pool.query(
      `SELECT * FROM internal_emails WHERE sender_email = $1 ORDER BY created_at DESC`,
      [email]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sent items' });
  }
});

// D. Mark Email as Read
app.put('/api/emails/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`UPDATE internal_emails SET is_read = TRUE WHERE id = $1`, [id]);
    res.json({ message: 'Marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update email' });
  }
});

// ==========================================
// 4. START THE SERVER (RENDER PORT BINDING)
// ==========================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
