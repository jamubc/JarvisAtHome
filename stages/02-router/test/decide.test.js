const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createDecider } = require('../src/decide');
const { logUtterance } = require('../src/decide/log');
const { buildTools } = require('../src/decide/ollama');

test('rules backend: contract shape and hijack regression', async () => {
  const d = createDecider('rules');
  const t = await d.decide({ transcript: 'jarvis what time is it' });
  assert.strictEqual(t.intent, 'get_time');
  assert.strictEqual(t.needsLLM, false);
  assert.strictEqual(t.source, 'rules');
  assert.ok(t.ms >= 0);
  assert.strictEqual((await d.decide({ transcript: 'jarvis what time does the store open today' })).intent, 'chat');
});

test('unknown backend and unimplemented jev fail loudly', async () => {
  assert.throws(() => createDecider('nope'), /Unknown decider/);
  await assert.rejects(() => createDecider('jev').decide({ transcript: 'x' }), /not implemented/);
});

test('ollama backend maps tool calls to intent+slots (mock server)', async () => {
  let seen;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen = JSON.parse(body);
      const user = seen.messages.at(-1).content;
      const message = user.includes('paris')
        ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'weather', arguments: { city: 'Paris' } } }] }
        : user.includes('bogus')
          ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'launch_missiles', arguments: {} } }] }
          : { role: 'assistant', content: 'Hello!' };
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ message }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  try {
    const d = createDecider('ollama', { url: `http://127.0.0.1:${server.address().port}`, model: 'm' });
    const w = await d.decide({ transcript: 'weather in paris' });
    assert.deepStrictEqual([w.intent, w.slots], ['weather', { city: 'Paris' }]);
    assert.strictEqual(seen.model, 'm');
    assert.ok(seen.tools.some((t) => t.function.name === 'weather'));
    assert.strictEqual((await d.decide({ transcript: 'hi there' })).intent, 'chat');
    assert.strictEqual((await d.decide({ transcript: 'bogus' })).intent, 'chat', 'unknown tool names must not become actions');
  } finally { server.close(); }
});

test('tool schema covers every command and requires slots', () => {
  const tools = buildTools();
  const names = tools.map((t) => t.function.name);
  for (const id of ['get_time', 'weather', 'mac_open', 'turn_on_lights']) assert.ok(names.includes(id), id);
  assert.deepStrictEqual(tools.find((t) => t.function.name === 'weather').function.parameters.required, ['city']);
});

test('utterance log appends JSONL with a null corrected field', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jlog-')), 'sub', 'u.jsonl');
  logUtterance({ transcript: 'hello', intent: 'chat' }, file);
  logUtterance({ transcript: 'lights on', intent: 'turn_on_lights' }, file);
  const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].corrected, null);
  assert.strictEqual(rows[1].intent, 'turn_on_lights');
});
