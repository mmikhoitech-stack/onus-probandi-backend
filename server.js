// --- 2. PERPLEXITY LIVE RESEARCH ---
app.post('/api/live-research', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });

  try {
    // Updated to the new v1 endpoint
    const response = await fetch('https://api.perplexity.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`
      },
      body: JSON.stringify({
        model: "sonar", 
        messages: [
            { role: "system", content: "You are a South African legal research assistant. Provide accurate, cited answers." },
            { role: "user", content: query }
        ]
      })
    });

    const data = await response.json();
    
    // If Perplexity rejects the request, capture their exact error
    if (!response.ok) {
        console.error("Perplexity Rejected Request:", data);
        throw new Error(data.error?.message || JSON.stringify(data));
    }
    
    res.json({ answer: data.choices[0].message.content });
  } catch (error) {
    console.error("Live Research Error:", error.message);
    res.status(500).json({ error: error.message }); // Send exact error to frontend
  }
});
