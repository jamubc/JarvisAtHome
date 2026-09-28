/**
 * Local tool-calling decider via Ollama's /api/chat — for tiny function-calling
 * models such as FunctionGemma 270M or Qwen3 0.6B.
 *   ollama pull functiongemma        (set OLLAMA_MODEL to whatever you pulled)
 * One model returns both the intent (tool name) and slots (tool arguments).
 * No tool call = chat.
 */
const { intentList, SLOTS } = require('./intents');

function buildTools() {
  return intentList().filter((i) => i.id !== 'chat').map((i) => {
    const slots = SLOTS[i.id] || {};
    return {
      type: 'function',
      function: {
        name: i.id,
        description: i.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(Object.entries(slots).map(([k, d]) => [k, { type: 'string', description: d }])),
          required: Object.keys(slots),
        },
      },
    };
  });
}

function create({ url = process.env.OLLAMA_URL || 'http://localhost:11434', model = process.env.OLLAMA_MODEL || 'functiongemma' } = {}) {
  const tools = buildTools();
  const known = new Set(tools.map((t) => t.function.name));
  return {
    name: `ollama:${model}`,
    async decide({ transcript }) {
      const res = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, stream: false, tools,
          options: { temperature: 0 },
          messages: [
            { role: 'system', content: 'You control a home assistant. If the user request matches one of the tools, call it. Otherwise do not call any tool.' },
            { role: 'user', content: transcript },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const call = data.message?.tool_calls?.[0]?.function;
      if (call && known.has(call.name)) {
        return { intent: call.name, needsLLM: false, confidence: null, slots: call.arguments || {} };
      }
      return { intent: 'chat', needsLLM: true, confidence: null, slots: {} };
    },
  };
}
module.exports = { create, buildTools };
