// Role -> model routing. Verified live on HF Inference Providers 2026-07-20.
// Treat as config, not a lock-in; re-check provider availability before the demo.
export const ROLES = {
  planner: {
    primary: 'zai-org/GLM-5.2',
    fallback: 'Qwen/Qwen3.6-35B-A3B',
    temperature: 0.2
  },
  frontend: {
    primary: 'zai-org/GLM-5.2',
    fallback: 'moonshotai/Kimi-K2.6',
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
  }
};

// Provider-enforced completion caps; anything absent gets the default.
// GLM-5.2's router cap is 16384 (400s above it).
export const MODEL_MAX_TOKENS = {
  'zai-org/GLM-5.2': 16384
};
export const DEFAULT_MAX_TOKENS = 32768;

// Runtime override map: Swarm Doctor / self-heal flips roles to fallback here.
export const promoted = {};
