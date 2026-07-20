import { SpanStatusCode } from '@opentelemetry/api';
import { tracer } from './telemetry.js';
import { ROLES, promoted } from './models.js';

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
    body: JSON.stringify({ model, messages, temperature, max_tokens: 32768 })
  });
  if (!res.ok) throw new Error(`HF router ${res.status} for ${model}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const usage = data.usage || {};
  span.setAttributes({
    'gen_ai.usage.input_tokens': usage.prompt_tokens ?? 0,
    'gen_ai.usage.output_tokens': usage.completion_tokens ?? 0
  });
  const msg = data.choices?.[0]?.message || {};
  // Providers differ: content can be a string, an array of parts, or null
  // with the real output in reasoning_content (thinking models).
  let content = msg.content;
  if (Array.isArray(content)) content = content.map((p) => p.text ?? '').join('');
  if (!content) content = msg.reasoning_content;
  if (!content) throw new Error(`Empty completion from ${model} (finish: ${data.choices?.[0]?.finish_reason})`);
  return content;
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
    try {
      const out = await callModel(model, messages, cfg.temperature, span);
      span.end();
      return out;
    } catch (err) {
      span.addEvent('fallback_promotion', { from: model, to: cfg.fallback, reason: String(err) });
      span.setAttribute('gen_ai.request.model', cfg.fallback);
      try {
        const out = await callModel(cfg.fallback, messages, cfg.temperature, span);
        promoted[role] = cfg.fallback;
        span.end();
        return out;
      } catch (err2) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err2) });
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
