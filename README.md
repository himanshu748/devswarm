# DevSwarm

DevSwarm turns one prompt into a working full-stack app. Five specialist open-weight models plan it, build it, review it and repair their own routing, and every step is an OpenTelemetry span in SigNoz, including the steps that go wrong. Generated apps are born observable: each one ships with its own OTel bootstrap and reports to SigNoz under its own service name seconds after it exists. The swarm watches itself, and everything it builds.

Built for the Agents of SigNoz hackathon by WeMakeDevs (July 20 to 26, 2026), Track 1: AI and Agent Observability.

The hackathon's two required files are [`observability/casting.yaml`](observability/casting.yaml) and [`observability/casting.yaml.lock`](observability/casting.yaml.lock): the Foundry config this project's SigNoz was actually installed from, so the whole telemetry stack is reproducible rather than described.

## Run it on your laptop

You need Node 22 or newer and a Hugging Face token. SigNoz is optional for a first run.

```sh
git clone https://github.com/himanshu748/devswarm.git
cd devswarm
npm install
cp .env.example .env          # then put your token in HF_TOKEN
npm start                     # http://localhost:4100
```

That is the whole setup. Without `SIGNOZ_OTLP_ENDPOINT` set, spans print to the console and the swarm works normally; you just do not get dashboards. `npm start` loads `.env` automatically.

What you can do straight away:

- `/` the landing page. Its statistics come from SigNoz when it is connected, and fall back to static numbers when it is not.
- `/app` Mission Control: the swarm graph, a live span stream, the hangar of everything built so far, and the Swarm Doctor.
- Type a prompt and press Dispatch. A generation takes 4 to 20 minutes and costs roughly 20 to 60 cents in tokens, because these are real model calls.

Two things that need more than a token:

| feature | also needs |
| --- | --- |
| dashboards, `/api/stats`, Swarm Doctor | SigNoz running, plus Docker (or `CLICKHOUSE_HTTP_URL`) so the Doctor can read the trace store |
| per-app dashboards auto-created at generation time | `SIGNOZ_API_TOKEN` from SigNoz Settings, API keys |

To self-host SigNoz, this repo ships a Foundry config (`observability/casting.yaml` and its lock file) plus importable dashboards and alert rules. See [observability/README.md](observability/README.md).

## What a generation does

1. **Planner** turns the prompt into a typed build plan: entities, pages and a locked API contract. Every field carries a binding `rules` string (format, range, nullability) because most failed builds are the two builders disagreeing about exactly those details.
2. **Frontend and backend** generate in parallel against that contract, the frontend under a design system injected verbatim into its prompt.
3. **Critic** reviews both for contract conformance, security and runtime bugs. Catches route back to the agent that owns them, that agent patches its own file, and the critic re-reviews only the delta. Two regeneration rounds, then it ships with an honest verdict either way.
4. The result gets a live preview, a review report, its own `otel.mjs`, a `package.json`, and a SigNoz dashboard scoped to its service name.

## Refining what it shipped

Generated apps are not one-shot. `POST /api/refine` takes an instruction, and the planner decides which agents need to re-run and whether the API contract changes, so a copy tweak never rebuilds your backend. The critic still gates the result and the history is appended to the app's `review.json`.

In Mission Control, hit **Refine** on any card in the hangar.

## Model routing

| role | primary | fallback |
| --- | --- | --- |
| planner | GLM-5.2 | Qwen3.6-35B-A3B |
| frontend | GLM-5.2 (thinking disabled) | Kimi-K2.6 |
| backend | Qwen3-Coder-480B | Kimi-K2.7-Code |
| critic | Kimi-K2.7-Code | DeepSeek-V4-Flash |
| doctor | GLM-5.2 | Qwen3.6-35B-A3B |

All open weights, served through Hugging Face Inference Providers. Zero closed-model API calls.

Two entries in `src/models.js` are load-bearing and worth reading the comments on. GLM-5.2 is **pinned to one provider** because the router load-balances it across seven whose `max_completion_tokens` ceilings disagree, from 16384 to over 200000, and an unpinned request fails outright whenever it lands on the strict one. Thinking is **disabled for the frontend role only**, because with it on GLM spends about two thirds of its budget reasoning and truncates full-page HTML.

The critic choice is measured, not assumed. On an app with three documented contract defects, three runs each, Kimi-K2.7-Code found 8 of 9 and the previous primary found 2 of 9.

## Observability

All three signals go to SigNoz:

- **Traces**: GenAI semconv attributes on every model call, plus `fallback_promotion` and `critic_catch` span events. Record the reason text; both of the worst bugs in this project were solved by reading it.
- **Metrics**: token, call, fallback, catch, generation and refinement counters, plus an LLM latency histogram, labelled by role and model.
- **Logs**: structured records for fallbacks, doctor diagnoses and generation verdicts.

Four dashboards and two alert rules live in `observability/`. The instrumentation layer is extracted as a standalone library, [otel-swarm](https://github.com/himanshu748/otel-swarm), which DevSwarm consumes as a real dependency.

### Self-healing

A SigNoz alert (fallback spike, or critic catch-rate flatline) posts to `/api/doctor/webhook`. The Swarm Doctor queries the swarm's own trace store for recent role health, diagnoses in plain English using the numbers it just read, and promotes a backup model or resets a recovered primary. Its own calls are traced, so the healer is as observable as the patient.

## API

| method | path | purpose |
| --- | --- | --- |
| POST | `/api/generate` | `{prompt}`, runs a full generation |
| POST | `/api/refine` | `{id, instruction}`, scoped edit to an existing app |
| GET | `/api/events` | SSE stream of everything the swarm is doing |
| GET | `/api/generations` | every app built, with verdict and refinement count |
| GET | `/api/stats` | lifetime stats, read live from SigNoz |
| GET | `/api/models` | current routing table and any active promotions |
| POST | `/api/doctor/run` | run a diagnosis on demand |
| GET | `/preview/:id/` | the generated app, running for real |

Previews are live. The generated Express server runs as a child process and requests are proxied to it, so its API and its traces are real. Children get an allowlisted environment, never the parent's secrets.

## Repo map

- `src/` server, orchestrator, LLM client with TTL-bound fallback promotion, `agents/` (planner, frontend, backend, critic, doctor), child-process preview runner, OTel setup
- `swarm/` the contracts the agents are held to: role contracts and the generated-app design system, both injected into prompts verbatim
- `ui/` landing page and Mission Control, no build step
- `observability/` Foundry casting file, dashboards, alert rules, ops notes
- `generated/` (gitignored) every app the swarm has built

## What we learned

The write-up is [BLOG.md](BLOG.md), and it is mostly about being wrong: a stale constant we blamed on a model, a provider limit we blamed on the model, a review gate we assumed was our strongest link, and a design system we were sure was helping that measurably was not. Every one of those was found by telemetry contradicting us rather than by reading the code again.

DevSwarm was built with Claude Code.
