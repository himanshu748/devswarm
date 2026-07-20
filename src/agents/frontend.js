import { readFileSync } from 'node:fs';
import { chat, extractCode } from '../llm.js';

const DESIGN_GUIDE = readFileSync(new URL('../../swarm/design.md', import.meta.url), 'utf8');

const SYSTEM = `You are the frontend agent of DevSwarm. Generate a complete single-file web app: one index.html with inline CSS and vanilla JS. No frameworks, no CDNs, no external requests except the app's own /api/* endpoints from the contract.
Rules:
- Call the API endpoints exactly as given in the contract (method + path).
- If a fetch fails (backend not running in preview), catch it and fall back to localStorage so the preview still works standalone.
- Follow this design system exactly; its non-negotiables are review-gated:

${DESIGN_GUIDE}

Respond with ONLY the HTML in a \`\`\`html code fence.`;

export async function generateFrontend(buildPlan, feedback) {
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Build plan:\n${JSON.stringify(buildPlan, null, 2)}` }
  ];
  if (feedback) messages.push({ role: 'user', content: `The review agent flagged these issues in your previous version. Fix them:\n${feedback}` });
  const out = await chat('frontend', messages);
  return extractCode(out, 'html');
}
