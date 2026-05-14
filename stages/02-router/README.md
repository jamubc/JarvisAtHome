# Stage 02 — Central Router

Receives intents from Stage 01 (Voice Command) and routes them to the appropriate execution module.

## Status: 🔲 Not yet implemented

## Interface

**Input:** Subscribes to Stage 01 `commander.on('intent', ...)`  
**Output:** Emits `execute` events to Stage 03/04/05

## Test standalone

```bash
cd stages/02-router
npm install
node index.js
```
