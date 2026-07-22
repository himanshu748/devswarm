# DevSwarm

DevSwarm turns one prompt into a working full-stack app using four specialized open-weight models (GLM-5.2, Qwen3-Coder-480B, Kimi K2.x, DeepSeek-V4 via Hugging Face), with an independent critic agent that reviews every artifact before it ships. The whole swarm is traced into SigNoz with OpenTelemetry GenAI semantic conventions, three dashboards and two alert rules run on that data, a SigNoz alert webhook wakes a Swarm Doctor meta-agent that reads the traces and rewires model routing on its own, and every app the swarm generates ships already instrumented with its own OTel bootstrap. The swarm watches itself, and everything it builds.

Built for the Agents of SigNoz hackathon by WeMakeDevs (July 20 to 26, 2026), Track 1: AI and Agent Observability.

## Run it

```sh
npm install
export HF_TOKEN=hf_...                                # Hugging Face token, required
export SIGNOZ_OTLP_ENDPOINT=http://localhost:4318     # optional, console spans if unset
node src/server.js                                    # http://localhost:4100
```

- `/` landing page, its stat cards render live from SigNoz trace data via `/api/stats`
- `/app` Mission Control: live swarm graph, span waterfall with deep links into SigNoz traces, token vitals, Swarm Doctor
- `POST /api/generate {"prompt": "Build me a habit-tracker app"}` runs a full generation (3 to 6 minutes, real model calls)

Self-host SigNoz and import the dashboards and alerts: see [observability/README.md](observability/README.md). The instrumentation layer is also extracted as a standalone library: [otel-swarm](https://github.com/himanshu748/otel-swarm).

## How a generation works

1. Planner (GLM-5.2) turns the prompt into a typed build plan with an API contract and a subject-derived design direction.
2. Frontend and backend agents generate in parallel against that contract, under a design system with hard non-negotiables (responsive, real states, accessibility floor).
3. The critic (DeepSeek-V4-Pro) checks contract conformance verbatim, security and runtime bugs; failures route back to the owning agent, max 2 regeneration rounds.
4. The result ships with a live preview, the honest review report, and its own OTel bootstrap so its traffic appears in SigNoz seconds after generation.

Every step is a span. Every fallback promotion and critic catch is a span event. When something is slow or wrong, the answer is one trace away.

## Self-healing loop

SigNoz alert fires (fallback spike, or critic catch-rate flatline) → webhook wakes Swarm Doctor → the doctor queries SigNoz's trace store for recent role health → diagnoses in plain English → promotes fallbacks or resets recovered primaries. Its own LLM calls are traced too.

## Repo map

- `src/` server, orchestrator, llm client with per-model token caps and fallback promotion, `agents/` (planner, frontend, backend, critic, doctor), OTel setup, event bus
- `swarm/` the swarm's contracts: role contracts and the generated-app design system (injected into agent prompts verbatim)
- `ui/` landing page and Mission Control, no build step
- `observability/` SigNoz Foundry casting file, importable dashboards and alert rules, ops notes
- `generated/` (local only) generated apps, each with `server.js`, `public/index.html`, `otel.mjs`, `review.json` and a README
