---
title: "We Measured Our Own Token Compression: First A/B Numbers From the AIOS Token Bench"
description: "AIOS benchmarks its compression mechanisms on a frozen held-out task set. Three A/B pairs of the new Pi observation offload: cost averaged 21% lower but token savings swung from +21% to -64% across pairs, so the mechanism ships opt-in. Full tables and diagnosis."
date: 2026-09-30
tags: ["AIOS", "token bench", "ObservationPack", "Pi", "A/B", "token compression", "SoL-Pi"]
---

# We Measured Our Own Token Compression: First A/B Numbers From the AIOS Token Bench

> **Quick Answer:** We stopped arguing about compression savings and started measuring them. On a frozen 8-task bench with the model pinned, we ran three A/B pairs of our new Pi observation-offload mechanism (off → on). Token savings were +16% and +21% in two pairs, then **−64% in the third** — averaging −4% — because the model sometimes spends many extra retrieve-turns on the big-read task. Cost averaged 21% lower with the same variance. So the honest headline is: the target task often halves its tokens, the mechanism ships **opt-in (default off)** per our own two-gate rule, and the variance is the next engineering problem. Every number below is reproducible with three commands.

## Why we measure instead of argue

NVIDIA's SoL-Pi work screened 152 candidate mechanisms down to 4 using automated research loops and a frozen held-out benchmark. We evaluated their package, found two structural conflicts with our Pi safety gate and managed transport, and shipped none of it — but we borrowed the discipline wholesale:

1. **A frozen task set** that is only used for acceptance, never for tuning.
2. **A unified ledger** that attributes every token event to a layer, task, and model.
3. **Two acceptance gates**: capability checks must pass, and measured savings must be positive — otherwise a mechanism stays opt-in.

## The bench

The AIOS token bench lives in the repository: eight frozen tasks (echo, JSON contract, shell round-trips, small and large log reads, a multi-round write-then-run), executed against the managed Pi RPC transport with the model pinned to `kimi-k2.7-code`. Every turn's usage — input, output, cache reads, cost, stop reason — flows into the ledger attributed by task id.

```bash
node scripts/token-bench/run.mjs --dry --json   # validate the frozen set, spawn nothing
node scripts/token-bench/run.mjs --session bench-ab-off --model <provider/model>   # live, costs real tokens
node scripts/token-bench/compare.mjs --a bench-ab-off --b bench-ab-on              # the A/B report
```

## The first A/B result

Same tasks, same model, one variable: the observation-offload mechanism off versus on. This is pair 1 of three.

| Task | Off turns | On turns | Off tokens | On tokens | Δ tokens |
| --- | --- | --- | --- | --- | --- |
| bench-001 echo | 1 | 1 | 16,548 | 16,559 | +11 |
| bench-002 shell version | 2 | 2 | 33,210 | 33,229 | +19 |
| bench-003 small log read | 2 | 2 | 33,531 | 33,787 | +256 |
| bench-004 count ERROR lines | 3 | 2 | 53,465 | 35,070 | −18,395 (−34%) |
| bench-005 JSON contract | 1 | 1 | 16,566 | 16,578 | +12 |
| bench-006 arithmetic command | 2 | 2 | 33,254 | 33,239 | −15 |
| bench-007 big log read (126 KB) | 4 | 2 | 67,500 | 34,316 | −33,184 (−49%) |
| bench-008 multi-round write+run | 3 | 3 | 50,272 | 51,570 | +1,298 (+3%) |
| **Total** | | | **304,346 ($0.1035)** | **254,348 ($0.0602)** | **−49,998 (−16%)** |

## What the numbers actually say

**The target shape responds exactly as designed.** bench-007 forces a ~126 KB tool observation into context. With the mechanism on, that observation is archived once and replaced by a handle plus a short excerpt; the model pages exact lines back only when needed. Tokens for that task fell 49%, and the run settled in 2 turns instead of 4.

