# AGENTS.md

Working notes for anyone (human or agent) touching this repo.

## What this is

DevSwarm generates full-stack apps from a prompt using a swarm of open-weight models, each role handled by the model best at that job, with a critic agent reviewing everything before it ships. The swarm is fully traced into SigNoz via OpenTelemetry. Hackathon entry for "Agents of SigNoz" (WeMakeDevs, July 20-26, 2026). Strategy and scope live in PRD.md, Section 4c is the build plan.

## Run it

```sh
npm install
export HF_TOKEN=hf_...        # required, Hugging Face token
export SIGNOZ_OTLP_ENDPOINT=  # optional, e.g. http://localhost:4318; console spans if unset
node src/server.js            # http://localhost:4100
```

Smoke test: `curl -X POST localhost:4100/api/generate -H 'Content-Type: application/json' -d '{"prompt":"Build me a habit-tracker app"}'` (takes 3-6 min, real model calls).

## Map

- `src/models.js` role to model routing table plus runtime `promoted` overrides. Config, not law: re-verify provider availability before the demo.
- `src/llm.js` HF router client. Fallback promotion on primary failure, JSON/code extraction helpers, GenAI semconv span attrs.
- `src/agents/` one file per role: planner (JSON build plan), frontend (single-file HTML app), backend (single-file Express server), critic (structured review JSON, verdict pass/fail).
- `src/orchestrator.js` the flow: plan, parallel codegen, critic gate, regeneration loop (max 2), writes to `generated/<id>/`.
- `src/telemetry.js` OTel setup. One root span per generation, child span per agent and per LLM call.
- `src/server.js` Express API plus static preview of generated apps.
- `ui/` Mission Control, the judge-facing surface. Design rules in design.md.

## Conventions

- Plain JavaScript, ESM, no TypeScript, no build step. Minimal dependencies: express and OTel packages only unless there is a strong reason.
- Every span on the LLM path carries `gen_ai.*` semconv attributes and `devswarm.role`. New agent work must be spanned; untraced work defeats the whole thesis.
- Critic prompts are scoped checklists (contract, security, runtime bugs), never open-ended "is this good code". Keep them verifiable.
- Agent system prompts demand fenced output (```json / ```html / ```js); parse with the helpers in llm.js, never ad hoc regex.
- No em or en dashes anywhere: code comments, commit messages, docs, UI copy. Use commas, colons or parentheses.
- Commits: small, imperative, under 72 chars. No AI attribution or co-author trailers.

## Gotchas already paid for

- Thinking models eat small token budgets in reasoning and return empty content with `finish: length`. max_tokens is 32768 for a reason.
- Provider response shapes differ: `content` can be a string, an array of parts, or null with the output in `reasoning_content`. llm.js handles all three; do not bypass it.
- The server does not hot-reload. Restart after edits before re-testing.
- Generated apps run `server.js` standalone via a symlinked node_modules; the browser preview is static (frontend falls back to localStorage when its API is absent).
