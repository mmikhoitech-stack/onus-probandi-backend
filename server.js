const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();

// Fixes connection errors and allows JSON
app.use(cors());
app.use(express.json());

// Set up file upload handling (stores file in memory)
const upload = multer({ storage: multer.memoryStorage() });

// --- DEEPSEEK CONFIGURATION ---
// Using the exact name from your Render environment variables
const LUDUS_CONFIG = {
  API_KEY: process.env.DEEPSEEK_API_KEY, 
  API_ENDPOINT: "https://api.deepseek.com/chat/completions",
  MODEL: "deepseek-chat", 
  TEMPERATURE: 0.3,
};

// --- SYSTEM PROMPT ---
const DISCIPLINE_PROMPT = `You are a strict, highly experienced South African Professor. You teach Law of Contract (LOC262) and Onus Probandi principles. 
YOUR TEACHING STYLE: Analyze the provided text rigorously, cite relevant legal principles, and answer the student's prompt based strictly on the uploaded document.`;

// --- BACKEND API ROUTE (Handles the document upload) ---
app.post('/api/lecture', upload.single('document'), async (req, res) => {
    try {
        const userPrompt = req.body.prompt || "Please analyze this document.";
        let documentText = "";

        // 1. Read the uploaded document (PDF or Word)
        if (req.file) {
            if (req.file.mimetype === 'application/pdf') {
                const pdfData = await pdfParse(req.file.buffer);
                documentText = pdfData.text;
            } else if (req.file.mimetype.includes('word') || req.file.mimetype.includes('officedocument')) {
                const docxData = await mammoth.extractRawText({ buffer: req.file.buffer });
                documentText = docxData.value;
            } else {
                return res.status(400).json({ error: "Please upload a PDF or Word document." });
            }
        }

        // 2. Send extracted text to DeepSeek API
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
                temperature: LUDUS_CONFIG.TEMPERATURE
            })
        });

        if (!response.ok) {
            const errorDetails = await response.text();
            console.error("DeepSeek Error:", errorDetails);
            throw new Error(`DeepSeek API Error: ${response.status}`);
        }

        const data = await response.json();
        
        // 3. Send the answer back to the website
        res.json({ success: true, lecture: data.choices[0].message.content });

    } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "The AI Lecturer service returned an error. Please try again." });
    }
});

// --- FRONTEND (HTML/CSS) - Recreated from your screenshot ---
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
                        <input type="text" id="prompt" placeholder="I've uploaded the professor in this attached module" value="I've uploaded the professor in this attached module">
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

                    // Reset UI
                    submitBtn.disabled = true;
                    submitBtn.textContent = "Processing document... Please wait";
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

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Ludus AI Professor is running on port ${PORT}`);
});
