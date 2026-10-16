---
title: "One Sentence In, One Product Out: A Small Model Burned 3.6 Billion Tokens a Month — AIOS Makes Software Development Something Anyone Can Do"
description: "AIOS has one selling point: software development for everyone, as long as you can describe what you want. The field evidence behind it: Qwen 3.8 Flash inside the Pi coding agent, wrapped in the AIOS control plane (requirements grilling, workflow routing, project memory, evidence gates, multi-agent dispatch) — 3.6B tokens in one month of heavy use at 96% cache hits, delivering at GPT-6 Sol level. Real usage screenshot, before/after comparisons, the full requirements-to-delivery flow, and the E-drive project list it produced."
date: 2026-10-16
tags: ["AIOS", "Qwen", "Pi", "small-model", "tokens", "field-report"]
---

# One Sentence In, One Product Out: A Small Model Burned 3.6 Billion Tokens a Month — AIOS Makes Software Development Something Anyone Can Do

The pitch first: **AIOS exists to do one thing — make software development something anyone can do, as long as they can describe what they want.** "Can code" is no longer the entry ticket; "can state the requirement" is — and stating requirements is a skill humans already have.

The corollary is this post's test subject: you don't need a flagship model — you barely need an expensive one. For the past month I've run Qwen 3.8 Flash (medium thinking effort) as my primary coding model, inside the Pi coding agent, wrapped in one layer of the [AIOS](https://github.com/rexleimo/aios) control plane. This "pony pulling a cart" setup burned **3.628 billion tokens** in a single month at a **96% cache-hit rate**, and shipped a full slate of real projects — from promo-video rendering to parallel multi-agent releases.

My felt experience after a month: **this combo's delivery level already rivals the flagship GPT-6 Sol itself.** One size smaller model, one notch lower cost — and a basic request really is one sentence in, one working result out, with tests and evidence attached.

## Do any of these scenes ring a bell?

- A 40-minute task died at minute 18; you re-explained the whole context in a fresh session and it still got it wrong;
- It says "done" — you open the project and the tests never ran and the feature isn't there;
- The flagship model is brilliant, but its price tag doesn't survive 24/7 usage;
- The small model is cheap and fast, but you dare not hand it anything important — it forgets everything between sessions.

If even one of these hits, what you're missing isn't a bigger model — it's a control plane. Here's the full evidence of how AIOS turned a small model into something worth delegating: screenshots, repos, shipped projects — all checkable.

## The only new skill you need: describing what you want

The historical gate for software was "can write code". AIOS moves the gate: from "can code" to "can describe the requirement" — and the second one you already speak natively. But there's a precondition: **you actually have to describe it clearly.**

AIOS doesn't gamble on you "happening to be clear". It productizes clarity itself:

- **Requirements grilling (`/grill` + ask-first)**: say "build me a download tool" and it won't start typing code — it checks the repo and past decisions first, then asks you exactly one decision question at a time (auth method? storage location?), each question carrying a stated assumption, converging within three rounds — fuzzy want becomes an acceptance-testable spec;
- **Workflow tiering (direct / guarded / planned)**: a one-line fix just happens; a multi-step job gets a plan you can read before anything is built — you always know what it's doing;
- **Evidence gates before "done"**: to say the word "done" it must first pass tests, diffs, screenshots — it cannot bluff you;
- **Cross-session memory**: the requirement you didn't finish describing today is still remembered tomorrow — "continue" actually continues.

The full flow looks like this: you say "I want a YouTube parsing & download tool, frontend/backend split" → AIOS asks back two decision questions → routes to the planned tier → dispatches parallel implementation → delivers with tests and screenshots as evidence. You did exactly two things the whole way: **described the requirement, and answered two questions.**

Every number and every project below is a product of this flow.

## Evidence, not adjectives: what the internal artifacts look like

All three shots below are real files in the repository — check them yourself:

![ADR decision record: settled decisions land in the repo — even "don't follow the upstream rename" has a source](assets/qwen-flash-aios/shot-adr.png)

