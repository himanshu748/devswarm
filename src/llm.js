import { swarm, m, slog } from './telemetry.js';
import { ROLES, promoted, promote, demote, FALLBACK_TTL_MS, MODEL_MAX_TOKENS, DEFAULT_MAX_TOKENS } from './models.js';
import { emit } from './bus.js';

const HF_URL = 'https://router.huggingface.co/v1/chat/completions';

function token() {
  const t = process.env.HF_TOKEN;
  if (!t) throw new Error('HF_TOKEN is not set. Export your Hugging Face token as HF_TOKEN.');
  return t;
}

// Streaming keeps bytes flowing on multi-minute codegen calls; buffered
// responses sat idle past the router's gateway timeout and 504ed.
async function callModel(model, messages, temperature) {
  const res = await fetch(HF_URL, {
    method: 'POST',
    // Streaming defeats gateway timeouts, but a stalled stream would hang a
    // generation forever; 15 minutes is past every p95 we have seen.
    signal: AbortSignal.timeout(15 * 60 * 1000),
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, messages, temperature,
      max_tokens: MODEL_MAX_TOKENS[model] ?? DEFAULT_MAX_TOKENS,
      stream: true,
      stream_options: { include_usage: true }
    })
  });
  if (!res.ok) throw new Error(`HF router ${res.status} for ${model}: ${(await res.text()).slice(0, 300)}`);

  let content = '';
  let reasoning = '';
  let usage = {};
  let finish = null;
  let buffer = '';
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const payload = line.replace(/^data:\s*/, '').trim();
      if (!payload || payload === '[DONE]' || !line.startsWith('data:')) continue;
      let data;
      try { data = JSON.parse(payload); } catch { continue; }
      if (data.usage) usage = data.usage;
      const choice = data.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finish = choice.finish_reason;
      const delta = choice.delta || {};
      if (typeof delta.content === 'string') content += delta.content;
      else if (Array.isArray(delta.content)) content += delta.content.map((p) => p.text ?? '').join('');
      if (typeof delta.reasoning_content === 'string') reasoning += delta.reasoning_content;
    }
  }

  if (!content) content = reasoning;
  if (!content) throw new Error(`Empty completion from ${model} (finish: ${finish})`);
  // A truncated artifact is broken code; fail so the fallback (higher cap) takes over.
  if (finish === 'length') throw new Error(`Truncated completion from ${model} at its token cap`);
  return { content, usage };
}

// One chat completion for a role. The span, GenAI attributes, fallback-promotion
// event and the mirrored bus events all come from otel-swarm's llm(); DevSwarm
// layers its routing pins (TTL-bound) and per-call metrics on top.
export async function chat(role, messages) {
  const cfg = ROLES[role];
  let first = cfg.primary;
  const pin = promoted[role];
  if (pin) {
    if (Date.now() - pin.at > FALLBACK_TTL_MS) {
      demote(role);
      slog('info', `fallback TTL expired for ${role}, retrying primary ${cfg.primary}`, { role, from: pin.model, to: cfg.primary });
      emit('fallback_reset', { role, from: pin.model, to: cfg.primary });
    } else {
      first = pin.model;
    }
  }
  // When a role is pinned to its fallback, the rescue path is the primary.
  const second = first === cfg.fallback ? cfg.primary : cfg.fallback;
  let lastTried = null;
  const call = async (model) => {
    lastTried = model;
    const t0 = Date.now();
    const { content, usage } = await callModel(model, messages, cfg.temperature);
    const inTok = usage.prompt_tokens ?? 0;
    const outTok = usage.completion_tokens ?? 0;
    m.tokens.add(inTok + outTok, { role, model });
    m.llmCalls.add(1, { role, model, outcome: model === first ? 'ok' : 'ok_after_fallback' });
    m.llmDuration.record((Date.now() - t0) / 1000, { role, model });
    return { content, inputTokens: inTok, outputTokens: outTok };
  };
  try {
    const content = await swarm.llm(role, {
      model: first,
      fallbackModel: second,
      call,
      attributes: { 'devswarm.role': role }
    });
    if (lastTried === cfg.fallback && first !== cfg.fallback) promote(role, cfg.fallback, 'llm');
    if (lastTried === cfg.primary && first === cfg.fallback) demote(role);
    return content;
  } catch (err) {
    m.llmCalls.add(1, { role, model: lastTried, outcome: 'error' });
    slog('error', `llm call failed for ${role} on both ${first} and ${second}`, { role, reason: String(err.message || err).slice(0, 200) });
    throw err;
  }
}

// Models often wrap JSON in prose or fences; pull out the first parseable object.
export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text, text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)];
  for (const c of candidates) {
    if (!c) continue;
    try { return JSON.parse(c); } catch { /* next */ }
  }
  throw new Error(`No parseable JSON in model output: ${text.slice(0, 200)}`);
}

export function extractCode(text, lang) {
  // Models sometimes emit a short explanatory snippet before the full file;
  // the longest fence is the artifact.
  const re = new RegExp('```(?:' + lang + ')?\\s*\\n([\\s\\S]*?)```', 'g');
  let best = null;
  for (const match of text.matchAll(re)) {
    if (!best || match[1].length > best.length) best = match[1];
  }
  return best ?? text;
}
