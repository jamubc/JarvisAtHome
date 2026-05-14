const path = require('path');
const fs = require('fs');
const mqtt = require('mqtt');
const { speak } = require('./src/engine');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

// Audio Queue to prevent overlapping speech
const queue = [];
let isSpeaking = false;

async function checkPiperSetup() {
  if (config.activeEngine !== 'piper') return;
  const piperPath = path.resolve(__dirname, 'piper');
  const modelsPath = path.resolve(__dirname, 'models');
  const modelFile = path.resolve(__dirname, config.engines.piper.modelPath);
  const modelJson = modelFile + '.json';

  if (!fs.existsSync(piperPath)) {
    console.log('  ⬇️   Piper executable not found. Downloading...');
    const { spawnSync } = require('child_process');
    const os = require('os');
    let url = '';
    if (os.platform() === 'darwin' && os.arch() === 'arm64') {
      url = 'https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_macos_aarch64.tar.gz';
    } else if (os.platform() === 'darwin' && os.arch() === 'x64') {
      url = 'https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_macos_x64.tar.gz';
    } else {
      console.error('  ❌  Unsupported platform for automatic piper download.');
      process.exit(1);
    }
    
    fs.mkdirSync(piperPath, { recursive: true });
    spawnSync('curl', ['-L', '-s', '-o', path.join(__dirname, 'piper.tar.gz'), url]);
    spawnSync('tar', ['-xzf', path.join(__dirname, 'piper.tar.gz'), '-C', __dirname]);
    fs.unlinkSync(path.join(__dirname, 'piper.tar.gz'));
    console.log('  ✅  Piper executable downloaded.');
  }

  if (!fs.existsSync(modelFile) || !fs.existsSync(modelJson)) {
    console.log('  ⬇️   Piper model not found. Downloading...');
    const { spawnSync } = require('child_process');
    fs.mkdirSync(modelsPath, { recursive: true });
    // URL for en_US-lessac-medium
    const baseUrl = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/';
    
    if (!fs.existsSync(modelFile)) {
      spawnSync('curl', ['-L', '-s', '-o', modelFile, baseUrl + 'en_US-lessac-medium.onnx']);
    }
    if (!fs.existsSync(modelJson)) {
      spawnSync('curl', ['-L', '-s', '-o', modelJson, baseUrl + 'en_US-lessac-medium.onnx.json']);
    }
    console.log('  ✅  Piper model downloaded.');
  }
}

async function init() {
  await checkPiperSetup();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🔊  STAGE 06 — TEXT TO SPEECH (The Voice)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Engine: ${config.activeEngine}`);

  const client = mqtt.connect(config.mqtt.broker);

client.on('connect', () => {
  console.log('  ✅  Connected to MQTT broker.');
  client.subscribe(config.mqtt.topic, (err) => {
    if (err) console.error('  ⚠️  Subscription error:', err.message);
    else console.log(`  📡  Listening on: ${config.mqtt.topic}\n`);
  });
});

client.on('message', (topic, message) => {
  if (topic === config.mqtt.topic) {
    const textToSpeak = message.toString();
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    console.log(`  [${timestamp}] 📥 Received text to speak`);
    
    queue.push(textToSpeak);
    processQueue();
  }
});

async function processQueue() {
  if (isSpeaking || queue.length === 0) return;

  isSpeaking = true;
  const textToSpeak = queue.shift();
  
  // 1. Tell Stage 01 to close its ears
  client.publish('jarvis/state/speaking', 'true');
  
  // 2. Wait for the audio process to completely finish playing
  await speak(textToSpeak, config);
  
  // 3. Add a 500ms padding for room acoustics/echo to decay
  setTimeout(() => {
    isSpeaking = false;
    client.publish('jarvis/state/speaking', 'false');
    processQueue();
  }, 500);
}

client.on('error', (err) => console.error('  ⚠️  MQTT error:', err.message));

process.on('SIGINT', () => {
  console.log('\n\n  👋  Shutting down TTS module...');
  client.end();
  process.exit(0);
});
}

init().catch(console.error);
