require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Groq = require('groq-sdk');
const PDFDocument = require('pdfkit');
const { Readable } = require('stream');
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const port = process.env.PORT || 10000;

// --- SETUP CLIENTS ---
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

// Optional: These will only work if you add the keys to Render
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_KEY 
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY) 
    : null;

const openai = process.env.OPENAI_API_KEY 
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) 
    : null;

// --- 1. EMAIL ROUTE ---
app.post('/api/send-email', async (req, res) => {
    try {
        const { to, subject, text } = req.body;
        const data = await resend.emails.send({
            from: 'Onus Probandi <notifications@onusprobandi.guru>',
            to: [to],
            subject: subject,
            text: text,
        });
        res.status(200).json({ status: 'success', message: 'Email sent' });
    } catch (error) {
        console.error('Email Error:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// --- 2. VOICE TO PDF ROUTE ---
app.post('/api/voice-to-pdf', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });
        const audioStream = Readable.from(req.file.buffer);
        audioStream.path = req.file.originalname || 'audio.webm'; 

        const transcription = await groq.audio.transcriptions.create({
            file: audioStream,
            model: "whisper-large-v3",
            response_format: "json",
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
        console.error('Voice to PDF Error:', error);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to process audio' });
    }
});

// --- 3. TABULAR REVIEW ---
app.post('/api/tabular-review', async (req, res) => {
    try {
        const { documents, columns } = req.body;
        if (!documents || !columns) return res.status(400).json({ error: 'Documents and columns required' });

        const prompt = `You are a South African legal AI. Analyze the following documents and extract the requested info for EACH document. Return ONLY a valid JSON array. No markdown formatting.
        Columns: ${JSON.stringify(columns)}
        Documents: ${documents.map((doc, i) => `--- DOC ${i+1} ---\n${doc}`).join('\n\n')}`;

        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama3-70b-8192",
            temperature: 0.1,
        });

        let rawResponse = chatCompletion.choices[0]?.message?.content.replace(/```json/g, '').replace(/```/g, '').trim();
        res.status(200).json({ status: 'success', table_data: JSON.parse(rawResponse) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to process tabular review' });
    }
});

// --- 4. AGENT INTAKE ---
app.post('/api/agent-intake', async (req, res) => {
    try {
        const { request_text } = req.body;
        const prompt = `You are the Onus Probandi Intake Agent. Read this request and return ONLY valid JSON with keys: "priority" (High/Medium/Low), "missing_info" (array), "draft_response" (string). Request: "${request_text}"`;

        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama3-70b-8192",
            temperature: 0.2,
        });

        let rawResponse = chatCompletion.choices[0]?.message?.content.replace(/```json/g, '').replace(/```/g, '').trim();
        res.status(200).json({ status: 'success', intake_result: JSON.parse(rawResponse) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to process intake' });
    }
});

// --- 5. WORKFLOW DRAFT ---
app.post('/api/workflow-draft', async (req, res) => {
    try {
        const { goal } = req.body;
        const prompt = `You are a legal workflow architect. Generate a step-by-step workflow for: "${goal}". Return ONLY a JSON array with "step_number" and "instruction".`;

        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama3-70b-8192",
            temperature: 0.3,
        });

        let rawResponse = chatCompletion.choices[0]?.message?.content.replace(/```json/g, '').replace(/```/g, '').trim();
        res.status(200).json({ status: 'success', workflow: JSON.parse(rawResponse) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate workflow' });
    }
});

// --- 6. DEEP LEGAL RESEARCH (RAG) ---
app.post('/api/deep-research', async (req, res) => {
    try {
        if (!supabase || !openai) return res.status(500).json({ error: 'Database or OpenAI not configured in environment variables.' });

        const { query } = req.body;
        const embeddingResponse = await openai.embeddings.create({ model: "text-embedding-3-small", input: query });
        const { data: documents, error } = await supabase.rpc('match_documents', {
            query_embedding: embeddingResponse.data[0].embedding,
            match_threshold: 0.5,
            match_count: 5,
        });

        if (error) throw error;
        let contextText = documents.map(doc => doc.content).join('\n\n---\n\n') || "No specific SA case law found.";

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: `You are Onus Probandi. Answer ONLY using this context: \n\n${contextText}` },
                { role: "user", content: query }
            ],
            model: "llama3-70b-8192",
            temperature: 0.2,
        });

        res.status(200).json({ 
            status: 'success', 
            answer: chatCompletion.choices[0]?.message?.content,
            sources_used: documents.map(d => d.metadata)
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to process deep research' });
    }
});

// --- 7. VERITY AUDIT (CITATION VERIFICATION) ---
app.post('/api/verify-citation', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Database not configured.' });

        const { citation, ai_claim } = req.body;
        const { data: cases } = await supabase.from('legal_documents').select('*').ilike('metadata->>citation', `%${citation}%`).limit(1);

        if (!cases || cases.length === 0) {
            return res.status(200).json({ status: 'flagged', reason: 'Citation not found. Possible hallucination.' });
        }

        const foundCase = cases[0];
        if (foundCase.metadata?.status === 'overruled') {
            return res.status(200).json({ status: 'flagged', reason: 'Case is overruled.' });
        }

        res.status(200).json({ status: 'verified', reason: 'Citation exists and is good law.', case_name: foundCase.metadata?.case_name });
    } catch (error) {
        res.status(500).json({ error: 'Failed to audit citation' });
    }
});

// --- HEALTH CHECK & START ---
app.get('/', (req, res) => {
    res.status(200).json({ status: 'success', message: 'Onus Probandi API is running.' });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
});
