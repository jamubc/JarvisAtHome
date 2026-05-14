const path = require('path');
const fs = require('fs');
const mqtt = require('mqtt');
const { recordUntilSilence, pcmToWavBuffer } = require('./src/audio');
const { createTranscriber } = require('./src/transcriber');
const { Commander } = require('./src/commander');

// ─────────────────────────────────────────────────────────
// Load config
// ─────────────────────────────────────────────────────────
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

// ─────────────────────────────────────────────────────────
// Resolve model from registry
// Supports:  node index.js --model base.en
//            node index.js              (uses config.activeModel)
// ─────────────────────────────────────────────────────────
function resolveModel() {
  // Check for --model CLI flag
  const flagIdx = process.argv.indexOf('--model');
  const modelName = (flagIdx !== -1 && process.argv[flagIdx + 1])
    ? process.argv[flagIdx + 1]
    : config.activeModel;

  const entry = config.models[modelName];
  if (!entry) {
    console.error(`\n  ❌  Unknown model: "${modelName}"`);
    console.error(`  Available models: ${Object.keys(config.models).join(', ')}`);
    process.exit(1);
  }

  const modelPath = path.resolve(__dirname, 'models', entry.file);
  if (!fs.existsSync(modelPath)) {
    console.log(`\n  ⬇️   Model "${modelName}" (${entry.size}) is not available locally.`);
    console.log(`  Downloading from HuggingFace... (this may take a minute)`);
    
    const modelsDir = path.dirname(modelPath);
    if (!fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true });
    }

    const { spawnSync } = require('child_process');
    const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${entry.file}`;
    
    // Download silently (-s) but follow redirects (-L)
    const result = spawnSync('curl', ['-L', '-s', '-o', modelPath, url]);
    
    if (result.status !== 0 || !fs.existsSync(modelPath)) {
      console.error(`\n  ❌  Failed to download model file: ${modelPath}`);
      console.error(`  ${entry.notes}`);
      process.exit(1);
    }
    console.log(`  ✅  Model downloaded successfully.`);
  }

  return { modelName, modelPath, entry };
}

const { modelName, modelPath, entry: modelInfo } = resolveModel();
config.modelPath = modelPath;

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────
async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🎤  VOICE COMMAND SYSTEM');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Loading model: ${modelName} (${modelInfo.size}, ${modelInfo.speed})...`);

  const transcriber = await createTranscriber(config);
  const commander = new Commander(config);
  let isDeafened = false;
  let wasDeafened = false;

  console.log('  ✅  Model loaded.\n');

  // Print available models
  console.log('  Models (switch with --model <name>):');
  for (const [name, info] of Object.entries(config.models)) {
    const installed = fs.existsSync(path.resolve(__dirname, 'models', info.file));
    const active = name === modelName ? ' ◀ active' : '';
    const status = installed ? '✓' : '✗ not downloaded';
    console.log(`    ${status} ${name} (${info.size}, ${info.speed})${active}`);
  }
  console.log('');

  // Print registered commands
  const cmds = commander.getCommands();
  console.log(`  ${cmds.length} commands loaded from commands/:`);
  for (const cmd of cmds) {
    console.log(`    • "${cmd.phrase}" → ${cmd.id} — ${cmd.description}`);
  }
  console.log('');
  console.log(`  Wake word: "${config.wakeWord}" (change in config.json)`);
  console.log('  Mode: Dynamic VAD');

  // ───────────────────────────────────────────────────────
  // MQTT — optional connection to Main Brain (Stage 02)
  // ───────────────────────────────────────────────────────
  let mqttClient = null;
  if (config.mqtt && config.mqtt.enabled) {
    try {
      mqttClient = mqtt.connect(config.mqtt.broker, {
        reconnectPeriod: 5000,
        connectTimeout: 3000,
      });
      mqttClient.on('connect', () => {
        console.log(`  📡  MQTT: Connected to ${config.mqtt.broker}`);
        mqttClient.subscribe('jarvis/state/speaking');
        mqttClient.subscribe('jarvis/state/listen_now');
      });
      mqttClient.on('error', () => { });
      mqttClient.on('message', (topic, message) => {
        if (topic === 'jarvis/state/speaking') {
          isDeafened = message.toString() === 'true';
          if (isDeafened) {
            wasDeafened = true;
            console.log('  🔇  Jarvis is speaking — ignoring microphone.');
          } else {
            console.log('  🔈  Jarvis finished speaking — microphone active.');
          }
        }

        if (topic === 'jarvis/state/listen_now') {
          console.log('  🎤  Hot mic triggered! Awaiting user clarification...');

          // Force the commander awake and play the ping sound
          commander.isAwake = true;
          commander.resetAwakeTimer();

          // Wait 1 second for the TTS to finish talking before playing the ping
          setTimeout(() => {
            const { playSound } = require('./src/sounds');
            playSound(commander.pingPath);
          }, 1000);
        }
      });
      mqttClient.on('offline', () => {
        console.log('  📡  MQTT: Broker offline — running in local-only mode');
      });
    } catch {
      console.log('  📡  MQTT: Could not connect — running in local-only mode');
    }
  } else {
    console.log('  📡  MQTT: Disabled (enable in config.json)');
  }

  function publishIntent(topic, data) {
    if (mqttClient && mqttClient.connected) {
      mqttClient.publish(topic, JSON.stringify(data));
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ───────────────────────────────────────────────────────
  // Event handlers — this is the interface to the next stage
  // ───────────────────────────────────────────────────────
  commander.on('wake', () => {
    const label = config.wakeWord.charAt(0).toUpperCase() + config.wakeWord.slice(1);
    console.log(`  🟢  ${label} activated!`);
  });

  commander.on('sleep', ({ reason }) => {
    const msg = reason === 'timeout'
      ? `No commands heard — going back to sleep.`
      : `Going to sleep.`;
    console.log(`\n  😴  ${msg} Say "${config.wakeWord}" to wake.\n`);
  });

  commander.on('intent', (intent) => {
    console.log(`  ✅  Intent: ${intent.id} (${intent.elapsed}ms)`);
    if (intent.id === 'sleep') commander.sleep();

    if (intent.feedback) {
      publishIntent('jarvis/tts/speak', intent.feedback);
    }

    // Publish to MQTT for Stage 02 (Main Brain) to route
    publishIntent('jarvis/intent/command', intent);
  });

  commander.on('unknown', ({ transcript, elapsed, timestamp }) => {
    console.log(`  ❓  "${transcript}" — no match (${elapsed}ms)`);
    // Route unrecognized speech to LLM via Stage 02
    publishIntent('jarvis/intent/chat', { transcript, elapsed, timestamp });
  });

  commander.on('feedback', (text) => {
    publishIntent('jarvis/tts/speak', text);
  });

  commander.on('idle', ({ transcript, elapsed }) => {
    process.stdout.write(`  💤  "${transcript}" (${elapsed}ms)                    \r`);
  });

  // ───────────────────────────────────────────────────────
  // Listen loop — dynamic VAD, no fixed chunks
  // ───────────────────────────────────────────────────────
  let running = true;

  async function listenLoop() {
    while (running) {
      try {
        // If we are already deafened, pause the loop so we don't capture any ongoing TTS audio
        if (isDeafened) {
          await new Promise(r => setTimeout(r, 100));
          continue;
        }

        // Waits for speech, then stops the instant user goes quiet
        const pcmBuffer = await recordUntilSilence(config);

        // Skip processing if we are currently deafened by the TTS engine or were deafened while recording
        if (pcmBuffer.length === 0 || isDeafened || wasDeafened) {
          wasDeafened = false;
          continue;
        }

        // Transcribe
        const wavBuffer = pcmToWavBuffer(pcmBuffer, config.sampleRate);
        const arrayBuffer = wavBuffer.buffer.slice(
          wavBuffer.byteOffset,
          wavBuffer.byteOffset + wavBuffer.byteLength
        );

        const { text, elapsed } = await transcriber.transcribe(arrayBuffer);

        // 1. Strip out subtitle tags like [beep] or (silence)
        const cleanText = text.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();

        // 2. If the audio was ONLY a beep, ignore it entirely
        if (!cleanText) continue;

        // Feed to commander — it handles wake/sleep/matching/events
        commander.process(cleanText, elapsed);
      } catch (err) {
        console.error('  ⚠️  Error:', err.message);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  // Clean shutdown — release GPU resources to avoid GGML_ASSERT crash
  process.on('SIGINT', async () => {
    console.log('\n\n  👋  Shutting down...');
    running = false;
    if (mqttClient) mqttClient.end();
    await transcriber.release();
    console.log('  ✅  Resources released.\n');
    process.exit(0);
  });

  listenLoop();
}

main().catch(console.error);
