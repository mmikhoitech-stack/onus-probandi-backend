require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { randomUUID } = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS so your frontend can talk to this backend
app.use(cors());
app.use(express.json({ limit: '256kb' }));

// --- MAIL TRANSPORT SETUP ---
const getTransporter = () => {
  // If you haven't set up SMTP in your .env file, it will just log to the console.
  if (!process.env.SMTP_HOST) {
    console.log("⚠️ No SMTP configured in .env. Emails will be logged, not sent.");
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
};

// ==========================================
// YOUR ROUTES
// ==========================================

// 1. Health Check
app.get('/', (req, res) => {
  res.send("Onus Probandi Backend is Live and Running");
});

// 2. THE FIX: Secure Email Send Route
app.post('/api/secure-email/send', async (req, res) => {
  const { to, subject, message } = req.body || {};
  
  console.log(`[SECURE EMAIL] Received request to send to: ${to}`);

  // Validation
  if (!to || !subject || !message) {
    return res.status(400).json({ ok: false, error: 'VALIDATION', message: 'Missing required fields (to, subject, message)' });
  }

  try {
    const reqId = randomUUID();
    const transporter = getTransporter();
    
    if (transporter) {
      // Actually send the email
      await transporter.sendMail({
        from: process.env.MAIL_FROM || '"Onus Probandi" <no-reply@onusprobandi.guru>',
        to: to,
        subject: subject,
        text: message,
      });
      console.log(`[SECURE EMAIL] Successfully sent email to ${to}`);
    } else {
      // Mock send if no SMTP is configured yet
      console.log(`[SECURE EMAIL MOCK] To: ${to} | Subject: ${subject} | Message: ${message}`);
    }

    // Return success to frontend
    return res.status(200).json({ 
      ok: true, 
      id: reqId, 
      sentAt: new Date().toISOString() 
    });

  } catch (error) {
    console.error(`[SECURE EMAIL ERROR]`, error);
    return res.status(500).json({ 
      ok: false, 
      error: 'MAIL_TRANSPORT', 
      message: 'Failed to send email via mail server.' 
    });
  }
});

// 3. Your existing AI Draft route
app.post('/api/agents/email-draft', (req, res) => {
  res.json({ ok: true, message: "Draft generated" });
});

// --- START SERVER ---
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
