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
- Type: choose real typefaces on purpose and load them from Google Fonts with a preconnect. Pair a display face that carries the subject's character with a clean text face, and add a mono only where numbers or labels earn it. Editorial and domestic subjects usually want a serif display (Fraunces, Instrument Serif, Newsreader, Lora); technical and utility subjects want a confident sans (Geist, Inter Tight, Space Grotesk). Falling back to the system stack is a failure of nerve, not restraint: it is the single clearest tell of a generated page.
- Then still win on hierarchy: one display size for the page title, a clear label/body/caption scale, and tabular numerals for any stat or timer.
- Space: generous padding (16 to 24px in cards), consistent radius (8 to 12px), 1px borders from a neutral tone rather than heavy shadows.
- Motion is part of the design, including tools and dashboards. Use the motion system below: a coordinated entrance, short state feedback, selective scroll reveals, and at most one subject-appropriate signature effect. Match the motion's character to the subject instead of adding the same bounce everywhere.
- Depth is allowed everywhere too: a subtle radial glow, a faint grid or noise layer, gradient text on the one headline that earns it. At most two such devices per screen, chosen for the subject.
- Show the subject, do not only typeset it. Use original photography or generated raster imagery when materials, objects, people or places carry the story. Use hand-built SVG for diagrams, icons, data and structural illustrations: books become spines on a shelf, plants become pots in a row, workouts become a load curve. Choose the medium for the subject; SVG is not a replacement for the image system below.
- Personality comes from the subject: a habit tracker can celebrate a streak, a pomodoro timer can breathe. One signature moment per app, everything else quiet.

## Marketing sites (the Framer bar)

When the plan's archetype is "site" (landing page, portfolio, product site), the output must feel like a designed site, not a form with a header. All of the above still applies, plus:

- Structure: sticky translucent nav (backdrop blur), full-viewport hero with one strong composition, alternating content sections, a proper footer. Use the plan's sections list as the outline.
- Motion and imagery: give the hero a real visual composition and a coordinated entrance. Use the motion and image systems below throughout the page. A site may spend its signature-effect allowance on the hero rather than spreading it thin.
- Typography: hero headline at clamp(2.5rem, 7vw, 5rem) with tight leading and letter-spacing, an eyebrow label above it, balanced text wrapping. Scale drops deliberately through the page.
- Bento or feature grids beat bullet lists. Cards carry one idea each with a visual anchor (number, icon drawn as inline SVG, or stat).
- Real copy: specific headlines about the subject, not "Welcome to our website". Social proof, pricing or FAQ sections get realistic, subject-appropriate content.
- Forms wired for real: waitlist/contact forms POST to the contract endpoint, show inline success and error states, never dead-end.

## Motion system

Adapted from the Motion Design skill's timing, choreography and platform guidance, and the independently built Borrowed Sunday Motion Design trial. Carry over the behavior, not that trial's palette, sun motif or garden subject.

- Choose one motion personality for the app: calm, playful, precise or energetic. Define one signature easing and quick, standard and expressive durations, then reuse them. A useful restrained starting curve is `[0.2, 0, 0, 1]`; a gentle playful curve is `[0.175, 0.885, 0.32, 1.08]`. Use deceleration for entrances, acceleration for exits, and smooth easing for movement already on screen. Linear easing belongs to progress indicators or spinners, not spatial entrances.
- React and Next.js projects use Motion for React, the library formerly called Framer Motion. Prefer the `motion` package with imports from `motion/react`. If a project already uses `framer-motion`, keep that package and its imports consistent instead of installing both. Put animation hooks in a client component in Next.js.
- Preserve the host's output contract. DevSwarm's current frontend contract is one self-contained HTML file with no frameworks or CDNs. For that generator, implement the same choreography with CSS, the Web Animations API and IntersectionObserver. Do not emit React imports into its HTML. Motion for React becomes the implementation when the host supports a React build; changing the generator's stack is a separate implementation task.

| Behavior | Starting duration | Movement |
| --- | --- | --- |
| Hover, focus and press feedback | 100 to 150ms | Small arrow shift or scale around 0.98 on press |
| Ordinary state changes and collection updates | 200 to 300ms | Opacity plus restrained position or layout change |
| Scroll-triggered section reveal | 300 to 350ms | Fade with a 12 to 18px rise, once only |
| Dialog entrance | 300 to 400ms | Fade with a short rise or scale from 0.98 |
| Dialog exit | 150 to 250ms | Quicker than entrance, preserve focus restoration |
| Hero image entrance | 450 to 550ms | Fade with a 16 to 24px rise |

