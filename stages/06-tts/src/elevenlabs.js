const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * ElevenLabs text-to-speech client (default model: Eleven v4 Turbo).
 *
 * - Audio is cached on disk by sha256(model|voice|text). Static phrases such as
 *   "Office lights are on." are synthesized once and replayed for free.
 * - A monthly character budget guards against surprise bills. Cache hits cost 0.
 * - Throws on any failure so the caller can fall back to a local engine.
 *
 * Config (config.json -> engines.elevenlabs), env overrides in parentheses:
 *   modelId              "eleven_v4_turbo"
 *   voiceId              (ELEVENLABS_VOICE_ID)
 *   outputFormat         "mp3_44100_128"
 *   monthlyCharacterCap  number, 0 = unlimited
 *   cacheDir             "./cache"
 *   usageFile            "./usage.json"
 * API key: ELEVENLABS_API_KEY.
 */

const API_BASE = 'https://api.elevenlabs.io/v1';

function cachePath(cacheDir, modelId, voiceId, text) {
  const key = crypto.createHash('sha256').update(`${modelId}|${voiceId}|${text}`).digest('hex');
  return path.join(cacheDir, `${key}.mp3`);
}

function currentMonth(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

function readUsage(usageFile, now) {
  const month = currentMonth(now);
  try {
    const data = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
    if (data.month === month) return data;
  } catch { /* first run or corrupt file — start fresh */ }
  return { month, characters: 0 };
}

function writeUsage(usageFile, usage) {
  fs.writeFileSync(usageFile, JSON.stringify(usage));
}

/**
 * @returns {Promise<{file: string, cached: boolean, characters: number}>}
 */
async function synthesize(text, opts, deps = {}) {
  const fetchFn = deps.fetch || fetch;
  const now = deps.now || new Date();
  const apiKey = deps.apiKey ?? process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || opts.voiceId;

  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');
  if (!voiceId) throw new Error('No voice id (set ELEVENLABS_VOICE_ID or engines.elevenlabs.voiceId)');

  const modelId = opts.modelId || 'eleven_v4_turbo';
  const cacheDir = path.resolve(opts.cacheDir);
  fs.mkdirSync(cacheDir, { recursive: true });

  const file = cachePath(cacheDir, modelId, voiceId, text);
  if (fs.existsSync(file)) return { file, cached: true, characters: 0 };

  const usageFile = path.resolve(opts.usageFile);
  const usage = readUsage(usageFile, now);
  const cap = opts.monthlyCharacterCap || 0;
  if (cap > 0 && usage.characters + text.length > cap) {
    throw new Error(`Monthly ElevenLabs cap reached (${usage.characters}/${cap} characters)`);
  }

  const url = `${API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${opts.outputFormat || 'mp3_44100_128'}`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: modelId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length === 0) throw new Error('ElevenLabs returned empty audio');

  // Write atomically so a crash never leaves a truncated file in the cache.
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, audio);
  fs.renameSync(tmp, file);

  usage.characters += text.length;
  writeUsage(usageFile, usage);
  return { file, cached: false, characters: text.length };
}

module.exports = { synthesize, cachePath, readUsage, currentMonth };
