const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');
const { extractText } = require('unpdf');

const app = express();
app.use(cors());
// Increased Express limit for large payloads
app.use(express.json({ limit: '150mb' }));

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

// 150MB limit as requested
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 150 * 1024 * 1024 } 
});

const LUDUS_CONFIG = {
  API_KEY: process.env.DEEPSEEK_API_KEY, 
  API_ENDPOINT: "https://api.deepseek.com/chat/completions",
  MODEL: "deepseek-chat", 
  TEMPERATURE: 0.0, 
};

// The Strict "No Summarize" Audio Textbook Prompt
const DISCIPLINE_PROMPT = `You are a strict, highly experienced South African LLB Law Professor specializing in the Law of Contract (LOC262). You are training a student under extreme pressure for an exam.

YOUR TASK:
Read and explain the provided document sequentially from beginning to end. DO NOT SUMMARIZE. You must act as an audio textbook, delivering a structured lecture that follows the exact sequence of the document.

CRITICAL INSTRUCTIONS:
1. MAINTAIN STRUCTURE: Whenever you encounter a heading, subheading, or title in the text, state it clearly first. 
2. DO NOT SKIP ANYTHING: Walk through the text in the exact order it appears so the student can follow along in their physical copy and know exactly what to cite.
3. EXPLAIN AS YOU GO: After reading a section or paragraph, briefly explain the legal principle in clear terms.
4. CLEAN TEXT ONLY: You are generating a script for a Text-to-Speech engine.
   - NO Markdown symbols (no asterisks, no hashtags, no underscores).
   - NO HTML entities (use standard quotation marks " ").
   - Use simple numbers (1., 2., 3.) for lists.
   - Write in clear, full sentences with proper paragraphs.`;

// Accepts both frontend routes
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

        // Allow up to 100,000 characters (DeepSeek token limit)
        if (documentText.length > 100000) {
            documentText = documentText.substring(0, 100000) + "\n\n[Document truncated due to AI context limits. Please split very large files.]";
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
                max_tokens: 4000
            })
        });

        if (!response.ok) {
            const errorDetails = await response.text();
            console.error("DeepSeek API Error Response:", errorDetails);
            return res.status(500).json({ error: `DeepSeek Error: ${response.status}. Check API key or balance.` });
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

// --- THE COMPLETE FRONTEND WEBSITE (HTML/CSS/JS) ---
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
                        <input type="text" id="prompt" placeholder="teach me" value="Read this sequentially. Do not summarize.">
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
                    submitBtn.textContent = "Processing... Please wait (This may take a minute for large files)";
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
    console.log(`Ludus AI Lecturer is running on port ${PORT}`);
});