- Choreograph the hero in reading order: headline first, image close behind, supporting copy and CTA next, one small badge or illustration settles last. Keep stagger delays around 50 to 100ms and the total stagger delay below 500ms. Essential text and controls must become usable promptly. Animate wrappers rather than every word, letter and image at once.
- React scroll reveals use `whileInView` with `viewport={{ once: true, amount: 0.15 }}` and `useReducedMotion`. Reveal a section or a small related group. Do not hide the same content again when scrolling back, or leave content invisible if initialization fails. The HTML implementation uses equivalent once-only observer behavior with visible content as its baseline.
- Add at most one subtle scroll-linked signature effect when it helps the composition. The trial's useful scale was about 24px of image travel and 10px of secondary counter-motion. In React, use `useScroll` and `useTransform`; in HTML, use a passive listener and a scheduled animation frame. Keep native scrolling. No default scroll hijacking, mandatory pinned hero, full-screen zoom or long hold before the user can reach the content.
- A reading-progress line is useful on a long editorial page, not a requirement for every app. Filtered grids can animate layout over 200 to 300ms; selection, focus and empty-state messages must remain clear while items move. Errors and success always have text, not animation alone.
- Use a primary entrance plus a secondary response where it adds clarity. Ambient life is optional and must depict something true about the subject. Prefer visitor-controlled scroll motion over perpetual decorative loops. Never require three moving layers merely to satisfy a checklist.
- Mobile removes parallax and reduces displacement, simultaneous moving elements and stagger delay. Touch feedback should be immediate. Respect `prefers-reduced-motion` in both JavaScript and CSS: disable spatial entrances, springs, parallax, smooth scrolling and decorative loops; show content immediately or with a short opacity fade. `MotionConfig reducedMotion="user"` is useful, but also guard custom hooks and CSS animations explicitly.
- Animate transform and opacity first. Avoid animating layout on every scroll tick, avoid React state updates on every frame, reserve image space before loading, and clean up observers, listeners and animation frames. Use `will-change` only on elements that need it. Do not claim measured smoothness without checking the live result.

Motion API references: [scroll animations](https://motion.dev/docs/react-scroll-animations) and [reduced motion](https://motion.dev/docs/react-use-reduced-motion).

## Image system

- Marketing sites need actual subject-led imagery, not an all-text hero, empty image frame, unrelated stock background or a page made entirely from icons. Give the hero one strong raster composition. Add supporting object, product or scene imagery where it explains the offering. Tools and dashboards use imagery when it helps the task; do not fill useful work surfaces with decorative photos.
- Use ImageGen for original raster imagery when that tool is available, and create the imagery before completing the layout. Specify the subject, materials, light, viewpoint, background palette, intended aspect ratio, focal point and space for adjacent copy. Keep text, labels and CTAs in HTML, not baked into the generated image. Use the user's supplied assets when they define the product or identity. Never invent a real product's appearance or portray generated people or scenes as customer evidence.
- Treat the images as one art direction: consistent lighting, camera angle, color treatment and background across a collection. The Motion Design trial used one scene-setting hero plus a coordinated set of object photographs. Adopt that relationship when it fits, not its exact objects or composition.
- A generated contact sheet can establish a coordinated collection, but inspect each cell and map it to the correct item. Prefer separate optimized image files for reusable cards; if using a sheet, verify background positions, crops and responsive aspect ratios. Do not label one object's image as another object.
- Save generated or supplied assets locally in the project's asset directory and use paths that work in the production build. Record asset source or generation provenance. Never fabricate an image URL, an unavailable file, or a claim that ImageGen ran. For DevSwarm's single-file contract, use provided embedded assets or assets explicitly supported by its host. If its host cannot supply or generate images, report that concrete limitation instead of pretending the requirement is met.
- Deliver appropriately sized WebP or AVIF when supported, with a suitable fallback if needed. Avoid shipping an uncompressed multi-megabyte image where a smaller rendition works. Give images explicit dimensions or an aspect-ratio container, sensible `object-fit` and a deliberate focal point. Load the hero promptly and lazy-load below-fold imagery. Keep the composition legible at 360px as well as 1440px.
- Write useful alt text for meaningful imagery and use empty alt text for purely decorative images. Keep text contrast independent of unpredictable image detail. Verify that images load, match their labels, preserve the important subject in mobile crops, and remain correctly positioned when motion is reduced.

## Copy

- Sentence case, plain verbs, buttons say what they do ("Add task", not "Submit").
- Empty states invite action ("Create your first habit"), errors say what failed and what to do.
- No exclamation marks, no hype.
- Never use em dashes or en dashes anywhere in copy, code comments or generated text. Use a comma, a period, a colon or parentheses instead.
- Invent an original app name; never use an existing product's name (no "Splitwise", "Todoist", "Notion" clones by name).

## Craft principles (how the good ones think)

- The hero is a thesis. Open with the most characteristic thing in the subject's world, not a generic welcome. A big number with a small label plus a gradient accent is the template answer; only use it when it is truly the best option.
- Typography carries personality. Set a deliberate scale (one display size, clear label/body/caption steps) and let weight and spacing do the work. Tabular numerals for any stat, timer or price.
- Structure is information. Use numbered markers, eyebrows or dividers only when they encode something true about the content (a real sequence, a real hierarchy), never as decoration.
- One signature element per page: the single thing the page will be remembered by (a waveform under the headline, a recipe card texture, a breathing timer ring). Build it, usually as inline SVG, and spend the boldness there while everything around it stays quiet. A page with no signature element has failed this checklist even if every other rule passes.
- Remove one accessory before shipping: if a glow, gradient or animation does not serve the subject, cut it. This is a rule about accessories, never about the signature element or the subject's own illustration; do not economise your way to a page of plain boxes.
- Fill the fields the contract gives you. If an entity carries a description, tags, a count or a colour token, the card that renders it shows them. Empty space inside a card where real data exists is a bug, not restraint.
- Copy is design material. Name things by what the user controls ("Add recipe", not "Submit entry"), keep one name per action through the whole flow, and let empty states invite the first action.
