/**
 * decide() — one interface in front of every way of turning a transcript into an action.
 *
 *   const d = createDecider('rules' | 'ollama' | 'llm' | 'jev', options);
 *   const r = await d.decide({ transcript, state });
 *
 * Result contract:
 *   intent      string   a command id from stage 01, or "chat"
 *   needsLLM    boolean  true when a conversational LLM should answer
 *   confidence  number|null  0..1 when the backend can calibrate it (Jev can; others null)
 *   slots       object   extracted arguments, e.g. { city: "Paris" }
 *   source      string   backend name
 *   ms          number   wall-clock latency of this decision
 *
 * Swapping backends is a config change, so Jev-cloud -> local model needs no router changes.
 */
const backends = {
  rules: require('./rules'),
  ollama: require('./ollama'),
  llm: require('./llm'),
  jev: require('./jev'),
};

function createDecider(name, options) {
  const backend = backends[name];
  if (!backend) throw new Error(`Unknown decider "${name}". Available: ${Object.keys(backends).join(', ')}`);
  const impl = backend.create(options);
  return {
    name: impl.name,
    async decide(input) {
      const start = process.hrtime.bigint();
      const result = await impl.decide(input);
      return { ...result, source: impl.name, ms: Number(process.hrtime.bigint() - start) / 1e6 };
    },
  };
}

module.exports = { createDecider, backends: Object.keys(backends) };
