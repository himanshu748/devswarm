import { chat, extractJson } from '../llm.js';

const SYSTEM = `You are the planner agent of DevSwarm. Turn the user's app request into a strict build plan.
Respond with ONLY a JSON object:
{
  "name": "kebab-case-app-name",
  "summary": "one sentence",
  "archetype": "app" | "site",
  "design_direction": "one sentence: mood, a SPECIFIC palette derived from the subject's world (name real hues, e.g. 'ripe tomato red on cream paper'; never default to teal/emerald/violet-on-dark, and choose light themes when the subject suits daytime or domestic use) and the single signature visual",
  "entities": [{"name": "...", "fields": [{"name": "...", "type": "string|number|boolean|date"}]}],
  "api": [{"method": "GET|POST|PUT|DELETE", "path": "/api/...", "description": "..."}],
  "pages": [{"name": "...", "description": "..."}],
  "sections": [{"name": "...", "purpose": "..."}]
}
Archetype "site" is for landing pages, portfolios and product/marketing sites; "app" is for tools with CRUD workflows. For a site, sections is the page outline (hero, features, pricing, FAQ, waitlist...) and the api still exists for its interactive parts (waitlist signup, contact form) with matching entities. For an app, sections may be empty.
The api array is the shared contract: frontend and backend are both generated from it. Keep it minimal, CRUD-shaped and consistent with entities.`;

export async function plan(prompt) {
  const out = await chat('planner', [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: prompt }
  ]);
  return extractJson(out);
}
