// Role -> model routing. Re-verified live on HF Inference Providers 2026-07-25.
// Treat as config, not a lock-in; re-check provider availability before the demo.
export const ROLES = {
  planner: {
    primary: 'zai-org/GLM-5.2:fireworks-ai',
    fallback: 'Qwen/Qwen3.6-35B-A3B',
    temperature: 0.2
  },
  // GLM-5.2 leads frontend on craft: side by side against Kimi it derives a
  // palette from the subject, builds a real hero and keeps a typographic
  // hierarchy, where Kimi returns competent template layout. The backup is
  // K2.7-Code rather than the older K2.6: same family, newer weights, and it is
  // the model that measured best on our critic benchmark, so a rescue build is
  // more likely to survive review.
  //
  // Thinking is disabled for this role only. Measured on one bookshelf app:
  // with reasoning on, GLM spent two thirds of its budget thinking, hit 32768
  // and returned truncated HTML; with it off the same prompt finished naturally
  // at 18330 tokens in 170s with no loss of craft. The planner and doctor keep
  // reasoning, since their outputs are small and the thinking helps them.
  frontend: {
    primary: 'zai-org/GLM-5.2:fireworks-ai',
    fallback: 'moonshotai/Kimi-K2.7-Code',
    temperature: 0.4,
    params: { thinking: { type: 'disabled' } }
  },
  backend: {
    primary: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
    fallback: 'moonshotai/Kimi-K2.7-Code',
    temperature: 0.2
  },
  // Benchmarked on an app with 3 documented contract defects, 3 runs each:
  // Kimi-K2.7-Code recalled 8 of 9, DeepSeek-V4-Pro 2 of 9 with one run burning
  // its whole budget and returning unparseable output. V4-Pro is dropped rather
  // than kept as backup. K2.7-Code also stays independent of both builders,
  // which matters for a reviewer; V4-Flash is fast, proven insurance at 7s.
  critic: {
    primary: 'moonshotai/Kimi-K2.7-Code',
    fallback: 'deepseek-ai/DeepSeek-V4-Flash',
    temperature: 0.1
  },
  doctor: {
    primary: 'zai-org/GLM-5.2:fireworks-ai',
    fallback: 'Qwen/Qwen3.6-35B-A3B',
    temperature: 0.1
  }
};

// GLM-5.2 is pinned to one provider on purpose. The HF router load-balances it
// across seven, and their max_completion_tokens ceilings disagree: scaleway caps
// at 16384 and featherless at 32768, while together, fireworks-ai and deepinfra
// accept 200000+. Unpinned, a 32768 request 400s whenever routing lands on
// scaleway, which is what produced the "GLM keeps failing" mystery. Measured
// 2026-07-25; re-probe providers before changing this pin.

// Per-model completion caps; anything absent gets the default. GLM-5.2 sat here
// at 16384, which capped our own frontend builds mid-file. The cap belonged to
// one provider, not the model, so the fix was the pin above rather than an entry
// here. Re-probe before adding anything, since a stale cap reads exactly like a
// model that cannot finish.
export const MODEL_MAX_TOKENS = {};
export const DEFAULT_MAX_TOKENS = 32768;

// Runtime override map: role -> { model, at, by }. Promotions expire after
// FALLBACK_TTL_MINUTES so a transient primary outage never pins a role to its
// fallback forever; the Swarm Doctor can still reset earlier or re-promote.
export const promoted = {};
export const FALLBACK_TTL_MS = (Number(process.env.FALLBACK_TTL_MINUTES) || 10) * 60 * 1000;
export function promote(role, model, by = 'llm') {
  promoted[role] = { model, at: Date.now(), by };
}
export function demote(role) {
  delete promoted[role];
}
