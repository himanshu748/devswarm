import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chat, extractJson } from '../llm.js';
import { ROLES, promoted } from '../models.js';
import { emit } from '../bus.js';

const exec = promisify(execFile);
const CH = process.env.SIGNOZ_CLICKHOUSE_CONTAINER || 'signoz-telemetrystore-clickhouse-0-0';

async function ch(sql) {
  const { stdout } = await exec('docker', ['exec', CH, 'clickhouse-client', '-q', `${sql} FORMAT JSON`]);
  return JSON.parse(stdout).data;
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
        FROM signoz_traces.signoz_index_v3
        WHERE serviceName='devswarm' AND name LIKE 'llm.%' AND ${since} GROUP BY role`),
    ch(`SELECT attributes_string['devswarm.role'] AS role, count() AS fallback_promotions
        FROM signoz_traces.signoz_index_v3
        WHERE serviceName='devswarm' AND arrayExists(e -> e LIKE '%fallback_promotion%', events) AND ${since} GROUP BY role`),
    ch(`SELECT count() AS generations,
        countIf(attributes_string['devswarm.generation.verdict']='pass') AS passed,
        sum(attributes_number['devswarm.generation.critic_catches']) AS critic_catches,
        sum(attributes_number['devswarm.generation.regenerations']) AS regenerations
        FROM signoz_traces.signoz_index_v3
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
  ]);
  const verdict = extractJson(out);
  const applied = [];
  for (const a of verdict.actions || []) {
    if (!ROLES[a.role]) continue;
    if (a.action === 'promote_fallback') { promoted[a.role] = ROLES[a.role].fallback; applied.push(a); }
    if (a.action === 'reset_to_primary') { delete promoted[a.role]; applied.push(a); }
  }
  emit('doctor_diagnosis', { summary: verdict.summary, findings: verdict.findings, applied });
  return { stats, ...verdict, applied };
}
