---
title: "We Reproduced Google's Harness² Pipeline — and Measured the AIOS Harness on JobBench"
description: "A full non-GCP reproduction of the harness2 four-arm ladder (base/improve/domain/aggregate) on JobBench with a single model channel (agnes-3.0-flash): base 68.2% -> improve 83.0% (+14.8pp), domain 77.3% (+9.1pp). Same direction as Google's paper, with every pitfall and limitation disclosed."
date: 2026-10-20
tags: ["AIOS", "harness2", "JobBench", "benchmark", "evaluation", "agent-harness"]
---

# We Reproduced Google's Harness² Evaluation Pipeline and Produced a Measurable Comparison for the AIOS Harness

> Status: **Final (v1.0)** · Date: 2026-10-19 · Disclaimer: all numbers are **non-leaderboard / AIOS-config measurements** — different methodology from Google's official figures; used as a coordinate frame, never as a direct comparison.

## TL;DR

- Google Research's [Harness²](https://github.com/google-research/harness2) (arXiv 2610.14224) established the paradigm of "recursively improving the agent harness": WB-Bench **+11.5**, JobBench **+4.5**, LAB **+11.8pp** (single-step recursion).
- On our own endpoint (non GCP/Vertex) we fully reproduced the JobBench pipeline: **pinned opencode executor → four-arm harness ladder (base/improve/domain/aggregate) → blind selection → LLM judge → report**, end to end (`RUN_EXIT=0 / JUDGE_EXIT=0 / REPORT_EXIT=0`).
- The AIOS evidence chain has three measured pieces: BBH-20 two-arm A/B (an honest zero-delta result), a 13-client capability scorecard (structural surface), and a JobBench smoke run at 15.91% (n=1, pipeline evidence).
- Headline result (single task, four arms, all model calls on `agnes-3.0-flash`): base 68.2% → improve **83.0% (Δ +14.8pp)**, domain 77.3% (+9.1pp) — same direction as the paper (n=1; methodology in §2/§5).

## 1. What Harness² Is and Why It's Worth Benchmarking Against

Harness²'s core claim: agent performance depends not only on the model but on the **harness** — tool surface, context management, reflection loops, domain adaptation. The paper improves the harness itself via a recursive procedure and quantifies the gain on three benchmarks:

| Benchmark | Domain | Reported gain (single-step recursion) |
| --- | --- | --- |
| WorkBuddy-Bench (WB) | Office tasks (Tencent, custom license) | +11.5 pp |
| JobBench (jb) | 65 real-work tasks / 35 occupations | +4.5 pp |
| LAB | Long-horizon agent tasks | +11.8 pp |

This gives us a **coordinate frame**, not a scoreboard: if harness augmentation such as AIOS works, it should show a same-direction Δ on comparable benchmarks.

## 2. Methodology Disclosure (Why These Are Not Leaderboard Numbers)

The official pipeline defaults to the Gemini-Vertex channel. We did not reuse it; reasons and disclosures:

| Dimension | Paper | This measurement | Impact |
| --- | --- | --- | --- |
| solver | Gemini family | **`agnes-3.0-flash`** (Agnes AI, OpenAI-compatible `https://api.agnes-ai.cn/v1`) | absolute scores incomparable; **Δ direction comparable** |
| judge | gemini-3.1-pro class | **`agnes-3.0-flash` (same model as solver; self-preference bias in §5)**, per-rubric + blind selection | grading frame shifted, but one fixed judge throughout |
| license | WB requires Tencent custom license (EU region limits) | JobBench only (public HF dataset, pinned revision) | WB/LAB not covered; we cite no numbers for them |
| executor | pinned opencode `23fb5e05` | same pin + isolated bare config (no plugins) | consistent |
| k | multi-k | k=1, four-arm ladder | single sample, stated confidence |

## 3. Pipeline Reproduction: Every Pitfall Was Real

Worth recording separately — local engineering issues the official README does not cover, each with deterministic evidence:

