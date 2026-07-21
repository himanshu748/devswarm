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

const port = process.env.PORT || 4100;
app.listen(port, () => console.log(`DevSwarm on http://localhost:${port}`));
