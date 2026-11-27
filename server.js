require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const pdfParse = require('pdf-parse');
const PDFDocument = require('pdfkit');
const { Readable } = require('stream');

const app = express();
const port = process.env.PORT || 10000;

// --- CORS CONFIGURATION (ALLOWS BOTH SITES) ---
app.use(cors({
    origin: [
        'https://www.ludus.guru', 
        'https://ludus.guru', 
        'https://onusprobandi.guru',
        'https://www.onusprobandi.guru'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));

// --- SETUP CLIENTS ---
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_KEY 
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY) 
    : null;

const openai = process.env.OPENAI_API_KEY 
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) 
    : null;

// --- HELPER: DEEPSEEK API CALLER ---
const callDeepSeek = async (systemPrompt, userPrompt) => {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.3
        })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0]?.message?.content;
};

// ==========================================
// --- ONUS PROBANDI ROUTES ---
// ==========================================

// 1. EMAIL ROUTE
app.post('/api/send-email', async (req, res) => {
    try {
        const { to, subject, text } = req.body;
        await resend.emails.send({
            from: 'Onus Probandi <notifications@onusprobandi.guru>',
            to: [to], subject: subject, text: text,
        });
        res.status(200).json({ status: 'success', message: 'Email sent' });
    } catch (error) {
        console.error("Email Error:", error);
        res.status(500).json({ error: 'Failed to send email', details: error.message });
    }
});

// 2. VOICE TO PDF ROUTE
app.post('/api/voice-to-pdf', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });
        const audioStream = Readable.from(req.file.buffer);
        audioStream.path = req.file.originalname || 'audio.webm'; 

        // Using OpenAI Whisper (or Groq if you prefer)
        const transcription = await openai.audio.transcriptions.create({
            file: audioStream, model: "whisper-1", response_format: "json",
        });

        const doc = new PDFDocument();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="onus-probandi-document.pdf"');
        doc.pipe(res);
        doc.font('Times-Roman').fontSize(18).text('Onus Probandi - Voice to PDF', { align: 'center' });
        doc.moveDown();
        doc.font('Times-Roman').fontSize(12).text(transcription.text, { align: 'left', lineGap: 5 });
        doc.end();
    } catch (error) {
        console.error("Audio Error:", error);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to process audio', details: error.message });
    }
});

// 3. DRAFT DOCUMENT (Using DeepSeek)
app.post('/api/draft-document', async (req, res) => {
    try {
        const { matter, firm_voice, instructions } = req.body;
        const systemPrompt = `You are a South African legal AI drafting assistant.`;
        const userPrompt = `Draft a legal document based on the following instructions. Matter: ${matter || 'General'}. Firm Voice: ${firm_voice || 'Standard'}. Instructions: ${instructions || 'Draft a standard legal document.'}. Provide a professional, court-ready draft.`;
        
        const draft = await callDeepSeek(systemPrompt, userPrompt);
        res.status(200).json({ status: 'success', draft: draft });
    } catch (error) {
        console.error("Draft Error:", error);
        res.status(500).json({ error: 'Failed to generate draft', details: error.message });
    }
});

// 4. DEEP LEGAL RESEARCH (RAG)
app.post('/api/deep-research', async (req, res) => {
    try {
        if (!supabase || !openai) return res.status(500).json({ error: 'Database or OpenAI not configured.' });
        const { query } = req.body;
        const embeddingResponse = await openai.embeddings.create({ model: "text-embedding-3-small", input: query });
        const { data: documents, error } = await supabase.rpc('match_documents', {
            query_embedding: embeddingResponse.data[0].embedding, match_threshold: 0.5, match_count: 5,
        });
        if (error) throw error;
        let contextText = documents.map(doc => doc.content).join('\n\n---\n\n') || "No specific SA case law found.";
        
        const systemPrompt = `Answer ONLY using this context: \n\n${contextText}`;
        const answer = await callDeepSeek(systemPrompt, query);
        
        res.status(200).json({ status: 'success', answer: answer, sources_used: documents.map(d => d.metadata) });
    } catch (error) {
        console.error("Research Error:", error);
        res.status(500).json({ error: 'Failed to process deep research', details: error.message });
    }
});

// ==========================================
// --- LUDUS ROUTES ---
// ==========================================

// 5. LUDUS UPLOAD ROUTE
app.post('/api/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded." });
        const pdfData = await pdfParse(req.file.buffer);
        res.json({ success: true, message: "Document parsed", text: pdfData.text.substring(0, 5000) });
    } catch (error) {
        console.error("Ludus Upload Error:", error);
        res.status(500).json({ error: "Failed to parse document.", details: error.message });
    }
});

// 6. LUDUS COURTROOM ARGUE ROUTE (AI Judge)
app.post('/api/courtroom/argue', async (req, res) => {
    try {
        const { argument, caseContext } = req.body;
        if (!argument) return res.status(400).json({ error: "No argument provided." });

        const systemPrompt = `You are Justice Ludus, a strict, analytical High Court Judge in South Africa. Be formal and demanding. Case Context: ${caseContext || "None"}`;
        
        const reply = await callDeepSeek(systemPrompt, argument);

        res.json({ 
            success: true, 
            reply: reply,
            scores: { reasoning: 85, authority: 90, responsiveness: 80 } 
        });
    } catch (error) {
        console.error("DeepSeek API Error:", error);
        res.status(500).json({ 
            error: "The Judge is currently in recess.", 
            details: error.message 
        });
    }
});

// ==========================================
// --- HEALTH CHECK & START ---
// ==========================================
app.get('/', (req, res) => {
    res.status(200).json({ status: 'success', message: 'Merged Backend for Onus & Ludus (DeepSeek Powered) is LIVE!' });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
});
