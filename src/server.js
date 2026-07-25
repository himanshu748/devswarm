import './env.js';
import { m } from './telemetry.js';
import express from 'express';
import path from 'node:path';
import http from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import { generate, refine } from './orchestrator.js';
import { ROLES, promoted } from './models.js';
import { ensureRunning, runningApps, stopAll } from './apps.js';
import { bus, emit } from './bus.js';

const app = express();
// JSON parsing stays scoped to /api so preview requests reach the proxy as
// untouched streams (any body type, no buffering).
app.use('/api', express.json());

app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  bus.on('event', send);
  const beat = setInterval(() => res.write(': beat\n\n'), 15000);
  req.on('close', () => { bus.off('event', send); clearInterval(beat); });
});

app.post('/api/generate', async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt (string) is required' });
  const events = [];
  try {
    const result = await generate(prompt, (e) => {
      events.push(e);
      console.log('[swarm]', JSON.stringify(e).slice(0, 200));
    });
    emit('done', { id: result.id, verdict: result.verdict, regenerations: result.regenerations, catches: result.catches.length, preview: `/preview/${result.id}/`, name: result.plan.name });
    res.json({ ...result, preview: `/preview/${result.id}/`, events });
  } catch (err) {
    console.error(err);
    m.generations.add(1, { verdict: 'error' });
    emit('generation_error', { reason: String(err.message || err) });
    res.status(500).json({ error: String(err.message || err), events });
  }
});

