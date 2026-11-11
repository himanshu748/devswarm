# Local development

## Three ways to contribute

| Mode | Setup | What works |
| --- | --- | --- |
| Checks and UI | Node 22+, `npm ci` | `npm run verify`, landing page, Mission Control, model configuration and empty generation history |
| Generation | Above plus `HF_TOKEN` | Paid model calls, critic review, refinement and local previews |
| Observability | Above plus SigNoz | Dashboards, trace-derived statistics, Doctor diagnosis and optional dashboard provisioning |

Start commands from the repository root. Paths such as `ui/`, `.env` and
`generated/` are resolved from the working directory. The server does not
hot-reload; restart it after changes.

```sh
npm ci
npm run verify
npm start
```

Open http://127.0.0.1:4100 or http://127.0.0.1:4100/app. Without a token, avoid
Dispatch, Refine and Doctor actions. Those require actual model access.
Missing SigNoz statistics are expected in this mode and do not mean the UI failed.

## Configuration

Copy `.env.example` to `.env` for local configuration. Existing process
environment values take precedence. `.env` and `.env.*` are ignored, except the
committed example. Do not change that exception to include real credentials.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HF_TOKEN` | unset | Hugging Face Inference Providers authentication for model calls |
| `HOST` | `127.0.0.1` | Server bind address; keep local |
| `PORT` | `4100` | DevSwarm HTTP port |
| `SIGNOZ_OTLP_ENDPOINT` | unset | OTLP HTTP collector base URL; console traces when absent |
| `SIGNOZ_URL` | `http://localhost:8080` | SigNoz UI/API base URL |
| `SIGNOZ_API_TOKEN` | unset | Dashboard import and automatic per-app dashboard creation |
| `CLICKHOUSE_HTTP_URL` | unset | Direct trace queries; preferred over Docker when set |
| `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD` | unset | Optional ClickHouse HTTP credentials |
| `SIGNOZ_CLICKHOUSE_CONTAINER` | `signoz-telemetrystore-clickhouse-0-0` | Doctor's Docker query target when HTTP is not configured |
| `FALLBACK_TTL_MINUTES` | `10` | Minutes a fallback remains pinned before retrying primary |
| `PREVIEW_PORT_BASE` | `4300` | Starting port for generated child servers |

`FALLBACK_TTL_MINUTES` accepts a positive finite number, including fractions.
Missing, empty, zero, negative, non-finite or overflowing values use the
10-minute default.

The checked-in model table is historical configuration, not a guarantee of
current provider availability. Confirm model access with your provider before
running a paid generation. Do not silently swap model families in unrelated PRs.

## Verification commands

| Command | Coverage |
| --- | --- |
| `npm run check` | Syntax of JS/MJS source, scripts and tests; parse repository JSON outside dependency/generated/vendor folders |
| `npm test` | Parser behavior, routing state and API smoke checks using Node's test runner |
| `npm run verify` | Both checks above, the same command used by CI |
| `git diff --check` | Whitespace errors in your patch |

The default suite does not measure generation quality, exercise real providers,
or verify dashboard SQL against a running SigNoz. Document these separately when
relevant. Use small synthetic fixtures for tests. Never commit generated private
projects or require credentials in CI.

## Common setup problems

- **`HF_TOKEN is not set`:** put your token in `.env` at the repo root or export
  it in the shell, then restart. No token is needed for `npm run verify`.
- **Provider 401/403, unavailable model or token-cap error:** check provider
  access and `src/models.js`. Share only sanitized status and model identifiers.
  Paid calls are not retried endlessly; the role tries its fallback once.
- **SigNoz unreachable / empty stats:** expected without a configured collector
  and trace store. For telemetry work, follow [the observability guide](../observability/README.md).
- **`EADDRINUSE`:** stop the other local process or set a different `PORT`.
- **Preview falls back to static HTML:** inspect the child process error in the
  server log and `generated/<id>/review.json`. Static localStorage behavior is
  not proof that the generated backend works.
- **Generated data disappears after restart/refine:** generated backends can
  use in-memory storage. Persistence depends on the generated app's contract.
- **Installation requests an SSH key:** use the current lockfile and `npm ci`;
  the `otel-swarm` dependency is pinned through HTTPS. Check your own Git URL
  rewrites if an old SSH route is still selected.

## Optional live checks

Read [the security boundary](../SECURITY.md) first. Use a disposable environment
for generated code. The following request spends model credits:

```sh
curl --max-time 1500 http://127.0.0.1:4100/api/generate \
  -H 'Content-Type: application/json' \
  --data '{"prompt":"Build a habit tracker with name, daily check-ins and streaks"}'
```

Inspect the returned verdict and catches, the generated plan and code, then
test the preview's actual API. A failed critic verdict can still produce files;
do not treat the presence of an artifact as a passing review.