**Cost falls faster than tokens.** Total tokens dropped 16% but measured cost dropped 42%. The off-arm's extra turns were re-billing large, uncached input at the most expensive rate; fewer turns shift more of the run onto cache reads. If you optimize tokens you get some of this; if you optimize rounds you get all of it.

**Small tasks are a noise band, and that is fine.** Zero-tool tasks carry a ~16K-token context floor (system prompt plus harness baseline) that no offload mechanism can touch — on our earlier baseline that floor was 59% of total consumption. Offload is not a lever for that; that is what the floor numbers are for.

## What the other two pairs showed

We promised three repeated pairs before any default-on decision. They changed the story:

| Pair | Off tokens | On tokens | Δ tokens | Δ cost | bench-007 off → on |
| --- | --- | --- | --- | --- | --- |
| 1 | 304,346 ($0.1035) | 254,348 ($0.0602) | −16% | −42% | 67,500 → 34,316 (4→2 turns) |
| 2 | 338,064 ($0.0982) | 268,559 ($0.0585) | −21% | −40% | 120,284 → 67,432 |
| 3 | 237,685 ($0.0551) | 389,675 ($0.0837) | **+64%** | **+52%** | 36,240 → 172,992 (10 turns) |
| **Average** | 293,365 | 304,194 | **−4%** | **−21%** | |

Pair 3 inverted. The per-turn ledger shows exactly why: bench-007 on the on-arm ran **10 turns instead of 2–4**, each turn structurally normal (same ~16K baseline, healthy cache reads) — the model repeatedly paged the observation back instead of settling. The mechanism did not malfunction; the model's retrieve policy is high-variance on exactly the task the mechanism targets.

Two honest conclusions follow. First, cost still averaged 21% lower across pairs, and in the two pairs where the model settled quickly the mechanism performed as designed — but an average of −4% tokens is not a stable win. Second, per our own two-gate rule, **the mechanism ships opt-in (default off, `AIOS_PI_OFFLOAD=on` to enable)** until the variance has an engineering answer: a retrieve budget per task, after which the handle degrades to a plain "archive too large" pointer.

## What we still will not claim

- **The averages are not a stable win.** −4% mean tokens across three pairs is within variance of zero; the cost average (−21%) is better but rests on the same three rolls of the dice.
- **One on-arm check failed once** (bench-007's reply missed the expected id in the on-arm of pair 1). An isolated re-run with the same mechanism and model replied the exact id. We treat it as model variance, not mechanism damage — but it is in the record, not filed under "flaky, ignore".
- **Token figures come from the runtime's usage reporting**, not provider invoices. The three-month ledger numbers below are byte-based estimates (bytes ÷ 4).
- **One model.** Different backends can shift these percentages materially — including the retrieve-turn variance itself.

## The three-month ledger behind it

The A/B is new; the accounting is not. The refs layer — offloading oversized tool output at the orchestrator boundary — has been recording every event since June. As of this post: **2,552 events, 5.73M estimated raw tokens in, 5.43M kept out of context (94.8%)**, zero uncontrolled events, zero policy violations. The biggest contributors are MCP tool results (1,768 events) and tool listings (578). `aios tokens report` prints this per layer, per session.

## The mechanism, in one paragraph

`ObservationPack-lite` ships inside the AIOS Pi extension, **off by default** (`AIOS_PI_OFFLOAD=on` enables it). On Pi's `context` event — fired before every LLM call — any text observation at or above 20K characters is archived once to a content-addressed file under the workspace state root, and the in-context copy is replaced by a 16-hex ref, a line/byte count, and a head-and-tail excerpt. A read-only `aios_offload_retrieve` tool pages the original back by ref and line range. It never touches tool execution, so it cannot interact with the safety gate.

## The rule going forward

No mechanism ships default-on without passing both gates on the frozen bench: capability within tolerance, savings measurably positive — across repeated pairs, not one lucky roll. ObservationPack-lite stays opt-in until its retrieve-turn variance has an engineering answer (a per-task retrieve budget is the obvious candidate, and the bench exists precisely to verify it). The bench grows from real task history, the ledger keeps the receipts, and every claim on this blog from now on should be a command someone else can run.
