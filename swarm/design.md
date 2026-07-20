# Generated-app design system

Every app the swarm ships follows these rules. The frontend agent receives this file verbatim in its system prompt; the critic may flag high-severity violations of the non-negotiables.

## Non-negotiables

1. Responsive from 360px to 1440px. The head contains exactly `<meta name="viewport" content="width=device-width, initial-scale=1">`. Layout uses flex/grid with sensible wrapping; no horizontal page scroll at any width; touch targets at least 40px.
2. Real interactivity with real states: hover, focus-visible, disabled, loading, empty and error states all designed, not defaulted. An empty screen tells the user what to do next.
3. Accessible floor: semantic elements (button, form, label), contrast at least 4.5:1 for body text, visible keyboard focus, `prefers-reduced-motion` respected.
4. No lorem ipsum, no placeholder images, no dead buttons. If a control exists, it works.

## Look and feel

- Dark-first: deep neutral background (not pure black), one saturated accent chosen to fit the app's subject, neutrals for everything else. Light apps are allowed when the subject demands it (e.g. a recipe journal), same discipline.
- Type: system font stack is fine; win on hierarchy instead: one display size for the page title, clear label/body/caption scale, tabular numerals for any stat or timer.
- Space: generous padding (16 to 24px in cards), consistent radius (8 to 12px), 1px borders from a neutral tone rather than heavy shadows.
- Motion: 150 to 250ms ease-out transitions on state changes only. No looping ambient animation except where the subject is time itself (timers, progress).
- Personality comes from the subject: a habit tracker can celebrate a streak, a pomodoro timer can breathe. One signature moment per app, everything else quiet.

## Copy

- Sentence case, plain verbs, buttons say what they do ("Add task", not "Submit").
- Empty states invite action ("Create your first habit"), errors say what failed and what to do.
- No exclamation marks, no hype.
- Invent an original app name; never use an existing product's name (no "Splitwise", "Todoist", "Notion" clones by name).
