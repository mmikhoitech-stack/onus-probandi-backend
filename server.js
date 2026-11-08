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

// Store files on disk temporarily
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

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// --- API CONFIGURATION ---
const LUDUS_CONFIG = {
  API_KEY: process.env.DEEPSEEK_API_KEY, 
  API_ENDPOINT: "https://api.deepseek.com/chat/completions",
  MODEL: "deepseek-chat", 
  TEMPERATURE: 0.0, // Changed to 0.0 to stop the AI from hallucinating
};

// --- STRICT SYSTEM PROMPT ---
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
                // Load PDF proxy for page-by-page reading
                pdfProxy = await getDocumentProxy(new Uint8Array(dataBuffer));
                const totalPages = pdfProxy.numPages;
                
                // Read up to 100 pages to allow large study guides, but prevent server crashes
                const MAX_PAGES = 100; 
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

        // Set a very high limit (100,000 chars) to allow large documents without hitting API limits
        if (documentText.length > 100000) {
            documentText = documentText.substring(0, 100000) + "\n\n[Document truncated to fit AI limits]";
        }

        // Send to DeepSeek
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
        res.status(500).json({ error: `Processing error: ${error.message}` });
    } finally {
        // Clean up memory
        if (pdfProxy) {
            try { await pdfProxy.destroy(); } catch (e) {}
        }
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (err) {}
        }
    }
});

// --- FRONTEND WEBSITE ---
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ludus AI Lecturer</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa; color: #333; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
                .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); width: 100%; max-width: 600px; }
                h1 { font-size: 18px; color: #555; text-transform: uppercase; letter-spacing: 1px; text-align: center; margin-bottom: 30px; }
                .form-group { margin-bottom: 20px; }
                label { display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #444; }
                input[type="file"] { width: 100%; padding: 12px; border: 1px dashed #ccc; border-radius: 8px; background: #fafafa; box-sizing: border-box; }
                input[type="text"] { width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 8px; box-sizing: border-box; font-size: 14px; }
                button { width: 100%; padding: 14px; background-color: #d4a373; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; transition: background 0.3s; margin-top: 10px; }
                button:hover { background-color: #bc8a5f; }
                button:disabled { background-color: #e0e0e0; cursor: not-allowed; }
                #error { color: #dc3545; background: #f8d7da; padding: 15px; border-radius: 8px; margin-top: 20px; font-size: 14px; display: none; }
                #result { margin-top: 20px; padding: 20px; background: #f1f3f5; border-radius: 8px; font-size: 15px; line-height: 1.6; white-space: pre-wrap; display: none; border-left: 4px solid #d4a373; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>What should the lecturer teach you today?</h1>
                
                <form id="lectureForm">
                    <div class="form-group">
                        <label>1. Upload your Document (PDF or Word)</label>
                        <input type="file" id="document" name="document" accept=".pdf,.doc,.docx" required>
                    </div>
                    
                    <div class="form-group">
                        <label>2. What should the lecturer teach you today?</label>
                        <input type="text" id="prompt" placeholder="teach me" value="teach me">
                    </div>
                    
                    <button type="submit" id="submitBtn">Start Lecture</button>
                </form>

                <div id="error"></div>
                <div id="result"></div>
            </div>

            <script>
                document.getElementById('lectureForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const fileInput = document.getElementById('document');
                    const promptInput = document.getElementById('prompt');
                    const submitBtn = document.getElementById('submitBtn');
                    const resultDiv = document.getElementById('result');
                    const errorDiv = document.getElementById('error');

                    if (!fileInput.files[0]) {
                        errorDiv.textContent = "Please select a file first.";
                        errorDiv.style.display = 'block';
                        return;
                    }

                    submitBtn.disabled = true;
                    submitBtn.textContent = "Processing... Please wait";
                    resultDiv.style.display = 'none';
                    errorDiv.style.display = 'none';

                    const formData = new FormData();
                    formData.append('document', fileInput.files[0]);
                    formData.append('prompt', promptInput.value);

                    try {
                        const response = await fetch('/api/lecture', {
                            method: 'POST',
                            body: formData
                        });

                        const data = await response.json();

                        if (!response.ok) {
                            throw new Error(data.error || "Failed to process");
                        }

                        resultDiv.textContent = data.lecture;
                        resultDiv.style.display = 'block';
                    } catch (error) {
                        errorDiv.textContent = "Error: " + error.message;
                        errorDiv.style.display = 'block';
                    } finally {
                        submitBtn.disabled = false;
                        submitBtn.textContent = "Start Lecture";
                    }
                });
            </script>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ludus AI Professor is running on port ${PORT}`);
});
