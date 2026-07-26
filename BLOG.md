---
title: "We instrumented an AI agent swarm with SigNoz, and its own telemetry told us we were wrong about almost everything"
published: false
description: "Five open-weight models plan, build and review a full-stack app. We traced every step into SigNoz, and the telemetry spent a week proving our own assumptions wrong. Six of those findings, with the queries."
tags: ai, observability, opentelemetry, showdev
cover_image: https://devswarm-blog.vercel.app/cover.png
---

Built for the WeMakeDevs Agents of SigNoz hackathon, July 2026.

![DevSwarm Mission Control: the swarm graph, the live trace river and the hangar of everything it has built](https://devswarm-blog.vercel.app/mission-control.png)
*Mission Control. The graph is the swarm, the river underneath it is the live span stream, and every bar deep-links into that trace in SigNoz.*

DevSwarm turns one prompt into a working full-stack app. Five open-weight models plan it, build it, review it and repair their own routing. Nothing it produces is trusted blindly, and every step is an OpenTelemetry span in SigNoz, including the steps that go wrong.

We built the observability first, expecting it to prove the thing worked.

It did something more useful. It spent a week proving that almost everything we believed about our own system was wrong. We blamed a model for a limit we had set ourselves. We blamed a provider outage on the model. We assumed our review agent was our strongest link when it was measurably the weakest. And we spent days writing a design system that, when we finally measured it, was making the output worse.

Not one of those was found by reading the code again. Every single one came off a span event, a dashboard row or a benchmark that disagreed with us.

So this is not an architecture post. It is six times the telemetry told us we were wrong, with the queries.

The current numbers, all read live out of SigNoz rather than typed into a slide: 22 generations, 188 traced model calls across 8 models, 2.84 million tokens, 225 critic catches, 19 fallback promotions and 24 generated apps each reporting under their own service name.

## What the swarm actually is

Five roles, each on the open-weight model that measured best for that job:

| role | model | job |
| --- | --- | --- |
| planner | GLM-5.2 | turn a prompt into a typed build plan and a locked API contract |
| frontend | GLM-5.2 | one self-contained index.html against that contract |
| backend | Qwen3-Coder-480B | one Express server against the same contract |
| critic | Kimi-K2.7-Code | review both, gate the merge, route catches back to their owner |
| doctor | GLM-5.2 | read the swarm's own traces and repair its model routing |

![The DevSwarm landing page](https://devswarm-blog.vercel.app/landing.png)
*Every number on our own landing page is a live ClickHouse query against the trace store. Marketing copy that drifts from the telemetry is impossible by construction.*

Everything is served through Hugging Face Inference Providers. There are zero closed-model API calls in the system, which turned out to matter for reasons we did not anticipate (see the provider section below).

The critic is the load-bearing part. Frontend and backend are generated in parallel from the same contract, then an independent model reviews both for contract conformance, security and runtime bugs. Real catches route back to the agent that owns them, that agent patches its own file and the critic re-reviews only the delta. Two regeneration rounds, then it ships with an honest verdict either way.

## Why we instrumented before we polished

A multi-agent system fails in ways a single-model tool does not. A call can succeed while producing an unusable artifact. A fallback can rescue a request so smoothly that nobody notices the primary is dead. Latency can triple because one role silently started thinking twice as long. None of that shows up in a request log.

So the very first thing that worked in this project was not code generation. It was a trace.

SigNoz is self-hosted through Foundry, which is a single-config install. Our `casting.yaml` and `casting.yaml.lock` are committed to the repo so the deployment is reproducible by anyone, judges included.

## Three signals, and what each one carries

**Traces.** Every model call is a span named `llm.<role>` carrying GenAI semantic conventions:

```js
span.setAttributes({
  'gen_ai.operation.name': 'chat',
  'gen_ai.request.model': model,
  'gen_ai.usage.input_tokens': usage.prompt_tokens,
  'gen_ai.usage.output_tokens': usage.completion_tokens,
  'devswarm.role': role
});
```

Two span events do the heavy diagnostic lifting. `fallback_promotion` records that a primary failed, which model took over and the verbatim reason. `critic_catch` records every issue the review agent found, with its target and severity. Both are events rather than separate spans on purpose: they belong to the call they describe, and they survive in the trace even when the call ultimately succeeds.

**Metrics.** Six counters and a histogram, because some questions are time series questions rather than trace questions: `devswarm.tokens`, `devswarm.llm.calls`, `devswarm.llm.duration`, `devswarm.fallback.promotions`, `devswarm.critic.catches`, `devswarm.generations`, `devswarm.refinements`. Labelled by role, model and outcome.

**Logs.** Structured records for the things a human reads during an incident: a fallback promoting, a doctor diagnosis, a generation completing with its verdict and catch count. Same resource attributes as the traces, so a log line and a span line up.

The whole trace layer is now extracted into a small library, [otel-swarm](https://github.com/himanshu748/otel-swarm), that any multi-agent system can drop in. DevSwarm consumes it as a real dependency, which means if the library breaks, our own dashboards go dark first. That felt like the honest way to ship it.

![A generation trace in SigNoz, nested agent and llm spans](https://devswarm-blog.vercel.app/otel-swarm-trace.png)
*One generation as a flame graph. Planner, then frontend and backend in parallel, then the critic.*

![Structured logs in SigNoz showing fallback promotions and generation verdicts](https://devswarm-blog.vercel.app/signoz-logs.png)
*The log stream during a rough run. WARN lines are fallback promotions, each naming the model that failed and why.*

## Reading the swarm out of ClickHouse

Five dashboards, all committed as JSON in `observability/dashboards/`. The one we actually live in is Command Center: is the swarm healthy, and if not, which role. The odd one out is Born Observable, which contains no swarm data at all, only the generated apps reporting under their own service names.

Three queries worth sharing, because span events in ClickHouse are not obvious the first time.

Role health, straight off the trace store:

```sql
SELECT attributes_string['devswarm.role'] AS role,
       count() AS calls,
       countIf(statusCode = 2) AS errors,
       round(quantile(0.95)(durationNano) / 1e9, 1) AS p95_s,
       sum(attributes_number['gen_ai.usage.input_tokens']
         + attributes_number['gen_ai.usage.output_tokens']) AS tokens
FROM signoz_traces.distributed_signoz_index_v3
WHERE serviceName = 'devswarm' AND name LIKE 'llm.%'
GROUP BY role ORDER BY calls DESC
```

Fallback promotions over time, which requires reaching into the events array:

```sql
SELECT toStartOfInterval(timestamp, INTERVAL 30 MINUTE) AS ts,
       attributes_string['devswarm.role'] AS role,
       count() AS value
FROM signoz_traces.distributed_signoz_index_v3
WHERE serviceName = 'devswarm'
  AND arrayExists(e -> e LIKE '%fallback_promotion%', events)
GROUP BY ts, role ORDER BY ts
```

The one that took longest to work out reads *inside* the events, so you can ask what the review gate actually caught rather than how many times it caught something:

```sql
SELECT JSONExtractString(e, 'attributeMap', 'severity') AS severity,
       JSONExtractString(e, 'attributeMap', 'target') AS target,
       count() AS catches
FROM signoz_traces.distributed_signoz_index_v3
ARRAY JOIN events AS e
WHERE serviceName = 'devswarm' AND name = 'agent.critic'
  AND JSONExtractString(e, 'name') = 'critic_catch'
GROUP BY severity, target ORDER BY catches DESC
```

The answer, over the week: 221 high, 46 medium, 10 low, and the frontend agent is on the receiving end of 70 percent of them. That single row changed how we think about the swarm. The half of the system generating markup and client-side state is where the bugs live, not the half touching the database.

One design decision we are glad about: the marketing numbers on our own landing page are fetched from these same queries at request time. The page cannot drift from the telemetry, because there is only one source of both.

![The DevSwarm Command Center dashboard in SigNoz](https://devswarm-blog.vercel.app/dashboard-command-center.png)
*Command Center. Top row answers "is the swarm healthy", the role-health table answers "which role", while the fallback chart should trend to zero.*

![The LLM Economics dashboard in SigNoz](https://devswarm-blog.vercel.app/dashboard-llm-economics.png)
*LLM Economics: tokens and latency per role and per model, which is how we caught the frontend role burning two thirds of its budget on reasoning.*

## What one app actually costs

Every token in the table below came off a span. This is one real run, the letterpress site above, priced at the rates the Hugging Face router itself reports for the providers we use.

| role | model | in | out | cost |
| --- | --- | --- | --- | --- |
| frontend | GLM-5.2 | 27,855 | 38,888 | $0.2101 |
| critic | Kimi-K2.7-Code | 50,996 | 14,539 | $0.1066 |
| planner | GLM-5.2 | 670 | 4,090 | $0.0189 |
| backend | Qwen3-Coder-480B | 2,800 | 3,778 | $0.0069 |
| | | **82,321** | **61,295** | **$0.34** |

Thirty four cents for a designed marketing site with a working Express backend, a waitlist that validates email and rejects duplicates, plus its own OpenTelemetry wiring. Across passing runs the range is about 18 cents to 56 cents.

Two things in that table surprised us.

The critic costs fifteen times what the backend author costs. Reviewing the code is dramatically more expensive than writing it, because review means reading both artifacts in full, twice, while the backend agent writes one file once. Nobody budgets for that. If you are building a review gate into an agent system, it is not a rounding error on top of generation, it is a third of your bill.

And a failed run costs more than a successful one. Our worst generations burned 232,000 tokens hitting the regeneration ceiling, against 74,000 for the cleanest pass. So convergence is not only a quality metric, it is the cost metric. Fixing the contract-format bug in finding five did more for our unit economics than any model swap we made.

## Alerts that wake an agent instead of a human

This is the part of the build we are proudest of, and it is a genuinely small amount of code.

Two alert rules live in `observability/alerts/`: a fallback-usage spike and a critic catch-rate flatline. Both notify a webhook channel called `swarm-doctor`, which points at `POST /api/doctor/webhook` on the swarm itself.

When an alert fires, the Doctor wakes up, queries the swarm's own traces for the last hour and decides what to do about the routing table. It promotes a backup model, resets a recovered primary or does nothing, then explains itself in plain English using the numbers it just read. Its first real diagnosis, verbatim:

> "The critic role is the clear problem area: its primary triggered 6 fallback promotions out of 9 calls (67%) with a 22% error rate and p95 latency of 242s. Backend, planner and doctor are healthy."

The Doctor's own model calls are traced too, so the healer is exactly as observable as the patient.

![Mission Control showing the Swarm Doctor's diagnosis panel](https://devswarm-blog.vercel.app/swarm-doctor.png)
*The Doctor reporting a healthy swarm. It read 180 minutes of its own traces to say so, and it is honest about sample size: "call volume is very low, so latency figures are not statistically meaningful".*

Two hard-won SigNoz API notes, since we lost hours to both:

Alert rules must be created against `/api/v2/rules` with `schemaVersion: v2alpha1`, a `notificationSettings` block and at least one channel. The v1 endpoint accepts the request and returns `"alert rule is not valid"` with no indication of which field is wrong. Dashboards, by contrast, go to `/api/v1/dashboards` with a `SIGNOZ-API-KEY` header and behave exactly as documented.

Also: a cold Docker restart can leave ClickHouse replicas read-only until Keeper reconnects. It usually self-heals within a minute. If it does not, `SYSTEM RESTORE REPLICA` per table clears it.

## Apps that are born observable

Every app the swarm generates ships instrumented. Alongside `index.html` and `server.js`, each generated folder gets an `otel.mjs` bootstrap, a `package.json`, and a `signoz-dashboard.json` scoped to that app's own service name. If a `SIGNOZ_API_TOKEN` is configured, the dashboard is created in SigNoz at generation time, before the user has opened the preview.

So the generated app appears in SigNoz as its own service, with RED metrics and a routes table, seconds after it exists. Twenty four of them are in our instance right now.

Worth saying because people assume otherwise: there is no image model anywhere in this pipeline. The swarm generates 227 inline SVG elements across the 26 apps it has built, an average of 8.7 per app, and every one of them was written as markup by a language model. The Vandercook press in the screenshot above is hand-drawn SVG, not a generated image. The only assets we ever image-generated are DevSwarm's own favicon and social card, which are branding for the tool rather than anything the swarm produces.

![Quoin and Roller, a letterpress site generated from one sentence](https://devswarm-blog.vercel.app/letterpress-hero.png)
*One of the outputs. The Vandercook press is inline SVG the model drew itself, and this app reports to SigNoz under its own service name from the moment it boots.*

One caveat we had to learn the hard way: an app only emits spans while its backend is actually running. Early on our preview served the frontend statically, so the generated Express server never booted and the app silently fell back to localStorage. The preview looked perfect and the service page was almost empty. That mismatch, two spans where there should have been dozens, is what gave the bug away. Previews now spawn the real server as a child process and proxy to it.

## Six things our own telemetry told us we had wrong

This is the section I would want to read, so it is the longest one.

**1. A "model limitation" was a stale constant we wrote ourselves.**

Traces showed every frontend failure as `finish: length`, truncating full-page HTML. We concluded GLM-5.2's provider capped completions at 16384 tokens and moved the role to another model. The cap was real when we found it. It was also in our own config, and when the provider limit later lifted, our constant kept enforcing a limit that no longer existed. The average frontend artifact needs about 19,000 output tokens. We had guaranteed truncation and blamed the model for a fortnight.

**2. The real cause was provider roulette, visible only in the span event text.**

After removing our own cap, GLM still failed intermittently with a 400: `max_completion_tokens is limited to 16384 for glm-5.2`. The Hugging Face router load-balances a model across every provider serving it, and their limits disagree. We probed all seven: scaleway caps at 16384, featherless at 32768, novita and zai-org at 131072, while together, fireworks-ai and deepinfra accept 200000 or more. Unpinned, roughly one request in seven hit the strict provider and died instantly. Pinning the model to one provider produced our first ever generation with zero fallbacks. That entire diagnosis came out of the `reason` attribute on a `fallback_promotion` event.

**3. Our span attribute was hiding the failures we most wanted to see.**

When a primary failed, our code overwrote `gen_ai.request.model` on the span with the fallback's name. It seemed tidy. It meant every dashboard row attributed the primary's failure, and its wasted latency, to the fallback that cleaned up after it. We spent an afternoon convinced the critic's backup model was slow and error-prone. Isolating them in a benchmark showed the opposite: the backup was fine at 7 seconds, and the primary was the problem. If you take one implementation detail from this post, take this one. Record the model you attempted, and put the promotion in an event, not on top of the attribute you will later group by.

**4. Our review gate was the weakest model in the swarm.**

We had never benchmarked the critic, so we built one: a generated app with three documented contract defects, three runs per model, scored on defect recall. DeepSeek-V4-Pro, our incumbent primary, found 2 of 9. One run burned its entire 32768-token budget and returned nothing parseable. Kimi-K2.7-Code found 8 of 9 and was consistent across runs. The clearest pattern in the data was that on a review task, reasoning volume tracks defect recall: the terse models answered in under 250 output tokens and missed real bugs.

**5. A 20 percent pass rate was one missing sentence in the contract.**

Our plans specified field names and types but never formats, ranges or nullability. So the backend rejected `rating: 0` while the frontend sent 0 as its default, and the backend demanded `YYYY-MM-DD` while the frontend sent full ISO strings. Three consecutive generations hit the regeneration ceiling on exactly this class of disagreement. The fix was making the planner write a binding rules string per field, for example `"integer 0 to 5 inclusive, where 0 means unrated and is a valid value"`. Both builders now read the same sentence. Catches dropped from 9 to 3 and the next run passed.

**6. Our design system was making the output worse.**

We wrote a careful design guide so generated apps would not look like generated apps. Then we measured it: same model, same prompt, the only variable being whether the guide was attached. Without it, 14 inline SVGs, 3 animations and a deliberate typeface pairing. With it, 5 SVGs, 1 animation and Courier New. Three of our own rules did that. "System font stack is fine" told the model not to bother choosing type. "Cut any animation that does not serve the subject" read as licence to strip ornament. And our frontend prompt banned all external requests, which silently banned Google Fonts, so it could not have chosen a real typeface even if it wanted to. We had written a list of prohibitions, which is good at preventing bad output and bad at producing good output.

![Generated bookshelf app using system fonts and rainbow card colours](https://devswarm-blog.vercel.app/before-system-fonts.png)
*Before. Mono labels from a system stack, and card colours the backend invented at random.*

![The same prompt generating a bookshelf app with Fraunces and a drawn SVG shelf](https://devswarm-blog.vercel.app/after-real-fonts.png)
*After. Same model, same prompt, three rules removed from our guide: Fraunces display type, a drawn logo mark, filter chips carrying live counts, plus the books rendered as spines on a shelf.*


There was a second layer to that one. The guide had a generous section for marketing sites, licensing scroll reveals, entrance sequences and layered depth, plus a stingy section for apps. Every app the swarm built was being held to a deliberately plainer standard than every site, and nobody had noticed because the sites looked great.

## How this was built

DevSwarm was built with Claude Code, which is worth stating plainly rather than leaving as an inference. An AI coding agent helped build an AI coding agent, and the hackathon rules ask entrants to declare assistant use, so here it is.

It is also relevant to the point of this post. Every finding in the section above started as a confident, wrong belief held by both of us, human and assistant alike. The stale token cap, the model we blamed for a provider's limit, the review gate we assumed was our strongest link, the design system we were sure was helping. None of those were resolved by reasoning harder about the code. They were resolved by a span event, a dashboard row or a benchmark disagreeing with us.

That is the argument for instrumenting an agent system early. When you are building with agents, and with an agent, the telemetry is the only participant in the conversation with no opinion to defend.

## What is worth copying from this build

If you are instrumenting an agent system, three things paid for themselves immediately.

Put the reason text in the span event. Not a code, not an enum, the actual provider error string. Both of our worst bugs were solved by reading that field, and neither would have been visible in a metric.

Never overwrite an attribute you intend to group by. Add, do not replace.

Make your product read its own telemetry. Our landing page statistics, our Doctor's diagnosis and our dashboards all run the same queries against the same trace store. It removes a whole category of drift, and it turns your observability stack from a debugging tool into a feature.

## The uncomfortable part

The through line of every finding above is the same, and I have thought about it more than I expected to.

Not one of these was a hard problem. A stale constant. A provider with a different limit. An attribute overwritten in the wrong place. A missing sentence in a contract. Three over-cautious lines in a style guide. Any of them would have been a five minute fix if we had known. Together they cost us most of a week and made the system look, from the outside, like the models were letting us down.

They were not. Every single time, the model did exactly what our configuration told it to do. The failure was always upstream of the model, in something we had written and then stopped looking at.

I think that is the actual lesson of building with agents, and it is not a comfortable one. The debugging skill is not prompt engineering. It is being willing to believe your instrumentation over your own memory of what you configured three days ago. We only got there because the telemetry kept producing numbers that made our explanations impossible.

If you are building something similar, I would genuinely like to know whether your experience matches. My suspicion is that a lot of "the model is not good enough" is actually "my config is stale and I have no way to see it".

## Links

- DevSwarm: [github.com/himanshu748/devswarm](https://github.com/himanshu748/devswarm)
- otel-swarm, the extracted instrumentation library: [github.com/himanshu748/otel-swarm](https://github.com/himanshu748/otel-swarm)
- SigNoz: [signoz.io](https://signoz.io)
- The hackathon: [Agents of SigNoz](https://www.wemakedevs.org/hackathons/signoz) by WeMakeDevs

Dashboards, alert rules and the Foundry `casting.yaml` are all in the repo under `observability/`, so the whole SigNoz side of this is reproducible rather than described.
