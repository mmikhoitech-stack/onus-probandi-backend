import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

app.post('/api/draft', async (req, res) => {
    // We now receive the context from the frontend
    const { prompt, agentType, context } = req.body; 
    
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    if (!DEEPSEEK_API_KEY) return res.status(500).json({ error: 'DEEPSEEK_API_KEY is not configured.' });

    try {
        console.log(`Drafting document using DeepSeek. Agent: ${agentType}`);
        
        let systemPrompt = "You are an expert South African legal AI. Draft highly professional legal documents, using correct South African legal formatting and citing relevant case law where applicable.";

        if (agentType === 'litigation') {
            systemPrompt = "You are an expert South African litigator. Draft a formal legal document based on the user's facts. If 'Case Context' is provided, you MUST base the draft strictly on the facts and details found in that context.";
        } else if (agentType === 'research') {
            systemPrompt = "You are a South African legal researcher. Summarize the relevant case law clearly. If 'Case Context' is provided, analyze the legal issues within that context.";
        } else if (agentType === 'review') {
            systemPrompt = "You are a senior South African attorney. Review the user's clause or text. If 'Case Context' is provided, review the text against the rules and facts in the context.";
        }

        // Combine the context and the prompt into the final user message
        let userMessage = `User Instruction: ${prompt}`;
        
        if (context && context.trim() !== "") {
            userMessage = `Here is the Case Context / Background Information:\n\n---\n${context}\n---\n\nBased on the above context, please do the following:\n${prompt}`;
        }

        const deepseekResponse = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: systemPrompt }, 
                    { role: "user", content: userMessage }
                ]
            })
        });

        if (!deepseekResponse.ok) throw new Error(`DeepSeek API failed: ${deepseekResponse.status}`);

        const deepseekData = await deepseekResponse.json();
        const draftedDocument = deepseekData.choices[0].message.content;

        res.json({ 
            success: true, 
            cases_retrieved: "DeepSeek internal knowledge base used for this draft.", 
            draft: draftedDocument 
        });

    } catch (error) {
        console.error("Pipeline Error:", error);
        res.status(500).json({ error: "Failed to draft document.", details: error.message });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
