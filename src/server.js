import './telemetry.js';
import express from 'express';
import path from 'node:path';
import { generate } from './orchestrator.js';
import { ROLES, promoted } from './models.js';

const app = express();
app.use(express.json());

app.post('/api/generate', async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'prompt (string) is required' });
  const events = [];
  try {
    const result = await generate(prompt, (e) => {
      events.push(e);
      console.log('[swarm]', JSON.stringify(e).slice(0, 200));
    });
    res.json({ ...result, preview: `/preview/${result.id}/`, events });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err), events });
  }
});

app.get('/api/models', (_req, res) => res.json({ roles: ROLES, promoted }));

app.use('/preview/:id/', (req, res, next) => {
  express.static(path.resolve('generated', req.params.id, 'public'))(req, res, next);
});

app.use(express.static(path.resolve('ui')));

const port = process.env.PORT || 4100;
app.listen(port, () => console.log(`DevSwarm on http://localhost:${port}`));
