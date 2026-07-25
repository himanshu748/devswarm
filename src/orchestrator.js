import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { swarm, m, slog } from './telemetry.js';
import { emit } from './bus.js';
import { stopApp } from './apps.js';
import { plan, planRefinement } from './agents/planner.js';
import { generateFrontend, refineFrontend } from './agents/frontend.js';
import { generateBackend, refineBackend } from './agents/backend.js';
import { review } from './agents/critic.js';

const MAX_REGEN = 2;
const GENERATED_DIR = path.resolve('generated');

// A ready-to-import SigNoz dashboard scoped to one generated app's service name.
const appDashboard = (id, plan) => ({
  title: `App / ${plan.name}`,
  description: `Auto-provisioned by DevSwarm at generation time for ${id}. RED metrics from the app's own HTTP spans.`,
  tags: ['devswarm-generated'],
  layout: [
    { i: 'rate', x: 0, y: 0, w: 4, h: 3 }, { i: 'errors', x: 4, y: 0, w: 4, h: 3 }, { i: 'duration', x: 8, y: 0, w: 4, h: 3 },
    { i: 'routes', x: 0, y: 3, w: 12, h: 4 }
  ],
  widgets: [
    { id: 'rate', title: 'Requests', panelTypes: 'graph', query: { queryType: 'clickhouse_sql', clickhouse_sql: [{ name: 'A', legend: 'req', disabled: false, query: `SELECT toStartOfInterval(timestamp, INTERVAL 1 MINUTE) AS ts, count() AS value FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName='${id}' AND timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}} GROUP BY ts ORDER BY ts` }], builder: { queryData: [], queryFormulas: [] }, promql: [] } },
    { id: 'errors', title: 'Errors (4xx/5xx)', panelTypes: 'graph', query: { queryType: 'clickhouse_sql', clickhouse_sql: [{ name: 'A', legend: 'errors', disabled: false, query: `SELECT toStartOfInterval(timestamp, INTERVAL 1 MINUTE) AS ts, countIf(responseStatusCode >= '400') AS value FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName='${id}' AND timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}} GROUP BY ts ORDER BY ts` }], builder: { queryData: [], queryFormulas: [] }, promql: [] } },
    { id: 'duration', title: 'p95 latency (ms)', panelTypes: 'graph', query: { queryType: 'clickhouse_sql', clickhouse_sql: [{ name: 'A', legend: 'p95', disabled: false, query: `SELECT toStartOfInterval(timestamp, INTERVAL 1 MINUTE) AS ts, round(quantile(0.95)(durationNano)/1e6, 1) AS value FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName='${id}' AND timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}} GROUP BY ts ORDER BY ts` }], builder: { queryData: [], queryFormulas: [] }, promql: [] } },
    { id: 'routes', title: 'Routes', panelTypes: 'table', query: { queryType: 'clickhouse_sql', clickhouse_sql: [{ name: 'A', legend: '', disabled: false, query: `SELECT httpMethod AS method, name AS route, count() AS requests, round(avg(durationNano)/1e6,1) AS avg_ms FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName='${id}' AND timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}} GROUP BY method, route ORDER BY requests DESC LIMIT 20` }], builder: { queryData: [], queryFormulas: [] }, promql: [] } }
  ]
});

