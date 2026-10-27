---
title: "v6.14.0: A Lifecycle Hook That Never Returns Is Not a Failure — It's a Stall"
description: "v6.14.0 puts a budget on lifecycle-hook waits and gives the runtime a word for what was previously invisible. `invokeLifecycleHook` was an unbounded await: one subscriber that never resolves hangs the whole run, and the journal shows only a `started` event — no error, no completion, just silence, so \"is this task stuck?\" stayed a human judgment with no runtime fact behind it. Waits now resolve to four verdicts — ok | cancelled | timed-out | failed — instead of the old ok | error, which collapsed a hook that broke, a hook someone cancelled, and a hook that outlived its budget into one token. Only `failed` counts as a run failure, only `timed-out` counts as a stall, and a cancel counts as neither, so one slow subscriber can no longer push a healthy run into backoff. The release also deletes a line that guessed: `failureClass: consecutiveInfraFailures > 0 ? 'runtime-error' : 'no-progress'` reassigned a run's real reason (tool-error, safety-gate) to a label the model never reported — on the exact field recovery reads. Default budgets sit one to two orders of magnitude above typical hook cost, because a guard introduced for the first time should under-react rather than invent failures, and `AIOS_SOLO_HOOK_TIMEOUT_MS=off` restores the old behavior."
date: 2026-10-27
tags: ["AIOS", "v6.14.0", "solo-harness", "long-running-tasks", "timeouts", "observability", "release"]
---

# v6.14.0: A Lifecycle Hook That Never Returns Is Not a Failure — It's a Stall

> **TL;DR:** The bug was not slowness. It was that the runtime had no word for a wait that never
> ends. `invokeLifecycleHook` was `await callback(...)` with no bound, so a subscriber that never
> resolves produced a run that was neither failing nor progressing — and the journal recorded a
> `started` event followed by nothing. Humans noticed by staring; the control plane noticed nothing.
> Now every hook wait resolves to a verdict, a stall is counted separately from a failure, and the
> abort record keeps the reason the agent actually reported instead of one a counter inferred.

## 1. What was actually wrong, in the code

Two lines carried the whole problem:

```js
// hooks.mjs — before
await callback(payload);                    // no bound, no cancel, no verdict

// loop.mjs:520 — before
failureClass: summary.backoff?.consecutiveInfraFailures > 0 ? 'runtime-error' : 'no-progress'
```

The first one means a single hung subscriber stops the loop forever, and the journal's shape is
indistinguishable from "the model is thinking very hard". The repository's own prompt-authoring norm
says hard gates must be enforced by runtime verification, not by judgment — and here the gate was a
human watching a terminal.

The second line is worse, because it *looks* like a diagnosis. A run that failed five times with
`tool-error` gets stamped `no-progress`; a run blocked by a safety gate gets stamped `no-progress`.
That field is what the resume path reads to decide whether continuing is even meaningful. The code
was inventing an answer to a question only the model can answer, and writing it into the record that
future turns trust.

## 2. Four verdicts where there used to be two

The old status vocabulary was `ok | error`. Three genuinely different things shared the second word:
the hook threw, the operator cancelled, the wait outlived its budget. They need different reactions:

| verdict | counts as run failure | counts as stall | why |
|---|---|---|---|
| `ok` | no | no | it finished inside the budget |
| `cancelled` | no | no | an operator acted; nothing is broken |
| `timed-out` | no | **yes** | the wait is bounded; the run isn't wrong |
| `failed` | **yes** | no | the hook itself errored |

`classifyWait` reads declared booleans — `aborted`, `timedOut`, `errored` — never error text. This is
the same rule the repo already applies to intent: code may verify objective facts, code must not
guess meaning.

Budgets are declared per phase, not one global number, because a session-end flush legitimately does
more work than a turn-start gate:

```
turn-start 60s · turn-complete 120s · before-continuity-commit 60s
session-end 300s · iteration-start 60s · default 120s
```

Those defaults are deliberately one to two orders of magnitude above what hooks actually cost. A
guard that did not exist yesterday should under-react first: cutting off a slow-but-correct run
would be a *new* failure mode manufactured by the fix. Tightening is an explicit act —
`AIOS_SOLO_HOOK_TIMEOUT_MS=<ms>` — and `off` returns to the old unbounded wait.

## 3. Stalls get their own counter, and their own way of ending the run

