require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Groq = require('groq-sdk');
const PDFDocument = require('pdfkit');
const { Readable } = require('stream');
const { Resend } = require('resend');

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 10000;

// --- SETUP MULTER ---
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } 
});

// --- SETUP GROQ ---
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- SETUP RESEND (For Email) ---
const resend = new Resend(process.env.RESEND_API_KEY);

// --- EMAIL ROUTE ---
app.post('/api/send-email', async (req, res) => {
    try {
        const { to, subject, text } = req.body;
        
        console.log("Attempting to send email to:", to);

        const data = await resend.emails.send({
            from: 'Onus Probandi <onboarding@resend.dev>', // You can change this later
            to: [to],
            subject: subject,
            text: text,
        });

        console.log("Email sent successfully:", data);
        res.status(200).json({ status: 'success', message: 'Email sent' });
    } catch (error) {
        console.error('Email Error:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// --- VOICE TO PDF ROUTE ---
app.post('/api/voice-to-pdf', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file uploaded' });
        }

        console.log("Audio received, transcribing with Groq...");

        const audioStream = Readable.from(req.file.buffer);
        audioStream.path = req.file.originalname || 'audio.webm'; 

        const transcription = await groq.audio.transcriptions.create({
            file: audioStream,
            model: "whisper-large-v3",
            response_format: "json",
        });

        const transcribedText = transcription.text;
        console.log("Transcription complete. Generating PDF...");

        const doc = new PDFDocument();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="onus-probandi-document.pdf"');

        doc.pipe(res);

        doc.font('Times-Roman').fontSize(18).text('Onus Probandi - Voice to PDF', { align: 'center' });
        doc.moveDown();
        doc.font('Times-Roman').fontSize(12).text(transcribedText, {
            align: 'left',
            lineGap: 5
        });

        doc.end();

    } catch (error) {
        console.error('Voice to PDF Error:', error);
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
