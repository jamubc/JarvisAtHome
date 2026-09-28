# Jarvis — Local AI Assistant

A local-first voice assistant pipeline. Core commands run fully offline (Whisper + Piper); optional cloud upgrades (Eleven v4 Turbo voice, a cloud LLM for conversation) are opt-in via `.env` and always fall back to local engines.

## Architecture

```
[Mic] → [VAD] → [Wake Word] → [Whisper STT] → [Intent Match] → [Router] → [Execution] → [TTS] → [Speaker]
```

See [docs/architecture.md](docs/architecture.md) for the full pipeline diagram.

## Stages

Each stage is **independently testable** — it has its own `package.json`, runs standalone, and exposes an EventEmitter interface for the pipeline to wire together.

| Stage | Directory | Status | Description |
|-------|-----------|--------|-------------|
| 01 | `stages/01-voice-command/` | ✅ Working | Mic → VAD → Wake Word → Whisper STT → Intent matching |
| 02 | `stages/02-router/` | ✅ Working | MQTT router + LLM chat (OpenRouter) + `decide()` layer & benchmark (see below) |
| 03 | `stages/03-hardware/` | 🔲 Planned | MQTT bridge → ESP32/Arduino nodes (relays, servos, sensors) |
| 04 | `stages/04-system/` | 🔲 Planned | OS-level commands (file system, scripts, local APIs) |
| 05 | `stages/05-llm/` | 🔲 Planned | Local LLM (Ollama/Llama) for conversational queries |
| 06 | `stages/06-tts/` | ✅ Working | Piper / macOS `say` / Eleven v4 Turbo (cached, spend-capped, Piper fallback) |

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

# Hardware stage (the hands) — requires Mosquitto broker
node stages/03-hardware/index.js
```

## Eleven v4 Turbo voice (optional)

```bash
cp .env.example .env            # set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID
# stages/06-tts/config.json -> "activeEngine": "elevenlabs"   (fallbackEngine stays "piper")
```
Audio is cached by text (static replies are billed once) and `monthlyCharacterCap` (default 100,000) stops surprise bills. Model id: `eleven_v4_turbo`.

## Choosing how Jarvis decides (Phase 2)

`stages/02-router/src/decide/` puts one `decide()` interface in front of `rules`, `ollama` (FunctionGemma / Qwen3 via tool calling), `llm` and `jev` (stub). Compare them on your own hardware:

```bash
cd stages/02-router
node bench/run.js --backend rules
node bench/run.js --backend ollama --model functiongemma
node bench/run.js --backend rules,ollama,llm
```
Every utterance the router sees is logged to `stages/02-router/data/utterances.jsonl` (git-ignored). Set the `corrected` field on wrong rows and run with `--from-log` to grow the eval set.

## Tests

```bash
node --test "stages/01-voice-command/test/*.test.js" "stages/06-tts/test/*.test.js" "stages/02-router/test/*.test.js"
```

## Requirements

- **Node.js** v20+
- **SoX** (`brew install sox` on macOS)
- Whisper models in `stages/01-voice-command/models/`
- (Future) **Mosquitto** MQTT broker for hardware stage
- (Future) **Ollama** for LLM stage
