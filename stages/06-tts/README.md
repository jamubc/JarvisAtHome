# Stage 06 — Text-to-Speech (The Voice)

Subscribes to `jarvis/tts/speak`, queues replies, and speaks them. While speaking it publishes `jarvis/state/speaking` so Stage 01 mutes the mic.

## Engines (`config.json` -> `activeEngine`, `fallbackEngine`)

| Engine | Notes |
|---|---|
| `piper` | Local, default. Auto-downloads on macOS. Text goes to Piper over stdin. |
| `macos_say` | Zero setup. |
| `windows_native` | PowerShell System.Speech. |
| `elevenlabs` | Eleven v4 Turbo (`eleven_v4_turbo`). Needs `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`. Cached in `cache/`, capped by `monthlyCharacterCap`, usage tracked in `usage.json`. |

If the active engine fails (offline, cap reached, bad key) the fallback speaks instead.

**Security:** reply text is untrusted (LLM/Wikipedia/MQTT). No engine ever passes it through a shell.

## Test standalone

```bash
cd stages/06-tts && npm install && node index.js
node --test "test/*.test.js"
```
