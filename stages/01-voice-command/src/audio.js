const record = require('node-record-lpcm16');

/**
 * Compute RMS of a 16-bit PCM buffer.
 * Used for silence detection — if RMS < threshold, audio is silent.
 */
function computeRMS(buffer) {
  let sum = 0;
  const samples = buffer.length / 2;
  if (samples === 0) return 0;
  for (let i = 0; i < buffer.length; i += 2) {
    const sample = buffer.readInt16LE(i);
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples);
}

/**
 * Stream audio from the mic and stop automatically when the user stops speaking.
 * 
 * Instead of recording a fixed 3-second chunk, this evaluates each data frame
 * (~250ms) in real-time:
 *   - Waits for speech to start (RMS above threshold)
 *   - Records while user is speaking
 *   - Stops after N consecutive silent frames (user finished their phrase)
 * 
 * This means a 1-second command gets processed in ~1.5s total (speech + small
 * silence tail), not 3+ seconds.
 * 
 * @param {object} config - Must include sampleRate, silenceThreshold, silenceToleranceFrames
 * @returns {Promise<Buffer>} Raw PCM S16LE buffer of the spoken phrase
 */
function recordUntilSilence(config) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let isSpeaking = false;
    let silenceFrames = 0;
    const tolerance = config.silenceToleranceFrames || 4;

    // Safety timeout — don't record forever if someone leaves music on
    const MAX_RECORD_MS = 10000;
    let timeout = null;

    const recording = record.record({
      sampleRate: config.sampleRate,
      channels: 1,
      recorder: 'sox',
      audioType: 'raw',
      encoding: 'signed-integer',
      endOnSilence: false,
    });

    const stream = recording.stream();

    timeout = setTimeout(() => {
      recording.stop();
    }, MAX_RECORD_MS);

    stream.on('data', (data) => {
      const rms = computeRMS(data);

      if (rms >= config.silenceThreshold) {
        // Speech detected
        isSpeaking = true;
        silenceFrames = 0;
        chunks.push(data);
      } else if (isSpeaking) {
        // Was speaking, now quiet — count silence frames
        silenceFrames++;
        chunks.push(data); // Keep the trailing silence for clean audio

        if (silenceFrames >= tolerance) {
          // User finished talking — stop immediately
          clearTimeout(timeout);
          recording.stop();
        }
      }
      // If not speaking and silence → do nothing, keep waiting
    });

    stream.on('end', () => {
      clearTimeout(timeout);
      if (chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        resolve(Buffer.alloc(0)); // No speech detected
      }
    });

    stream.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Convert raw PCM S16LE buffer to WAV format in memory.
 */
function pcmToWavBuffer(pcmBuffer, sampleRate) {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Check if a PCM buffer is silence based on RMS threshold.
 */
function isSilent(pcmBuffer, threshold) {
  return computeRMS(pcmBuffer) < threshold;
}

module.exports = { recordUntilSilence, pcmToWavBuffer, computeRMS, isSilent };
