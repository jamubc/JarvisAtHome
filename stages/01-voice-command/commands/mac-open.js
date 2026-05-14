const { exec } = require('child_process');

module.exports = {
  id: 'mac_open',
  // Using Regex to match "open anything"
  phrases: [
    /open (.+)/
  ],
  description: 'Open Mac apps or websites',
  action: (intent) => {
    const lower = intent.transcript.toLowerCase();
    const match = lower.match(/open (.+)/);
    if (!match) return;
    
    // Strip out wake word and punctuation
    let target = match[1]
      .replace(/jarvis/g, '')
      .replace(/[.,?!]/g, '')
      .trim();
      
    console.log(`\n  🖥️  Mac Module: Opening "${target}"...\n`);

    // Basic map for websites vs apps
    if (target === 'youtube') {
      exec("open 'https://youtube.com'");
    } else if (target === 'google') {
      exec("open 'https://google.com'");
    } else {
      // Try opening as a Mac application first
      exec(`open -a "${target}"`, (err) => {
        if (err) {
            // If it's not a known app, try searching the web or opening as URL
            exec(`open 'https://${target}.com'`);
        }
      });
    }
    
    return `Right away, opening ${target}.`;
  }
};
