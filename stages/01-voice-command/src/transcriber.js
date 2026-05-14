const { initWhisper, toggleNativeLog } = require('@fugood/whisper.node');
const path = require('path');

/**
 * Wraps whisper.cpp into a simple interface.
 * 
 * Usage:
 *   const transcriber = await createTranscriber(config);
 *   const { text, elapsed } = await transcriber.transcribe(wavArrayBuffer);
 *   await transcriber.release();
 */
async function createTranscriber(config) {
  // Suppress native whisper.cpp log spam
  await toggleNativeLog(false);

  const modelPath = path.resolve(config.modelPath);
  const context = await initWhisper({
    filePath: modelPath,
    useGpu: config.useGpu,
  });

  return {
    /**
     * Transcribe a WAV ArrayBuffer and return the text + timing.
     * @param {ArrayBuffer} wavArrayBuffer - WAV audio data
     * @returns {{ text: string, elapsed: number, segments: Array }}
     */
    async transcribe(wavArrayBuffer) {
      const startTime = Date.now();
      const { promise } = context.transcribeData(wavArrayBuffer, {
        language: 'en',
        maxThreads: config.maxThreads || 4,
        temperature: 0.0,
        beamSize: 1, // Greedy decoding — fastest
      });

      const result = await promise;
      const elapsed = Date.now() - startTime;
      const text = result.result.trim();

      return { text, elapsed, segments: result.segments };
    },

    /**
     * Release the whisper context (cleanup GPU resources).
     * Call this before exit to avoid the GGML_ASSERT crash.
     */
    async release() {
      await context.release();
    },
  };
}

module.exports = { createTranscriber };