// Best effort: if a SigNoz API token is configured, the app's dashboard exists
// in SigNoz before the user has even opened the preview.
async function provisionDashboard(id, plan) {
  const token = process.env.SIGNOZ_API_TOKEN;
  const base = (process.env.SIGNOZ_URL || 'http://localhost:8080').replace(/\/$/, '');
  if (!token) return { provisioned: false, reason: 'SIGNOZ_API_TOKEN not set' };
  try {
    const res = await fetch(`${base}/api/v1/dashboards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'SIGNOZ-API-KEY': token },
      body: JSON.stringify(appDashboard(id, plan))
    });
    return { provisioned: res.ok, status: res.status };
  } catch (err) {
    return { provisioned: false, reason: String(err.message || err).slice(0, 120) };
  }
}

const otelBootstrap = (id) => `import { NodeTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

const endpoint = (process.env.SIGNOZ_OTLP_ENDPOINT || 'http://localhost:4318').replace(/\\/$/, '');
const provider = new NodeTracerProvider({
  resource: new Resource({ 'service.name': '${id}', 'devswarm.generated': true }),
  spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: endpoint + '/v1/traces' }))]
});
provider.register();
registerInstrumentations({ instrumentations: [new HttpInstrumentation()] });
console.log('[otel] ${id} tracing to ' + endpoint);
`;

const appPackageJson = (id, plan) => JSON.stringify({
  name: id,
  version: '1.0.0',
  private: true,
  type: 'module',
  description: plan.summary,
  scripts: { start: 'node --import ./otel.mjs server.js' },
  dependencies: {
    express: '^4.21.0',
    '@opentelemetry/sdk-trace-node': '^1.30.0',
    '@opentelemetry/exporter-trace-otlp-http': '^0.57.0',
    '@opentelemetry/resources': '^1.30.0',
    '@opentelemetry/instrumentation': '^0.220.0',
    '@opentelemetry/instrumentation-http': '^0.220.0'
  }
}, null, 2) + '\n';

const appReadme = (id, plan) => `# ${plan.name}

${plan.summary}

Generated by DevSwarm; born observable. Every HTTP request this app serves is traced into SigNoz under the service name \`${id}\`.

## Run it

\`\`\`sh
npm install
SIGNOZ_OTLP_ENDPOINT=http://localhost:4318 npm start
\`\`\`

Inside the DevSwarm repo you can skip \`npm install\`; the parent node_modules already has every dependency.

Open http://localhost:3000 and watch your traffic appear in SigNoz.

## API

${plan.api.map((a) => `- ${a.method} ${a.path}: ${a.description}`).join('\n')}
`;

