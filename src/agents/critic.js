import { chat, extractJson } from '../llm.js';

const SYSTEM = `You are the review/critic agent of DevSwarm. You review other agents' output; you never write first drafts.
Check, in scope and nothing broader:
1. Contract conformance: every endpoint in the plan's api array exists in the backend with the EXACT method and path from the plan (renamed paths like /logs instead of /checkins are a high-severity failure even if frontend and backend agree with each other), and the frontend calls only contract endpoints with matching methods.
2. Security: hardcoded secrets, eval/Function, child_process, missing input validation on writes, XSS via unescaped user content in the frontend.
3. Obvious runtime bugs: undefined references, mismatched JSON field names between frontend and backend, unhandled promise rejections on the request path, write payloads the other side's validation would reject (partial PUT vs full-object validation is a classic high).
4. Design non-negotiables in the frontend: broken responsiveness (fixed widths causing horizontal scroll on small screens), dead controls, missing empty or error states. These are high severity only when clearly broken, not stylistic taste.
Respond with ONLY JSON:
{
  "verdict": "pass" | "fail",
  "issues": [{"target": "frontend" | "backend", "severity": "high" | "medium" | "low", "description": "specific, actionable"}]
}
Verdict is fail only if there is at least one high-severity issue. Be concrete; vague style opinions are out of scope.`;

export async function review(buildPlan, frontendCode, backendCode, previousIssues) {
  const messages = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Plan (contract):\n${JSON.stringify(buildPlan.api, null, 2)}\n\nEntities:\n${JSON.stringify(buildPlan.entities, null, 2)}\n\n--- FRONTEND (index.html) ---\n${frontendCode}\n\n--- BACKEND (server.js) ---\n${backendCode}`
    }
  ];
  if (previousIssues?.length) {
    // Re-reviews are delta reviews. A critic that re-audits everything with
    // fresh eyes finds different highs every round and never converges.
    messages.push({
      role: 'user',
      content: `This is a re-review after a regeneration. You previously flagged these issues:\n${JSON.stringify(previousIssues, null, 2)}\n\nYour job now: (1) verify each previously flagged issue is fixed, and flag it again only if it is not; (2) flag NEW issues only if they were introduced by the fix or are high-severity problems you clearly should have caught before. Do not raise fresh medium or low findings on code that was already reviewed. If all previous issues are fixed and no new highs exist, the verdict is pass.`
    });
  }
  const out = await chat('critic', messages);
  return extractJson(out);
}
