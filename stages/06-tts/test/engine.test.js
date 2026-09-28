const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { speak } = require('../src/engine');
const { synthesize } = require('../src/elevenlabs');

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-tts-test-')); }

test('regression: shell metacharacters in reply text are never executed', async () => {
  const dir = tmpdir();
  const marker = path.join(dir, 'pwned');
  const stdinDump = path.join(dir, 'stdin.txt');
  // Fake "piper": copies stdin to a file, then writes the --output_file it was given.
  const fake = path.join(dir, 'fakepiper');
  fs.writeFileSync(fake, `#!/bin/sh\ncat > "${stdinDump}"\nwhile [ $# -gt 0 ]; do [ "$1" = "--output_file" ] && : > "$2"; shift; done\n`, { mode: 0o755 });

  const text = `hello $(touch ${marker}) and \`touch ${marker}\` ; touch ${marker}`;
  const config = {
    activeEngine: 'piper',
    player: ['true'],
    engines: { piper: { executable: fake, modelPath: 'unused.onnx' } },
  };
  await speak(text, config, dir);

  assert.ok(!fs.existsSync(marker), 'command substitution was executed!');
  assert.strictEqual(fs.readFileSync(stdinDump, 'utf8'), text, 'text must arrive verbatim on stdin');
});

test('falls back to the fallback engine when the active one fails', async () => {
  const dir = tmpdir();
  const dump = path.join(dir, 'stdin.txt');
  const fake = path.join(dir, 'fakepiper');
  fs.writeFileSync(fake, `#!/bin/sh\ncat > "${dump}"\nwhile [ $# -gt 0 ]; do [ "$1" = "--output_file" ] && : > "$2"; shift; done\n`, { mode: 0o755 });
  const config = {
    activeEngine: 'elevenlabs', fallbackEngine: 'piper', player: ['true'],
    engines: {
      elevenlabs: { voiceId: 'v', cacheDir: path.join(dir, 'c'), usageFile: path.join(dir, 'u.json') },
      piper: { executable: fake, modelPath: 'x' },
    },
  };
  const saved = process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_API_KEY; // no key -> elevenlabs throws -> piper speaks
  try { await speak('fallback works', config, dir); } finally { if (saved) process.env.ELEVENLABS_API_KEY = saved; }
  assert.strictEqual(fs.readFileSync(dump, 'utf8'), 'fallback works');
});

function fakeFetch(calls) {
  return async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('ID3fake-mp3').buffer.slice(0, 11), text: async () => '' };
  };
}

test('elevenlabs: request shape, caching, and budget accounting', async () => {
  const dir = tmpdir();
  const opts = { voiceId: 'voice123', modelId: 'eleven_v4_turbo', cacheDir: path.join(dir, 'c'), usageFile: path.join(dir, 'u.json'), monthlyCharacterCap: 100 };
  const calls = [];
  const deps = { fetch: fakeFetch(calls), apiKey: 'k' };

  const a = await synthesize('Lights are on.', opts, deps);
  assert.strictEqual(a.cached, false);
  assert.strictEqual(calls.length, 1);
  assert.match(calls[0].url, /text-to-speech\/voice123\?output_format=mp3_44100_128$/);
  assert.strictEqual(calls[0].init.headers['xi-api-key'], 'k');
  assert.deepStrictEqual(JSON.parse(calls[0].init.body), { text: 'Lights are on.', model_id: 'eleven_v4_turbo' });

  const b = await synthesize('Lights are on.', opts, deps); // cache hit: no call, no charge
  assert.strictEqual(b.cached, true);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(JSON.parse(fs.readFileSync(opts.usageFile, 'utf8')).characters, 14);
});

test('elevenlabs: monthly cap blocks the request before any network call', async () => {
  const dir = tmpdir();
  const opts = { voiceId: 'v', cacheDir: path.join(dir, 'c'), usageFile: path.join(dir, 'u.json'), monthlyCharacterCap: 10 };
  const calls = [];
  await assert.rejects(() => synthesize('this text is longer than ten characters', opts, { fetch: fakeFetch(calls), apiKey: 'k' }), /cap reached/);
  assert.strictEqual(calls.length, 0);
});
