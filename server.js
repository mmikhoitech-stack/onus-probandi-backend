const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');
const { getDocumentProxy } = require('unpdf');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

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

// 1. HARD FILE SIZE LIMIT: Reject files larger than 10MB upfront
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

app.post('/api/lecture', upload.single('document'), async (req, res) => {
    let filePath = req.file ? req.file.path : null;
    let pdfProxy = null;
    
    try {
        const userPrompt = req.body.prompt || "Please analyze this document.";
        let documentText = "";

        if (req.file) {
            const mimeType = req.file.mimetype;
            const originalName = req.file.originalname.toLowerCase();

            if (mimeType === 'application/pdf' || originalName.endsWith('.pdf')) {
                const dataBuffer = fs.readFileSync(filePath);
                pdfProxy = await getDocumentProxy(new Uint8Array(dataBuffer));
                const totalPages = pdfProxy.numPages;
                
                // 2. STRICT PAGE LIMIT: Only read the first 10 pages to save memory
                const MAX_PAGES = 10; 
                const pagesToRead = Math.min(totalPages, MAX_PAGES);

                for (let i = 1; i <= pagesToRead; i++) {
                    const page = await pdfProxy.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    documentText += pageText + "\n";
                }

                if (totalPages > MAX_PAGES) {
                    documentText += `\n\n[Document truncated: Analyzed first ${MAX_PAGES} pages out of ${totalPages} total pages.]`;
                }
            } else if (mimeType.includes('word') || mimeType.includes('officedocument') || originalName.endsWith('.docx') || originalName.endsWith('.doc')) {
                const docxBuffer = fs.readFileSync(filePath);
                const docxData = await mammoth.extractRawText({ buffer: docxBuffer });
                documentText = docxData.value || "";
            } else {
                return res.status(400).json({ error: "Please upload a valid PDF or Word document." });
            }
        }

        if (!documentText || documentText.trim() === "") {
            return res.status(400).json({ error: "The document appears to be empty or contains no readable text." });
        }

        if (documentText.length > 20000) {
            documentText = documentText.substring(0, 20000) + "\n\n[Document truncated to fit AI limits]";
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
            return res.status(500).json({ error: `AI service error (${response.status}). Check your DeepSeek API key or balance.` });
        }

        const data = await response.json();
        res.json({ success: true, lecture: data.choices[0].message.content });

    } catch (error) {
        console.error("Detailed Backend Error:", error.stack || error.message);
        // Catch Multer file size errors specifically
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: "File is too large. Please upload a document smaller than 10MB." });
        }
        res.status(500).json({ error: `Processing error: ${error.message}` });
    } finally {
        if (pdfProxy) {
            try { await pdfProxy.destroy(); } catch (e) {}
        }
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (err) {}
        }
    }
});

// --- FRONTEND (Keep your existing frontend code) ---
// ... [Your existing frontend app.get('/') code goes here] ...

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ludus AI Professor is running on port ${PORT}`);
});
