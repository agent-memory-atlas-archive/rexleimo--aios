---
title: "We Made the Same AI Model Do the Same Job Four Times"
description: "We reproduced Google's Harness² evaluation on our own machine. Same model, same real work task, four different working setups: the score went from 68.2% to 83.0%. The model never changed — only its desk did."
date: 2026-10-20
tags: ["AIOS", "harness2", "JobBench", "agent-harness", "evaluation"]
---

# We Made the Same AI Model Do the Same Job Four Times

> **Quick answer:** Google's [Harness²](https://github.com/google-research/harness2) paper says an AI agent's score depends less on the model and more on the *harness* around it — the tools, the notes, the feedback loop. We reproduced their evaluation pipeline on our own machine, ran one real work task four times with the same model in four different harnesses, and watched the score climb from 68.2% to 83.0%.

## The idea in one paragraph

The model is the employee. The harness is the desk: what tools it has, how its context is organized, whether it gets a review loop, whether someone wrote down the domain tricks it would otherwise have to rediscover. Google's claim is that you can raise performance substantially by upgrading the desk instead of hiring a smarter employee — and they measured it on JobBench, 65 tasks pulled from 35 real occupations. Not riddles. Actual deliverables an analyst would produce on a Tuesday.

Their reported number on JobBench: **+4.5 points**. We wanted our own.

## The test

One task from JobBench: *operations analysis for a fictional manufacturer*. Inputs are five real files — customer complaint logs, plant spreadsheets, a VP's memo. The deliverable: a multi-tab analysis workbook plus an investment memo. Human budget on this task is about two hours.

The same small model — `agnes-3.0-flash` — did this job under four different harnesses:

1. **Base.** Just the task and the files. A competent employee with a blank desk.
2. **Improve.** After a first attempt, the harness looks at what went wrong and rewrites its own instructions. A desk with a review process.
3. **Domain.** The harness is stuffed with analysis tricks for this kind of task. A desk with a domain expert's sticky notes.
4. **Aggregate.** Combine the two improved desks and see if they compound.

Every model call — worker, harness-improver, and judge — used the same `agnes-3.0-flash`, and the judge scored all four deliverables with the same rubric at temperature 0. Absolute scores don't travel; the *difference between the four arms* is what we're measuring, because the only variable was the desk.

## The result

| Harness | Rubric score | vs base |
| --- | ---: | ---: |
| Base — blank desk | 68.2% | — |
| Domain — expert sticky notes | 77.3% | +9.1 |
| **Improve — self-rewritten process** | **83.0%** | **+14.8** |

Two things we found interesting:

- **The review loop beat the knowledge.** Giving the model a better *process* (fail, look at the failure, rewrite the instructions) gained triple what stuffing in domain knowledge did — and triple what Google's paper averaged. That's directionally exactly what Harness² argues, and we got a louder version of it.
- **A cheap model was never the bottleneck.** A flash-tier model went from mediocre to good on the same task purely by harness changes. If your agent is failing at long real-world tasks, suspect the desk before replacing the worker.

## What we're NOT claiming

Straight talk, because this is where benchmark posts usually cheat:

- **n = 1.** One task. The direction is real; the magnitude will move when we scale to more tasks.
- **The judge is the same model as the worker.** Self-preference bias exists. The four arms share one judge with identical parameters, which dampens it, but it's the first limitation in the technical writeup.
- **Our +14.8 vs their +4.5 are not comparable.** Different model, different judge, different grading procedure. We cite the direction, never the magnitudes side by side.
- This is a non-leaderboard, AIOS-configured measurement. We ran zero numbers on Google's official leaderboard and we don't present ours as leaderboard figures.

## Three bugs that nearly sank it

The pipeline itself is a good story for anyone reproducing papers locally:

- The pinned client silently requested a 404 page because our `baseURL` lacked a trailing `/v1`. Zero output, zero errors. It runs, it just... isn't.
- One hung model call occupied the agent server's only session slot. Everything behind it queued, and the whole sweep looked dead.
- When our metered channel ran out of balance, it answered with **HTTP 200 and a null body** instead of a 403 — so "the request succeeded" told us nothing. Now every probe asserts non-empty content before any budget is committed.

The full technical reproduction — pipeline, parameters, per-rubric evidence, the one-line patch we had to make — lives in [`docs/reports/2026-10-19-harness2-jobbench-aios-comparison-article.md`](https://github.com/rexleimo/aios/blob/main/docs/reports/2026-10-19-harness2-jobbench-aios-comparison-article.md), with the raw grading JSON under `runs/jb8_quickjudge_*.json`.

**Takeaway: your agent probably has a bad desk, not a bad brain. Fix the desk and measure — it's cheaper than the alternative, and this time, the number was real.**
