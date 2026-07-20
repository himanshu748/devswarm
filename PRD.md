# DevSwarm — Product Requirements Document

**Status:** Draft v0.2 (SigNoz observability layer added for the "Agents of SigNoz" hackathon by WeMakeDevs — Track 1: AI & Agent Observability; hackathon window July 20–26, 2026)
**Owner:** Himanshu Jha
**Last updated:** 2026-07-07

## 1. Problem Statement

Tools like Lovable, Bolt, and v0 let non/semi-technical users generate full apps from a prompt, but they share common failure modes: a single general-purpose model handles frontend, backend, and infra together, so quality is uneven across layers (good UI, sloppy backend logic, no real deployment story), there's no independent review step catching bugs before they ship, and they're built exclusively on closed frontier-model APIs (OpenAI/Anthropic/Google), which caps them on cost and vendor lock-in.

**DevSwarm's bet:** a multi-agent swarm where each layer (frontend, backend, deployment, planning) is handled by the open-source model that's actually best-in-class for that specific job, plus a dedicated critic/review agent that checks every other agent's output before it's presented or shipped — running entirely on open-weight models served via Hugging Face, so it's cheaper to run at scale and not dependent on any single closed-model vendor.

## 2. Goals

- G1: Match or beat Lovable-class output quality for full-stack app generation (prompt → working, deployed app).
- G2: Use only open-weight models (no closed frontier APIs) — served via Hugging Face Inference Providers/Endpoints.
- G3: Every generated artifact (frontend code, backend code, deploy config) passes through an independent review/critic agent before being surfaced to the user, catching bugs, security issues, and inconsistencies a single-pass generation would miss.
- G4: Route each subtask to the model role best suited for it, rather than one model doing everything.

### Non-goals (v1)
- Not trying to beat closed frontier models on raw benchmark score — the bet is cost/quality tradeoff + review-gating, not "smartest model wins."
- Not a general-purpose chat assistant — scoped to app scaffolding/generation and iteration.

## 3. Users & Personas

| Persona | Need |
|---|---|
| **Indie hacker / solo founder** | Wants a working full-stack MVP from a prompt, fast, without paying frontier-API prices per generation. |
| **Small dev team** | Wants to scaffold boilerplate (CRUD app, auth, dashboard) and trust the review layer to catch obvious bugs before merging. |
| **Cost-sensitive builder (hackathons, students, emerging markets)** | Needs Lovable-like capability at a fraction of the API cost, since it runs on open models. |

## 4. Architecture: The Swarm

Seven agent roles, each backed by the open-weight model currently strongest for that job (model landscape shifts fast — this table should be re-verified against current HF Inference Providers availability at build time, not treated as fixed):

| Role | Primary model (as of research, mid-2026) | Fallback | Why |
|---|---|---|---|
| **Planner/PRD agent** | Qwen3.6-Plus (Apache-2.0, 1M ctx) | DeepSeek-V4-Pro | Best tool-calling reliability + long-context task decomposition; turns a user prompt into a structured build plan and routes subtasks to the other agents. |
| **Frontend codegen agent** | GLM-5.2 (Zhipu, MoE, MIT, 1M ctx) | Kimi K2.6 (esp. for screenshot/Figma-to-code) | Leads open-model agentic web-dev benchmarks; best "feel" for UI code generation. |
| **Backend codegen agent** | Qwen3-Coder-480B (Apache-2.0, 1M ctx) | DeepSeek-V4-Flash (cheaper) | Best balanced correctness across Python/Node/Go on SWE-bench-style tasks. |
| **Deployment/DevOps agent** | Qwen3-Coder (general) + a Terraform/IaC-specialized fine-tune where available | GLM-5.x | Handles Dockerfiles, CI/CD, IaC; IaC-specialized small fine-tunes are cheap to self-host if HF-hosted general models underperform on IaC specifically. |
| **Testing/QA agent** | Qwen3-Coder-480B (same family as backend, tuned toward test generation) | DeepSeek-V4-Flash | Generates unit/integration tests and a smoke-test script the preview environment runs on every build; feeds failures back to the critic and the responsible codegen agent rather than surfacing raw stack traces to the user. |
| **Documentation agent** | GLM-5.2 or Qwen3.6-Plus (reuse whichever is already warm for the request; doc quality is fairly interchangeable across top-tier models) | — | Generates README, setup/deploy instructions, and inline API docs from the planner's schema + the actual generated code, so docs can't drift from what was really built. |
| **Review/critic agent** | DeepSeek-V4 (MIT, thinking mode) | Kimi K2.6 Thinking / GLM-5.2 as second-opinion | Strongest reasoning/self-verification profile; used specifically to review the other agents' outputs (including test results), not to generate first drafts. |

