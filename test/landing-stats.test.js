import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const landingPage = await readFile(new URL('../ui/index.html', import.meta.url), 'utf8');
const statsScript = [...landingPage.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(([, script]) => script)
  .find((script) => script.includes("fetch('/api/stats')"));
const stats = { catches: 0, tokens: 0, generations: 0, llm_calls: 0, models: 0 };

async function renderStats(payload, reducedMotion) {
  const elements = Object.fromEntries(['stat-catches', 'stat-tokens', 'stats-live'].map((id) => [
    id,
    { textContent: landingPage.match(new RegExp(`id="${id}"[^>]*>([^<]*)`))[1] }
  ]));
  const initial = Object.values(elements).map(({ textContent }) => textContent);
  const frames = [];
  await runInNewContext(statsScript, {
    fetch: async () => ({ ok: true, json: async () => payload }),
    document: { getElementById: (id) => elements[id] },
    matchMedia: () => ({ matches: reducedMotion }),
    performance: { now: () => 0 },
    requestAnimationFrame: (frame) => frames.push(frame)
  });
  return { elements, initial, frames };
}

test('renders a live zero instead of keeping the historical statistics', async () => {
  const { elements, frames } = await renderStats(stats, true);
  assert.equal(elements['stat-catches'].textContent, '0');
  assert.equal(elements['stat-tokens'].textContent, '0');
  assert.match(elements['stats-live'].textContent, /live from SigNoz.*0 generations/);
  assert.equal(frames.length, 0);
});

test('still animates positive values when motion is enabled', async () => {
  const { elements, frames } = await renderStats({ ...stats, catches: 12, tokens: 3456 }, false);
  assert.equal(frames.length, 2);
  for (const frame of frames.splice(0)) frame(450);
  assert.ok(Number(elements['stat-catches'].textContent) > 0);
  assert.ok(Number(elements['stat-catches'].textContent) < 12);
  for (const frame of frames.splice(0)) frame(900);
  assert.equal(elements['stat-catches'].textContent, '12');
  assert.equal(elements['stat-tokens'].textContent, (3456).toLocaleString());
});

test('keeps the historical snapshot and label when the live payload is invalid', async () => {
  for (const payload of [
    null,
    { ...stats, catches: null, tokens: 1 },
    { ...stats, catches: undefined, tokens: 1 },
    { ...stats, tokens: Infinity, catches: 1 },
    { ...stats, models: '0' }
  ]) {
    const { elements, initial, frames } = await renderStats(payload, true);
    assert.deepEqual(Object.values(elements).map(({ textContent }) => textContent), initial);
    assert.equal(frames.length, 0);
  }
});
