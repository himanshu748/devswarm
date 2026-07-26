// Imports the dashboard pack and alert rules into a running SigNoz.
// Dashboards are matched by title: an existing one is updated in place, so
// re-running this after editing a dashboard JSON does not create duplicates.
//
//   SIGNOZ_API_TOKEN=... node scripts/signoz-import.mjs            # dashboards
//   SIGNOZ_API_TOKEN=... node scripts/signoz-import.mjs --alerts   # + alert rules
//
// Mint the token in SigNoz: Settings, then Account Settings, then API keys.
import '../src/env.js';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const base = (process.env.SIGNOZ_URL || 'http://localhost:8080').replace(/\/$/, '');
const token = process.env.SIGNOZ_API_TOKEN;
if (!token) {
  console.error('SIGNOZ_API_TOKEN is not set. Mint one in SigNoz under Settings > Account Settings > API keys, then put it in .env as SIGNOZ_API_TOKEN.');
  process.exit(1);
}

const api = async (method, route, body) => {
  const res = await fetch(base + route, {
    method,
    headers: { 'Content-Type': 'application/json', 'SIGNOZ-API-KEY': token },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
};

const dir = path.resolve('observability/dashboards');
const existing = await api('GET', '/api/v1/dashboards');
const byTitle = new Map((existing.data || existing || []).map((d) => [d.data?.title, d.uuid || d.id]));

for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()) {
  const dash = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
  const uuid = byTitle.get(dash.title);
  if (uuid) {
    await api('PUT', `/api/v1/dashboards/${uuid}`, dash);
    console.log(`updated  ${dash.title}`);
  } else {
    await api('POST', '/api/v1/dashboards', dash);
    console.log(`created  ${dash.title}`);
  }
}

if (process.argv.includes('--alerts')) {
  const adir = path.resolve('observability/alerts');
  for (const file of (await readdir(adir)).filter((f) => f.endsWith('.json')).sort()) {
    const rule = JSON.parse(await readFile(path.join(adir, file), 'utf8'));
    await api('POST', '/api/v2/rules', rule);
    console.log(`created  alert: ${rule.alert}`);
  }
  console.log('\nAlerts notify the `swarm-doctor` webhook channel. Create it in SigNoz first (Settings > Alert Channels, webhook to http://host.docker.internal:4100/api/doctor/webhook) or the rules fire with nowhere to go.');
}
