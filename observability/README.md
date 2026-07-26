# DevSwarm observability pack

Self-host SigNoz with Foundry (casting.yaml in this folder), then import:

- dashboards/: five dashboards (Command Center, Generation Overview, LLM Economics, Review-Gate Funnel, Born Observable). Start with Command Center.
- alerts/: two alert rules in v2alpha1 schema. Both notify the `swarm-doctor` webhook channel; create it first pointing at http://host.docker.internal:4100/api/doctor/webhook so alerts wake Swarm Doctor automatically.

Import everything with one command, using an API key from SigNoz Settings, Account Settings, API keys:

```sh
SIGNOZ_API_TOKEN=... node scripts/signoz-import.mjs --alerts
```

Dashboards are matched by title, so re-running after an edit updates in place instead of creating duplicates. Drop `--alerts` to import dashboards only. Without the script: POST each dashboard to `/api/v1/dashboards` and each rule to `/api/v2/rules`, or paste the dashboard JSON into SigNoz's import UI.

That same `SIGNOZ_API_TOKEN` is what lets DevSwarm auto-create a per-app dashboard for every app it generates. Without it, generation still writes `signoz-dashboard.json` next to the app for you to import by hand.

All widget queries are ClickHouse SQL over signoz_traces.distributed_signoz_index_v3. Every one of them was run against live swarm data on 2026-07-26: 29 widgets, 29 returning rows.

Ops note: after a cold Docker restart, ClickHouse replicas can sit readonly for a few minutes until ClickHouse Keeper reconnects; ingestion returns on its own. If it persists, run SYSTEM RESTORE REPLICA per table.
