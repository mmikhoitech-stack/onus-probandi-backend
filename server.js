require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { randomBytes } = require('crypto'); // Assuming this was the 'random' import

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // Parses incoming JSON payloads

// Render dynamically assigns a port, fallback to 10000 for local testing
const port = process.env.PORT || 10000;

// --- NODEMAILER SETUP ---
// You will need to add these variables in your Render Environment Variables
const transporter = nodemailer.createTransport({
host: process.env.SMTP_HOST || 'smtp.gmail.com',
port: process.env.SMTP_PORT || 587,
secure: false, // true for 465, false for other ports
auth: {
user: process.env.SMTP_USER,
pass: process.env.SMTP_PASS,
},
});

// --- ROUTES ---

// Health Check Route (Good for testing if the server is up)
app.get('/', (req, res) => {
res.status(200).json({ status: 'success', message: 'Onus Probandi API is running.' });
});

// Example Route: Send Email
app.post('/api/send-email', async (req, res) => {
try {
const { to, subject, text } = req.body;

if (!to || !subject || !text) {
return res.status(400).json({ error: 'Missing required fields (to, subject, text)' });
}

const mailOptions = {
from: process.env.SMTP_USER,
to: to,
subject: subject,
text: text,
};

const info = await transporter.sendMail(mailOptions);

res.status(200).json({
status: 'success',
message: 'Email sent successfully',
messageId: info.messageId
});
} catch (error) {
console.error('Email Error:', error);
res.status(500).json({ error: 'Failed to send email' });
}
});

// Example Route: Generate Random Token (Using the crypto import)
app.get('/api/generate-token', (req, res) => {
const token = randomBytes(16).toString('hex');
res.status(200).json({ token });
});


// --- START SERVER ---
// IMPORTANT: Render requires '0.0.0.0' as the host
app.listen(port, '0.0.0.0', () => {
console.log(`Server is running on port ${port}`);
});
