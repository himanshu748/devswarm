import { readFileSync } from 'node:fs';
import { chat, extractCode } from '../llm.js';

const DESIGN_GUIDE = readFileSync(new URL('../../swarm/design.md', import.meta.url), 'utf8');

const SYSTEM = `You are the frontend agent of DevSwarm. Generate a complete single-file web app: one index.html with inline CSS and vanilla JS. No frameworks and no script or style CDNs. The only permitted external requests are the app's own /api/* endpoints from the contract and webfonts from fonts.googleapis.com / fonts.gstatic.com, which you are expected to use.
Rules:
- Call the API endpoints exactly as given in the contract (method + path).
- Send every field exactly as its "rules" string in the plan states: the named date format and no other, values inside the stated range, only members of a stated enum, and null only where null is declared allowed. Never invent a sentinel the rules do not mention, and on a partial edit send only the fields the user actually changed.
- If a fetch fails (backend not running in preview), catch it and fall back to localStorage so the preview still works standalone.
- Honor the plan's archetype: "site" means a designed marketing site (sticky nav, hero, scroll reveals, sections from the plan) per the Framer bar below; "app" means a focused tool UI. Use the plan's design_direction as your creative brief.
- Craft is the differentiator: this output competes with Framer templates, not with form scaffolds. Spend effort on the hero, spacing rhythm and one signature visual moment.
- Follow this design system exactly; its non-negotiables are review-gated:

${DESIGN_GUIDE}

Respond with ONLY the HTML in a \`\`\`html code fence.`;

export async function generateFrontend(buildPlan, feedback, previousCode) {
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Build plan:\n${JSON.stringify(buildPlan, null, 2)}` }
  ];
  if (feedback && previousCode) {
    // Regeneration is a patch, not a reroll: the agent must see its own prior
    // output or every round reintroduces fresh bugs.
    messages.push({ role: 'assistant', content: '```html\n' + previousCode + '\n```' });
    messages.push({ role: 'user', content: `The review agent flagged these issues in your code above. Fix ONLY these issues and keep everything else unchanged. Return the complete corrected file:\n${feedback}` });
  } else if (feedback) {
    messages.push({ role: 'user', content: `The review agent flagged these issues in your previous version. Fix them:\n${feedback}` });
  }
  const out = await chat('frontend', messages);
  return extractCode(out, 'html');
}

// Refinement is a targeted edit, not a rebuild: the agent sees its own shipped
// file and changes only what the user asked for.
export async function refineFrontend(buildPlan, instruction, previousCode) {
  const out = await chat('frontend', [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Build plan:\n${JSON.stringify(buildPlan, null, 2)}` },
    { role: 'assistant', content: '```html\n' + previousCode + '\n```' },
    { role: 'user', content: `The user is refining the app above. Make exactly this change and keep everything else byte-for-byte identical, including copy, layout, palette and behaviour you were not asked to touch:\n\n${instruction}\n\nReturn the complete updated file.` }
  ]);
  return extractCode(out, 'html');
}
