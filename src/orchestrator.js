import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SpanStatusCode } from '@opentelemetry/api';
import { tracer } from './telemetry.js';
import { plan } from './agents/planner.js';
import { generateFrontend } from './agents/frontend.js';
import { generateBackend } from './agents/backend.js';
import { review } from './agents/critic.js';

const MAX_REGEN = 2;
const GENERATED_DIR = path.resolve('generated');

export async function generate(prompt, onEvent = () => {}) {
  return tracer.startActiveSpan('generation', async (root) => {
    root.setAttribute('devswarm.prompt', prompt.slice(0, 500));
    try {
      onEvent({ stage: 'planning' });
      const buildPlan = await tracer.startActiveSpan('agent.planner', async (s) => {
        const p = await plan(prompt);
        s.setAttribute('devswarm.app_name', p.name);
        s.end();
        return p;
      });
      onEvent({ stage: 'planned', plan: buildPlan });

      const runAgent = (name, fn, feedback) =>
        tracer.startActiveSpan(`agent.${name}`, async (s) => {
          if (feedback) s.setAttribute('devswarm.regeneration', true);
          const code = await fn(buildPlan, feedback);
          s.setAttribute('devswarm.code_bytes', code.length);
          s.end();
          return code;
        });

      onEvent({ stage: 'codegen' });
      let [frontendCode, backendCode] = await Promise.all([
        runAgent('frontend', generateFrontend),
        runAgent('backend', generateBackend)
      ]);

      let verdict = null;
      let attempts = 0;
      const catches = [];
      while (attempts <= MAX_REGEN) {
        onEvent({ stage: 'review', attempt: attempts + 1 });
        verdict = await tracer.startActiveSpan('agent.critic', async (s) => {
          const v = await review(buildPlan, frontendCode, backendCode);
          s.setAttributes({
            'devswarm.review.verdict': v.verdict,
            'devswarm.review.issue_count': v.issues?.length ?? 0
          });
          for (const issue of v.issues || []) {
            s.addEvent('critic_catch', issue);
          }
          s.end();
          return v;
        });
        catches.push(...(verdict.issues || []));
        if (verdict.verdict === 'pass') break;

        attempts += 1;
        if (attempts > MAX_REGEN) break;
        onEvent({ stage: 'regenerating', attempt: attempts, issues: verdict.issues });
        const feedbackFor = (target) =>
          (verdict.issues || [])
            .filter((i) => i.target === target)
            .map((i) => `[${i.severity}] ${i.description}`)
            .join('\n') || null;
        const feFb = feedbackFor('frontend');
        const beFb = feedbackFor('backend');
        [frontendCode, backendCode] = await Promise.all([
          feFb ? runAgent('frontend', generateFrontend, feFb) : frontendCode,
          beFb ? runAgent('backend', generateBackend, beFb) : backendCode
        ]);
      }

      const id = `${buildPlan.name}-${Date.now().toString(36)}`;
      const dir = path.join(GENERATED_DIR, id);
      await mkdir(path.join(dir, 'public'), { recursive: true });
      await writeFile(path.join(dir, 'public', 'index.html'), frontendCode);
      await writeFile(path.join(dir, 'server.js'), backendCode);
      await writeFile(
        path.join(dir, 'review.json'),
        JSON.stringify({ verdict: verdict.verdict, regenerations: attempts, catches }, null, 2)
      );

      root.setAttributes({
        'devswarm.generation.id': id,
        'devswarm.generation.verdict': verdict.verdict,
        'devswarm.generation.regenerations': attempts,
        'devswarm.generation.critic_catches': catches.length
      });
      root.end();
      return { id, plan: buildPlan, verdict: verdict.verdict, regenerations: attempts, catches };
    } catch (err) {
      root.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      root.end();
      throw err;
    }
  });
}
