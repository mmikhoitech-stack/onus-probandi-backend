require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const multer = require('multer');
const Groq = require('groq-sdk');
const PDFDocument = require('pdfkit');
const { Readable } = require('stream');

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 10000;

// --- SETUP MULTER (For handling audio uploads in memory) ---
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } // Limit to 25MB to prevent memory crashes
});

// --- SETUP GROQ (Using your existing environment variable) ---
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- EMAIL ROUTE ---
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

app.post('/api/send-email', async (req, res) => {
    try {
        const { to, subject, text } = req.body;
        await transporter.sendMail({ from: process.env.SMTP_USER, to, subject, text });
        res.status(200).json({ status: 'success', message: 'Email sent' });
    } catch (error) {
        console.error('Email Error:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// --- FULL VOICE TO PDF ROUTE ---
app.post('/api/voice-to-pdf', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file uploaded' });
        }

        console.log("Audio received, transcribing with Groq...");

        // Convert buffer to a stream for Groq (Fixes some Node/Groq compatibility issues)
        const audioStream = Readable.from(req.file.buffer);
        // Groq needs a filename to know the format. We pass the original name or default to webm.
        audioStream.path = req.file.originalname || 'audio.webm'; 

        // 1. Send audio to Groq for transcription
        const transcription = await groq.audio.transcriptions.create({
            file: audioStream,
            model: "whisper-large-v3",
            response_format: "json",
        });

        const transcribedText = transcription.text;
        console.log("Transcription complete. Generating PDF...");

        // 2. Create the PDF
        const doc = new PDFDocument();
        
        // Set headers so the browser knows it's downloading a PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="onus-probandi-document.pdf"');

        // Pipe the PDF directly to the response
        doc.pipe(res);

        // Add content to PDF (Using Times-Roman to prevent font crashes on Render)
        doc.font('Times-Roman').fontSize(18).text('Onus Probandi - Voice to PDF', { align: 'center' });
        doc.moveDown();
        doc.font('Times-Roman').fontSize(12).text(transcribedText, {
            align: 'left',
            lineGap: 5
        });

        // Finalize the PDF
        doc.end();

    } catch (error) {
        console.error('Voice to PDF Error:', error);
        // If the PDF hasn't started streaming yet, send an error response
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to process audio and generate PDF' });
        }
    }
});

// Health check
app.get('/', (req, res) => {
    res.status(200).json({ status: 'success', message: 'Onus Probandi API is running.' });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
});
