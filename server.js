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

const DISCIPLINE_PROMPT = `You are a strict, highly experienced South African Professor teaching Law of Contract (LOC262) and Onus Probandi. 
YOUR ONLY SOURCE OF TRUTH IS THE DOCUMENT PROVIDED. 
Do not use outside legal knowledge. If the answer is not in the text, you must say: "This specific topic is not covered in the uploaded document." 
Always quote the text directly to support your lecture. Structure your response clearly with headings.`;

// ACCEPTS BOTH '/api/lecture' AND '/api/ludus/lecture'
app.post(['/api/lecture', '/api/ludus/lecture'], upload.any(), async (req, res) => {
    // Extract the file no matter what the frontend named it
    let file = req.files && req.files.length > 0 ? req.files[0] : null;
    let filePath = file ? file.path : null;
    
    try {
        // Extract prompt no matter if frontend called it 'prompt' or 'question'
        const userPrompt = req.body.prompt || req.body.question || "Please analyze this document.";
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

        if (documentText.length > 30000) {
            documentText = documentText.substring(0, 30000) + "\n\n[Document truncated]";
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
            console.error("DeepSeek API Error Response:", errorDetails);
            return res.status(500).json({ error: `DeepSeek Error: ${response.status}` });
        }

        const data = await response.json();
        res.json({ success: true, lecture: data.choices[0].message.content });

    } catch (error) {
        console.error("Detailed Backend Error:", error.message);
        res.status(500).json({ error: `Processing error: ${error.message}` });
    } finally {
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (err) {}
        }
    }
});

// Keep your frontend route here (I'm omitting it for brevity, you can paste the HTML code back in if you still need it)
app.get('/', (req, res) => res.send("Ludus API is running."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ludus AI Lecturer is running on port ${PORT}`);
});
