/**
 * The closed intent set decide() chooses from, plus "chat" (= hand to the LLM).
 * Derived from stage 01's command files so the two never drift apart.
 */
const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.resolve(__dirname, '..', '..', '..', '01-voice-command', 'commands');

function loadCommands(dir = COMMANDS_DIR) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => require(path.join(dir, f)));
}

/** Slots each intent can carry (used to build tool schemas / extraction schemas). */
const SLOTS = {
  weather: { city: 'City name the user asked about' },
  mac_open: { target: 'App or website to open' },
  wikipedia_search: { topic: 'Topic to look up' },
};

function intentList(commands = loadCommands()) {
  return [...commands.map((c) => ({ id: c.id, description: c.description })),
    { id: 'chat', description: 'General conversation or a question that is none of the other actions' }];
}

module.exports = { loadCommands, intentList, SLOTS, COMMANDS_DIR };
