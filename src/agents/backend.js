import { chat, extractCode } from '../llm.js';

const SYSTEM = `You are the backend agent of DevSwarm. Generate a complete single-file Express server (ESM JavaScript) implementing exactly the API contract in the plan.
Rules:
- In-memory data store keyed by entity, ids as strings.
- Validate inputs on every write endpoint (types per the plan's entity fields); respond 400 with {"error": "..."} on bad input.
- Serve ./public statically. Read PORT from process.env.PORT with a default of 3000. No other dependencies beyond express.
- No secrets, no eval, no child_process, no filesystem writes.
Respond with ONLY the JavaScript in a \`\`\`js code fence.`;

export async function generateBackend(buildPlan, feedback) {
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Build plan:\n${JSON.stringify(buildPlan, null, 2)}` }
  ];
  if (feedback) messages.push({ role: 'user', content: `The review agent flagged these issues in your previous version. Fix them:\n${feedback}` });
  const out = await chat('backend', messages);
  return extractCode(out, 'js');
}