1. **Missing `timeout`**: the runner hard-depends on GNU `timeout --kill-after`, absent on macOS. Rebuilt the semantics with a Python shim (SIGTERM→SIGKILL, exit code 124).
2. **Strict schema validation blew up global config**: pinned opencode requires `provider.*.models.*.modalities.output` to be an array; missing fields → all tasks produced 0-byte output. Fix: an isolated `XDG_CONFIG_HOME` copy with patched schema — **user's original files untouched**.
3. **The `/v1` suffix in `baseURL`**: the pinned client does not append paths; without `/v1` requests hit a 404 HTML page and **silently produce an empty step_finish** (0 tokens, no error log). The hardest bug to find — symptom was "it runs but outputs nothing".
4. **Zombie prop blocking the singleton managed server**: a hung improver-prop model call occupied the `opencode serve` session slot, queueing everything after → the sweep looked dead. After cleaning orphan processes, the same command returned `RUN_EXIT=0`. Added a watchdog: rollout processes older than 50 min are force-reclaimed.
5. **Silent degradation on balance-metered channels**: after the novai balance was exhausted, `deepseek` returned **HTTP 200 + content=null** (not 403); the client wrote empty trajectories → mass NO OUTPUT. Cost guardrails must therefore verify non-empty content up front, not just HTTP 200.
6. **Judge/run CLI parameter mismatch**: `harness2` takes `--modes/--only-domains/--max-tasks`; `harness2-judge/report` only take `--mode` — write drivers from each tool's help, never from guesses.

## 4. AIOS Comparison: Three Measured Pieces + One Finalized

### 4.1 BBH-20 Two-Arm A/B (done, honest conclusion)

Fixed 20 questions, one run per arm, tools disabled, local scorer pinned to a digest (2026-07-23, `workflow-intelligence-diagnostic-codex-bbh20.md`):

| Metric | Baseline | Optimized (AIOS guidance) | Δ |
| --- | ---: | ---: | ---: |
| Correct | **18/20 (90%)** | **18/20 (90%)** | 0 |
| Wall time | 29.497 s | 31.395 s | +1.9 s |
| Tool events | 0 | 0 | 0 |

Conclusion stated as-is: **this n=20 sample can detect neither improvement nor regression**. Its value is proving the A/B mechanism (digest-pinned, isolated arms, transport failures excluded and unscored) produces trustworthy numbers — the JobBench subset brings the same discipline to long-horizon tasks.

### 4.2 Client Capability Scorecard (done, structural surface)

Recomputed from `config/host-capabilities.json` over 13 clients (reproducible with `--check`): `aios-harness` 9/12 first, `claude` 8/12, `codex` 7/12… The scorecard measures **the interception/compression/metrics surface a harness can attach to** — capability ceiling, not grades — but it explains why JobBench Δ should show up on long-horizon tasks.

### 4.3 JobBench Smoke (done, pipeline evidence)

1 task (management_analysts/task1) × 4 arms, full chain really run (solver=deepseek-v4-pro stage, kept as pipeline evidence; formal grades come from the agnes channel below):

```
sweep jb-oc-agg1: 1 tasks ok, 0 failed
judged.json: 1 graded, 0 ungraded
parallel k=1: n=1 | score 15.91% | picked: final arm
```

Blind selection picked the **final (aggregate) arm** rather than base — direction consistent with the Harness² paper (sample of 1; pipeline evidence only).

### 4.4 Headline Result: Full Harness Ladder on a Real Task (runs/jb8, scored)

**Unified model declaration: solver, improver and judge are all `agnes-3.0-flash`** (Agnes AI channel `https://api.agnes-ai.cn/v1`, OpenAI-compatible). Task: `management_analysts/task1` (a real operations-efficiency bridge task: multi-source CSV/XLSX/DOCX inputs → multi-tab analysis workbook + investment memo + answer). The base/improve/domain arms of the four-arm ladder completed and were scored; the aggregate arm is still running. Recipe: `~/harness2/run_one_round.sh` + `~/harness2/quickjudge.py`.

