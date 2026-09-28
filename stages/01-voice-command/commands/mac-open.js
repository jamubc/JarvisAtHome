const { execFile } = require('child_process');

// Anchored: only "[jarvis,] [please] open <thing>" at the START of the utterance.
// An unanchored /open (.+)/ hijacked sentences like "what time does the store open today".
const OPEN_RE = /^\s*(?:(?:hey |ok )?jarvis[,.]?\s+)?(?:please\s+)?open\s+(.+)$/;

/** Keep only characters that can appear in an app name or hostname. */
function sanitizeTarget(raw) {
  return raw.replace(/[^a-z0-9 .\-]/g, '').trim();
}

module.exports = {
  id: 'mac_open',
  phrases: [OPEN_RE],
  description: 'Open Mac apps or websites',
  action: (intent) => {
    const match = intent.transcript.toLowerCase().match(OPEN_RE);
    if (!match) return;

    const target = sanitizeTarget(match[1]);
    if (!target) return;

    console.log(`\n  🖥️  Mac Module: Opening "${target}"...\n`);

    // execFile with an args array: the transcript never touches a shell.
    if (target === 'youtube') {
      execFile('open', ['https://youtube.com']);
    } else if (target === 'google') {
      execFile('open', ['https://google.com']);
    } else {
      execFile('open', ['-a', target], (err) => {
        if (err) {
          // Not a known app — try it as a website.
          execFile('open', [`https://${target.replace(/ /g, '')}.com`]);
        }
      });
    }

    return `Right away, opening ${target}.`;
  },
};
