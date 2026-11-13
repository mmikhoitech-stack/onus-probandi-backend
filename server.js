const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
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

// ==========================================
// 2. DATABASE INITIALIZATION (TABLES)
// ==========================================
// Create Matters Table
pool.query(`
  CREATE TABLE IF NOT EXISTS matters (
      id SERIAL PRIMARY KEY,
      client_name VARCHAR(255) NOT NULL,
      case_reference VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`).then(() => console.log('✅ Matters Table ready')).catch(err => console.error('DB Error:', err));

// Create Emails Table (Linked to Matters)
pool.query(`
  CREATE TABLE IF NOT EXISTS internal_emails (
      id SERIAL PRIMARY KEY,
      sender_email VARCHAR(255) NOT NULL,
      recipient_email VARCHAR(255) NOT NULL,
      subject VARCHAR(255),
      body TEXT,
      matter_id INTEGER REFERENCES matters(id) ON DELETE SET NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`).then(() => console.log('✅ Emails Table ready')).catch(err => console.error('DB Error:', err));


// ==========================================
// 3. MATTER SPACES API
// ==========================================
// Create a new Matter
app.post('/api/matters', async (req, res) => {
  try {
    const { client_name, case_reference, description } = req.body;
    const result = await pool.query(
      `INSERT INTO matters (client_name, case_reference, description) VALUES ($1, $2, $3) RETURNING *`,
      [client_name, case_reference, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create matter' });
  }
});

// Get all Matters
app.get('/api/matters', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM matters ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch matters' });
  }
});

// ==========================================
// 4. AI & EMAIL API
// ==========================================
// Send Email (Now with Matter Linking)
app.post('/api/emails/send', async (req, res) => {
  try {
    // Accepts both sender_email and sender for compatibility
    const { sender_email, sender, recipient_email, recipient, subject, body, matter_id } = req.body;
    const finalSender = sender_email || sender;
    const finalRecipient = recipient_email || recipient;

    if (!finalSender || !finalRecipient || !body) {
      return res.status(400).json({ error: 'Sender, recipient, and body are required.' });
    }

    const result = await pool.query(
      `INSERT INTO internal_emails (sender_email, recipient_email, subject, body, matter_id) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [finalSender, finalRecipient, subject, body, matter_id || null]
    );
    res.status(201).json({ message: 'Email sent successfully', email: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Get Inbox (Joins with Matters table to show the case reference!)
app.get('/api/emails/inbox/:email', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*, m.case_reference, m.client_name 
       FROM internal_emails e
       LEFT JOIN matters m ON e.matter_id = m.id
       WHERE e.recipient_email = $1 ORDER BY e.created_at DESC`,
      [req.params.email]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch inbox' });
  }
});

// AI Analysis (DeepSeek)
const systemPrompt = `You are a senior South African attorney...`; 

app.post('/api/analyze', async (req, res) => {
  try {
    const { emailText } = req.body;
    if (!emailText) return res.status(400).json({ error: 'emailText is required' });

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
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// 5. START SERVER
// ==========================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