**Serving note:** mid-size MoE models (30–70B active params) are realistically servable via HF Inference Providers/Endpoints (serverless or dedicated) at reasonable cost; the largest models (300B+ active) typically cost less through Inference Providers than self-hosting. Model choices should be re-validated against current HF availability and pricing at implementation time — this is a fast-moving landscape, not a permanent lock-in.

### Flow

1. User submits a prompt describing the app.
2. **Planner** decomposes it into a build plan: data model, pages/routes, API endpoints, deployment target.
3. **Frontend** and **Backend** agents generate their layers in parallel, each grounded in the plan's shared schema/contract (API shape, types) so they don't drift apart.
4. **Deployment agent** generates Dockerfile/IaC/CI config matching the stack chosen; this config also boots the **live preview** sandbox (Section 4a) as soon as a buildable version of the app exists, not just at the end.
5. **Testing agent** generates and runs a test/smoke suite against the live preview build; failures are routed back to the owning codegen agent, not surfaced raw to the user.
6. **Documentation agent** generates README/setup docs from the plan + final code, in parallel with review (docs never block the build).
7. **Review/critic agent** checks all outputs: cross-checks frontend↔backend contract consistency, flags security issues (secrets in code, missing input validation, insecure defaults), checks the deploy config matches runtime needs, checks test results, and requests a fix-and-regenerate loop from the responsible agent if it finds a problem — before anything is shown to the user as "done."
8. User sees the live, interactive preview, the final app, generated docs, and a review summary (what was checked, what got flagged/fixed).

## 4a. Live Preview (v0/Lovable/Bolt-style)

This is table stakes for a vibecoding tool and is called out separately because it's infrastructure, not a model-routing concern:

- **Sandboxed execution environment**: every generation spins up an isolated, ephemeral runtime (container-per-session, e.g. Docker/Firecracker-based or a WebContainer-style in-browser Node runtime) that actually runs the generated frontend + backend + a scratch database, not just renders static code.
- **Streaming build**: the preview should update incrementally as the frontend/backend agents produce code — first paint from scaffolding, then hydrate as endpoints come online — rather than a single "wait for everything, then reveal" step, to match the perceived responsiveness of v0/Lovable/Bolt.
- **In-preview iteration loop**: user can click into the running app, describe a change, and have it re-routed to the relevant agent(s) and hot-reloaded into the same sandbox, not a full regenerate.
- **Preview ≠ prod**: the sandbox is disposable/ephemeral; "one-click deploy" (Section 5) promotes a reviewed, tested build out of the sandbox to a real deploy target, it doesn't just expose the sandbox publicly.
- **Isolation/security**: sandboxes must be network- and filesystem-isolated per session (untrusted, agent-generated code is executing) — this is a hard security requirement, not an optimization, given the code running it was never written or reviewed by the end user.

## 4b. Observability Layer (SigNoz — first-class, not an add-on)

A seven-agent swarm with parallel generation, review-gate loops, and regeneration cycles is exactly the kind of system that is opaque without tracing. DevSwarm instruments the entire swarm with **OpenTelemetry**, exported to **SigNoz** (self-hosted or cloud), making observability a core product surface — and the basis of the Transparency Panel (Feature 10), not a separate ops tool.

### What gets instrumented

- **End-to-end generation traces**: one root span per user prompt; child spans per agent (planner → frontend/backend/deploy in parallel → testing → critic → regeneration loops). Every fix-and-regenerate cycle is visible as a span tree, so "why did this generation take 4 minutes" is answerable in one trace view.
- **LLM call telemetry** (per model call, via OTel GenAI semantic conventions): model id, provider, prompt/completion token counts, latency, cost estimate, retry/fallback events (primary → fallback model switches are explicit span events).
- **Review-gate metrics**: critic catch events (what was flagged, which agent's output, severity), regeneration counts per role, pass/fail rates — this directly instruments the core value prop (Section 6's "review catch rate") instead of computing it offline.
- **Sandbox/infra signals**: preview sandbox boot time, build/test durations, smoke-test results, sandbox resource usage and teardown — logs and metrics shipped alongside traces so a failed preview correlates to the exact agent output that caused it.
- **Cost dashboards**: per-generation and per-role token/cost breakdown across HF Inference Providers — the "materially cheaper than closed models" thesis becomes a live SigNoz dashboard, not a claim.

