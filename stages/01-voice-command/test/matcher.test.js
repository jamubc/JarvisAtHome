const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { matchCommand } = require('../src/matcher');

const dir = path.join(__dirname, '..', 'commands');
const commands = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => require(path.join(dir, f)));
const id = (t) => matchCommand(t, commands)?.id ?? null;

test('regression: "open" mid-sentence no longer hijacks other commands', () => {
  assert.strictEqual(id('jarvis what time does the store open today'), null);
  assert.strictEqual(id('jarvis is the front door open right now'), null);
  assert.strictEqual(id('jarvis tell me the current time it is open mic night'), 'get_time');
});

test('mac_open still works when it is the command', () => {
  assert.strictEqual(id('jarvis open spotify'), 'mac_open');
  assert.strictEqual(id('open the calculator'), 'mac_open');
  assert.strictEqual(id('Jarvis, please open youtube.'), 'mac_open');
});

test('other commands unchanged', () => {
  assert.strictEqual(id('jarvis what time is it'), 'get_time');
  assert.strictEqual(id("what's the weather in paris"), 'weather');
  assert.strictEqual(id('jarvis turn off the lights'), 'turn_off_lights');
  assert.strictEqual(id('jarvis tell me a joke'), 'tell_joke');
});

test('longest match wins over directory order', () => {
  const cmds = [
    { id: 'short', phrases: ['lights'] },
    { id: 'long', phrases: ['turn off the lights'] },
  ];
  assert.strictEqual(matchCommand('turn off the lights', cmds).id, 'long');
});

test('mac-open action never reaches a shell', () => {
  const src = fs.readFileSync(path.join(dir, 'mac-open.js'), 'utf8');
  assert.ok(!/\bexec\(/.test(src), 'must use execFile, not exec');
});
