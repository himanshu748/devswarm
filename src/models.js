// Role -> model routing. Verified live on HF Inference Providers 2026-07-20.
// Treat as config, not a lock-in; re-check provider availability before the demo.
export const ROLES = {
  // GLM-5.2 leads where outputs are small (its provider caps completions at
  // 16384, which never bites a plan or a diagnosis) and is banned from
  // frontend, where traces showed every failure was that cap truncating
  // full-page HTML.
  planner: {
    primary: 'zai-org/GLM-5.2',
    fallback: 'Qwen/Qwen3.6-35B-A3B',
    temperature: 0.2
  },
  // Frontend moved off GLM-5.2 after traces showed every failure was its 16384
  // output cap truncating full-page HTML; Kimi-K2.6 (32k) was already doing the
  // real work via fallback promotion, so the config now matches the telemetry.
  frontend: {
    primary: 'moonshotai/Kimi-K2.6',
    fallback: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
    temperature: 0.4
  },
  backend: {
    primary: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
    fallback: 'moonshotai/Kimi-K2.7-Code',
    temperature: 0.2
  },
  critic: {
    primary: 'deepseek-ai/DeepSeek-V4-Pro',
    fallback: 'deepseek-ai/DeepSeek-V4-Flash',
    temperature: 0.1
  },
  doctor: {
    primary: 'zai-org/GLM-5.2',
    fallback: 'Qwen/Qwen3.6-35B-A3B',
    temperature: 0.1
  }
};

// Provider-enforced completion caps; anything absent gets the default.
// GLM-5.2's router cap is 16384 (400s above it).
export const MODEL_MAX_TOKENS = {
  'zai-org/GLM-5.2': 16384
};
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
