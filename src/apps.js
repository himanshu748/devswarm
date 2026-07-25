import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Generated backends run as real child processes so previews exercise the
// actual Express server (and its OTel traces), not a localStorage mockup.
// ESM resolution walks up from generated/<id>/ into devswarm's node_modules,
// so no per-app npm install is needed inside the repo.
const GENERATED = path.resolve('generated');
const IDLE_MS = 30 * 60 * 1000;
const running = new Map();
let nextPort = Number(process.env.PREVIEW_PORT_BASE) || 4300;

// LLM-written code never sees the parent's secrets (HF_TOKEN, API keys);
// children get exactly what a generated app needs and nothing else.
const childEnv = (port) => ({
  PATH: process.env.PATH,
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: String(port),
  ...(process.env.SIGNOZ_OTLP_ENDPOINT ? { SIGNOZ_OTLP_ENDPOINT: process.env.SIGNOZ_OTLP_ENDPOINT } : {})
});

// A crashed parent can orphan children on these ports; probe before assigning
// so a new child never fights an orphan and the proxy never hits the wrong app.
async function claimPort() {
  for (;;) {
    const port = nextPort++;
    try {
      await fetch(`http://127.0.0.1:${port}/`, { method: 'HEAD', signal: AbortSignal.timeout(300) });
    } catch {
      return port;
    }
  }
}

async function waitReady(port, proc, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (proc.exitCode !== null) throw new Error(`app exited with code ${proc.exitCode}`);
    try {
      await fetch(`http://127.0.0.1:${port}/`, { method: 'HEAD' });
      return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`app did not listen on ${port} within ${timeoutMs / 1000}s`);
}

export async function ensureRunning(id) {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('invalid app id');
  const dir = path.join(GENERATED, id);
  if (!existsSync(path.join(dir, 'server.js'))) throw new Error(`no server.js in generated/${id}`);

  const existing = running.get(id);
  if (existing) {
    existing.lastHit = Date.now();
    await existing.ready;
    return existing;
  }

  // Register before any await so concurrent requests for one id share a spawn.
  const entry = { id, port: null, proc: null, lastHit: Date.now() };
  entry.ready = (async () => {
    entry.port = await claimPort();
    const args = existsSync(path.join(dir, 'otel.mjs')) ? ['--import', './otel.mjs', 'server.js'] : ['server.js'];
    entry.proc = spawn(process.execPath, args, {
      cwd: dir,
      env: childEnv(entry.port),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    entry.proc.stdout.on('data', (d) => console.log(`[app:${id}]`, String(d).trim()));
    entry.proc.stderr.on('data', (d) => console.error(`[app:${id}]`, String(d).trim()));
    entry.proc.on('exit', () => {
      if (running.get(id) === entry) running.delete(id);
    });
    await waitReady(entry.port, entry.proc);
  })().catch((err) => {
    running.delete(id);
    entry.proc?.kill();
    throw err;
  });
  running.set(id, entry);
  await entry.ready;
  return entry;
}

process.on('exit', () => {
  for (const [, e] of running) e.proc?.kill();
});

// After a refinement the child holds stale code and stale in-memory data, so
// the preview must be restarted rather than reused.
export function stopApp(id) {
  const e = running.get(id);
  if (!e) return false;
  e.proc?.kill();
  running.delete(id);
  return true;
}

export function runningApps() {
  return [...running.values()].map((e) => ({ id: e.id, port: e.port, idle_s: Math.round((Date.now() - e.lastHit) / 1000) }));
}

setInterval(() => {
  for (const [id, e] of running) {
    if (Date.now() - e.lastHit > IDLE_MS) {
      console.log(`[app:${id}] idle, stopping`);
      e.proc.kill();
      running.delete(id);
    }
  }
}, 60000).unref();

export function stopAll() {
  for (const [, e] of running) e.proc?.kill();
  running.clear();
}
