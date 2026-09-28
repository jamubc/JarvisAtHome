/**
 * Jev (TypeSafe System One) adapter — INTENTIONALLY NOT IMPLEMENTED.
 *
 * Jev returns calibrated probabilities for typed questions and would slot in here
 * (intent enum, addressed_to_jarvis, needs_llm, utterance_complete). I could not
 * verify the wire API or SDK signature from this environment, so I did not guess
 * one. To finish it: install @typesafe-ai/sdk, set TYPESAFE_API_KEY, and map its
 * answers onto the contract in ./index.js. Local Jev-compatible servers can then
 * be tried by changing only the base URL.
 */
function create() {
  return {
    name: 'jev',
    async decide() {
      throw new Error('jev backend not implemented — see src/decide/jev.js for how to finish it');
    },
  };
}
module.exports = { create };
