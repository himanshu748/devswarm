import { chat, extractJson } from '../llm.js';

const SYSTEM = `You are the planner agent of DevSwarm. Turn the user's app request into a strict build plan.
Respond with ONLY a JSON object:
{
  "name": "kebab-case-app-name",
  "summary": "one sentence",
  "archetype": "app" | "site",
  "design_direction": "one sentence: mood, a SPECIFIC palette derived from the subject's world (name real hues, e.g. 'ripe tomato red on cream paper'; never default to teal/emerald/violet-on-dark, and choose light themes when the subject suits daytime or domestic use) and the single signature visual",
  "entities": [{"name": "...", "fields": [{"name": "...", "type": "string|number|boolean|date", "rules": "the exact wire contract for this field"}]}],
  "api": [{"method": "GET|POST|PUT|DELETE", "path": "/api/...", "description": "..."}],
  "pages": [{"name": "...", "description": "..."}],
  "sections": [{"name": "...", "purpose": "..."}]
}
Archetype "site" is for landing pages, portfolios and product/marketing sites; "app" is for tools with CRUD workflows. For a site, sections is the page outline (hero, features, pricing, FAQ, waitlist...) and the api still exists for its interactive parts (waitlist signup, contact form) with matching entities. For an app, sections may be empty.
The api array is the shared contract: frontend and backend are both generated from it. Keep it minimal, CRUD-shaped and consistent with entities.
Every field's "rules" string is binding on both builders and must remove all room for interpretation. State, in a short phrase: whether the field is required or optional on create, whether null is an accepted value and what it means, the exact wire format for dates and times (pick one and name it, e.g. "ISO 8601 date-time string, or null while unfinished"), numeric range and whether the low end is a real value (e.g. "integer 0 to 5, where 0 means unrated and is a valid value"), and the allowed set for anything enum-like (e.g. "one of unread, reading, finished"). Most failed generations are the two builders disagreeing about exactly these details, one validating stricter than the other sends, so vagueness here costs a rebuild.
Entities must carry the fields a well-designed card or row actually needs, not just the bare data model. For any collection the user browses, include: a short prose field the UI can show as a line of description, a list-ish field for labels or tags, at least one numeric or date detail worth displaying, and where the subject has physical or visual character a token for it (a colour, a cover, an icon). A frontend can only render what this contract carries, so an entity with four thin fields guarantees a thin interface.`;

export async function plan(prompt) {
  const out = await chat('planner', [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: prompt }
  ], { validate: extractJson });
  return extractJson(out);
}

const REFINE_SYSTEM = `You are the planner agent of DevSwarm, scoping a refinement to an app you already planned.
The user wants one change to an existing app. Decide the smallest correct scope: which agents must re-run, and whether the shared API contract changes.
Respond with ONLY a JSON object:
{
  "targets": ["frontend"] | ["backend"] | ["frontend", "backend"],
  "change_summary": "one sentence describing the change in build terms",
  "contract_changed": true | false,
  "plan": { the COMPLETE updated build plan, same shape as the original, with api/entities/design_direction/sections edited only where this change requires }
}
Scoping rules:
- Visual, copy, layout and interaction changes that need no new data are "frontend" only.
- New or altered endpoints, validation or stored fields are "backend", and also "frontend" whenever the UI must call or display the change.
- Set contract_changed true only when the api array or entities actually differ from the original.
- Never widen the scope beyond what the instruction asks. Re-running an agent that does not need to change wastes a model call and risks regressions.
- Keep the plan's name unchanged.`;

export async function planRefinement(buildPlan, instruction) {
  const out = await chat('planner', [
    { role: 'system', content: REFINE_SYSTEM },
    { role: 'user', content: `Existing build plan:\n${JSON.stringify(buildPlan, null, 2)}\n\nUser's refinement request:\n${instruction}` }
  ], { validate: extractJson });
  const parsed = extractJson(out);
  const targets = (parsed.targets || []).filter((t) => t === 'frontend' || t === 'backend');
  return {
    targets: targets.length ? targets : ['frontend'],
    change_summary: parsed.change_summary || instruction,
    contract_changed: !!parsed.contract_changed,
    plan: { ...buildPlan, ...(parsed.plan || {}), name: buildPlan.name }
  };
}
