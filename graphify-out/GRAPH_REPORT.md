# Graph Report - /Users/himanshujha/n/devswarm  (2026-07-21)

## Corpus Check
- Corpus is ~14,992 words - fits in a single context window. You may not need a graph.

## Summary
- 136 nodes · 258 edges · 10 communities
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.55)
- Token cost: 119,851 input · 8,000 output

## Community Hubs (Navigation)
- The Agent Swarm
- SigNoz Deployment and Alerts
- OTel Dependencies
- Product Vision and PRD
- Model Routing and Mission Control
- LLM Client Code
- Package Manifest
- Orchestrator and Codegen Flow
- Swarm Doctor and Event Bus
- Codegen Agent Internals

## God Nodes (most connected - your core abstractions)
1. `chat()` - 13 edges
2. `SigNoz` - 12 edges
3. `Critic agent` - 12 edges
4. `DevSwarm` - 11 edges
5. `Landing page` - 10 edges
6. `ClickHouse telemetry store` - 10 edges
7. `generate()` - 9 edges
8. `Mission Control UI` - 9 edges
9. `emit()` - 8 edges
10. `Frontend agent` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Swarm Doctor` --promotes fallback models in--> `Model routing table (models.js)`  [INFERRED]
  PRD.md → AGENTS.md
- `Telemetry setup (telemetry.js)` --sends OTLP on ports 4317/4318 to--> `SigNoz ingester (OTel collector)`  [INFERRED]
  AGENTS.md → observability/pours/deployment/ingester/ingester.yaml
- `Landing page` --reuses role color tokens from--> `Mission Control design language`  [INFERRED]
  ui/index.html → design.md
- `DevSwarm AGENTS.md` --documents working conventions of--> `DevSwarm`  [EXTRACTED]
  AGENTS.md → PRD.md
- `Landing page` --markets--> `DevSwarm`  [EXTRACTED]
  ui/index.html → PRD.md

## Import Cycles
- None detected.

## Communities (10 total, 0 thin omitted)

### Community 0 - "The Agent Swarm"
Cohesion: 0.16
Nodes (22): Agents of SigNoz hackathon, Backend agent, Build plan / API contract, Critic agent, DeepSeek-V4, DeepSeek-V4-Flash, DeepSeek-V4-Pro, Documentation agent (+14 more)

### Community 1 - "SigNoz Deployment and Alerts"
Cohesion: 0.15
Nodes (21): ClickHouse telemetry store, ClickHouse Keeper, ClickHouse user-scripts init, Cost per generation, Critic catch-rate flatline alert, 3-minute demo script, Fallback-usage spike alert, Foundry casting (casting.yaml) (+13 more)

### Community 2 - "OTel Dependencies"
Cohesion: 0.12
Nodes (17): express, @opentelemetry/api, @opentelemetry/exporter-trace-otlp-http, @opentelemetry/instrumentation, @opentelemetry/instrumentation-http, @opentelemetry/resources, @opentelemetry/sdk-trace-node, @opentelemetry/semantic-conventions (+9 more)

### Community 3 - "Product Vision and PRD"
Cohesion: 0.17
Nodes (15): Born-observable generated apps, Deployment/DevOps agent, DevSwarm, DevSwarm AGENTS.md, DevSwarm PRD, Generation Overview dashboard, Generation success rate, Live preview sandbox (+7 more)

### Community 4 - "Model Routing and Mission Control"
Cohesion: 0.23
Nodes (14): DevSwarm server (server.js), Fallback promotion, GenAI semantic conventions, Hugging Face Inference Providers, LLM client (llm.js), Mission Control design language, Mission Control UI, Model routing table (models.js) (+6 more)

### Community 5 - "LLM Client Code"
Cohesion: 0.29
Nodes (8): callModel(), token(), MODEL_MAX_TOKENS, promoted, ROLES, app, provider, tracer

### Community 6 - "Package Manifest"
Cohesion: 0.20
Nodes (9): devDependencies, playwright-core, name, private, scripts, start, type, version (+1 more)

### Community 7 - "Orchestrator and Codegen Flow"
Cohesion: 0.40
Nodes (7): review(), plan(), extractJson(), appReadme(), generate(), GENERATED_DIR, otelBootstrap()

### Community 8 - "Swarm Doctor and Event Bus"
Cohesion: 0.43
Nodes (6): ch(), collectHealth(), diagnose(), exec, bus, emit()

### Community 9 - "Codegen Agent Internals"
Cohesion: 0.52
Nodes (5): generateBackend(), DESIGN_GUIDE, generateFrontend(), chat(), extractCode()

## Knowledge Gaps
- **29 isolated node(s):** `name`, `version`, `private`, `type`, `start` (+24 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SigNoz` connect `Product Vision and PRD` to `The Agent Swarm`, `SigNoz Deployment and Alerts`, `Model Routing and Mission Control`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `DevSwarm` connect `Product Vision and PRD` to `The Agent Swarm`, `Model Routing and Mission Control`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `Telemetry setup (telemetry.js)` connect `Product Vision and PRD` to `The Agent Swarm`, `SigNoz Deployment and Alerts`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _29 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `OTel Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._