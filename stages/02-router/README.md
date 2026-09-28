# Stage 02 — Central Router

Subscribes to `jarvis/intent/#`, routes known intents (hardware / system / local), and sends conversation to the LLM (OpenRouter).

## decide() layer (`src/decide/`)

One interface, swappable backends: `rules` (stage 01 matcher), `ollama` (tiny tool-calling models), `llm` (cloud JSON), `jev` (stub — see file header). Contract in `src/decide/index.js`. Not yet wired into the live routing path; today it is used by the benchmark, and the router logs every utterance to `data/utterances.jsonl`.

## Benchmark

```bash
node bench/run.js --backend rules [--verbose]
node bench/run.js --backend ollama --model functiongemma
node bench/run.js --backend rules,ollama,llm --from-log
```
Reports intent accuracy, slot accuracy, false actions (acted when it should have chatted), missed actions, and p50/p95 latency. `bench/dataset.json` (101 labelled utterances incl. hard negatives) was written by hand and is biased toward my guesses at paraphrases — add your own via the log.

## Tests

```bash
node --test "test/*.test.js"
```
