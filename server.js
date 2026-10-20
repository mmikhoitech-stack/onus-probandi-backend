import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const MCP_GATEWAY_URL = "https://gateway.ansvar.eu/mcp"; 

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

app.post('/api/draft', async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!DEEPSEEK_API_KEY) {
        return res.status(500).json({ error: 'DEEPSEEK_API_KEY is not configured on the server.' });
    }

    try {
        console.log(`Connecting to MCP Gateway to retrieve cases for: "${prompt}"`);
        
        // 1. Connect to the remote MCP Gateway via SSE
        // Note: We append /sse to the gateway URL as is standard for SSE connections
        const transport = new SSEClientTransport(new URL(`${MCP_GATEWAY_URL}/sse`));
        const mcpClient = new Client({ name: "onus-probandi-backend", version: "1.0.0" }, { capabilities: {} });
        
        await mcpClient.connect(transport);
        console.log("Successfully connected to MCP Gateway.");

        // 2. Call the search tool (Using the standard Ansvar tool name)
        const toolResult = await mcpClient.callTool({
            name: "search_case_law", 
            arguments: { query: prompt, limit: 3 }
        });

        await mcpClient.close();

        // Extract the text from the MCP result
        const retrievedCases = toolResult.content.map(c => c.text).join("\n\n");
        console.log("Successfully retrieved cases from MCP.");

        // 3. Send to DeepSeek with the retrieved cases as context
        console.log("Sending request to DeepSeek...");
        const deepseekResponse = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    {
                        role: "system",
                        content: "You are a South African legal AI assistant. You must draft legal documents based ONLY on the provided case law context. If the context does not support the draft, explicitly state that."
                    },
                    {
                        role: "user",
                        content: `Here is the case law context retrieved from the database:\n\n${retrievedCases}\n\nBased on this, please draft the following: ${prompt}`
                    }
                ]
            })
        });

        if (!deepseekResponse.ok) {
            const errText = await deepseekResponse.text();
            console.error("DeepSeek API Error:", errText);
            throw new Error(`DeepSeek API failed with status ${deepseekResponse.status}`);
        }

        const deepseekData = await deepseekResponse.json();
        const draftedDocument = deepseekData.choices[0].message.content;

        // 4. Return the final response to the frontend
        res.json({
            success: true,
            cases_retrieved: retrievedCases,
            draft: draftedDocument
        });

    } catch (error) {
        console.error("Pipeline Error:", error);
        res.status(500).json({ 
            error: "Failed to retrieve verified case law or draft document.",
            details: error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
