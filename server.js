const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');
const { extractText } = require('unpdf');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } 
});

const LUDUS_CONFIG = {
  API_KEY: process.env.DEEPSEEK_API_KEY, 
  API_ENDPOINT: "https://api.deepseek.com/chat/completions",
  MODEL: "deepseek-chat", 
  TEMPERATURE: 0.0, 
};

// ==========================================
// 1. YOUR EXISTING LECTURER FUNCTION (UNTOUCHED)
// ==========================================
const DISCIPLINE_PROMPT = `You are a strict, highly experienced South African LLB Law Professor. Read the document sequentially. Do NOT summarize. Explain as you go. Bring in external knowledge where relevant.`;

app.post(['/api/lecture', '/api/ludus/lecture'], upload.any(), async (req, res) => {
    let file = req.files && req.files.length > 0 ? req.files[0] : null;
    let filePath = file ? file.path : null;
    
    try {
        const userPrompt = req.body.prompt || req.body.question || "Please start the lecture.";
        let documentText = "";

        if (file) {
            if (file.originalname.endsWith('.pdf')) {
                const dataBuffer = fs.readFileSync(filePath);
                const pdfData = await extractText(new Uint8Array(dataBuffer), { mergePages: true });
                documentText = pdfData.text;
            } else if (file.originalname.endsWith('.docx')) {
                const docxBuffer = fs.readFileSync(filePath);
                const docxData = await mammoth.extractRawText({ buffer: Buffer.from(docxBuffer) });
                documentText = docxData.value;
            }
        }

        if (!documentText) return res.status(400).json({ error: "No readable text found." });
        if (documentText.length > 80000) documentText = documentText.substring(0, 80000);

        const response = await fetch(LUDUS_CONFIG.API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LUDUS_CONFIG.API_KEY}` },
            body: JSON.stringify({
                model: LUDUS_CONFIG.MODEL,
                messages: [
                    { role: "system", content: DISCIPLINE_PROMPT },
                    { role: "user", content: `Student Instruction: ${userPrompt}\n\nDocument Content:\n${documentText}` }
                ],
                temperature: LUDUS_CONFIG.TEMPERATURE,
                max_tokens: 8000 
            })
        });

        const data = await response.json();
        res.json({ success: true, lecture: data.choices[0].message.content });

    } catch (error) {
        res.status(500).json({ error: `Processing error: ${error.message}` });
    } finally {
        if (filePath && fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (err) {} }
    }
});

// ==========================================
// 2. YOUR NEW SIMULATOR FUNCTION (ISOLATED)
// ==========================================
app.post('/api/simulator', upload.single('examPaper'), async (req, res) => {
    let filePath = req.file ? req.file.path : null;
    try {
        const userAnswer = req.body.answer || "";
        let examText = "";

        if (req.file) {
            if (req.file.originalname.endsWith('.pdf')) {
                const dataBuffer = fs.readFileSync(filePath);
                const pdfData = await extractText(new Uint8Array(dataBuffer), { mergePages: true });
                examText = pdfData.text;
            } else if (req.file.originalname.endsWith('.docx')) {
                const docxBuffer = fs.readFileSync(filePath);
                const docxData = await mammoth.extractRawText({ buffer: Buffer.from(docxBuffer) });
                examText = docxData.value;
            }
        }

        if (!examText) return res.status(400).json({ error: "No readable text found." });

        const SIMULATOR_PROMPT = `You are a strict South African Examiner. Based on the exam paper, give the user ONE question at a time. If they provide an answer, mark it strictly and give a score. Then provide the next question. Do not lecture.`;

        const response = await fetch(LUDUS_CONFIG.API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LUDUS_CONFIG.API_KEY}` },
            body: JSON.stringify({
                model: LUDUS_CONFIG.MODEL,
                messages: [
                    { role: "system", content: SIMULATOR_PROMPT },
                    { role: "user", content: `Exam Paper:\n${examText}\n\nStudent Answer: ${userAnswer}` }
                ],
                temperature: 0.2,
                max_tokens: 2000
            })
        });

        const data = await response.json();
        res.json({ success: true, response: data.choices[0].message.content });

    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (filePath && fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (err) {} }
    }
});

// ==========================================
// 3. START SERVER
// ==========================================
app.get('/', (req, res) => res.send("Ludus API is running."));
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ludus API is running on port ${PORT}`);
});