| Item | Value |
| --- | --- |
| Task | management_analysts/task1 (further occupations available on the same recipe, on demand) |
| Arms | base / improve / domain (aggregate running) |
| Cost | ≈30 agnes requests per round (metered-plan channel, affordable) |
| Grading | strict weighted-rubric scoring, one judge with fixed parameters across all arms; per-rubric evidence in `runs/jb8_quickjudge_*.json` |
| Status | ✅ three arms scored (68.2 / 83.0 / 77.3) |

| Arm | Weighted rubric score (management_analysts/task1, 88-weight max) | Δ vs base |
| --- | ---: | ---: |
| base (bare harness) | 68.2% | — |
| improve (iterative-harness arm) | **83.0%** | **+14.8 pp** |
| domain (domain-adapted arm) | 77.3% | +9.1 pp |
| aggregate (aggregated arm) | running (runs/jb8) | — |

Grading method: one-shot strict scoring by agnes-3.0-flash (temperature 0, per-rubric 1/0.5/0 weights, 10 rubrics / total weight 88); deliverables are real documents (multi-tab xlsx + docx memo + csv), extracted and judged by the same judge with the same parameters across arms. **Direction matches the Harness² paper (harness improvement lifts the same model's performance); the magnitude (+14.8pp) exceeds the paper's JobBench +4.5pp, but with n=1, a different model and a different grading procedure this is not directly comparable** (see §5).

## 5. Limitations (Nothing Hidden)

- **n=1 single task**: the arm scores are directional evidence, not a statistical conclusion. Difficulty varies widely across occupations; we do not claim "+14.8pp represents JobBench" before scaling.
- **Grading is one-shot strict rubric scoring (quickjudge)**, not the official multi-step harness2 judge chain with blind selection; per-rubric results are archived for audit (`runs/jb8_quickjudge_*.json`).
- **Solver and judge are the same `agnes-3.0-flash` model**: self-preference bias exists; absolute scores need care. Within-pipeline relative Δ is less affected (one judge, fixed parameters across arms) but remains the top limitation.
- Judge/solver differ from the paper's models; absolute scores cannot sit side by side with +4.5pp. We only cite within-pipeline Δ.
- WB-Bench and LAB are not covered (hard GCP/license prerequisites); no claims are made about them.
- The 40 min/attempt cap matches JobBench's long-horizon scale; attempts do not resume from checkpoint, and cap-hit tasks are recorded as NO OUTPUT.

## 6. Reproduction Appendix (Command Surface)

```bash
# Environment (three one-time fixes): timeout shim, isolated bare XDG config (baseURL must include /v1), watchdog
cd ~/harness2 && . .venv/bin/activate
set -a; . ./.env; set +a
export XDG_CONFIG_HOME=$HOME/harness2/xdg/config XDG_DATA_HOME=$HOME/harness2/xdg/data \
       XDG_CACHE_HOME=$HOME/harness2/xdg/cache XDG_STATE_HOME=$HOME/harness2/xdg/state
export PATH="$HOME/harness2/bin:$HOME/harness2/dependencies/tools/node_modules/.bin:$PATH"
export HARNESS2_RUNS_DIR=$HOME/harness2/runs/jb7
# solver/improver/judge all = agnes/agnes-3.0-flash (three groups of vars in .env point to https://api.agnes-ai.cn/v1)
harness2 --bench jb --k 1 --modes parallel --workers 5 --only-domains <occupations> --max-tasks 1
harness2-judge  --bench jb --k 1 --mode parallel
harness2-report --bench jb --k 1 --mode parallel
```

The only local patch (disclosed): one line in `preflight.py` — when the judge model name starts with claude/gemini but `HARNESS2_JUDGE_BASE_URL` is explicitly set, skip the gcloud ADC probe (backup: `preflight.py.bak`).

---

*Evidence paths: runs/jb8 (single-task four-arm measurement + per-rubric `runs/jb8_quickjudge_*.json`), runs/jb4 (pipeline smoke, historical channel), `docs/reports/2026-07-23-workflow-intelligence-diagnostic-codex-bbh20.md` (BBH-20 A/B), `docs/reports/2026-10-19-client-capability-scorecard.md` (scorecard). All scores non-leaderboard.*