app.post('/api/refine', async (req, res) => {
  const { id, instruction } = req.body || {};
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'id (string) is required' });
  if (!instruction || typeof instruction !== 'string') return res.status(400).json({ error: 'instruction (string) is required' });
  try {
    const result = await refine(id, instruction, (e) => console.log('[refine]', JSON.stringify(e).slice(0, 200)));
    res.json(result);
  } catch (err) {
    console.error(err);
    emit('generation_error', { reason: String(err.message || err) });
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get('/api/models', (_req, res) => res.json({ roles: ROLES, promoted }));

app.get('/api/config', (_req, res) => res.json({ signozUrl: process.env.SIGNOZ_URL || 'http://localhost:8080' }));

app.get('/api/apps', (_req, res) => res.json({ running: runningApps() }));

// Everything the swarm ever built, newest first, with its review verdict;
// Mission Control's hangar renders this so past builds stay one click away.
app.get('/api/generations', async (_req, res) => {
  try {
    const entries = await readdir(path.resolve('generated'), { withFileTypes: true });
    const apps = await Promise.all(entries.filter((d) => d.isDirectory()).map(async (d) => {
      const dir = path.resolve('generated', d.name);
      const info = await stat(dir);
      let review = null;
      try { review = JSON.parse(await readFile(path.join(dir, 'review.json'), 'utf8')); } catch { /* older scaffold */ }
      const refinements = review?.refinements ?? [];
      const last = refinements.length ? refinements[refinements.length - 1] : null;
      // Refinement needs the persisted contract; apps built before plan.json cannot.
      const refinable = await stat(path.join(dir, 'plan.json')).then(() => true).catch(() => false);
      return {
        id: d.name,
        at: Math.round(info.mtimeMs),
        verdict: last?.verdict ?? review?.verdict ?? null,
        catches: review?.catches?.length ?? null,
        regenerations: review?.regenerations ?? null,
        refinements: refinements.length,
        refinable,
        last_change: last?.change_summary ?? null
      };
    }));
    apps.sort((a, b) => b.at - a.at);
    const live = new Set(runningApps().map((a) => a.id));
    res.json({ apps: apps.map((a) => ({ ...a, running: live.has(a.id) })) });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Lifetime swarm stats, read from SigNoz's trace store. The landing page renders
// these live: the marketing numbers and the telemetry are the same numbers.
let statsCache = { at: 0, data: null };
let statsFailedAt = 0;
app.get('/api/stats', async (_req, res) => {
  if (Date.now() - statsCache.at < 30000 && statsCache.data) return res.json(statsCache.data);
  if (Date.now() - statsFailedAt < 10000) return res.status(503).json({ error: 'SigNoz unreachable (retrying shortly)' });
  try {
    const { ch } = await import('./agents/doctor.js');
    const [tok, gen, models] = await Promise.all([
      ch("SELECT sum(attributes_number['gen_ai.usage.input_tokens'] + attributes_number['gen_ai.usage.output_tokens']) AS tokens, count() AS llm_calls FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName='devswarm' AND name LIKE 'llm.%'"),
      ch("SELECT count() AS generations, sum(attributes_number['devswarm.generation.critic_catches']) AS catches, sum(attributes_number['devswarm.generation.regenerations']) AS regens FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName='devswarm' AND name='generation'"),
      ch("SELECT uniqExact(attributes_string['gen_ai.request.model']) AS models FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName='devswarm' AND name LIKE 'llm.%'")
    ]);
    statsCache = { at: Date.now(), data: {
      tokens: Number(tok[0]?.tokens ?? 0), llm_calls: Number(tok[0]?.llm_calls ?? 0),
      generations: Number(gen[0]?.generations ?? 0), catches: Number(gen[0]?.catches ?? 0),
      regens: Number(gen[0]?.regens ?? 0), models: Number(models[0]?.models ?? 0),
      signoz_url: process.env.SIGNOZ_URL || 'http://localhost:8080'
    }};
    res.json(statsCache.data);
  } catch (err) {
    statsFailedAt = Date.now();
    res.status(503).json({ error: 'SigNoz unreachable: ' + String(err.message || err).slice(0, 120) });
  }
});

app.get('/app', (_req, res) => res.sendFile(path.resolve('ui', 'app.html')));

// SigNoz alert webhook: an alert firing IS the trigger for self-healing.
let doctorBusy = false;
app.post('/api/doctor/webhook', async (req, res) => {
  res.json({ ok: true });
  if (doctorBusy) return;
  doctorBusy = true;
  try {
    console.log('[doctor] woken by SigNoz alert:', req.body?.title || req.body?.alerts?.[0]?.labels?.alertname || 'unknown');
    const { diagnose } = await import('./agents/doctor.js');
    const result = await diagnose(60);
    console.log('[doctor] diagnosis:', result.summary);
  } catch (err) {
    console.error('[doctor] webhook diagnosis failed:', err);
  } finally {
    doctorBusy = false;
  }
});

app.post('/api/doctor/run', async (_req, res) => {
  try {
    const { diagnose } = await import('./agents/doctor.js');
    res.json(await diagnose(Number(_req.body?.minutes) || 180));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Injected into previewed HTML only; the artifact on disk is never modified.
const previewShim = (id) => `<script>(function(){var P='/preview/${id}',f=window.fetch;
window.fetch=function(input,init){try{
if(typeof input==='string'&&input.charAt(0)==='/'&&input.indexOf('/api/')===0)input=P+input;
else if(input&&input.url){var u=new URL(input.url,location.origin);
if(u.pathname.indexOf('/api/')===0)input=new Request(P+u.pathname+u.search,input);}
}catch(e){}return f.call(window,input,init);};})();</script>`;

// Previews are live: the generated backend runs as a child process and every
// request is piped to it raw, so any body type and streaming responses work
// and its API (and its OTel traces) are real. If the app cannot boot, fall
// back to the static frontend's localStorage mode.
app.use('/preview/:id', async (req, res) => {
  const { id } = req.params;
  if (!/^[a-z0-9-]{1,60}$/i.test(id)) return res.status(400).json({ error: 'invalid app id' });
  if (req.url === '/' && !req.originalUrl.endsWith('/')) return res.redirect(302, `/preview/${id}/`);
  try {
    const { port } = await ensureRunning(id);
    const upstream = http.request(
      { host: '127.0.0.1', port, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${port}` } },
      (ur) => {
        const headers = { ...ur.headers };
        if (headers.location?.startsWith('/')) headers.location = `/preview/${id}${headers.location}`;
        // Generated apps call their API at an absolute /api/... path, which is
        // correct when they are deployed at a domain root but resolves to
        // DevSwarm itself under /preview/:id. Left alone the app 404s and
        // silently drops into its localStorage fallback, so the preview looks
        // fine while the real backend is never touched. Rewriting fetch here
        // keeps the shipped artifact correct and makes the preview honest.
        if ((headers['content-type'] || '').includes('text/html')) {
          delete headers['content-length'];
          const chunks = [];
          ur.on('data', (c) => chunks.push(c));
          ur.on('end', () => {
            const html = Buffer.concat(chunks).toString('utf8').replace(/<head([^>]*)>/i, `<head$1>${previewShim(id)}`);
            res.writeHead(ur.statusCode, headers);
            res.end(html);
          });
          return;
        }
        res.writeHead(ur.statusCode, headers);
        ur.pipe(res);
      }
    );
    upstream.on('error', (err) => {
      if (!res.headersSent) res.status(502).json({ error: String(err.message || err) });
      else res.end();
    });
    req.pipe(upstream);
  } catch (err) {
    console.error(`[preview:${id}] live run failed, serving static:`, String(err.message || err));
    express.static(path.resolve('generated', id, 'public'))(req, res, () => res.status(404).end());
  }
});

app.use(express.static(path.resolve('ui')));

app.use('/api', (_req, res) => res.status(404).json({ error: 'unknown API route' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

const port = process.env.PORT || 4100;
app.listen(port, () => console.log(`DevSwarm on http://localhost:${port}`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { stopAll(); process.exit(0); });
}