### SigNoz-powered features

1. **Transparency Panel = SigNoz data**: the user-facing "which model did what, what the critic flagged" panel reads from the same trace data, keeping product and ops views consistent.
2. **SLO dashboards**: generation success rate, time-to-working-app, review catch rate as SigNoz dashboards with alerts (e.g., fallback-model usage spike, critic catch rate dropping to zero = critic silently broken).
3. **Self-healing hooks (stretch)**: SigNoz alerts (e.g., a role's failure rate spikes) trigger automatic fallback-model promotion for that role — closing the loop from observability back into swarm routing.

4. **Swarm Doctor (SRE copilot for the swarm)**: a dedicated meta-agent that *consumes* SigNoz data instead of producing it — it queries the SigNoz API (traces, metrics, alerts) to diagnose swarm health in natural language ("backend agent's p95 latency doubled after the fallback switch; regenerations are up 3×; recommend pinning DeepSeek-V4-Flash"), and executes the self-healing actions in item 3. This turns SigNoz from a passive dashboard into the swarm's own nervous system, and is the single strongest "agent-native observability" story in the project.
5. **Born-observable generated apps**: every app DevSwarm generates ships *already instrumented* — the deployment agent injects OTel SDK setup (traces + logs + basic RED metrics) into the generated backend/frontend, and DevSwarm auto-provisions a per-app SigNoz dashboard alongside the README. The pitch: *DevSwarm doesn't just build your app, it births it observable.* No other vibecoding tool does this.

## 4c. Hackathon Strategy (Agents of SigNoz — WeMakeDevs, July 20–26, 2026)

**Core narrative: "The swarm that watches itself — and everything it builds."** SigNoz is not a feature of the submission; it is the architecture. Three layers of SigNoz usage, which map one-to-one onto the three hackathon tracks:

| Layer | What it is | Track it wins on |
|---|---|---|
| **Observed swarm** | Every agent, LLM call, review-gate event, and regeneration loop traced into SigNoz (Section 4b) | **Track 1: AI & Agent Observability** — "AI agents with end-to-end observability, inference monitoring" |
| **Swarm Doctor + self-healing** | Meta-agent queries SigNoz to diagnose the swarm and auto-promotes fallback models on alert (Section 4b, items 3–4) | **Track 1** (its "SRE assistants, self-healing infrastructure" examples) |
| **`otel-swarm` instrumentation library + dashboard pack** | The swarm instrumentation extracted as a reusable, open-source OTel library for *any* multi-agent LLM system (GenAI semconv-compliant), shipped with importable SigNoz dashboard JSON (LLM cost, agent SLOs, review-gate funnel) | **Track 2: Signals & Dashboards** — "auto-instrumentation libraries, multi-signal panels, SLO dashboards" |
| **Born-observable generated apps** | DevSwarm auto-instruments every app it generates + provisions its SigNoz dashboard (Section 4b, item 5) | **Track 3: Build Your Own** — "observe anything with SigNoz," including apps that didn't exist five minutes ago |

**What the rules actually say (checked 2026-07-20).** The official overview and rules pages ([overview](https://www.wemakedevs.org/hackathons/signoz), [rules](https://www.wemakedevs.org/hackathons/signoz/rules)) confirm: "One prize per track", "maximum team size of 4", every winning-team member gets the device, and IP stays with the team. On submissions the rules are explicit about tracks but silent on counts: **"Pick one of the three tracks ... or bring your own idea"** (singular "one"), and the project form was still marked "will be updated soon" at the time of writing. There is **no stated permission to submit multiple projects and no stated ban on it**, so the safe base case is one project per team, entered on one track. Additional structural facts: the pre-event **blog prize** (submit before Jul 19 → AirPods Pro 3 / Powerbeats Pro 2) and the **social-media track** (top 10 posts → swag) are separate, additive awards that any team can win alongside a track prize — those are free extra paths, not competing entries.

**Consequence for the plan:** do not architect around winning three track prizes with three entries — that is not supported by the written rules and "one prize per track" plus singular "pick one track" points the other way. Instead, **build one project engineered so every track's judging criteria light up on it**, and enter it on **Track 1** (deepest fit, biggest wow). The single-project design already fits all three tracks:

- **Track 1 (AI & Agent Observability)** — the observed swarm + Swarm Doctor self-healing. This is the entry track.
- **Track 2 (Signals & Dashboards)** — the `otel-swarm` instrumentation library + importable SigNoz dashboard pack, published as its own standalone open-source repo. Genuinely useful without DevSwarm, so it stands as real Track-2-grade work whether or not a second entry is permitted; if the organizers confirm multiple entries are allowed, it becomes a literal second submission at near-zero extra cost, and if not, it is depth evidence that lifts the main entry's "Best Use of SigNoz" and Technical Excellence scores.
- **Track 3 (Build Your Own)** — born-observable generated apps (DevSwarm auto-instruments and provisions a dashboard for anything it builds), folded into the main submission as breadth.

**One action still open:** confirm the multiple-entry question with organizers (Slack/Discord) once the project form ships, since the pages don't settle it. The plan does not depend on the answer: a "no" costs nothing because the `otel-swarm` repo and Track 3 breadth were always going to strengthen the single Track 1 entry; a "yes" is pure upside (a second, ready-made Track 2 submission).

### Hackathon MVP scope (what actually gets built, in dependency order)

A thin vertical slice with observability *complete*, rather than the full swarm untraced. Everything below composes into one demo; nothing is built that isn't in the demo.

1. **Swarm core (day 1–2)**: planner + frontend agent + backend agent + critic (4 roles, not 7 — testing/docs/deploy agents are cut; a fixed React+Express template stands in for the deploy agent). One default stack, no streaming preview — a simple static preview of the generated app is enough.
2. **Instrumentation (day 2–3)**: OTel tracing across all four agents per Section 4b, exported to self-hosted SigNoz (Docker Compose) on the $100 AWS credits. GenAI semconv attributes on every LLM span. This is where depth goes: traces + metrics + logs, all three signals, from day one.
3. **Dashboards + alerts (day 3–4)**: three SigNoz dashboards — *Generation Overview* (span waterfall KPIs, success rate, time-to-app), *LLM Economics* (tokens/cost per role/model/provider, fallback events), *Review-Gate Funnel* (catches by severity, regeneration loops, catch rate over time). Two alert rules: fallback-usage spike, critic catch-rate flatline.
4. **Swarm Doctor (day 4–5)**: meta-agent over the SigNoz query API; natural-language diagnosis in the UI + one working self-heal path (alert → fallback model promotion), demoed by deliberately degrading a model endpoint live.
5. **Born-observable output (day 5)**: generated apps get OTel bootstrapping injected + an auto-created SigNoz dashboard; demo shows the *generated* app's traffic appearing in SigNoz seconds after generation.
6. **Mission Control UI (throughout, polished day 5–6)**: Section 4d — the front-of-house for everything above.
7. **Submission polish (day 6–7)**: README with architecture diagram, 3-minute demo video following the demo script below, blog post (bonus prize), deployed live URL.

### Demo script (3 minutes, one continuous take)

1. *(0:00)* Type a prompt: "Build me a habit-tracker app." Mission Control lights up — agents activate, the live trace waterfall streams.
2. *(0:40)* Critic catches a real issue (e.g., backend agent left an unvalidated input); the flag, the regeneration loop, and the fix are all visible as spans. Cut to the Review-Gate Funnel dashboard in SigNoz: the catch is already on it.
3. *(1:20)* Kill the primary backend model's endpoint mid-generation. SigNoz alert fires → Swarm Doctor diagnoses it in plain English → auto-promotes the fallback model → generation completes anyway. (Self-healing, live, not slideware.)
4. *(2:10)* The generated app opens — and it's already instrumented: click around it, and its own traces appear in its own auto-provisioned SigNoz dashboard.
5. *(2:40)* LLM Economics dashboard: "this whole app cost $0.14 to generate, and here's the per-agent breakdown." Close on the tagline: *the swarm that watches itself — and everything it builds.*

### Judging criteria mapping (all six, explicit)

- **Best Use of SigNoz** — all three signals (traces/metrics/logs) + dashboards + alerts + *querying SigNoz programmatically from an agent* + provisioning SigNoz for generated apps. Consumer *and* producer of SigNoz data; few submissions will do both.
- **Potential Impact** — multi-agent LLM systems are exploding and nobody can debug them; `otel-swarm` is reusable beyond DevSwarm.
- **Creativity & Innovation** — the recursion (an AI system whose own observability heals it, generating apps that are born observable) is a story no dashboard-only project has.
- **Technical Excellence** — OTel GenAI semantic conventions, structured span model, real self-healing control loop.
- **User Experience** — Mission Control (Section 4d) is designed to be the screenshot that gets shared.
- **Presentation Quality** — scripted 3-min demo above; README/diagram/blog budgeted as build tasks (day 6–7), not afterthoughts.

## 4d. Mission Control UI (the showcase surface)

The judge-facing (and eventually user-facing) UI. Design goal: **the observability data IS the interface** — beautiful enough that screenshots carry the submission, honest enough that every pixel is backed by live SigNoz data.

**Design language:** dark theme, near-black slate background (`#0B0E14`-family), one restrained accent per agent role (planner amber, frontend cyan, backend violet, critic red, doctor green), glassy panel surfaces with subtle borders, `Inter` or `Geist` for UI + a monospace (`JetBrains Mono`) for spans/code/costs. Motion is meaningful, not decorative: things animate only when real telemetry arrives. NO generic dashboard-template look — this should read as a NASA mission control room for AI agents.

**Layout (single screen, three zones):**

1. **Swarm Graph (center stage)** — a live node graph of the agents. Idle nodes glow dim; an active agent's node pulses with its role color and shows its current span name + elapsed time + running token count underneath. Edges light up as data flows (planner → backend, critic → regeneration). A critic catch flashes the offending agent's edge red and pins a flag chip to it. This is the hero shot.
2. **Trace River (bottom third)** — a live-streaming horizontal span waterfall of the current generation (the same data SigNoz has, rendered natively in the app). Spans are color-coded by agent, regeneration loops render as visually distinct nested groups, and clicking any span deep-links to that exact trace in SigNoz — an explicit, judge-pleasing "and here it is in SigNoz" bridge.
3. **Vitals Rail (right side)** — live tickers: cost-so-far (odometer-style rolling digits), tokens/sec, active model per role with fallback badges, critic catches count, and an alert feed. When Swarm Doctor acts, its diagnosis appears here as a chat-style card with a "view evidence in SigNoz" link.

**Second screen — the generated app's own dashboard:** after generation, a panel shows the born-observable app: its preview on the left, its live SigNoz-fed RED metrics on the right, updating as the demo driver clicks around the preview. The visual of *both* dashboards alive at once (swarm's and app's) is the closing shot of the demo.

**Build guardrails:** Next.js + Tailwind + shadcn/ui, spans streamed to the UI over a WebSocket from the same OTel collector pipeline that feeds SigNoz (one pipeline, two consumers — no duplicate bookkeeping, guaranteeing the UI and SigNoz never disagree). Frame budget: the graph and waterfall must stay smooth on a single mid-size generation; this is a demo surface, not Grafana — cap history, don't paginate.

## 5. Key Features (v1 scope)

1. **Prompt-to-app scaffolding**: single prompt produces a working full-stack app (frontend + backend + basic data layer).
2. **Multi-agent routing**: planner decomposes and assigns work to the specialized agents above.
3. **Contract enforcement**: shared schema/types between frontend and backend agents to prevent integration drift.
4. **Live preview sandbox**: streaming, interactive preview of the running app during and after generation (Section 4a) — not just a code dump.
5. **Test generation & smoke-testing**: testing agent produces and runs tests against the live preview; failures loop back into regeneration automatically.
6. **Auto-generated documentation**: README, setup, and API docs generated from the plan + real code, kept in sync with what was actually built.
7. **Review-gate loop**: critic agent reviews every generated layer (including test results), triggers regeneration on failures, before final output.
8. **One-click deploy**: promotes a reviewed build from the preview sandbox to a real deploy target (e.g., Vercel/Render/Fly, or a self-hosted Docker Compose stack).
9. **Iteration**: user can request changes directly from the live preview; the planner re-routes only the affected agent(s), not a full regenerate.
10. **Transparency panel**: shows which model handled which part, and what the critic/tests flagged/fixed — a differentiator vs. black-box competitors. Backed by SigNoz trace data (Section 4b), not a separate bookkeeping layer.
11. **Swarm observability (SigNoz)**: full OpenTelemetry instrumentation of every agent, LLM call, review-gate event, and sandbox lifecycle, with cost/SLO dashboards and alerting (Section 4b).

### Later phases
- User-selectable model tiers (cheaper/faster vs. higher-quality per role).
- Support for more stacks/frameworks beyond the initial default (e.g., beyond React+Node).
- Self-hosted/on-prem mode for teams wanting full data control (since it's all open-weight, no vendor API dependency).
- Community-contributed agent "specialists" (e.g., a dedicated mobile/React Native agent, a dedicated ML/data-pipeline agent).

## 6. Success Metrics

- **Generation success rate**: % of prompts that produce a working, deployable app on first pass (pre-review) vs. after review-gate fixes.
- **Review catch rate**: % of generations where the critic agent caught and fixed a real bug/security issue before user-facing output (this is the core value prop — must be measurably nonzero and visible).
- **Cost per generation** vs. equivalent Lovable/Bolt-style closed-model generation (target: materially cheaper, since this is the whole cost thesis).
- **Time to working app** (prompt to deployed, working app).
- **User retention/iteration rate**: do users come back to iterate, or abandon after first generation (signal of trust in output quality).

All of the above are computed live from SigNoz metrics/traces (Section 4b), not batch analytics — the success metrics ship as dashboards on day one.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Open-weight models lag closed frontier models on raw code quality | Lean on the review-gate as the quality lever — catch what generation misses rather than relying on one-shot model quality alone. |
| Model landscape shifts fast; hardcoded model choices go stale | Treat the per-role model table as a config, not a hardcoded constant; re-benchmark periodically. |
| Multi-agent latency (5 model calls vs. 1) hurts perceived speed | Parallelize frontend/backend/deploy generation; only review-gate is sequential; consider streaming partial output. |
| Frontend/backend contract drift despite shared schema | Planner-owned schema is the single source of truth; critic agent explicitly checks contract conformance as a review step, not just correctness in isolation. |
| Self-hosting large MoE models is expensive/complex | Default to HF Inference Providers (serverless) rather than self-hosting; only self-host small specialized fine-tunes (e.g., IaC) where it's clearly cheaper. |
| "Review agent approves, but is itself wrong" (critic hallucination) | Critic checks are scoped and structured (contract match, security checklist, known bug patterns) rather than open-ended "is this good code" judgment, to keep it verifiable. |
| Live preview runs untrusted, agent-generated code | Hard per-session sandbox isolation (network + filesystem) is a launch requirement, not a later hardening pass; treat every generated app as hostile until reviewed. |
| Preview sandbox cost/scaling (one ephemeral environment per active session) | Aggressive idle-teardown, and cap concurrent live sandboxes per user tier; this is a real infra cost line item to model early, not an afterthought. |
| Hackathon scope creep — 7 days is not enough for the full swarm | Section 4c's build order is a hard cut list (4 agents, one stack, no streaming preview); anything not in the 3-minute demo script doesn't get built. |
| Live demo fragility (self-heal moment depends on real model endpoints) | Rehearse the kill-the-endpoint step with a deterministic degradation switch (feature-flagged fake outage), and pre-record the demo video as the primary artifact with the live URL as backup. |

## 8. Roadmap (indicative)

- **Phase 0.5 (Hackathon slice — Agents of SigNoz, submit by July 26, 2026)**: the 7-day plan in Section 4c — 4-agent swarm core, full OTel→SigNoz instrumentation, three dashboards + two alerts, Swarm Doctor with one self-heal path, born-observable generated apps, Mission Control UI (Section 4d), scripted demo. Doubles as the observability foundation and UI shell for Phase 1; hosted on the $100 AWS participant credits.
- **Phase 0**: validate the model-routing thesis — benchmark actual per-role model quality (frontend/backend/review) on a fixed task set before committing architecture.
- **Phase 1 (MVP)**: single default stack (e.g., React + Node/Express + Postgres), planner + frontend + backend + critic agents, a basic live preview sandbox (even non-streaming), manual deploy config output (no auto-deploy yet).
- **Phase 2**: testing agent + documentation agent added to the loop; deployment agent + one-click deploy target; iteration/re-routing directly from the live preview.
- **Phase 3**: streaming/incremental preview builds, multi-stack support, model-tier selection, transparency panel, self-hosted mode.

## 9. Open Questions

- Which single stack to default to for MVP, to keep the frontend/backend contract problem tractable before generalizing?
- Where to draw the line on review-gate scope (security + contract checks only, vs. broader code-quality judgment) to keep the critic agent's output verifiable rather than another source of hallucination?
- Build vs. rely-on HF Inference Providers pricing model at scale — needs a cost model once real usage volume is estimated.
- Should the "one model per role" table be user-visible/configurable from day one (transparency as a feature) or an internal implementation detail initially?
