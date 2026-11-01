// --- PERPLEXITY LIVE RESEARCH ROUTE ---
app.post('/api/live-research', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`
      },
      body: JSON.stringify({
        model: "sonar", 
        messages: [
            { role: "system", content: "You are a South African legal research assistant. Provide accurate, cited answers based on the latest available case law." },
            { role: "user", content: query }
        ]
      })
    });

    const data = await response.json();
    
    // Check if Perplexity returned an error
    if (!response.ok) {
        console.error("Perplexity API Error:", data);
        throw new Error(data.error?.message || "Perplexity failed to respond");
    }
    
    res.json({ answer: data.choices[0].message.content });
  } catch (error) {
    console.error("Live Research Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});
