# Swarm role contracts

What each agent receives, must produce, and is judged on. Prompts in `src/agents/` implement these; change the contract here first, then the prompt.

## planner

- In: the user's prompt.
- Out: strict JSON build plan: `name`, `summary`, `entities` (typed fields), `api` (method + path + description), `pages`.
- Contract: the `api` array is law. Minimal CRUD shape, consistent with entities. Everything downstream is generated from it.

## frontend

- In: build plan, swarm/design.md, optional critic feedback.
- Out: one self-contained `index.html` (inline CSS/JS, no frameworks, no CDNs).
- Contract: calls contract endpoints exactly (method and path); every fetch has a catch with a localStorage fallback so the static preview works without the backend; follows swarm/design.md.

## backend

- In: build plan, optional critic feedback.
- Out: one ESM `server.js`, express only, in-memory store.
- Contract: implements the `api` array verbatim; validates writes per entity field types and returns 400 with `{"error": "..."}` on bad input; partial updates on PUT must be accepted (validate only the provided fields); serves `./public` statically; PORT from env with a default; no secrets, eval, child_process or fs writes.

## critic

- In: plan contract, both code artifacts.
- Out: JSON verdict: `pass` or `fail` plus issues `[{target, severity, description}]`.
- Contract: scoped checks only: verbatim contract conformance (renamed paths fail even if frontend and backend agree), security checklist, obvious runtime bugs, high-severity design.md violations (broken responsiveness, dead controls). Fail requires at least one high. Issues must be specific enough for the owning agent to fix without guessing.

## Regeneration loop

Critic issues route back only to the flagged agent(s) with the issues as feedback. Max 2 regenerations, then ship with the review attached. Every catch is a span event; the loop is visible in Mission Control and SigNoz.
