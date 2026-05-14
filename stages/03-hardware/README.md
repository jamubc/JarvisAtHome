# Stage 03 — Hardware Execution (MQTT)

Publishes commands to MQTT topics. ESP32/Arduino nodes subscribe and actuate physical hardware (relays, servos, sensors).

## Status: 🔲 Not yet implemented

## Requirements

- Mosquitto MQTT broker (`brew install mosquitto`)
- ESP32/Arduino with PubSubClient library

## MQTT Topic Convention

```
jarvis/{room}/{device}

jarvis/office/lights   → ON / OFF
jarvis/office/temp     → (sensor publishes float)
jarvis/lab/servo       → { "pan": 45, "tilt": 30 }
```

## Test standalone

```bash
cd stages/03-hardware
npm install
node index.js
```
