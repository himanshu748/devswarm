import { chat, extractJson } from '../llm.js';

const SYSTEM = `You are the planner agent of DevSwarm. Turn the user's app request into a strict build plan.
Respond with ONLY a JSON object:
{
  "name": "kebab-case-app-name",
  "summary": "one sentence",
  "entities": [{"name": "...", "fields": [{"name": "...", "type": "string|number|boolean|date"}]}],
  "api": [{"method": "GET|POST|PUT|DELETE", "path": "/api/...", "description": "..."}],
  "pages": [{"name": "...", "description": "..."}]
}
The api array is the shared contract: frontend and backend are both generated from it. Keep it minimal, CRUD-shaped and consistent with entities.`;

export async function plan(prompt) {
  const out = await chat('planner', [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: prompt }
  ]);
  return extractJson(out);
}