**ADR decision records**. Requirements clarification doesn't evaporate after the interview: settled decisions are written live into `docs/architecture/adr/` — even a ruling like "keep CONTEXT.md, don't follow the upstream rename" carries the original quote, the date, and the consequence analysis. That's what stops a future session from quietly changing its mind.

![Project memory checkpoints: every milestone pinned, with its verification line right next to it](assets/qwen-flash-aios/shot-memo.png)

**Project memory (`.aios/memo/`)**. Every milestone is pinned as a checkpoint, with "verified: pnpm test all green + typecheck/lint pass" written beside it — this is the machinery behind "continue" actually continuing.

![Real session capture: the model calls aios_memory_write itself, pinning a hard-won lesson into project memory and getting back a memo event ID](assets/qwen-flash-aios/shot-live-memory.png)

**Writing in real time (the shot above, happening live)**. Mid-task, the model judged that "the Dockerfile runtime stage only COPYs allowlisted scripts" was a trap it had fallen into repeatedly — so it called `aios_memory_write` on its own, pinned the lesson into project memory, and got an event ID back at write time. Nobody asked it to remember. **It decided to remember.** That's what a memory system actually looks like in use: not a lookup table, a habit.

![Evidence envelope: sha256 hashes, accepted status, non-regression flag — machine-checkable](assets/qwen-flash-aios/shot-evidence.png)

**Evidence envelopes (`docs/evidence/`)**. Whether work is done is decided by hashes, not by words: baseline/candidate contentSha256, non-regression flags, acceptance status — all machine-recomputable. "Evidence gates before done" isn't rhetoric; it's this kind of JSON.

## The data first, feelings later

![Last 30 days of model usage: 3,627.97M total tokens, 96% cache-hit rate](assets/qwen-flash-aios/token-usage-30d.png)

This screenshot is the raw usage panel, untouched:

- **Total tokens: 3,627.97M** — one month, all of it real daily development, not benchmark farming;
- **96% cache-hit rate** (3,459.56M of 3,604.78M input tokens cached) — context reused to the bone, which is exactly how a small model affords big projects;
- Daily peak of **263.43M tokens** (9/16), with multiple days above 160M — high intensity, long sessions, no gaps.

That 96% wasn't earned by the model. It was earned by the AIOS layer: resident project memory, pull-based context loading, and a token-compression interception layer that crushes repeated injection. The model only has to *think*; the environment makes sure it never has to *ask again*.

## Bare model vs. wrapped in AIOS: same horse, two harnesses

Below is the same class of task under "bare Pi + Qwen 3.8 Flash" versus "Pi + Qwen 3.8 Flash + AIOS", over one month of daily use (personal field observation, not a controlled benchmark — the sample is my own work):

| Dimension | Bare-model workflow | + AIOS control plane | Change |
| --- | --- | --- | --- |
| Cross-session continuation | Re-explain project context every time; often guesses last session's progress wrong | Memory recall + checkpoint recovery — "continue" actually continues | Rework drops sharply |
| Long-task survival | One interruption loses all context; restart from zero | Checkpoint every step; survives even a killed process | Overnight tasks become resumable |
| Task completion rate | Complex multi-step work often "looks done" | Hard evidence gate (tests, diff, screenshots) before anything may claim done | **~40% relative lift** |
| Cost per task | Repeated context injection wastes tokens | 96% cache hits + on-demand context | Effective cost falls clearly |
| Multi-agent collaboration | None | `aios work`: one command for parallel dispatch with a merge gate | From zero to one |

Yes, "~40%" is a marketing number — I own that. But the anchor behind it is aggressive: with this combo, a small model's daily delivery level goes head-to-head with the flagship GPT-6 Sol. Why dare say that? Because of a verifiable mechanism: **a small model's failure modes aren't "can't reason" — they're "forgets, drifts, ships unverified"** — and all three failure classes are precisely what the control plane exists to eliminate. Push the environment's error rate down, and the utilization of the model's raw capability goes up. That's why the same model "feels swapped" inside this stack.

## What this combo actually shipped

Not demos — real, evidence-checkable deliveries. The most direct proof is my `E:/coding` directory: **every project below was written with the Pi + Qwen small-model + AIOS stack**, and each one started as a one-sentence request:

| Project | What it is |
| --- | --- |
| **aios-pro** | A local-first desktop agent harness — an orchestration layer over real workspaces |
| **inkloom.im** | A visual AI creative workflow platform — reproducible image/video pipelines |
| **huabu** | Canvas creation + image & video workbench + re-painting projects and asset management |
| **rex-ai-tools** | A frontend/backend-split video parsing & download tool |
| **discourse-worker / services** | Forum worker plus ingest / user-center / webui microservices |
| **rex-hugo / rex-videos** | Content-site publishing pipeline and an AI video-production skill set |
| **claude-relay-service / vpn-master / hermes-setup / xsapp** | Relay, deployment, installer, and app-grade engineering |

From platform products (inkloom, aios-pro) to creative workbenches (huabu), to content pipelines, forum microservices, and deployment ops — requirements alignment, architecture, coding, testing, deployment, all without ever switching to a big model. That is the real-world version of "one sentence gets the job done": **your sentences got shorter because the environment caught the long tasks.**

Three sample cases with full evidence chains:

**1. The AIOS promo video: scene-by-scene parallel dispatch, 1,355 frames rendered**

We split a Remotion promo video into independent work items per scene, dispatched multiple small-model agents in parallel, froze shared components on the main thread, and gated completion on the real render log. 45 seconds of video, 1,355 frames, 426-second render — not a single "big model" involved.

**2. The multi-client control plane itself**

AIOS now supports ten coding clients — Codex CLI, Claude Code, Gemini CLI, OpenCode, Hermes, Grok, WorkBuddy, **Pi**, ZCode, Qoder. The cross-client adapters, the memory system (memo/ContextDB), the RL training system, and v5.6.0's `aios work` parallel dispatch were all iterated out by small models plus the control plane.

**3. Daily operations automation**

Three Xiaohongshu (RED) accounts on an automated content queue plus browser automation — from 2 hours a day down to 15 minutes ([full write-up](xiaohongshu-automation.md)). Small models execute, humans hold the review gates, and the environment guarantees nothing crosses the line.

## How to run it in Pi

Three steps, everything local — no data leaves your machine:

```bash
# 1. Install AIOS (Windows: one irm line, see README)
curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash

# 2. Initialize in your project root — it detects Pi and installs the native overlay
cd your-project
aios init --all
aios doctor --native --verbose

# 3. Point Pi at Qwen 3.8 Flash (OpenAI-compatible endpoint; see Pi's own docs for config format)
pi   # select/specify qwen3.8-flash, then work normally
```

After that your daily flow is unchanged: talk to Pi normally while AIOS handles memory recall, workflow tiering (direct / guarded / planned), and evidence verification before anything claims done. No habit changes — **the agent is still your agent, the model is still your model; AIOS just completes the environment.**

## Closing thought

After burning 3.6 billion tokens in a month, my biggest takeaway: stop asking "is the small model smart enough" and start asking "does your environment deserve the smartness it already has". Model capability is the multiplicand; the control plane is the multiplier — take the multiplier from 1 to 1.4, keep the same pony as the multiplicand, and you get GPT-6 Sol pacing.

And the real meaning of that layer isn't token savings: **it rewrites who counts as a developer — from "someone who can write code" to "someone who can state a requirement".** Software development is becoming a capability anyone can hold, and AIOS is the machine that exchanges "described clearly" for "delivered".

- Repo: [github.com/rexleimo/aios](https://github.com/rexleimo/aios)
- Docs (EN/ZH/JA/KO): [cli.rexai.top](https://cli.rexai.top/)
- Install takes 30 seconds; one day of use shows the gap.

Install it tonight and let it work while you sleep — tomorrow morning the task is still moving forward, and the results come with evidence attached.

One sentence in, one delivery out — that's small models plus a control plane at full strength.

---

*Data note: the usage screenshot is the raw personal panel. Percentage lifts in the comparison table are subjective engineering observations from one month of heavy daily use — trend indicators, not academic benchmarks. Reproduce them on your own tasks.*
