# Generated-app design system

Every app the swarm ships follows these rules. The frontend agent receives this file verbatim in its system prompt; the critic may flag high-severity violations of the non-negotiables.

## Non-negotiables

1. Responsive from 360px to 1440px. The head contains exactly `<meta name="viewport" content="width=device-width, initial-scale=1">`. Layout uses flex/grid with sensible wrapping; no horizontal page scroll at any width; touch targets at least 40px.
2. Real interactivity with real states: hover, focus-visible, disabled, loading, empty and error states all designed, not defaulted. An empty screen tells the user what to do next.
3. Accessible floor: semantic elements (button, form, label), contrast at least 4.5:1 for body text, visible keyboard focus, `prefers-reduced-motion` respected.
4. No lorem ipsum, no placeholder images, no dead buttons. If a control exists, it works.

## Look and feel

- Color comes from the subject's world, never from habit. Ask: what would this thing's physical or cultural materials look like? A recipe journal earns warm paper and tomato red, a finance tool earns banknote green or ledger ink blue, a sleep app earns deep night blues, a climbing log earns chalk and granite. Commit to the palette the plan's design_direction names.
- Banned defaults: do not reach for emerald/mint green, teal or violet-on-near-black unless the subject specifically earns them (a forest app earns green; a generic tracker does not). These are the palettes every AI tool produces; producing them means the design failed.
- Dark or light is also a subject decision: night-adjacent and focus subjects go dark; domestic, editorial, health and daytime subjects usually deserve a light or warm theme. Do not default to dark. Same discipline either way: deep neutral surfaces, one saturated accent, neutrals for everything else.
- Type: system font stack is fine; win on hierarchy instead: one display size for the page title, clear label/body/caption scale, tabular numerals for any stat or timer.
- Space: generous padding (16 to 24px in cards), consistent radius (8 to 12px), 1px borders from a neutral tone rather than heavy shadows.
- Motion: 150 to 250ms ease-out transitions on state changes only. No looping ambient animation except where the subject is time itself (timers, progress).
- Personality comes from the subject: a habit tracker can celebrate a streak, a pomodoro timer can breathe. One signature moment per app, everything else quiet.

## Marketing sites (the Framer bar)

When the plan's archetype is "site" (landing page, portfolio, product site), the output must feel like a designed site, not a form with a header. All of the above still applies, plus:

- Structure: sticky translucent nav (backdrop blur), full-viewport hero with one strong composition, alternating content sections, a proper footer. Use the plan's sections list as the outline.
- Motion: scroll-triggered reveals via IntersectionObserver (fade + 12 to 24px rise, staggered children, once only), one hero entrance sequence on load, hover lift on cards (transform only). Everything gated behind prefers-reduced-motion.
- Depth: layered backgrounds are welcome here: a subtle radial glow, a faint grid or noise layer, gradient text on the headline. At most two such devices per page; pick the ones the subject earns.
- Typography: hero headline at clamp(2.5rem, 7vw, 5rem) with tight leading and letter-spacing, an eyebrow label above it, balanced text wrapping. Scale drops deliberately through the page.
- Bento or feature grids beat bullet lists. Cards carry one idea each with a visual anchor (number, icon drawn as inline SVG, or stat).
- Real copy: specific headlines about the subject, not "Welcome to our website". Social proof, pricing or FAQ sections get realistic, subject-appropriate content.
- Forms wired for real: waitlist/contact forms POST to the contract endpoint, show inline success and error states, never dead-end.

## Copy

- Sentence case, plain verbs, buttons say what they do ("Add task", not "Submit").
- Empty states invite action ("Create your first habit"), errors say what failed and what to do.
- No exclamation marks, no hype.
- Invent an original app name; never use an existing product's name (no "Splitwise", "Todoist", "Notion" clones by name).
