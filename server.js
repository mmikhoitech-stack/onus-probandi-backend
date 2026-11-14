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
    ? { rejectUnauthorized: false } : false
});

pool.connect((err, client, release) => {
  if (err) console.error('❌ Database connection error:', err.stack);
  else { console.log('✅ Connected to PostgreSQL'); release(); }
});

// ==========================================
// 2. DATABASE INITIALIZATION (TABLES)
// ==========================================
// Matters Table
pool.query(`
  CREATE TABLE IF NOT EXISTS matters (
      id SERIAL PRIMARY KEY,
      client_name VARCHAR(255) NOT NULL,
      case_reference VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`).then(() => console.log('✅ Matters Table ready')).catch(err => console.error(err));

// Secure Emails Table
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
`).then(() => console.log('✅ Emails Table ready')).catch(err => console.error(err));

// Case Law Table (For the Scraper)
pool.query(`
  CREATE TABLE IF NOT EXISTS case_law (
      id SERIAL PRIMARY KEY,
      title VARCHAR(500),
      citation VARCHAR(255) UNIQUE,
      court VARCHAR(100),
      year INTEGER,
      body_text TEXT,
      url VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`).then(() => console.log('✅ Case Law Table ready')).catch(err => console.error(err));


// ==========================================
// 3. MATTER SPACES API
// ==========================================
app.post('/api/matters', async (req, res) => {
  try {
    const { client_name, case_reference, description } = req.body;
    const result = await pool.query(
      `INSERT INTO matters (client_name, case_reference, description) VALUES ($1, $2, $3) RETURNING *`,
      [client_name, case_reference, description]
    );
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
// 4. INTERNAL SECURE EMAIL API
// ==========================================
app.post('/api/emails/send', async (req, res) => {
  try {
    const { sender_email, sender, recipient_email, recipient, subject, body, matter_id } = req.body;
    const finalSender = sender_email || sender;
    const finalRecipient = recipient_email || recipient;
    if (!finalSender || !finalRecipient || !body) return res.status(400).json({ error: 'Missing fields' });
    
    const result = await pool.query(
      `INSERT INTO internal_emails (sender_email, recipient_email, subject, body, matter_id) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [finalSender, finalRecipient, subject, body, matter_id || null]
    );
    res.status(201).json({ message: 'Email sent', email: result.rows[0] });
  } catch (error) { res.status(500).json({ error: 'Failed to send email' }); }
});

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
  } catch (error) { res.status(500).json({ error: 'Failed to fetch inbox' }); }
});

// ==========================================
// 5. AI LEGAL DRAFTING ENGINE (DeepSeek)
// ==========================================
const systemPrompt = `You are an elite South African litigation attorney, an expert in High Court practice, drafting, and legal analysis. You have 25 years of experience at the Bar.

YOUR TASK:
You will receive a legal query, set of facts, or an email. You must produce a pristine, ready-to-file or ready-to-send legal document. 

CRITICAL DRAFTING RULES:
1. ZERO CHATTER: Never include conversational text. Do not say "Here is the draft" or "Let me know if you need changes." Output ONLY the document itself.
2. NO MARKDOWN FORMATTING: NEVER use asterisks (**) for bold text. NEVER use hashtags (#) for headers. NEVER use hyphens (---) for horizontal lines. Use PLAIN TEXT ONLY. For emphasis, use ALL CAPS. If a physical dividing line is needed, use a row of underscores (____________________).
3. FORMATTING STRUCTURE:
   - If drafting a Court Document (Notice of Motion, Affidavit, Plea, Heads of Argument): Use the exact standard South African High Court format. Include the full heading (IN THE HIGH COURT OF SOUTH AFRICA...), Case Number, Parties, and numbered paragraphs.
   - If drafting Correspondence (Letter of Demand, Client Email): Use professional firm letterhead format (Date, To, From, Subject, Salutation, Body, Sign-off).
4. PLACEHOLDERS: Use bracketed placeholders like [INSERT CASE NUMBER], [INSERT DATE], or [INSERT CLIENT NAME] where facts are missing. Do not invent facts.
5. LEGAL PRECISION: Cite South African legislation (e.g., Companies Act 71 of 2008, Insolvency Act 24 of 1936, Uniform Rules of Court) and relevant SA case law accurately.
6. TONE: Authoritative, objective, and highly professional. 
7. DISCLAIMER: At the very bottom, in plain text, add: "Draft generated by Onus Probandi AI. Requires attorney review and signature."`;

app.get('/', (req, res) => res.send('Onus Probandi Engine Live'));

app.post('/api/analyze', async (req, res) => {
  try {
    const { emailText } = req.body;
    if (!emailText) return res.status(400).json({ error: 'emailText required' });

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
    console.error(error);
    res.status(500).json({ error: 'Internal server error' }); 
  }
});

// ==========================================
// 6. START SERVER
// ==========================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server on port ${PORT}`));
