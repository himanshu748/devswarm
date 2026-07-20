# DevSwarm Mission Control, design language

The observability data IS the interface. Every pixel is backed by live telemetry; nothing animates unless real data arrived. The reference feeling is a NASA control room at night: calm, dark, dense with meaning, alive only where something is actually happening.

## Tokens

### Color

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0B0E14` | page background, near-black slate |
| `--panel` | `rgba(19, 23, 34, 0.72)` | glassy panel surfaces |
| `--border` | `#1F2635` | 1px panel borders, hairlines |
| `--text` | `#E6E9F0` | primary text |
| `--dim` | `#8A93A6` | secondary text, idle states |
| `--planner` | `#F5A623` | amber |
| `--frontend` | `#22D3EE` | cyan |
| `--backend` | `#A78BFA` | violet |
| `--critic` | `#F87171` | red |
| `--doctor` | `#4ADE80` | green (Swarm Doctor, success states) |

One accent per agent role, used everywhere that role appears: node, span bar, log line, model chip. Color is identity, never decoration. No gradients on surfaces; a role color may glow (box-shadow) only while that role is active.

### Type

- Display: Space Grotesk, used only for the wordmark and zone titles. Wide tracking, uppercase, small sizes; presence through letterspacing, not size.
- Body/UI: Inter, 14-15px.
- Data: JetBrains Mono for everything telemetry: span names, token counts, model ids, timings, costs. If a number came from a trace, it is set in mono.

### Motion

- Animation is an event, not ambience. Node pulses, edge flows and span growth are driven by telemetry arriving, and stop when it stops.
- Durations 150-300ms, ease-out. The only looped animation allowed is the active-agent pulse ring.
- `prefers-reduced-motion`: pulses and flows become static color changes.

## Layout, single screen, three zones

```
+----------------------------------------------------------+-----------+
| DEVSWARM // MISSION CONTROL          prompt [Dispatch]   |  VITALS   |
+----------------------------------------------------------+  tokens   |
|                                                          |  models   |
|                  SWARM GRAPH (hero)                      |  per role |
|        planner -> frontend / backend -> critic           |  catches  |
|                                                          |  alerts   |
+----------------------------------------------------------+           |
|  TRACE RIVER: live span waterfall of this generation     |           |
+----------------------------------------------------------+-----------+
```

1. Swarm Graph, center stage, the signature element. Agent nodes idle dim; an active node glows in its role color with current span name, elapsed time and running token count beneath. Edges light directionally as data flows. A critic catch flashes the offending edge red and pins a flag chip.
2. Trace River, bottom third. Horizontal span waterfall, bars colored by role, regeneration loops render as nested groups. Every bar deep-links to the same trace in SigNoz.
3. Vitals Rail, right side. Live tickers in mono: total tokens (odometer roll), tokens/sec, active model per role with a FALLBACK badge when promoted, critic catch count, alert feed. Swarm Doctor diagnoses appear here as cards.

## Voice

Interface copy is flight-ops terse: "Dispatch", "swarm idle", "critic flagged backend", "fallback promoted". Sentence case, plain verbs, no exclamation marks, no filler. Errors say what failed and what to do next.

## Quality floor

Responsive to 900px (rail stacks below graph), visible keyboard focus (`--frontend` outline), reduced motion respected, contrast at least 4.5:1 for text on `--bg`.
