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
const LUDUS_CONFIG = {
  // Make sure your API key is set in Hostinger's environment variables!
  API_KEY: process.env.LUDUS_API_KEY || "YOUR_DEEPSEEK_API_KEY_HERE", 
  API_ENDPOINT: "https://api.deepseek.com/chat/completions",
  MODEL: "deepseek-chat", 
  TEMPERATURE: 0.3,
};

// --- SYSTEM PROMPT ---
const DISCIPLINE_PROMPT = `You are a strict, highly experienced South African Professor. You teach Law of Contract (LOC262) and Onus Probandi principles. 
YOUR TEACHING STYLE: Analyze the provided text rigorously, cite relevant legal principles, and answer the student's prompt based strictly on the uploaded document.`;

// --- BACKEND API ROUTE ---
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
            throw new Error(`DeepSeek API Error: ${response.status}`);
        }

        const data = await response.json();
        
        // 3. Send the answer back to the website
        res.json({ success: true, lecture: data.choices[0].message.content });

    } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "The AI Lecturer service returned an error." });
    }
});

// --- FRONTEND (HTML/CSS) ---
// This serves the webpage to the user
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AI Lecturer</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f4f4f9; }
                h1 { color: #333; }
                .container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
                input[type="file"], input[type="text"] { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
                button { background-color: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; width: 100%; }
                button:hover { background-color: #0056b3; }
                #result { margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 4px; white-space: pre-wrap; font-family: monospace; }
                #error { color: red; margin-top: 10px; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>WHAT SHOULD THE LECTURER TEACH YOU TODAY?</h1>
                
                <form id="lectureForm">
                    <label>1. Upload your PDF or Word Document:</label>
                    <input type="file" id="document" name="document" accept=".pdf,.doc,.docx" required>
                    
                    <label>2. What do you want the Professor to do?</label>
                    <input type="text" id="prompt" placeholder="e.g., Summarize this document" value="Summarize this document">
                    
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
                        return;
                    }

                    // Reset UI
                    submitBtn.disabled = true;
                    submitBtn.textContent = "Processing... Please wait";
                    resultDiv.textContent = "";
                    errorDiv.textContent = "";

                    // Prepare the data to send
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
                    } catch (error) {
                        errorDiv.textContent = "Error: " + error.message;
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
