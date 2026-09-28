const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { synthesize } = require('./elevenlabs');

/**
 * TTS engines. SECURITY: reply text can come from an LLM, Wikipedia, or anyone
 * who can publish to the MQTT topic, so it must never reach a shell. Every
 * process here is started with an argument array (no shell), and text is
 * passed over stdin or an environment variable.
 */

/** Run a command without a shell; optionally feed `input` on stdin. */
function run(cmd, args, { input, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: [input === undefined ? 'ignore' : 'pipe', 'ignore', 'pipe'],
      env: env ? { ...process.env, ...env } : process.env,
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${stderr.trim().slice(0, 200)}`)));
    if (input !== undefined) {
      child.stdin.on('error', () => { /* process exited early; close handler reports it */ });
      child.stdin.end(input);
    }
  });
}

/** Play an audio file. config.player (array) overrides the platform default. */
function playFile(file, config) {
  const custom = config.player;
  if (Array.isArray(custom) && custom.length) return run(custom[0], [...custom.slice(1), file]);
  if (os.platform() === 'darwin') return run('afplay', [file]);
  if (os.platform() === 'linux') return run('play', ['-q', file]); // SoX, already a project requirement
  return Promise.reject(new Error(`No audio player configured for ${os.platform()}`));
}

const engines = {
  async macos_say(text, config) {
    const o = config.engines.macos_say;
    await run('say', ['-v', o.voice, '-r', String(o.rate), '-f', '-'], { input: text });
  },

  async piper(text, config, baseDir) {
    const o = config.engines.piper;
    const tmp = path.join(os.tmpdir(), `jarvis-tts-${process.pid}-${Date.now()}.wav`);
    try {
      await run(path.resolve(baseDir, o.executable), ['--model', path.resolve(baseDir, o.modelPath), '--output_file', tmp], { input: text });
      await playFile(tmp, config);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  },

  async windows_native(text) {
    await run('powershell', [
      '-NoProfile', '-Command',
      'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak($env:JARVIS_TEXT)',
    ], { env: { JARVIS_TEXT: text } });
  },

  async elevenlabs(text, config, baseDir) {
    const o = { ...config.engines.elevenlabs };
    o.cacheDir = path.resolve(baseDir, o.cacheDir || './cache');
    o.usageFile = path.resolve(baseDir, o.usageFile || './usage.json');
    const { file, cached, characters } = await synthesize(text, o);
    if (!cached) console.log(`  💳  ElevenLabs: ${characters} characters billed (cached for next time)`);
    await playFile(file, config);
  },
};

/**
 * Speak `text` with the active engine; on failure, fall back to
 * config.fallbackEngine so Jarvis never goes silent (e.g. offline, cap hit).
 * Always resolves — TTS problems are logged, not thrown.
 */
async function speak(text, config, baseDir = path.join(__dirname, '..')) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (!clean) return;

  const order = [config.activeEngine, config.fallbackEngine].filter((e, i, a) => e && a.indexOf(e) === i);
  for (const name of order) {
    const engine = engines[name];
    if (!engine) { console.error(`  ⚠️  Unknown TTS engine: ${name}`); continue; }
    console.log(`  🗣️  [${name}] Speaking: "${clean}"`);
    try {
      await engine(clean, config, baseDir);
      return;
    } catch (err) {
      console.error(`  ⚠️  TTS engine "${name}" failed: ${err.message}`);
    }
  }
}

module.exports = { speak, engines, run, playFile };
