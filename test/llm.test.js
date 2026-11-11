import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
// Never export test traces to a developer's configured collector.
delete process.env.SIGNOZ_OTLP_ENDPOINT;
delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const { chat, extractJson, extractCode } = await import('../src/llm.js');
import { ROLES, promoted, demote, FALLBACK_TTL_MS } from '../src/models.js';
const { swarm, m } = await import('../src/telemetry.js');

const originalFetch = globalThis.fetch;
const originalToken = process.env.HF_TOKEN;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.HF_TOKEN;
  else process.env.HF_TOKEN = originalToken;
  for (const role of Object.keys(promoted)) demote(role);
});
after(() => swarm.shutdown());

function completion(content, finish = 'stop') {
  const text = `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: finish }] })}\n\ndata: [DONE]\n\n`;
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({
    start(controller) {
      // Split inside the JSON, just as arbitrary network chunks can do.
      controller.enqueue(bytes.slice(0, 23));
      controller.enqueue(bytes.slice(23));
      controller.close();
    }
  }));
}

test('extractJson accepts fenced, bare, and prose-wrapped contracts', () => {
  for (const input of ['{"ok":true}', '```json\n{"ok":true}\n```', 'Plan follows: {"ok":true} End.']) {
    assert.deepEqual(extractJson(input), { ok: true });
  }
  assert.throws(() => extractJson('not json'), /No parseable JSON/);
});

test('extractCode chooses the full artifact over a preliminary snippet', () => {
  assert.equal(extractCode('```js\nx\n```\nThen:\n```js\nconst full = true;\n```', 'js'), 'const full = true;\n');
  assert.equal(extractCode('plain code', 'js'), 'plain code');
});

test('chat assembles split stream chunks without a real provider call', async () => {
  process.env.HF_TOKEN = 'synthetic-test-token';
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return completion('hello 🌱');
  };
  assert.equal(await chat('planner', [{ role: 'user', content: 'synthetic prompt' }]), 'hello 🌱');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, ROLES.planner.primary);
  assert.equal(calls[0].stream, true);
});

test('invalid structured output retries fallback and pins the successful model', async () => {
  process.env.HF_TOKEN = 'synthetic-test-token';
  const models = [];
  globalThis.fetch = async (_url, init) => {
    models.push(JSON.parse(init.body).model);
    return completion(models.length === 1 ? 'broken output' : '{"ok":true}');
  };
  assert.equal(await chat('planner', [], { validate: extractJson }), '{"ok":true}');
  assert.deepEqual(models, [ROLES.planner.primary, ROLES.planner.fallback]);
  assert.equal(promoted.planner.model, ROLES.planner.fallback);
});

test('expired fallback pin retries primary and clears the override', async () => {
  process.env.HF_TOKEN = 'synthetic-test-token';
  promoted.planner = { model: ROLES.planner.fallback, at: Date.now() - FALLBACK_TTL_MS - 1, by: 'test' };
  let model;
  globalThis.fetch = async (_url, init) => {
    model = JSON.parse(init.body).model;
    return completion('recovered');
  };
  assert.equal(await chat('planner', []), 'recovered');
  assert.equal(model, ROLES.planner.primary);
  assert.equal(promoted.planner, undefined);
});

test('truncated completions fail after the two-model retry budget', async () => {
  process.env.HF_TOKEN = 'synthetic-test-token';
  let calls = 0;
  globalThis.fetch = async () => { calls++; return completion('partial artifact', 'length'); };
  await assert.rejects(chat('backend', []), /Truncated completion/);
  assert.equal(calls, 2);
});

