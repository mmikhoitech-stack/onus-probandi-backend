// ... (keep your imports and setup the same)

app.post('/api/draft', async (req, res) => {
    // We now expect agentType from the frontend
    const { prompt, agentType } = req.body; 
    
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    if (!DEEPSEEK_API_KEY) return res.status(500).json({ error: 'DEEPSEEK_API_KEY is not configured.' });

    try {
        console.log(`Running agent: ${agentType || 'default'} for: "${prompt}"`);
        
        // ... (Keep your MCP connection code here) ...
        const transport = new StdioClientTransport({
            command: "npx",
            args: ["-y", "github:Ansvar-Systems/southafrica-law-mcp"]
        });
        const mcpClient = new Client({ name: "onus-probandi-backend", version: "1.0.0" }, { capabilities: {} });
        await mcpClient.connect(transport);

        const toolResult = await mcpClient.callTool({
            name: "search_case_law", 
            arguments: { query: prompt, limit: 3 }
        });
        await mcpClient.close();

        const retrievedCases = toolResult.content.map(c => c.text).join("\n\n");

        // --- NEW: DYNAMIC SYSTEM PROMPTS BASED ON AGENT TYPE ---
        let systemPrompt = "You are a South African legal AI. Draft documents based ONLY on the provided case law context.";

        if (agentType === 'litigation') {
            systemPrompt = "You are an expert South African litigator. Draft a formal legal document (like an affidavit or pleading) based on the user's facts. Cite the provided case law accurately.";
        } else if (agentType === 'research') {
            systemPrompt = "You are a South African legal researcher. Summarize the provided case law clearly. Explain how these cases apply to the user's legal question.";
        } else if (agentType === 'review') {
            systemPrompt = "You are a senior South African attorney. Review the user's clause or text against the provided case law. Highlight any risks, missing elements, or legal issues.";
        }

        // Send to DeepSeek with the specific agent role
        const deepseekResponse = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: systemPrompt }, // Using the dynamic prompt here
                    { role: "user", content: `Case law context:\n\n${retrievedCases}\n\nUser Input: ${prompt}` }
                ]
            })
        });

        if (!deepseekResponse.ok) throw new Error(`DeepSeek API failed: ${deepseekResponse.status}`);

        const deepseekData = await deepseekResponse.json();
        const draftedDocument = deepseekData.choices[0].message.content;

        res.json({ success: true, cases_retrieved: retrievedCases, draft: draftedDocument });

    } catch (error) {
        console.error("Pipeline Error:", error);
        res.status(500).json({ error: "Failed to retrieve verified case law.", details: error.message });
    }
});
