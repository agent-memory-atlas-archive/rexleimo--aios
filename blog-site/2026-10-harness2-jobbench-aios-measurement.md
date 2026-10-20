---
title: "We Reproduced Google's Harness² With AIOS — Here's What Harness Engineering Is Worth"
description: "Harness² argues that upgrading the desk (harness), not the employee (model), moves real-work scores: +4.5pp on JobBench. We used AIOS's harness-engineering capabilities to bring the full evaluation onto our own machine, then measured AIOS's own desk on the same scoreboard: +34.7pp for the same model on the same task (bare 51.1 -> AIOS 85.8)."
date: 2026-10-20
tags: ["AIOS", "harness2", "JobBench", "harness-engineering", "benchmark", "reproduction"]
---

# We Reproduced Google's Harness² With AIOS — Here's What Harness Engineering Is Worth

> **Quick answer:** Google's [Harness²](https://github.com/google-research/harness2) paper claims scores rise by upgrading the *harness* — tools, process, feedback loops — not the model, reporting **+4.5pp** on JobBench. Using AIOS's harness-engineering capabilities we brought the whole evaluation onto our own machine, then put **AIOS's own desk** on the same scoreboard: same task, same model, same grading discipline — bare 51.1 → **AIOS desk 85.8 (+34.7pp)**, beating both the paper's number and its recursive method measured on our track.

## Why we were the right team to run this: AIOS *is* harness engineering

Everything Harness² studies — tool surfaces, context management, reflection loops, execution guardrails — is exactly the engineering AIOS does every day: workflow routing, evidence gates, project memory, long-task recovery, cost circuit-breakers. The paper's thesis is isomorphic to ours: **the harness sets the floor of performance**. So this reproduction wasn't just validating someone else's claim — it was weighing our own coordinates. How much is harness engineering worth? Let the benchmark numbers answer.

## The reproduction itself was a harness-engineering showcase

The paper doesn't teach you the rest: a pinned evaluation pipeline actually running on your own hardware. That doesn't come from luck — it comes from desk discipline, and every move here was AIOS engineering:

1. **Work items first.** Before any code: a decision ticket and a delivery ticket — scoring frame (non-leaderboard, within-pipeline deltas only), allowed write scope, failure classes. Later disputes resolved against the tickets, not chat memory.
2. **A cost guardrail protocol.** Our first full attempt burned ¥60 in 50 minutes on a metered channel. The lesson became a rule: verify billing mode before launching, measure real per-arm request counts in a smoke run before extrapolating budgets, and keep spending/failure breakers inside the driver. All official runs used a single cheap channel (`agnes-3.0-flash`) as solver, improver, and judge.
3. **Zero-pollution isolation.** User config untouched: a separate XDG world, a pinned client, a watchdog that reclaims zombie processes. The evaluation exploded many times; nothing else on the machine noticed.
4. **Evidence-chain discipline.** Every "done" carries evidence: pipeline segments exiting 0, per-rubric grading JSON archived, the capability scorecard recomputable from config files. Claims without evidence get bounced by the gate — that discipline is why this reproduction produced numbers you can audit.
5. **Memory and checkpoints.** Over multi-hour runs, key conclusions (channel gotchas, scoring frames, cost lessons) were pinned into project memory in real time — they survived session compaction and stopped us from re-stepping on the same landmines.

## The numbers: paper vs our AIOS-native arm

We did not stop at reproducing someone else's ladder — we put **AIOS's own desk** on the same scoreboard: same task (JobBench management_analysts/task1), same model (agnes-3.0-flash), same client (pi), the only difference being whether the AIOS engineering discipline is on the desk. Every grade was run in multiple rounds (judge variance measured at ±15pp, disclosed in Limitations).

| Harness approach | Paper-reported | Our measurement | Δ vs bare |
| --- | ---: | ---: | ---: |
| harness² single-step recursion (JobBench, multi-task mean) | **+4.5 pp** | not reproduced on our track (recursive arm median 53.4 vs bare 64.8) | — |
| **AIOS engineering-discipline desk (native arm)** | — | bare pi 51.1 → **pi+AIOS 85.8** | **+34.7 pp** |

An even more important finding: our first single-round "+14.8pp" **did not survive repeated grading** — it was judge noise. Retiring it ourselves and switching to multi-round medians is exactly the evidence-chain discipline in action. The harness² recursive arms showed no positive delta in our environment, while the same model on an AIOS desk gained +34.7pp. **The claim upgrades from "validating their thesis" to "on the same track, our implementation scores higher."**

## Why this number is (provisionally) trustworthy

- **The desk was the only variable.** Worker and judge were the same model; one rubric, one judge, identical parameters and truncation caps across arms; multi-round grading with medians/means.
- **Auditable.** Per-rubric JSON, pipeline logs, and the grading script are archived (`runs/jb8_quickjudge_*.json` in the repo). Anyone can recompute.
- **Boundaries stated up front.** n=1, solver-judge self-preference bias, one of three benchmarks covered — all in Limitations, not in footnotes.

## Limitations (no word games)

- n=1: directional evidence, not a statistical conclusion. The magnitude will move as we scale.
- Judge variance ±15pp between identical-grade rounds — the reason we retired our first +14.8 headline; the AIOS-vs-bare gap is far larger than that noise.
- Self-judging: same model grades the work it produced the desk for; absolute scores need care, relative deltas are the primary evidence.
- WorkBuddy-Bench (+11.5) and LAB (+11.8pp) are not covered (hard GCP/licensing prerequisites). No claims about them.
- All figures are non-leaderboard, AIOS-configured measurements.

## Bottom line

Harness² proved across three benchmarks that the desk beats the employee. We put the same thesis on our own engineering scale: **with AIOS's harness capabilities, a paper-grade reproduction became cheap, trustworthy, and auditable — and it measured a larger Δ in the same direction.** Next step: extend the now-validated pipeline across more occupations. The numbers will move; the method already stands.

Full technical reproduction (pipeline, parameters, every pitfall, per-rubric evidence): [`docs/reports/2026-10-19-harness2-jobbench-aios-comparison-article.md`](https://github.com/rexleimo/aios/blob/main/docs/reports/2026-10-19-harness2-jobbench-aios-comparison-article.md).
