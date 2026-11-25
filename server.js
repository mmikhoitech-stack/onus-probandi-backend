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
const pdfParse = require('pdf-parse'); // ADDED FOR LUDUS

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const port = process.env.PORT || 10000;

// --- SETUP CLIENTS ---
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

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
        await resend.emails.send({
            from: 'Onus Probandi <notifications@onusprobandi.guru>',
            to: [to], subject: subject, text: text,
        });
        res.status(200).json({ status: 'success', message: 'Email sent' });
    } catch (error) {
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
            file: audioStream, model: "whisper-large-v3", response_format: "json",
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
        if (!res.headersSent) res.status(500).json({ error: 'Failed to process audio' });
    }
});

// --- 3. TABULAR REVIEW ---
app.post('/api/tabular-review', async (req, res) => {
    try {
        const { documents, columns } = req.body;
        const prompt = `Analyze these documents and extract: ${JSON.stringify(columns)}. Return ONLY a JSON array. Documents: ${documents.join('\n\n')}`;
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama3-70b-8192", temperature: 0.1,
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
        const prompt = `Read this request: "${request_text}". Return ONLY JSON with keys: "priority" (High/Medium/Low), "missing_info" (array), "draft_response" (string).`;
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama3-70b-8192", temperature: 0.2,
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
        const prompt = `Generate a step-by-step legal workflow for: "${goal}". Return ONLY a JSON array with "step_number" and "instruction".`;
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama3-70b-8192", temperature: 0.3,
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
        if (!supabase || !openai) return res.status(500).json({ error: 'Database or OpenAI not configured.' });
        const { query } = req.body;
        const embeddingResponse = await openai.embeddings.create({ model: "text-embedding-3-small", input: query });
        const { data: documents, error } = await supabase.rpc('match_documents', {
            query_embedding: embeddingResponse.data[0].embedding, match_threshold: 0.5, match_count: 5,
        });
        if (error) throw error;
        let contextText = documents.map(doc => doc.content).join('\n\n---\n\n') || "No specific SA case law found.";
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "system", content: `Answer ONLY using this context: \n\n${contextText}` }, { role: "user", content: query }],
            model: "llama3-70b-8192", temperature: 0.2,
        });
        res.status(200).json({ status: 'success', answer: chatCompletion.choices[0]?.message?.content, sources_used: documents.map(d => d.metadata) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to process deep research' });
    }
});

// --- 7. VERITY AUDIT (CITATION VERIFICATION) ---
app.post('/api/verify-citation', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Database not configured.' });
        const { citation } = req.body;
        const { data: cases } = await supabase.from('legal_documents').select('*').ilike('metadata->>citation', `%${citation}%`).limit(1);
        if (!cases || cases.length === 0) return res.status(200).json({ status: 'flagged', reason: 'Citation not found.' });
        if (cases[0].metadata?.status === 'overruled') return res.status(200).json({ status: 'flagged', reason: 'Case is overruled.' });
        res.status(200).json({ status: 'verified', reason: 'Citation exists and is good law.', case_name: cases[0].metadata?.case_name });
    } catch (error) {
        res.status(500).json({ error: 'Failed to audit citation' });
    }
});

// --- 8. THE VAULT (UPLOAD & INDEX DOCUMENTS) ---
app.post('/api/vault/upload', upload.single('document'), async (req, res) => {
    try {
        if (!supabase || !openai) return res.status(500).json({ error: 'Database/OpenAI not configured.' });
        if (!req.file) return res.status(400).json({ error: 'No document uploaded' });
        const textContent = req.file.buffer.toString('utf-8');
        const embeddingResponse = await openai.embeddings.create({ model: "text-embedding-3-small", input: textContent });
        const { data, error } = await supabase.from('legal_documents').insert([{
            content: textContent,
            metadata: { filename: req.file.originalname, type: 'vault_upload', date: new Date() },
            embedding: embeddingResponse.data[0].embedding
        }]);
        if (error) throw error;
        res.status(200).json({ status: 'success', message: 'Document added to Vault', id: data[0].id });
    } catch (error) {
        res.status(500).json({ error: 'Failed to upload to Vault' });
    }
});

