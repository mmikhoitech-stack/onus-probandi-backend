const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const Parser = require('rss-parser');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const rssParser = new Parser();

// ==========================================
// 1. DATABASE CONNECTION & TABLES
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com') 
    ? { rejectUnauthorized: false } : false
});

pool.connect((err, client, release) => {
  if (err) console.error('❌ DB Error:', err.stack);
  else { console.log('✅ Connected to PostgreSQL'); release(); }
});

pool.query(`CREATE TABLE IF NOT EXISTS matters (id SERIAL PRIMARY KEY, client_name VARCHAR(255) NOT NULL, case_reference VARCHAR(100) UNIQUE NOT NULL, description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`)
  .then(() => console.log('✅ Matters Table ready')).catch(err => console.error(err));

pool.query(`CREATE TABLE IF NOT EXISTS internal_emails (id SERIAL PRIMARY KEY, sender_email VARCHAR(255) NOT NULL, recipient_email VARCHAR(255) NOT NULL, subject VARCHAR(255), body TEXT, matter_id INTEGER REFERENCES matters(id) ON DELETE SET NULL, is_read BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`)
  .then(() => console.log('✅ Emails Table ready')).catch(err => console.error(err));

// ==========================================
// 2. MATTER SPACES API
// ==========================================
app.post('/api/matters', async (req, res) => {
  try {
    const { client_name, case_reference, description } = req.body;
    const result = await pool.query(`INSERT INTO matters (client_name, case_reference, description) VALUES ($1, $2, $3) RETURNING *`, [client_name, case_reference, description]);
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to create matter' }); }
});

app.get('/api/matters', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM matters ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch matters' }); }
});

// ==========================================
// 3. INTERNAL SECURE EMAIL API
// ==========================================
app.post('/api/emails/send', async (req, res) => {
  try {
    const { sender_email, sender, recipient_email, recipient, subject, body, matter_id } = req.body;
    const finalSender = sender_email || sender;
    const finalRecipient = recipient_email || recipient;
    if (!finalSender || !finalRecipient || !body) return res.status(400).json({ error: 'Missing fields' });
    const result = await pool.query(`INSERT INTO internal_emails (sender_email, recipient_email, subject, body, matter_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`, [finalSender, finalRecipient, subject, body, matter_id || null]);
    res.status(201).json({ message: 'Email sent', email: result.rows[0] });
  } catch (error) { res.status(500).json({ error: 'Failed to send email' }); }
});

app.get('/api/emails/inbox/:email', async (req, res) => {
  try {
    const result = await pool.query(`SELECT e.*, m.case_reference, m.client_name FROM internal_emails e LEFT JOIN matters m ON e.matter_id = m.id WHERE e.recipient_email = $1 ORDER BY e.created_at DESC`, [req.params.email]);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch inbox' }); }
});

// ==========================================
// 4. AI LEGAL DRAFTING ENGINE (DeepSeek)
// ==========================================
const systemPrompt = `You are an elite South African litigation attorney... 
(Keep your existing systemPrompt here)
Requires attorney review and signature."`;

// 🚀 NEW: EMAIL DRAFTING ROUTE
app.post('/api/emails/draft-reply', async (req, res) => {
  try {
    const { emailBody, matter_id } = req.body;
    if (!emailBody) return res.status(400).json({ error: 'emailBody required' });

    let memoryContext = "";
    if (matter_id) {
      const matterResult = await pool.query(`SELECT * FROM matters WHERE id = $1`, [matter_id]);
      if (matterResult.rows.length > 0) {
        const m = matterResult.rows[0];
        memoryContext = `\nCASE CONTEXT: Client ${m.client_name}, Ref ${m.case_reference}. Facts: ${m.description}`;
      }
    }

    const emailPrompt = `You are drafting a reply to the following email. ${memoryContext}\n\nIncoming Email:\n"${emailBody}"\n\nDraft a professional, formal reply in plain text format.`;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ 
        model: 'deepseek-chat', 
        messages: [
          { role: 'system', content: systemPrompt }, 
          { role: 'user', content: emailPrompt }
        ] 
      })
    });
    const data = await response.json();
    res.json({ draft: data.choices[0].message.content });
  } catch (error) { 
    console.error(error);
    res.status(500).json({ error: 'Failed to draft email' }); 
  }
});

// (Keep your /api/analyze route here)

// ==========================================
// 5. START SERVER
// ==========================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server on port ${PORT}`));