export async function generate(prompt, onEvent = () => {}) {
  const notify = (e) => { onEvent(e); emit('stage', e); };
  return swarm.task('generation', { 'devswarm.prompt': prompt.slice(0, 500) }, async (root) => {
      notify({ stage: 'planning' });
      const buildPlan = await swarm.agent('planner', async (s) => {
        const p = await plan(prompt);
        s.setAttribute('devswarm.app_name', p.name);
        return p;
      });
      notify({ stage: 'planned', plan: buildPlan });

      const runAgent = (name, fn, feedback, previousCode) =>
        swarm.agent(name, async (s) => {
          if (feedback) s.setAttribute('devswarm.regeneration', true);
          const code = await fn(buildPlan, feedback, previousCode);
          s.setAttribute('devswarm.code_bytes', code.length);
          return code;
        });

      notify({ stage: 'codegen' });
      let [frontendCode, backendCode] = await Promise.all([
        runAgent('frontend', generateFrontend),
        runAgent('backend', generateBackend)
      ]);

      let verdict = null;
      let attempts = 0;
      const catches = [];
      while (attempts <= MAX_REGEN) {
        notify({ stage: 'review', attempt: attempts + 1 });
        verdict = await swarm.agent('critic', async (s) => {
          const v = await review(buildPlan, frontendCode, backendCode, verdict?.issues);
          s.setAttributes({
            'devswarm.review.verdict': v.verdict,
            'devswarm.review.issue_count': v.issues?.length ?? 0
          });
          swarm.reviewEvents(s, v.issues);
          return v;
        });
        catches.push(...(verdict.issues || []));
        if (verdict.verdict === 'pass') break;

        attempts += 1;
        if (attempts > MAX_REGEN) break;
        notify({ stage: 'regenerating', attempt: attempts, issues: verdict.issues });
        const feedbackFor = (target) =>
          (verdict.issues || [])
            .filter((i) => i.target === target)
            .map((i) => `[${i.severity}] ${i.description}`)
            .join('\n') || null;
        const feFb = feedbackFor('frontend');
        const beFb = feedbackFor('backend');
        [frontendCode, backendCode] = await Promise.all([
          feFb ? runAgent('frontend', generateFrontend, feFb, frontendCode) : frontendCode,
          beFb ? runAgent('backend', generateBackend, beFb, backendCode) : backendCode
        ]);
      }

      // Models occasionally mangle the viewport meta; a broken one silently
      // kills mobile rendering, so normalize it deterministically.
      const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1">';
      frontendCode = frontendCode.replace(/<meta[^>]*viewport[^>]*>/i, VIEWPORT);
      if (!frontendCode.includes(VIEWPORT)) frontendCode = frontendCode.replace(/<head>/i, `<head>\n${VIEWPORT}`);

      // The name is model-authored; slugify before it touches paths or SQL.
      buildPlan.name = String(buildPlan.name || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'app';
      const id = `${buildPlan.name}-${Date.now().toString(36)}`;
      const dir = path.join(GENERATED_DIR, id);
      await mkdir(path.join(dir, 'public'), { recursive: true });
      await writeFile(path.join(dir, 'public', 'index.html'), frontendCode);
      await writeFile(path.join(dir, 'server.js'), backendCode);
      // Born observable: every generated app ships with its own OTel bootstrap
      // so its traffic appears in SigNoz under its own service name.
      await writeFile(path.join(dir, 'otel.mjs'), otelBootstrap(id));
      await writeFile(path.join(dir, 'package.json'), appPackageJson(id, buildPlan));
      await writeFile(path.join(dir, 'README.md'), appReadme(id, buildPlan));
      await writeFile(path.join(dir, 'signoz-dashboard.json'), JSON.stringify(appDashboard(id, buildPlan), null, 2));
      // The plan is the shared contract; persisting it is what makes a later
      // refinement a scoped edit instead of a guess at the original intent.
      await writeFile(path.join(dir, 'plan.json'), JSON.stringify(buildPlan, null, 2));
      const dash = await provisionDashboard(id, buildPlan);
      if (dash.provisioned) {
        slog('info', `provisioned SigNoz dashboard for generated app ${id}`, { 'devswarm.generation.id': id });
        notify({ stage: 'dashboard_provisioned', id });
      }
      await writeFile(
        path.join(dir, 'review.json'),
        JSON.stringify({ verdict: verdict.verdict, regenerations: attempts, catches, refinements: [] }, null, 2)
      );

      root.setAttributes({
        'devswarm.generation.id': id,
        'devswarm.generation.verdict': verdict.verdict,
        'devswarm.generation.regenerations': attempts,
        'devswarm.generation.critic_catches': catches.length
      });
      m.generations.add(1, { verdict: verdict.verdict });
      slog('info', `generation ${id} complete: ${verdict.verdict}, ${catches.length} catches, ${attempts} regenerations`, {
        'devswarm.generation.id': id, verdict: verdict.verdict, catches: catches.length, regenerations: attempts
      });
      return { id, plan: buildPlan, verdict: verdict.verdict, regenerations: attempts, catches };
  });
}

// Refinement: an existing app plus one instruction. The planner scopes which
// agents re-run, only those run, and the critic still gates the result. Traced
// as its own root span so a refinement is as answerable as a build.
export async function refine(id, instruction, onEvent = () => {}) {
  const notify = (e) => { onEvent(e); emit('stage', { ...e, id }); };
  if (!/^[a-z0-9-]{1,60}$/i.test(id)) throw new Error('invalid app id');
  const dir = path.join(GENERATED_DIR, id);
  const [buildPlan, frontendBefore, backendBefore, reviewBefore] = await Promise.all([
    readFile(path.join(dir, 'plan.json'), 'utf8').then(JSON.parse).catch(() => {
      throw new Error(`generated/${id} has no plan.json, so it predates refinement support. Generate a fresh app to refine it.`);
    }),
    readFile(path.join(dir, 'public', 'index.html'), 'utf8'),
    readFile(path.join(dir, 'server.js'), 'utf8'),
    readFile(path.join(dir, 'review.json'), 'utf8').then(JSON.parse).catch(() => ({}))
  ]);

  return swarm.task('refinement', {
    'devswarm.generation.id': id,
    'devswarm.refinement.instruction': instruction.slice(0, 500)
  }, async (root) => {
    notify({ stage: 'scoping' });
    const scope = await swarm.agent('planner', async (s) => {
      const r = await planRefinement(buildPlan, instruction);
      s.setAttributes({
        'devswarm.refinement.targets': r.targets.join(','),
        'devswarm.refinement.contract_changed': r.contract_changed
      });
      return r;
    });
    notify({ stage: 'scoped', targets: scope.targets, change: scope.change_summary, contract_changed: scope.contract_changed });

    const runAgent = (name, fn, code) =>
      swarm.agent(name, async (s) => {
        s.setAttribute('devswarm.refinement', true);
        const out = await fn(scope.plan, instruction, code);
        s.setAttribute('devswarm.code_bytes', out.length);
        return out;
      });

    notify({ stage: 'refining', targets: scope.targets });
    let [frontendCode, backendCode] = await Promise.all([
      scope.targets.includes('frontend') ? runAgent('frontend', refineFrontend, frontendBefore) : frontendBefore,
      scope.targets.includes('backend') ? runAgent('backend', refineBackend, backendBefore) : backendBefore
    ]);

    notify({ stage: 'review', attempt: 1 });
    const verdict = await swarm.agent('critic', async (s) => {
      const v = await review(scope.plan, frontendCode, backendCode);
      s.setAttributes({
        'devswarm.review.verdict': v.verdict,
        'devswarm.review.issue_count': v.issues?.length ?? 0
      });
      swarm.reviewEvents(s, v.issues);
      return v;
    });

    const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1">';
    frontendCode = frontendCode.replace(/<meta[^>]*viewport[^>]*>/i, VIEWPORT);
    if (!frontendCode.includes(VIEWPORT)) frontendCode = frontendCode.replace(/<head>/i, `<head>\n${VIEWPORT}`);

    await Promise.all([
      writeFile(path.join(dir, 'public', 'index.html'), frontendCode),
      writeFile(path.join(dir, 'server.js'), backendCode),
      writeFile(path.join(dir, 'plan.json'), JSON.stringify(scope.plan, null, 2)),
      writeFile(path.join(dir, 'README.md'), appReadme(id, scope.plan))
    ]);
    const history = [...(reviewBefore.refinements || []), {
      instruction,
      change_summary: scope.change_summary,
      targets: scope.targets,
      contract_changed: scope.contract_changed,
      verdict: verdict.verdict,
      catches: verdict.issues || []
    }];
    await writeFile(path.join(dir, 'review.json'), JSON.stringify({ ...reviewBefore, refinements: history }, null, 2));

    // The running preview holds the old code and old in-memory data.
    stopApp(id);

    root.setAttributes({
      'devswarm.refinement.verdict': verdict.verdict,
      'devswarm.refinement.critic_catches': verdict.issues?.length ?? 0,
      'devswarm.refinement.count': history.length
    });
    m.refinements.add(1, { verdict: verdict.verdict, targets: scope.targets.join(',') });
    slog('info', `refinement ${history.length} on ${id}: ${scope.change_summary} (${scope.targets.join(', ')}), ${verdict.verdict}`, {
      'devswarm.generation.id': id, verdict: verdict.verdict, targets: scope.targets.join(',')
    });
    const result = {
      id, targets: scope.targets, change: scope.change_summary, contract_changed: scope.contract_changed,
      verdict: verdict.verdict, catches: verdict.issues || [], refinement: history.length,
      preview: `/preview/${id}/`, name: scope.plan.name
    };
    emit('refined', result);
    return result;
  });
}
