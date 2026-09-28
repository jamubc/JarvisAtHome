/** Baseline decider: the existing substring/regex matcher from stage 01. */
const { matchCommand } = require('../../../01-voice-command/src/matcher');
const { loadCommands } = require('./intents');

function create() {
  const commands = loadCommands();
  return {
    name: 'rules',
    async decide({ transcript }) {
      const cmd = matchCommand(transcript, commands);
      return cmd
        ? { intent: cmd.id, needsLLM: false, confidence: null, slots: {} }
        : { intent: 'chat', needsLLM: true, confidence: null, slots: {} };
    },
  };
}
module.exports = { create };
