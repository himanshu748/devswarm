import { chat, extractCode } from '../llm.js';

const SYSTEM = `You are the backend agent of DevSwarm. Generate a complete single-file Express server (ESM JavaScript) implementing exactly the API contract in the plan.
Rules:
- In-memory data store keyed by entity, ids as strings.
- Validate inputs on every write endpoint, exactly as each field's "rules" string in the plan states and never one degree stricter: if rules say a value is optional, accept its absence; if rules say null is allowed, accept null and not just undefined; if rules give a numeric range, accept the whole range including its endpoints; if rules name a date format, accept that format. Respond 400 with {"error": "..."} only for input the rules actually forbid.
- PUT/PATCH are partial updates: validate only the fields present in the body, never require the full object.
- Serve ./public statically. Read PORT from process.env.PORT with a default of 3000. No other dependencies beyond express.
- No secrets, no eval, no child_process, no filesystem writes.
- Production shape: consistent JSON responses ({"error": "..."} on failure, resource or array on success), a 404 handler for unknown /api routes, a final error-handling middleware that logs and returns 500 as JSON, and express.json() with a sane limit.
- Seed 10 to 14 demo records per browsable entity at boot (3 to 6 is enough only for a singleton or settings-style entity). A collection rendered from 5 records looks like a broken app, and this seed data IS the first impression.
- Any colour value in seed data must be drawn from the palette the plan's design_direction names, as a small set of muted variations on it. Never seed arbitrary bright hues; a rainbow of mint, teal, magenta and violet will fight the app's own palette and is treated as a design failure.
- Never name a seeded record by its position. "Commission 1", "Paper 2", "Press 3", "Item 4", "Client A" and every variant of a label plus an index are placeholders wearing a costume, and they are the single most obvious tell of unfinished work. Every record gets a name a real person or shop would use (a Vandercook 219, Crane Lettra 300gsm, "Bitter Almond broadside for Tandem Coffee"), and every description is written fresh for that record. Two records sharing a sentence template is a failure.
- This applies to every entity in the plan, not only the largest one. A secondary list of three records still gets three real names and three distinct descriptions.
- Seed data must be specific and real, never placeholder. Use recognisable names and facts a person would actually have, fill every descriptive field with a genuine sentence rather than lorem or "Description here", and vary the numbers, dates and statuses across records so filters and sorts have something to do.
- Implement ONLY the endpoints listed in the plan's api array. Never add an endpoint the contract does not list, however useful it seems; an extra route is a contract violation the review agent will reject.
- When the contract itself includes a waitlist or contact endpoint, validate email format, reject duplicates with 409 and return the created record with a timestamp.
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

// Refinement is a targeted edit, not a rebuild: the agent sees its own shipped
// server and changes only what the user asked for.
export async function refineBackend(buildPlan, instruction, previousCode) {
  const out = await chat('backend', [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Build plan:\n${JSON.stringify(buildPlan, null, 2)}` },
    { role: 'assistant', content: '```js\n' + previousCode + '\n```' },
    { role: 'user', content: `The user is refining the app above. Make exactly this change and keep every other endpoint, validation rule and seeded record identical:\n\n${instruction}\n\nReturn the complete updated file.` }
  ]);
  return extractCode(out, 'js');
}
