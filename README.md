# Jarvis: Local AI Assistant

A fully local, offline, free voice assistant pipeline. No cloud APIs, no subscriptions. Everything runs on your hardware.

## Architecture

```
[Mic] → [VAD] → [Wake Word] → [Whisper STT] → [Intent Match] → [Router] → [Execution] → [TTS] → [Speaker]
```

See [docs/architecture.md](docs/architecture.md) for the full pipeline diagram.

## Stages

Each stage is **independently testable**: its own `package.json`, runs standalone, exposes an EventEmitter interface for the pipeline to wire together.

| Stage | Directory | Status | Description |
|-------|-----------|--------|-------------|
| 01 | `stages/01-voice-command/` | Working | Mic → VAD → Wake Word → Whisper STT → Intent matching |
| 02 | `stages/02-router/` | Planned | Central dispatcher, routes intents to execution modules |
| 03 | `stages/03-hardware/` | Planned | MQTT bridge → ESP32/Arduino nodes (relays, servos, sensors) |
| 04 | `stages/04-system/` | Planned | OS-level commands (file system, scripts, local APIs) |
| 05 | `stages/05-llm/` | Planned | Local LLM (Ollama/Llama) for conversational queries |
| 06 | `stages/06-tts/` | Planned | Text-to-Speech feedback ("The time is 3:15 PM, sir.") |

## Quick Start

```bash
# Install stage 01 dependencies
cd stages/01-voice-command && npm install

# Run the voice command stage standalone
npm run voice

# Or with a different model
npm run voice:base
```

## Running Individual Stages

Each stage can be tested in isolation:

```bash
# Voice command stage (the ears)
node stages/01-voice-command/index.js

# Router stage (the brain stem)  
node stages/02-router/index.js

# Hardware stage (the hands, requires Mosquitto broker)
node stages/03-hardware/index.js
```

## Requirements

- **Node.js** v20+
- **SoX** (`brew install sox` on macOS)
- Whisper models in `stages/01-voice-command/models/`
- (Future) **Mosquitto** MQTT broker for hardware stage
- (Future) **Ollama** for LLM stage
