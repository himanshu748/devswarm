# DevSwarm observability pack

Self-host SigNoz with Foundry (casting.yaml in this folder), then import:

- dashboards/: three dashboards (Generation Overview, LLM Economics, Review-Gate Funnel). POST each to /api/v1/dashboards, or paste into the SigNoz dashboard import UI.
- alerts/: two alert rules in v2alpha1 schema. POST to /api/v2/rules. Both notify the `swarm-doctor` webhook channel; create it first pointing at http://host.docker.internal:4100/api/doctor/webhook so alerts wake Swarm Doctor automatically.

All widget queries are ClickHouse SQL over signoz_traces.distributed_signoz_index_v3 and were validated against live swarm data on 2026-07-21.

Ops note: after a cold Docker restart, ClickHouse replicas can sit readonly for a few minutes until ClickHouse Keeper reconnects; ingestion returns on its own. If it persists, run SYSTEM RESTORE REPLICA per table.