// --- 9. INTEGRATION ECOSYSTEM (iManage / NetDocs Mock) ---
app.get('/api/integrations/imanage/documents', async (req, res) => {
    res.status(200).json({ 
        status: 'success', 
        provider: 'iManage (Mock)', 
        documents: [
            { id: 'doc_001', name: 'NDA_Acme_Corp.pdf', matter: 'Matter-2023-89' },
            { id: 'doc_002', name: 'Affidavit_Smith_v_Jones.docx', matter: 'Matter-2024-12' }
        ]
    });
});

// --- 10. MEMORY LAYER (Save User Style) ---
app.post('/api/memory/style', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Database not configured.' });
        const { user_id, style_prompt } = req.body;
        const { error } = await supabase.from('user_preferences').upsert({ 
            user_id: user_id, 
            style_prompt: style_prompt 
        });
        if (error) throw error;
        res.status(200).json({ status: 'success', message: 'Drafting style saved.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save style' });
    }
});

// --- 11. DRAFT DOCUMENT (NEW ROUTE FOR THE BUTTON) ---
app.post('/api/draft-document', async (req, res) => {
    try {
        const { matter, firm_voice, instructions } = req.body;
        
        const prompt = `You are a South African legal AI drafting assistant. 
        Draft a legal document based on the following instructions. 
        
        Matter: ${matter || 'General'}
        Firm Voice: ${firm_voice || 'Standard'}
        Instructions: ${instructions || 'Draft a standard legal document.'}
        
        Provide a professional, court-ready draft. Include placeholders like [CLIENT NAME] where information is missing.`;

        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama3-70b-8192",
            temperature: 0.3,
        });

        const draft = chatCompletion.choices[0]?.message?.content;
        res.status(200).json({ status: 'success', draft: draft });
    } catch (error) {
        console.error('Draft Document Error:', error);
        res.status(500).json({ error: 'Failed to generate draft' });
    }
});


// ==========================================
// --- NEW LUDUS COURTROOM ROUTES ---
// ==========================================

// 12. LUDUS UPLOAD ROUTE
app.post('/api/upload', upload.single('document'), async (req, res) => {
    console.log("Ludus upload route hit!");
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded. Make sure the FormData key is 'document'." });
        }
        const pdfData = await pdfParse(req.file.buffer);
        const extractedText = pdfData.text;
        
        res.json({ 
            success: true, 
            message: "Document parsed successfully",
            text: extractedText.substring(0, 5000)
        });
    } catch (error) {
        console.error("PDF Parse Error:", error);
        res.status(500).json({ error: "Failed to parse document." });
    }
});

// 13. LUDUS COURTROOM ARGUE ROUTE (AI Judge)
app.post('/api/courtroom/argue', async (req, res) => {
    console.log("Ludus courtroom route hit!");
    try {
        const { argument, caseContext } = req.body;

        if (!argument) {
            return res.status(400).json({ error: "No argument provided." });
        }

        const systemPrompt = `You are Justice Ludus, a strict, analytical High Court Judge. You are presiding over a virtual simulation. The user is an attorney. Be formal and demanding. Case Context: ${caseContext || "None"}`;

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: argument }
            ],
            model: "llama3-8b-8192", 
        });

        res.json({ 
            success: true, 
            reply: chatCompletion.choices[0]?.message?.content,
            scores: { reasoning: 85, authority: 90, responsiveness: 80 } 
        });

    } catch (error) {
        console.error("Groq API Error:", error);
        res.status(500).json({ error: "The Judge is currently in recess." });
    }
});


// --- HEALTH CHECK & START ---
app.get('/', (req, res) => {
    res.status(200).json({ status: 'success', message: 'Onus Probandi & Ludus API is running.' });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
});
