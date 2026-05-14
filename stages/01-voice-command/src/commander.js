const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { playSound, ensurePingSound } = require('./sounds');

/**
 * Commander — loads commands, matches intents, manages wake state.
 * 
 * Extends EventEmitter so downstream pipeline stages can subscribe:
 * 
 *   commander.on('wake',    ()         => { ... })  // Wake word detected
 *   commander.on('sleep',   ()         => { ... })  // Went to sleep
 *   commander.on('intent',  (intent)   => { ... })  // Command matched
 *   commander.on('unknown', (data)     => { ... })  // Speech heard, no match
 *   commander.on('idle',    (data)     => { ... })  // Sleeping, heard speech
 * 
 * Intent object shape (emitted on 'intent'):
 *   {
 *     id:         'get_time',           // Command ID
 *     transcript: "what's the time",    // Raw transcript
 *     elapsed:    82,                   // Transcription time in ms
 *     timestamp:  1715...,              // Date.now()
 *   }
 */
class Commander extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.commands = [];
    this.isAwake = false;
    this.awakeTimeout = null;

    this.wakeWord = config.wakeWord.toLowerCase();
    this.wakeVariants = config.wakeWordVariants.map(w => w.toLowerCase());

    // Load commands from the commands/ directory
    this._loadCommands();

    // Generate ping sound
    this.pingPath = ensurePingSound(config);
  }

  /**
   * Auto-load all .js files from the commands/ directory.
   * Each file must export: { id, phrases, description, action? }
   */
  _loadCommands() {
    const commandsDir = path.join(__dirname, '..', 'commands');
    if (!fs.existsSync(commandsDir)) {
      fs.mkdirSync(commandsDir, { recursive: true });
      return;
    }

    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));
    for (const file of files) {
      try {
        const cmd = require(path.join(commandsDir, file));
        if (cmd.id && cmd.phrases) {
          this.commands.push(cmd);
        } else {
          console.warn(`  ⚠️  Skipping ${file} — missing 'id' or 'phrases' export.`);
        }
      } catch (err) {
        console.error(`  ⚠️  Failed to load command ${file}:`, err.message);
      }
    }
  }

  /**
   * Check if text contains the wake word.
   */
  checkWakeWord(text) {
    const lower = text.toLowerCase();
    return this.wakeVariants.some(v => lower.includes(v));
  }

  /**
   * Match transcript text against registered commands.
   * Returns the matched command or null.
   */
  matchCommand(text) {
    const lower = text.toLowerCase().trim();
    for (const cmd of this.commands) {
      for (const phrase of cmd.phrases) {
        if (phrase instanceof RegExp) {
          if (phrase.test(lower)) return cmd;
        } else if (lower.includes(phrase)) {
          return cmd;
        }
      }
    }
    return null;
  }

  /**
   * Reset the auto-sleep timer.
   */
  resetAwakeTimer() {
    if (this.awakeTimeout) clearTimeout(this.awakeTimeout);
    this.awakeTimeout = setTimeout(() => {
      this.isAwake = false;
      this.emit('sleep', { reason: 'timeout' });
    }, this.config.awakeDurationMs);
  }

  /**
   * Process a transcription result.
   * This is the main entry point — called by the listen loop with each transcript.
   * 
   * @param {string} text     - Transcribed text
   * @param {number} elapsed  - Transcription time in ms
   */
  process(text, elapsed) {
    if (!text || text === '[BLANK_AUDIO]' || text === '(silence)') return;

    const timestamp = Date.now();

    if (!this.isAwake) {
      // ── SLEEPING ──
      if (this.checkWakeWord(text)) {
        this.isAwake = true;
        this.resetAwakeTimer();
        playSound(this.pingPath);
        this.emit('wake');

        // Check if command was in the same utterance: "Jarvis, what's the time?"
        const cmd = this.matchCommand(text);
        if (cmd) {
          const intent = { id: cmd.id, transcript: text, elapsed, timestamp };
          if (cmd.action) {
            const returnedFeedback = cmd.action(intent, (text) => this.emit('feedback', text));
            if (returnedFeedback && typeof returnedFeedback === 'string') {
              intent.feedback = returnedFeedback;
            }
            intent.handledLocally = true;
          }
          this.emit('intent', intent);
          this.resetAwakeTimer();
        }
      } else {
        this.emit('idle', { transcript: text, elapsed, timestamp });
      }
    } else {
      // ── AWAKE — COMMAND MODE ──
      const cmd = this.matchCommand(text);
      if (cmd) {
        const intent = { id: cmd.id, transcript: text, elapsed, timestamp };
        if (cmd.action) {
          const returnedFeedback = cmd.action(intent, (text) => this.emit('feedback', text));
          if (returnedFeedback && typeof returnedFeedback === 'string') {
            intent.feedback = returnedFeedback;
          }
          intent.handledLocally = true;
        }
        this.emit('intent', intent);
        this.resetAwakeTimer();
      } else if (this.checkWakeWord(text)) {
        // Just said the wake word again — acknowledge
        playSound(this.pingPath);
        this.emit('wake');
        this.resetAwakeTimer();
      } else {
        this.emit('unknown', { transcript: text, elapsed, timestamp });
      }
    }
  }

  /**
   * Force sleep (used by the sleep command).
   */
  sleep() {
    this.isAwake = false;
    if (this.awakeTimeout) clearTimeout(this.awakeTimeout);
    this.emit('sleep', { reason: 'command' });
  }

  /**
   * Get list of registered commands (for display).
   */
  getCommands() {
    return this.commands.map(c => ({
      id: c.id,
      phrase: c.phrases[0],
      description: c.description,
    }));
  }
}

module.exports = { Commander };
