import { chat, extractCode } from '../llm.js';

const SYSTEM = `You are the backend agent of DevSwarm. Generate a complete single-file Express server (ESM JavaScript) implementing exactly the API contract in the plan.
Rules:
- In-memory data store keyed by entity, ids as strings.
- Validate inputs on every write endpoint (types per the plan's entity fields); respond 400 with {"error": "..."} on bad input.
- PUT/PATCH are partial updates: validate only the fields present in the body, never require the full object.
- Serve ./public statically. Read PORT from process.env.PORT with a default of 3000. No other dependencies beyond express.
- No secrets, no eval, no child_process, no filesystem writes.
- Production shape: consistent JSON responses ({"error": "..."} on failure, resource or array on success), a 404 handler for unknown /api routes, a final error-handling middleware that logs and returns 500 as JSON, and express.json() with a sane limit.
- Seed 3 to 6 realistic demo records per entity at boot so GET endpoints are never empty on first load.
- For site archetypes: waitlist/contact endpoints validate email format, reject duplicates with 409 and return the created record with a timestamp.
Respond with ONLY the JavaScript in a \`\`\`js code fence.`;

export async function generateBackend(buildPlan, feedback, previousCode) {
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Build plan:\n${JSON.stringify(buildPlan, null, 2)}` }
  ];
  if (feedback && previousCode) {
    messages.push({ role: 'assistant', content: '```js\n' + previousCode + '\n```' });
    messages.push({ role: 'user', content: `The review agent flagged these issues in your code above. Fix ONLY these issues and keep everything else unchanged. Return the complete corrected file:\n${feedback}` });
  } else if (feedback) {
    messages.push({ role: 'user', content: `The review agent flagged these issues in your previous version. Fix them:\n${feedback}` });
  }
  const out = await chat('backend', messages);
  return extractCode(out, 'js');
}
