import { SpanStatusCode } from '@opentelemetry/api';
import { tracer } from './telemetry.js';
import { ROLES, promoted, MODEL_MAX_TOKENS, DEFAULT_MAX_TOKENS } from './models.js';
import { emit } from './bus.js';

const HF_URL = 'https://router.huggingface.co/v1/chat/completions';

function token() {
  const t = process.env.HF_TOKEN;
  if (!t) throw new Error('HF_TOKEN is not set. Export your Hugging Face token as HF_TOKEN.');
  return t;
}

async function callModel(model, messages, temperature, span) {
  const res = await fetch(HF_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, max_tokens: MODEL_MAX_TOKENS[model] ?? DEFAULT_MAX_TOKENS })
  });
  if (!res.ok) throw new Error(`HF router ${res.status} for ${model}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const usage = data.usage || {};
  span.setAttributes({
    'gen_ai.usage.input_tokens': usage.prompt_tokens ?? 0,
    'gen_ai.usage.output_tokens': usage.completion_tokens ?? 0
  });
  const msg = data.choices?.[0]?.message || {};
  const finish = data.choices?.[0]?.finish_reason;
  // Providers differ: content can be a string, an array of parts, or null
  // with the real output in reasoning_content (thinking models).
  let content = msg.content;
  if (Array.isArray(content)) content = content.map((p) => p.text ?? '').join('');
  if (!content) content = msg.reasoning_content;
  if (!content) throw new Error(`Empty completion from ${model} (finish: ${finish})`);
  // A truncated artifact is broken code; fail so the fallback (higher cap) takes over.
  if (finish === 'length') throw new Error(`Truncated completion from ${model} at its token cap`);
  return { content, usage };
}

// One chat completion for a role, with fallback promotion on primary failure.
export async function chat(role, messages) {
  const cfg = ROLES[role];
  return tracer.startActiveSpan(`llm.${role}`, async (span) => {
    const model = promoted[role] || cfg.primary;
    span.setAttributes({
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': model,
      'devswarm.role': role
    });
    const started = Date.now();
    emit('llm_start', { role, model });
    try {
      const { content, usage } = await callModel(model, messages, cfg.temperature, span);
      emit('llm_end', { role, model, ms: Date.now() - started, in: usage.prompt_tokens ?? 0, out: usage.completion_tokens ?? 0 });
      span.end();
      return content;
    } catch (err) {
      span.addEvent('fallback_promotion', { from: model, to: cfg.fallback, reason: String(err) });
      span.setAttribute('gen_ai.request.model', cfg.fallback);
      emit('fallback', { role, from: model, to: cfg.fallback, reason: String(err.message || err) });
      try {
        const { content, usage } = await callModel(cfg.fallback, messages, cfg.temperature, span);
        promoted[role] = cfg.fallback;
        emit('llm_end', { role, model: cfg.fallback, ms: Date.now() - started, in: usage.prompt_tokens ?? 0, out: usage.completion_tokens ?? 0 });
        span.end();
        return content;
      } catch (err2) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err2) });
        emit('llm_error', { role, model: cfg.fallback, reason: String(err2.message || err2) });
        span.end();
        throw err2;
      }
    }
  });
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
  const re = new RegExp('```(?:' + lang + ')?\\s*\\n([\\s\\S]*?)```');
  const m = text.match(re);
  return m ? m[1] : text;
}