test('records each failed and successful attempt without inventing token usage', async (t) => {
  process.env.HF_TOKEN = 'synthetic-test-token';
  const calls = [];
  const durations = [];
  const tokens = [];
  const original = { ...m };
  t.after(() => Object.assign(m, original));
  m.llmCalls = { add: (value, attrs) => calls.push({ value, ...attrs }) };
  m.llmDuration = { record: (value, attrs) => durations.push({ value, ...attrs }) };
  m.tokens = { add: (value, attrs) => tokens.push({ value, ...attrs }) };
  let attempt = 0;
  globalThis.fetch = async () => ++attempt === 1 ? new Response('failed', { status: 503 }) : completion('recovered');
  assert.equal(await chat('planner', []), 'recovered');
  assert.deepEqual(calls.map(({ model, outcome }) => ({ model, outcome })), [
    { model: ROLES.planner.primary, outcome: 'error' },
    { model: ROLES.planner.fallback, outcome: 'ok_after_fallback' }
  ]);
  assert.deepEqual(durations.map(({ model, outcome }) => ({ model, outcome })), calls.map(({ model, outcome }) => ({ model, outcome })));
  assert.ok(durations.every(({ value }) => value >= 0));
  assert.deepEqual(tokens, []);
});

test('records both failed attempts exactly once', async (t) => {
  process.env.HF_TOKEN = 'synthetic-test-token';
  const calls = [];
  const durations = [];
  const original = { ...m };
  t.after(() => Object.assign(m, original));
  m.llmCalls = { add: (value, attrs) => calls.push({ value, ...attrs }) };
  m.llmDuration = { record: (value, attrs) => durations.push({ value, ...attrs }) };
  globalThis.fetch = async () => new Response('failed', { status: 503 });
  await assert.rejects(chat('planner', []), /503/);
  assert.deepEqual(calls.map(({ model, outcome }) => ({ model, outcome })), [
    { model: ROLES.planner.primary, outcome: 'error' },
    { model: ROLES.planner.fallback, outcome: 'error' }
  ]);
  assert.deepEqual(durations.map(({ model, outcome }) => ({ model, outcome })), calls.map(({ model, outcome }) => ({ model, outcome })));
});
test('fallback TTL config defaults invalid values and accepts positive fractions', async () => {
  const original = process.env.FALLBACK_TTL_MINUTES;
  let importId = 0;
  const loadTtl = async (value, isSet = true) => {
    if (isSet) process.env.FALLBACK_TTL_MINUTES = value;
    else delete process.env.FALLBACK_TTL_MINUTES;
    try {
      const models = await import(`../src/models.js?ttl-test=${importId++}`);
      return models.FALLBACK_TTL_MS;
    } finally {
      if (original === undefined) delete process.env.FALLBACK_TTL_MINUTES;
      else process.env.FALLBACK_TTL_MINUTES = original;
    }
  };

  for (const [value, isSet] of [
    [undefined, false], ['', true], ['not-a-number', true], ['Infinity', true],
    ['1e308', true], ['-1', true], ['0', true]
  ]) {
    assert.equal(await loadTtl(value, isSet), 10 * 60 * 1000, `value: ${value}`);
  }
  assert.equal(await loadTtl('1'), 60 * 1000);
  assert.equal(await loadTtl('0.5'), 30 * 1000);
});

test('chat expires a fallback pin using a configured fractional TTL', () => {
  const script = `
import assert from 'node:assert/strict';
import { chat } from './src/llm.js';
import { FALLBACK_TTL_MS, promoted, ROLES } from './src/models.js';

assert.equal(FALLBACK_TTL_MS, 30_000);
process.env.HF_TOKEN = 'synthetic-test-token';
promoted.planner = {
  model: ROLES.planner.fallback,
  at: Date.now() - 45_000,
  by: 'test'
};
const calls = [];
globalThis.fetch = async (_url, init) => {
  calls.push(JSON.parse(init.body).model);
  const payload = { choices: [{ delta: { content: 'recovered' }, finish_reason: 'stop' }] };
  return new Response('data: ' + JSON.stringify(payload) + '\\n\\ndata: [DONE]\\n\\n');
};
assert.equal(await chat('planner', []), 'recovered');
assert.deepEqual(calls, [ROLES.planner.primary]);
assert.equal(promoted.planner, undefined);
`;
  execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    env: { ...process.env, FALLBACK_TTL_MINUTES: '0.5', HF_TOKEN: 'synthetic-test-token' },
    encoding: 'utf8'
  });
});
