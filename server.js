const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse/lib/pdf-parse.js'); // Fixes the known Render crash bug
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Use diskStorage instead of memoryStorage to prevent RAM crashes
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

// Allow large uploads but store them on disk
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } 
});

const LUDUS_CONFIG = {
  API_KEY: process.env.DEEPSEEK_API_KEY, 
  API_ENDPOINT: "https://api.deepseek.com/chat/completions",
  MODEL: "deepseek-chat", 
  TEMPERATURE: 0.3,
};

const DISCIPLINE_PROMPT = `You are a strict, highly experienced South African Professor. You teach Law of Contract (LOC262) and Onus Probandi principles. Analyze the provided text rigorously and answer the student's prompt based on the document.`;

app.post('/api/lecture', upload.single('document'), async (req, res) => {
    let filePath = req.file ? req.file.path : null;
    
    try {
        const userPrompt = req.body.prompt || "Please analyze this document.";
        let documentText = "";

        if (req.file) {
            const mimeType = req.file.mimetype;

            if (mimeType === 'application/pdf') {
                const dataBuffer = fs.readFileSync(filePath);
                const pdfData = await pdfParse(dataBuffer);
                documentText = pdfData.text;
            } else if (mimeType.includes('word') || mimeType.includes('officedocument')) {
                const docxData = await mammoth.extractRawText({ path: filePath });
                documentText = docxData.value;
            } else {
                return res.status(400).json({ error: "Please upload a PDF or Word document." });
            }
        }

        // Limit text to ~15,000 characters to stay within token limits
        if (documentText.length > 15000) {
            documentText = documentText.substring(0, 15000) + "\n\n[Document truncated to fit AI limits]";
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
                    { role: "user", content: `Student Question: ${userPrompt}\n\nDocument Content:\n${documentText}` }
                ],
                temperature: LUDUS_CONFIG.TEMPERATURE,
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            const errorDetails = await response.text();
            console.error("DeepSeek API Error:", errorDetails);
            return res.status(response.status).json({ error: "The AI service returned an error." });
        }

        const data = await response.json();
        res.json({ success: true, lecture: data.choices[0].message.content });

    } catch (error) {
        console.error("Internal Server Error:", error);
        res.status(500).json({ error: "An error occurred while processing the document." });
    } finally {
        // Clean up the uploaded file from disk
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
});

// ... (Frontend HTML/CSS remains the same as your last working version) ...
