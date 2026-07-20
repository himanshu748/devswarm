import { chat, extractJson } from '../llm.js';

const SYSTEM = `You are the review/critic agent of DevSwarm. You review other agents' output; you never write first drafts.
Check, in scope and nothing broader:
1. Contract conformance: every endpoint in the plan's api array exists in the backend with the EXACT method and path from the plan (renamed paths like /logs instead of /checkins are a high-severity failure even if frontend and backend agree with each other), and the frontend calls only contract endpoints with matching methods.
2. Security: hardcoded secrets, eval/Function, child_process, missing input validation on writes, XSS via unescaped user content in the frontend.
3. Obvious runtime bugs: undefined references, mismatched JSON field names between frontend and backend, unhandled promise rejections on the request path.
Respond with ONLY JSON:
{
  "verdict": "pass" | "fail",
  "issues": [{"target": "frontend" | "backend", "severity": "high" | "medium" | "low", "description": "specific, actionable"}]
}
Verdict is fail only if there is at least one high-severity issue. Be concrete; vague style opinions are out of scope.`;

export async function review(buildPlan, frontendCode, backendCode) {
  const out = await chat('critic', [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Plan (contract):\n${JSON.stringify(buildPlan.api, null, 2)}\n\nEntities:\n${JSON.stringify(buildPlan.entities, null, 2)}\n\n--- FRONTEND (index.html) ---\n${frontendCode}\n\n--- BACKEND (server.js) ---\n${backendCode}`
    }
  ]);
  return extractJson(out);
}