`hook-waits.mjs` counts consecutive `timed-out` verdicts. It is separate from
`consecutiveFailures` on purpose: if a slow telemetry subscriber shared that counter, a perfectly
healthy run would be marched into exponential backoff by something that never failed. A clean `ok`
resets it; a `cancelled` leaves it untouched.

Three stalls in a row end the run — a different gate with a different reason, because retrying does
not fix a wedged subscriber:

```
Aborted after 3 consecutive hook stalls (bounded wait expired).
consecutiveHookStalls=3 | component=solo-runtime hook=onTurnComplete phase=turn-complete
  iteration=3 budgetMs=120000 elapsedMs=120001 verdict=timed-out
```

The attribution line is the point. "Stalled" is only actionable if you can tell which hook, in which
phase, on which iteration, against what budget.

Two subtler rules live in `hooks.mjs`: a callback that settles *after* its budget can no longer
rewrite the recorded verdict or leak a result back into the loop — late success is not success — and
cooperative hooks now receive `{ signal, hook, phase, iteration, budgetMs }` as a second argument so
they can actually stop instead of being abandoned mid-work.

## 4. Facts that only existed in memory, and the ratchet that caught me

`solo-journal` persists hook events through a payload whitelist. `component`, `verdict`, `budgetMs`
and `elapsedMs` were not on it — so all the attribution I had built was real in the loop and silently
dropped on disk. A guard test now writes through the real writer and asserts the fields survive.
Without that test I would have shipped a diagnostic feature that produces no diagnostics.

The structural gate caught a second thing, on my own change: `loop.mjs` carries a fileLines baseline
of 596 and the rule is shrink-only. My first cut pushed it to 634, and the violation count moved from
6 to 7. The tempting fix — raise the baseline — is exactly how a ratchet dies. Instead the new logic
became three owners with one job each:

```
solo-runtime/support/stall.mjs       pure policy: budgets, verdicts, what counts
solo-runtime/loop/hook-waits.mjs     stall accounting + abort wording + evidence
solo-runtime/loop/abort-records.mjs  the two ways a run gives up, and what each reports
```

`loop.mjs` is back at 596 lines, `fileLines blocking=6` (the pre-existing stock, no new violation),
and the shared rule now has a concrete precedent: when a shrink-only budget breaks, split the
responsibility, don't move the number.

## 5. Proving the tests aren't decorative

Both new loop tests were checked against the previous implementation — swap `HEAD:loop.mjs` back in,
run, swap out:

```
✖ repeated hook stalls trip their own abort gate   actual: 5, expected: 3   (no stall gate existed)
✖ an abort keeps the class the agent actually reported   runtime-error ≠ tool-error
```

The first failure is the real symptom: five turns ran, because nothing bounded the wait. The second
is the invented-label bug in one diff line.

Full receipts on this commit:

```
npm run test:regression   files=248  tests=2407  pass=2398  fail=0  skipped=9   (495s)
node scripts/check-syntax.mjs   checked=1283  failures=0
standards directoryEntries   blocking=0
standards fileLines          blocking=6 (unchanged stock; loop.mjs held at its 596 baseline)
hook-stall-guard + hook-stall-loop + solo suites   35/35   harness suites 162/162
help-surface-renders   5/5   (the two new env knobs are discoverable in `aios harness --help`)
```

Both test files are registered in `scripts/test-suites.json`, which is an explicit file list, not glob
discovery — a new test that isn't listed simply never runs in CI.

## 6. What this does not do

Declared limits, because "there is now a stall gate" invites the wrong confidence:

- **The stall counter is per-run and not persisted.** A resume resets it to zero. Crossing resume
  needs a journal schema change; pretending otherwise would overstate the feature.
- **A hook that is slow-but-successful inside budget is invisible**, as it should be. The gate
  targets waits that never end, not waits that cost time.
- **Cooperative cancellation needs the callback to read `signal`.** Non-cooperative work is
  abandoned at the boundary, not killed mid-flight; anything still running keeps consuming resources
  even though the loop has moved on. That is a real, bounded leak and it is stated rather than hidden.
- **This is the solo-runtime layer.** Fleet watchdog has its own stall semantics and was not merged
  into this one; there are now two owners of the word "stalled" at different layers.

## 7. Scope

No schema migration, no new dependency, no changed command surface. Behavior for anyone whose hooks
finish inside a couple of minutes is identical — with richer events when they don't.
