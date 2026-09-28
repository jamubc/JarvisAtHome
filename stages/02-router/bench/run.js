#!/usr/bin/env node
/**
 * decide() benchmark — accuracy + latency per backend on a labelled utterance set.
 *
 *   node bench/run.js --backend rules
 *   node bench/run.js --backend ollama --model functiongemma
 *   node bench/run.js --backend llm            (needs OPENROUTER_API_KEY)
 *   node bench/run.js --backend rules,ollama   (compare; failures in one don't stop the other)
 *   options: --dataset <file> [--from-log]  --limit N  --verbose  --warmup N
 *
 * --from-log appends rows from data/utterances.jsonl whose `corrected` field you filled in.
 * Latency is per-call wall-clock; run on the machine that will host Jarvis (results are
 * hardware-specific). Results are also written to bench/results/<backend>.json.
 */
const fs = require('fs');
const path = require('path');
try { process.loadEnvFile(path.resolve(__dirname, '..', '..', '..', '.env')); } catch { /* optional */ }

const { createDecider, backends } = require('../src/decide');
const { DEFAULT_FILE: LOG_FILE } = require('../src/decide/log');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return dflt;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function slotsMatch(expected, got) {
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  return Object.entries(expected).every(([k, v]) => {
    const got_ = norm(got?.[k]);
    const exp = norm(v);
    return got_ !== '' && (got_.includes(exp) || exp.includes(got_));
  });
}

function loadRows() {
  let rows = JSON.parse(fs.readFileSync(arg('dataset', path.join(__dirname, 'dataset.json')), 'utf8'));
  if (arg('from-log', false) && fs.existsSync(LOG_FILE)) {
    const extra = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
      .filter((e) => e.corrected).map((e) => ({ text: e.transcript, intent: e.corrected }));
    rows = rows.concat(extra);
  }
  const limit = Number(arg('limit', 0));
  return limit ? rows.slice(0, limit) : rows;
}

async function bench(name, rows) {
  const options = name === 'ollama' && arg('model') ? { model: arg('model') }
    : name === 'llm' ? config.llm : undefined;
  const decider = createDecider(name, options);
  const verbose = arg('verbose', false);

  for (let i = 0; i < Number(arg('warmup', 2)); i++) await decider.decide({ transcript: rows[0].text }); // load model / warm caches

  const times = [];
  const misses = [];
  let correct = 0, slotTotal = 0, slotCorrect = 0, actionFalsePos = 0, actionMiss = 0;

  for (const row of rows) {
    let r;
    try { r = await decider.decide({ transcript: row.text }); }
    catch (err) { throw new Error(`${decider.name} failed on "${row.text}": ${err.message}`); }
    times.push(r.ms);
    const ok = r.intent === row.intent;
    if (ok) correct++;
    else {
      misses.push({ text: row.text, expected: row.intent, got: r.intent });
      if (row.intent === 'chat') actionFalsePos++; else if (r.intent === 'chat') actionMiss++;
    }
    if (row.slots) { slotTotal++; if (ok && slotsMatch(row.slots, r.slots)) slotCorrect++; }
    if (verbose) console.log(`  ${ok ? 'ok  ' : 'MISS'} ${r.ms.toFixed(1).padStart(8)}ms  ${row.text}  ->  ${r.intent}`);
  }

  const sorted = [...times].sort((a, b) => a - b);
  return {
    backend: decider.name, n: rows.length,
    intentAccuracy: correct / rows.length,
    slotAccuracy: slotTotal ? slotCorrect / slotTotal : null, slotCases: slotTotal,
    falseActions: actionFalsePos,   // said "do X" when it should have been conversation (the dangerous kind)
    missedActions: actionMiss,      // fell through to the LLM when an action was wanted (slow, not dangerous)
    latencyMs: { p50: percentile(sorted, 50), p95: percentile(sorted, 95), max: sorted[sorted.length - 1] },
    misses,
  };
}

(async () => {
  const names = String(arg('backend', 'rules')).split(',');
  const rows = loadRows();
  const resultsDir = path.join(__dirname, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const summary = [];

  for (const name of names) {
    if (!backends.includes(name)) { console.error(`Unknown backend "${name}". Available: ${backends.join(', ')}`); process.exitCode = 1; continue; }
    try {
      const r = await bench(name, rows);
      fs.writeFileSync(path.join(resultsDir, `${name}.json`), JSON.stringify({ ...r, ranAt: new Date().toISOString(), node: process.version, platform: `${process.platform}/${process.arch}` }, null, 2));
      summary.push(r);
      console.log(`\n== ${r.backend}  (${r.n} utterances)`);
      console.log(`   intent accuracy : ${(r.intentAccuracy * 100).toFixed(1)}%`);
      if (r.slotAccuracy !== null) console.log(`   slot accuracy   : ${(r.slotAccuracy * 100).toFixed(1)}%  (${r.slotCases} cases)`);
      console.log(`   false actions   : ${r.falseActions}   missed actions: ${r.missedActions}`);
      console.log(`   latency         : p50 ${r.latencyMs.p50.toFixed(1)}ms  p95 ${r.latencyMs.p95.toFixed(1)}ms  max ${r.latencyMs.max.toFixed(1)}ms`);
      for (const m of r.misses.slice(0, 12)) console.log(`     miss: "${m.text}" expected ${m.expected}, got ${m.got}`);
      if (r.misses.length > 12) console.log(`     ... ${r.misses.length - 12} more in bench/results/${name}.json`);
    } catch (err) {
      console.error(`\n== ${name}: FAILED — ${err.message}`);
      process.exitCode = 1;
    }
  }
})();
