/**
 * OpenRouter LLM Client
 * 
 * Calls OpenRouter's chat completions endpoint (OpenAI-compatible).
 * Uses the 'openrouter/free' model which auto-selects the best free model.
 * API key is loaded from the root .env file.
 */

async function chat(config, userMessage) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || config.model;

  if (!apiKey || apiKey === 'your-key-here') {
    return '[LLM unavailable — set OPENROUTER_API_KEY in .env]';
  }

  try {
    const requestMessages = Array.isArray(userMessage) 
      ? userMessage 
      : [
          { role: 'system', content: config.systemPrompt },
          { role: 'user', content: userMessage },
        ];

    const response = await fetch(config.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost',
        'X-Title': 'Jarvis Assistant',
      },
      body: JSON.stringify({
        model: model,
        messages: requestMessages,
        max_tokens: 500,
        temperature: 0.7,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`  ⚠️  LLM API error (${response.status}):`, errBody);
      return `Sorry, I encountered an error processing that request.`;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || 'I have no response for that.';
  } catch (err) {
    console.error('  ⚠️  LLM request failed:', err.message);
    return `Sorry, I couldn't reach the AI service right now.`;
  }
}

module.exports = { chat };
