/**
 * Pure command matching — no I/O, so it is unit-testable and reusable by the
 * router's `rules` decider.
 *
 * Strategy: collect every command that matches and return the MOST SPECIFIC
 * one (longest matched text), instead of the first one in directory order.
 * Ties keep directory order.
 */

/** Length of the text a phrase matched, or 0 if it did not match. */
function matchScore(phrase, lower) {
  if (phrase instanceof RegExp) {
    const m = lower.match(phrase);
    return m ? m[0].length : 0;
  }
  return lower.includes(phrase) ? phrase.length : 0;
}

/**
 * @param {string} text
 * @param {Array<{id: string, phrases: Array<string|RegExp>}>} commands
 * @returns {object|null} the best matching command, or null
 */
function matchCommand(text, commands) {
  const lower = text.toLowerCase().trim();
  let best = null;
  let bestScore = 0;
  for (const cmd of commands) {
    for (const phrase of cmd.phrases) {
      const score = matchScore(phrase, lower);
      if (score > bestScore) {
        best = cmd;
        bestScore = score;
      }
    }
  }
  return best;
}

module.exports = { matchCommand, matchScore };
