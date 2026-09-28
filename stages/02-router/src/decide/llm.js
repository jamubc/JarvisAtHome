/** Cloud-LLM decider using the router's existing OpenRouter client (JSON mode). */
const { chat } = require('../llm');
const { intentList, SLOTS } = require('./intents');

function create(llmConfig) {
  const intents = intentList();
  const system = `You classify one spoken request for a home assistant.
Intents: ${intents.map((i) => `${i.id} (${i.description})`).join('; ')}.
Slots by intent: ${JSON.stringify(SLOTS)}.
Reply ONLY with JSON: {"intent": "<id>", "slots": {}}. Use "chat" if nothing else fits.`;
  return {
    name: 'llm',
    async decide({ transcript }) {
      const raw = await chat(llmConfig, [{ role: 'system', content: system }, { role: 'user', content: transcript }]);
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error(`No JSON in LLM reply: ${raw.slice(0, 120)}`);
      const out = JSON.parse(m[0]);
      const ok = intents.some((i) => i.id === out.intent);
      const intent = ok ? out.intent : 'chat';
      return { intent, needsLLM: intent === 'chat', confidence: null, slots: out.slots || {} };
    },
  };
}
module.exports = { create };
