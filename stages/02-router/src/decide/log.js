/**
 * Utterance log: the seed of a fine-tuning / eval set for a local decision model.
 * One JSON line per utterance. `corrected` is for you to fill in when Jarvis got
 * it wrong; scripts/bench can then treat corrected rows as ground truth.
 * Contains raw speech transcripts — kept local and git-ignored (stages/02-router/data/).
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = path.resolve(__dirname, '..', '..', 'data', 'utterances.jsonl');

function logUtterance(entry, file = DEFAULT_FILE) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), corrected: null, ...entry }) + '\n');
  } catch (err) {
    console.error('  ⚠️  utterance log failed:', err.message);
  }
}
module.exports = { logUtterance, DEFAULT_FILE };
