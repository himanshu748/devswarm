import './telemetry.js';
import express from 'express';
import path from 'node:path';
import { generate } from './orchestrator.js';
import { ROLES, promoted } from './models.js';
import { bus, emit } from './bus.js';

const app = express();
app.use(express.json());

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
    emit('generation_error', { reason: String(err.message || err) });
    res.status(500).json({ error: String(err.message || err), events });
  }
});

app.get('/api/models', (_req, res) => res.json({ roles: ROLES, promoted }));

// Lifetime swarm stats, read from SigNoz's trace store. The landing page renders
// these live: the marketing numbers and the telemetry are the same numbers.
let statsCache = { at: 0, data: null };
app.get('/api/stats', async (_req, res) => {
  if (Date.now() - statsCache.at < 30000 && statsCache.data) return res.json(statsCache.data);
  try {
    const { ch } = await import('./agents/doctor.js');
    const [tok, gen, models] = await Promise.all([
      ch("SELECT sum(attributes_number['gen_ai.usage.input_tokens'] + attributes_number['gen_ai.usage.output_tokens']) AS tokens, count() AS llm_calls FROM signoz_traces.signoz_index_v3 WHERE serviceName='devswarm' AND name LIKE 'llm.%'"),
      ch("SELECT count() AS generations, sum(attributes_number['devswarm.generation.critic_catches']) AS catches, sum(attributes_number['devswarm.generation.regenerations']) AS regens FROM signoz_traces.signoz_index_v3 WHERE serviceName='devswarm' AND name='generation'"),
      ch("SELECT uniqExact(attributes_string['gen_ai.request.model']) AS models FROM signoz_traces.signoz_index_v3 WHERE serviceName='devswarm' AND name LIKE 'llm.%'")
    ]);
    statsCache = { at: Date.now(), data: {
      tokens: Number(tok[0]?.tokens ?? 0), llm_calls: Number(tok[0]?.llm_calls ?? 0),
      generations: Number(gen[0]?.generations ?? 0), catches: Number(gen[0]?.catches ?? 0),
      regens: Number(gen[0]?.regens ?? 0), models: Number(models[0]?.models ?? 0),
      signoz_url: process.env.SIGNOZ_URL || 'http://localhost:8080'
    }};
    res.json(statsCache.data);
  } catch (err) {
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

app.use('/preview/:id/', (req, res, next) => {
  express.static(path.resolve('generated', req.params.id, 'public'))(req, res, next);
});

app.get('/app', (_req, res) => res.sendFile(path.resolve('ui', 'app.html')));
app.use(express.static(path.resolve('ui')));

app.use('/api', (_req, res) => res.status(404).json({ error: 'unknown API route' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

const port = process.env.PORT || 4100;
app.listen(port, () => console.log(`DevSwarm on http://localhost:${port}`));
