import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chat, extractJson } from '../llm.js';
import { ROLES, promoted, promote, demote } from '../models.js';
import { emit } from '../bus.js';

const exec = promisify(execFile);
const CH_HTTP = process.env.CLICKHOUSE_HTTP_URL;
const CH = process.env.SIGNOZ_CLICKHOUSE_CONTAINER || 'signoz-telemetrystore-clickhouse-0-0';

// Prefer the ClickHouse HTTP interface when configured (works without Docker,
// with renamed containers and with remote ClickHouse); docker exec is the
// zero-config default for a local SigNoz Foundry install.
export async function ch(sql) {
  if (CH_HTTP) {
    const res = await fetch(CH_HTTP.replace(/\/$/, '') + '/', {
      method: 'POST',
      headers: {
        ...(process.env.CLICKHOUSE_USER ? { 'X-ClickHouse-User': process.env.CLICKHOUSE_USER } : {}),
        ...(process.env.CLICKHOUSE_PASSWORD ? { 'X-ClickHouse-Key': process.env.CLICKHOUSE_PASSWORD } : {})
      },
      body: `${sql} FORMAT JSON`
    });
    if (!res.ok) throw new Error(`ClickHouse HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()).data;
  }
  try {
    const { stdout } = await exec('docker', ['exec', CH, 'clickhouse-client', '-q', `${sql} FORMAT JSON`]);
    return JSON.parse(stdout).data;
  } catch (err) {
    throw new Error(
      `ClickHouse unreachable via docker exec on container "${CH}". ` +
      'Set SIGNOZ_CLICKHOUSE_CONTAINER if your container has a different name, ' +
      'or CLICKHOUSE_HTTP_URL (plus CLICKHOUSE_USER/CLICKHOUSE_PASSWORD if needed) to query over HTTP. ' +
      `Cause: ${String(err.message || err).slice(0, 200)}`
    );
  }
}

// The doctor consumes what the swarm produces: SigNoz's trace store is the
// single source of truth about swarm health, no separate bookkeeping.
export async function collectHealth(minutes = 180) {
  const since = `timestamp > now() - INTERVAL ${Number(minutes)} MINUTE`;
  const [roles, fallbacks, generations] = await Promise.all([
    ch(`SELECT attributes_string['devswarm.role'] AS role, count() AS calls,
        round(avg(durationNano)/1e9,1) AS avg_s, round(quantile(0.95)(durationNano)/1e9,1) AS p95_s,
        countIf(statusCode=2) AS errors,
        sum(attributes_number['gen_ai.usage.input_tokens'] + attributes_number['gen_ai.usage.output_tokens']) AS tokens
        FROM signoz_traces.distributed_signoz_index_v3
        WHERE serviceName='devswarm' AND name LIKE 'llm.%' AND ${since} GROUP BY role`),
    ch(`SELECT attributes_string['devswarm.role'] AS role, count() AS fallback_promotions
        FROM signoz_traces.distributed_signoz_index_v3
        WHERE serviceName='devswarm' AND arrayExists(e -> e LIKE '%fallback_promotion%', events) AND ${since} GROUP BY role`),
    ch(`SELECT count() AS generations,
        countIf(attributes_string['devswarm.generation.verdict']='pass') AS passed,
        sum(attributes_number['devswarm.generation.critic_catches']) AS critic_catches,
        sum(attributes_number['devswarm.generation.regenerations']) AS regenerations
        FROM signoz_traces.distributed_signoz_index_v3
        WHERE serviceName='devswarm' AND name='generation' AND ${since}`)
  ]);
  return { window_minutes: minutes, roles, fallbacks, generations: generations[0], promoted: { ...promoted } };
}

const SYSTEM = `You are Swarm Doctor, the SRE meta-agent of DevSwarm. You receive health statistics computed from the swarm's own SigNoz traces, plus the current fallback-promotion state (roles listed in "promoted" are pinned to their fallback model).
Model routing table: ${JSON.stringify(Object.fromEntries(Object.entries(ROLES).map(([r, c]) => [r, { primary: c.primary, fallback: c.fallback }])))}

Diagnose in plain English and decide routing actions. Respond with ONLY JSON:
{
  "summary": "2-3 sentences, plain English, specific numbers, what is healthy and what is not",
  "findings": ["short specific observations"],
  "actions": [{"role": "planner|frontend|backend|critic", "action": "promote_fallback" | "reset_to_primary", "reason": "..."}]
}
Action rules: promote_fallback when a role's primary is failing repeatedly (errors or fallback_promotions high relative to calls). reset_to_primary when a role is pinned to fallback but recent data shows no primary failures, or the fallback itself is erroring. Empty actions array when routing is already right. Never invent numbers.`;

export async function diagnose(minutes = 180) {
  const stats = await collectHealth(minutes);
  const out = await chat('doctor', [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: JSON.stringify(stats, null, 2) }
  ], { validate: extractJson });
  const verdict = extractJson(out);
  const applied = [];
  for (const a of verdict.actions || []) {
    if (!ROLES[a.role]) continue;
    if (a.action === 'promote_fallback') { promote(a.role, ROLES[a.role].fallback, 'doctor'); applied.push(a); }
    if (a.action === 'reset_to_primary') { demote(a.role); applied.push(a); }
  }
  const { slog } = await import('../telemetry.js');
  slog('info', `doctor diagnosis: ${verdict.summary}`, { applied: applied.length, findings: (verdict.findings || []).length });
  emit('doctor_diagnosis', { summary: verdict.summary, findings: verdict.findings, applied });
  return { stats, ...verdict, applied };
}
