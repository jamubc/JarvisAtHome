const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const SOUNDS_DIR = path.join(__dirname, '..', 'sounds');

/**
 * Generate a sine-wave ping as a WAV file.
 * Pure math — no dependencies.
 */
function generatePingSound(filePath, frequency = 880, durationMs = 150, sampleRate = 44100) {
  const numSamples = Math.floor(sampleRate * (durationMs / 1000));
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = numSamples * blockAlign;

  const buffer = Buffer.alloc(44 + dataSize);

  // WAV header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Sine wave with fade envelope to avoid clicks
  const fadeLen = Math.floor(numSamples * 0.1);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = Math.sin(2 * Math.PI * frequency * t);

    let envelope = 1.0;
    if (i < fadeLen) envelope = i / fadeLen;
    else if (i > numSamples - fadeLen) envelope = (numSamples - i) / fadeLen;

    sample *= envelope * 0.6;
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

/**
 * Ensure the ping sound file exists, generate if missing.
 */
function ensurePingSound(config) {
  const pingPath = path.join(SOUNDS_DIR, 'ping.wav');
  if (!fs.existsSync(pingPath)) {
    generatePingSound(pingPath, config.pingFrequency, config.pingDurationMs);
  }
  return pingPath;
}

/**
 * Play a sound file asynchronously (non-blocking).
 * Uses afplay on macOS, falls back to SoX play.
 */
function playSound(filePath) {
  exec(`afplay "${filePath}"`, (err) => {
    if (err) exec(`play "${filePath}" 2>/dev/null`);
  });
}

module.exports = { ensurePingSound, playSound, generatePingSound };
