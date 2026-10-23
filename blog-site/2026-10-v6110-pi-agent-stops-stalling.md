---
title: "v6.11.0: The Pi Agent Stops Stalling — Three Measured Stall Classes Fixed, and the Safety Gate Learns What a Target Is"
description: "v6.11.0 fixes three empirically measured classes of Pi agent stalls found in 226 local sessions (60,673 turns): gate blocks that terminated the whole run, an unbounded 120s before_agent_start wait, and HTTP 400 hard-stops from undeclared developer-role compat. It also rewrites the recursive-delete gate from word-shape matching to target judgement: 114 historical blocks collapse to 4 true positives with zero adversarial loss. Doctor reports compat gaps, init --pi-compat-self-heal repairs them with explicit consent, and every slice ships with RED/GREEN receipts plus a standards-and-spec review."
date: 2026-10-23
tags: ["AIOS", "v6.11.0", "pi", "safety-gate", "stall", "release"]
---

# v6.11.0: The Pi Agent Stops Stalling — Three Measured Stall Classes Fixed, and the Safety Gate Learns What a Target Is

> **TL;DR:** We read 226 Pi sessions (60,673 assistant turns) on one machine and sorted every stop
> by evidence. Three stall classes were AIOS's own fault: (1) a blocked bash call set
> `terminate: true`, ending the whole run in 99 of 135 blocked turns — the agent needed a human
> re-prompt to continue; (2) `runAios` awaited every `before_agent_start` with a 120s ceiling, so
> one wedged child process froze every turn start for up to two minutes; (3) reasoning relays
> that reject the `developer` role died with HTTP 400, which Pi classifies non-retryable. All
> three are fixed, each with receipts. Separately, the recursive-delete gate matched the *words*
> `rm -rf` and was wrong ~98% of the time (112 of 114 historical blocks hit scratch cleanups and
> test fixtures); it now judges the *target*. 42,282 recorded calls: 114 blocks become 4, all
> true positives, with 37/37 adversarial destructive shapes still blocked.

## What the sessions actually said

| signal | measurement | verdict |
|---|---|---|
| stop reasons | `toolUse: 57412, stop: 2261, aborted: 137, error: 803, length: 22` | — |
| gate blocks ending the run | 99 of 135 blocked turns set `terminate: true` | **our bug (A2)** |
| `runAios` ceiling | normal digest 0.57s; wedged CLI held every turn start up to 120s | **our bug (A3)** |
| relay `developer`-role rejection → HTTP 400 | non-retryable hard stop, no pre-warning | **our bug (A4)** |
| `rm -rf` word blocks | 114 of 41,923 calls; 2 pointed at a real user/system path | **our bug (gate)** |
| `This operation was aborted` × 55 | all at 0s latency | user pressed Esc — not a stall, untouched |
| compaction > 60s × 170, bash > 300s × 292 | Pi/provider behavior | out of scope, untouched |

The discipline held throughout: `retry.*`, `httpIdleTimeoutMs`, compaction, quotas, and the
long-command rules were explicitly *not* touched — the Esc-abort evidence (0s round trips)
proved they were never the timeout problem.

## Fix one: a block is a report, not a stop sign (A2)

Pi treats `terminate: true` on a finalized tool result as "skip the automatic follow-up"
(pi docs/extensions.md:253). The bash branch of the gate set it, so a blocked command ended
the run and the user had to re-prompt. Blocked bash/powershell verdicts now return
`{ block: true, reason, terminate: false }` — same prohibition, but the model gets the reason
*and the way out* and continues working.

## Fix two: the start hook gets a ceiling (A3)

`runAios`'s `execFile` timeout goes from 120000ms to 8000ms with a comment recording why:
`before_agent_start` awaits it on *every* turn. Normal memo search is ~0.57s end to end, so
8s never fires in a healthy run (14× headroom) and only cuts the wedged case. The timeout's
error shape is pinned as characterization (`AiosCliError`, exit code 1, stderr preserved),
including a live-hung-child scenario that proves the kill actually fires.

## Fix three: compat gaps are reported, then repaired with consent (A4)

Pi sends the `developer` role for reasoning models when `compat.supportsDeveloperRole` is
undeclared-or-true; relays that reject it answer 400 and the turn dies. `aios doctor` now
reports exactly which `models.json` entries are at risk (one predicate owner,
`findDeveloperRoleGaps`, shared by reporter and repair so they cannot drift). The writer is
additive and consent-gated: it never creates a missing `models.json`, never rewrites an
explicit user `true`, fails closed on malformed JSON — and it only runs via
`aios init --pi-compat-self-heal`. Without the flag, init stays read-only and prints the
repair command.

## Fix four: the gate judges targets, not words

The old rule blocked the text shape `rm -rf`. Over the corpus that meant blocking sandbox
disposal the repo's own hygiene rules *require*, build-directory cleanup, and strings inside
test fixtures — while teaching the agent to route around the gate. The new
`danger-targets.mjs` walks command positions (quoting, heredoc, redirect, and `#`-comment
aware), resolves same-line variable assignments, understands `find -delete`,
`find … -exec`, `xargs`, and shell-interpreter inline scripts — then classifies the target:
relative subdirectories, volatile temp space, and regenerable build content pass; roots,
home, system, device, credential, and unboundable paths stay blocked, with a reason that
states the allowed alternative.

The rewrite caught four genuine leaks *in itself* during development (a `..` escape, a
Windows backslash tokenization defect, an early quote close, a segment skip after `;`) —
each fixed and pinned with a regression test, which is why the replacement is safer than
the rule it replaced, not just less annoying. Adversarial list: 37/37 destructive shapes
blocked, 12/12 benign shapes allowed.

## Evidence

- `node --test` on the gate surface: **29/29**; wiring gate 6/6.
- `npm run test:affected`: **2347 pass, 0 fail**; `npm run test:scripts` (CI suite): green.
- Corpus re-scan with the shipped gate: **42,282 calls → 4 blocks**, each judged a true
  positive (shared public dir, Downloads/agent-tree cleanup, a literal `rm -rf /dev/null`
  that would delete the device node, one off-tree absolute build path the old gate also
  blocked).
- Every slice carries RED/GREEN receipts and a standards-and-spec review under
  `docs/reviews/` (A2/A3, work-1…work-4, gate rewrite) — no fabricated REDs; the timeout
  slice is recorded as the characterization it is.
- Merge door: two-way. Pi-extension-only files; installed copies keep enforcing the old gate
  until the user updates, so nothing changes behavior at merge time.
