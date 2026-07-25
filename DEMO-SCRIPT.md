# DevSwarm demo video script

3 minutes max (hackathon limit), YouTube. Voiceover recorded first, screen captured to match.
Covers the four things the submission form asks for: the project, the tech stack and
architecture, the demo, and what we learned.

Word count is tuned to land around 2:40 at a natural pace, leaving headroom under the 3:00 cap.

---

## Beat 1: What it is (0:00)

**On screen:** DevSwarm landing page, hero, then cut to Mission Control idle.

> This is DevSwarm. One prompt goes in, and a swarm of open-weight models plans, builds,
> reviews and ships a working full-stack app. Nothing it produces is trusted blindly.
> Every step is an OpenTelemetry span in SigNoz, including the steps that go wrong.

## Beat 2: Live generation and the review gate (0:18)

**On screen:** type the prompt, hit Dispatch. Swarm graph lights up. Trace river streams.
Critic node turns red, a catch lands in the feed, regeneration runs.

> I'll dispatch a prompt. The planner locks an API contract, then the frontend and backend
> agents build against it in parallel. What you are watching is not a progress bar. It is the
> live span stream. Each bar is a real model call with its own token count, and it deep-links
> straight into that trace in SigNoz.
>
> Then the critic reviews the code. It just flagged a real bug: a partial update the backend's
> own validation would reject. That catch routes back to the agent that owns it, which patches
> its own code, and the critic re-reviews only the delta.

## Beat 3: It heals itself (0:55)

**On screen:** SigNoz alert firing, then the Swarm Doctor card in Mission Control with its
plain-English diagnosis and the applied routing action.

> Here is the part I am proudest of. When a model degrades, nobody gets paged. A SigNoz alert
> fires, a webhook wakes the Swarm Doctor, and the Doctor queries the swarm's own traces to
> decide what to do. It promotes the backup model and explains itself in plain English, using
> the numbers it just read. The healer is traced too.

## Beat 4: Born observable (1:32)

**On screen:** open the generated app's preview, click through it, then cut to SigNoz Services
showing that app as its own service, then its auto-provisioned dashboard.

> The app it built is born observable. It ships with its own OpenTelemetry bootstrap, so the
> moment I click around it, it shows up in SigNoz as its own service with its own dashboard,
> provisioned at generation time. Every app the swarm has built is in here.

## Beat 5: Stack, architecture and what we learned (2:00)

**On screen:** Command Center dashboard with the real lifetime numbers, then the otel-swarm
repo, then the closing brand frame.

> The stack is Node and Express, with open-weight models served through Hugging Face and zero
> closed-model API calls. SigNoz is self-hosted with Foundry, carrying all three signals:
> traces, metrics and logs. We pulled the instrumentation out into otel-swarm, an open library
> any multi-agent system can drop in.
>
> The biggest lesson: our own telemetry caught our own bugs. The traces showed that every
> frontend failure was one model hitting its output cap and truncating mid-file. The logs showed
> our critic never converging, because it re-audited everything from scratch on every pass. We
> did not guess at either one. We read them off a dashboard, and both fixes are in the repo.
>
> DevSwarm. The swarm that watches itself, and everything it builds.
