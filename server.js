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

// Store files temporarily on disk
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
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const LUDUS_CONFIG = {
  API_KEY: process.env.DEEPSEEK_API_KEY, 
  API_ENDPOINT: "https://api.deepseek.com/chat/completions",
  MODEL: "deepseek-chat", 
  TEMPERATURE: 0.0, 
};

// --- STRICT PROMPT: NO SUMMARIES, KEEP HEADINGS, CLEAN TEXT ---
const DISCIPLINE_PROMPT = `You are a strict, highly experienced South African LLB Law Professor specializing in the Law of Contract (LOC262). You are training a student under extreme pressure for an exam.

YOUR TASK:
Read and explain the provided document sequentially from beginning to end. DO NOT SUMMARIZE. You must act as an audio textbook, delivering a structured lecture that follows the exact sequence of the document.

CRITICAL INSTRUCTIONS:
1. MAINTAIN STRUCTURE: Whenever you encounter a heading, subheading, or title in the text, state it clearly first (e.g., "Heading: Part 1, The Ludus System Prompt"). 
2. DO NOT SKIP ANYTHING: Walk through the text in the exact order it appears so the student can follow along in their physical copy and know exactly what to cite.
3. EXPLAIN AS YOU GO: After reading a section or paragraph, briefly explain the legal principle in clear terms.
4. CLEAN TEXT ONLY: You are generating a script for a Text-to-Speech engine.
   - NO Markdown symbols (no asterisks, no hashtags, no underscores).
   - NO HTML entities (use standard quotation marks " ").
   - Use simple numbers (1., 2., 3.) for lists.
   - Write in clear, full sentences with proper paragraphs.`;

app.post(['/api/lecture', '/api/ludus/lecture'], upload.any(), async (req, res) => {
    let file = req.files && req.files.length > 0 ? req.files[0] : null;
    let filePath = file ? file.path : null;
    
    try {
        const userPrompt = req.body.prompt || req.body.question || "Please start the lecture.";
        let documentText = "";

        if (file) {
            const mimeType = file.mimetype;
            const originalName = file.originalname.toLowerCase();

            if (mimeType === 'application/pdf' || originalName.endsWith('.pdf')) {
                const dataBuffer = fs.readFileSync(filePath);
                const pdfData = await extractText(new Uint8Array(dataBuffer), { mergePages: true });
                documentText = pdfData.text;
            } else if (mimeType.includes('word') || mimeType.includes('officedocument') || originalName.endsWith('.docx') || originalName.endsWith('.doc')) {
                const docxBuffer = fs.readFileSync(filePath);
                const docxData = await mammoth.extractRawText({ buffer: Buffer.from(docxBuffer) });
                documentText = docxData.value || "";
            } else if (mimeType === 'text/plain' || originalName.endsWith('.txt')) {
                documentText = fs.readFileSync(filePath, 'utf8');
            } else {
                return res.status(400).json({ error: "Unsupported file format." });
            }
        }

        if (!documentText || documentText.trim() === "") {
            return res.status(400).json({ error: "No readable text found. It might be a scanned image." });
        }

        // INCREASED LIMIT: Allow up to 80,000 characters
        if (documentText.length > 80000) {
            documentText = documentText.substring(0, 80000) + "\n\n[Document truncated due to size limits. Please split large files.]";
        }

        const response = await fetch(LUDUS_CONFIG.API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${LUDUS_CONFIG.API_KEY}`
            },
            body: JSON.stringify({
                model: LUDUS_CONFIG.MODEL,
                messages: [
                    { role: "system", content: DISCIPLINE_PROMPT },
                    { role: "user", content: `Student Instruction: ${userPrompt}\n\nDocument Content to read step-by-step:\n${documentText}` }
                ],
                temperature: LUDUS_CONFIG.TEMPERATURE,
                max_tokens: 8000 // INCREASED OUTPUT: Allow AI to write longer responses
            })
        });

        if (!response.ok) {
            return res.status(500).json({ error: `DeepSeek Error: ${response.status}` });
        }

        const data = await response.json();
        res.json({ success: true, lecture: data.choices[0].message.content });

    } catch (error) {
        res.status(500).json({ error: `Processing error: ${error.message}` });
    } finally {
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (err) {}
        }
    }
});

app.get('/', (req, res) => res.send("Ludus API is running."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ludus AI Lecturer is running on port ${PORT}`);
});
