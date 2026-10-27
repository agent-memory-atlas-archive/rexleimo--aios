---
title: "v6.13.0: A Retention Policy Nobody Could Call — and 49,209 Files That Proved It"
description: "v6.13.0 gives refs retention its first automatic caller. `pruneInterceptionRefs` existed since it was written but had exactly one entry point — a human typing `aios refs prune`; nobody typed it, and the store grew to 49,209 files / 161.7MB with 30,861 entries older than 30 days, numerically identical to the 2026-09-09 audit, which is the evidence that nothing consumed it. Retention now reads each ref's own declared `created_at` + `ttl_days` instead of filesystem mtime (a copy resets mtime, so one copy could keep an entry forever; and `ttl_days` was written by every ref and read by no code), protects the active session so a resumable long task cannot lose the refs it is citing, deletes `.raw` and `.meta.json` as a pair instead of orphaning halves, runs from the session-close hook bounded at 1500ms with a 6h cooldown, and defaults to reporting rather than deleting — the same shape as AIOS_AUTODREAM_AUTO being off by default. Two near-misses are documented as shipped: an omitted `nowMs` argument made the whole sweeper a silent no-op that reported a healthy clock, and a backtick inside help prose closed a template literal and turned a documentation edit into a SyntaxError — which is why `node --check` is now a 16.9s gate over all 1,278 files in scripts/."
date: 2026-10-27
tags: ["AIOS", "v6.13.0", "refs", "retention", "contextdb", "offload", "maintenance", "release"]
---

# v6.13.0: A Retention Policy Nobody Could Call — and 49,209 Files That Proved It

> **TL;DR:** The defect was never the retention rule. It was that a rule can exist, be correct, be
> tested by hand, and still do nothing because no runtime path reaches it. AIOS had exactly that:
> `pruneInterceptionRefs`, plus a `ttl_days` field written into every ref's metadata and read by zero
> lines of code. Measured before this release: **49,209 files / 161.7MB**, **30,861 older than 30
> days** — the same three numbers as the 2026-09-09 self-audit, nine weeks earlier. A backlog that
> does not shrink across a quarterly audit is not growing slowly; it is unowned.

## 1. What was actually wrong, measured first

I did not take "sweep has no automated caller" on faith. Four measurements:

```
files=49,209   bytes=161.7MB   older_than_30d=30,861   full_walk_cost=2,283ms
```

The first three are the backlog. The fourth is the constraint: **a full walk costs 2.3 seconds**, so
"just call it on session start" would have traded an unbounded disk problem for a bounded latency
problem in the hottest path in the product — the same path that v6.12.0's session-start fuse exists to
protect. Cost is why the caller is `session close`, and why the walk is budgeted rather than trusted.

Then the part that made this a real bug instead of a missing convenience:

```json
{ "created_at": "2026-07-15T17:24:11.201Z", "ttl_days": "30", "redaction_status": "not_scanned" }
```

Every ref already declared its own retention. `pruneInterceptionRefs` looked at neither field. It read
`stat.mtimeMs` and one global `keepDays`. So the store had a written contract that no code consumed —
the worst kind of dead data, because it makes the policy look configured when it is only decorative.

## 2. Business time beats filesystem time

```js
// before: one clock, and it was the wrong one
const cutoff = Date.now() - Number(keepDays || 30) * 86400_000;
if (st.mtimeMs >= cutoff) continue;

// after: declared time first, declared ttl first, and the receipt says which it used
if (Number.isFinite(created)) return { ageMs: clockNow - created, clock: 'meta.created_at' };
return { ageMs: Math.max(0, clockNow - mtime), clock: 'fs.mtime' };
```

Two consequences that mtime-only pruning got wrong in opposite directions:

- **A refreshed mtime hides age.** Copy, sync, restore, or migrate a ref and its mtime becomes *now*
  while its business age keeps growing. Under the old rule such an entry can never expire — the
  backlog is not just unpruned, it is unprunable.
- **A long `ttl_days` deserves to survive.** A ref declaring `ttl_days: 90` was deleted at day 31 by
  the global default. The per-ref declaration was the more specific fact and it lost.

The fallback is explicit and self-labelling (`clockBasis` in the receipt), because "we could not read
the declared time" is a different claim from "the declared time says expired". On this repository's own
store, a dry-run over 18,525 pairs reported `meta.created_at/meta.ttl_days=18,524` and
`fs.mtime/default.keepDays=1`. One entry actually needed the fallback — so the fallback branch is
proven against production data, not only against a fixture.

## 3. Two things that would have shipped if I had not run the tests

**The silent no-op.** `decideRefRetention` called `refAgeMs` without passing `nowMs`:

```js
const age = refAgeMs({ meta, mtimeMs });   // nowMs missing → NaN
```

`NaN > keepMs` is false for every input, so nothing ever expired. And the receipt still reported
`clock: 'meta.created_at'` — the clock was read correctly, it just produced `NaN` arithmetic. This is
the failure mode I fear most in maintenance code: **not an error, an all-clear that means nothing.**
Caught in the RED phase by 3 policy tests and 4 I/O tests going red together. A regression guard now
pins it: a caller that forgets `nowMs` must degrade to wall-clock, never to "clean".

**Prose that broke a module.** I edited help text and wrote `` `created_at` `` inside a template
literal. The backtick closed the string; the file became `SyntaxError: Unexpected identifier
'created_at'`. I had run `node --check` on the files I *created* and skipped the file I only *edited* —
which is how a documentation change reaches CI as a broken CLI. It surfaced there, eventually, in a
test that happened to spawn the CLI.

So the fix is structural, not a promise to be careful. `scripts/check-syntax.mjs` runs `node --check`
across the runtime with 8 lanes: **1,278 files in 16.9s** (serial: 72.7s, which is why it is a gate and
not a per-edit loop), wired into `pretest:scripts`. Plus `help-surface-renders.test.mjs`, which does
something strictly better than parsing: it renders every documented help topic and asserts real text
comes out — one action covering "module parses", "switch branch exists", and "the output is help".
Verified against a deliberately broken probe:

```
[syntax] FAIL ...\lib\broken.mjs
         SyntaxError: Unexpected identifier 'created_at'
[syntax] checked=2 failures=1 elapsed_ms=104 concurrency=8
probe exit=1
```

## 4. Why the default is a report, not a delete

An automatic pass that deletes local evidence is a new mutation with no human in the loop. This
repository already answered that question twice: `AIOS_AUTODREAM_AUTO` defaults **off**, and the dream
engine runs `mode: 'preview'` — proposals wait for governed apply. A new automatic pass starts at the
same altitude:

```
AIOS_REFS_SWEEP unset   → dry-run: counts the backlog, prints it, touches nothing
AIOS_REFS_SWEEP=enforce → prunes
AIOS_REFS_SWEEP=off     → does not even scan
```

The CLI keeps the opposite default because there the human *is* the intent: `aios refs prune` prunes,
`aios refs prune --dry-run` reports.

Two safety rules that are not configuration, because they should not be one switch away from a bad day:

- **The active session's directory is never touched.** AIOS tasks are resumable; a session 31 days in
  may be citing a ref from day 2. Deleting it does not free space, it severs the recall chain
  mid-session. Enforced by comparing against `rawRefsSessionRoot`, the writer's own path function —
  if the sweep computed its own "protected path" from a different env resolution, protection would
  fail silently and point at the wrong root. That inconsistency was fixed before it could ship.
- **`.raw` and `.meta.json` move as a pair.** Pruning them independently — what the old code did,
  because it iterated files — produces orphan metadata (a ref that lists but has no content) and
  orphan raw text (a grep hit with no provenance). Both halves of that corruption are invisible until
  someone tries to read the ref.

## 5. Cost, in the three states that matter

```
cooldown hit (the normal case)      1ms
AIOS_REFS_SWEEP=off                 0ms
backlog present, budget respected   1,501ms   (truncated, and truncation is not completion)
```

Truncation deliberately does **not** write `lastRunAtMs`; it writes `lastTruncated: true`, which
bypasses the next cooldown. A budgeted pass that stops mid-backlog is not done, and a sweeper that
locks itself out for 6 hours after doing 1.5 seconds of a 2.3 second job is a sweeper that never drains
a large store. Sessions are walked oldest-first so that a truncated pass always spends its budget on
the stalest backlog instead of re-reading the same new directory.

Real dry-run receipt from this repository:

```json
{ "mode": "dry-run", "scanned": 18525, "wouldPrunePairs": 10862, "reclaimMB": 67.4,
  "sessionsScanned": 424, "sessionsProtected": 1, "truncated": true, "elapsedMs": 8001 }
```

**67.4MB reclaimable right now**, from entries that declared a 30-day TTL and were never asked.

## 6. Verification

| Gate | Result |
|---|---|
| `refs-sweep.test.mjs` | 15/15 — policy, real fixtures on disk, cooldown/truncation, close-hook caller |
| `help-surface-renders.test.mjs` | 4/4 — every help topic renders |
| Suite wiring W1–W6 | 10/10 — both new files registered (regression 244 → **246**) |
| Adjacent suites (offload, autodream, CLI) | 47/47 |
| `npm run test:regression` | files=**246**, tests 2,390 / pass 2,381 / **fail 0** / skipped 9 |
| `directoryEntries` | blocking=0 |
| CLI end-to-end | `Would prune 5658 refs, freed 39523.6KB (scanned 6700, 1501ms, basis: meta.created_at/meta.ttl_days=6700, truncated by budget)` |

The regression wall-clock moved 450s → 506s. I do not attribute that to myself without a number: the
two suites I added cost **147ms** in total, and the delta sits in the known 484s hub file
(`aios-harness.test.mjs`), which spawns real clients and is the reason that file is measured separately.

## 7. What this release is really about

The interesting part of B5 is not the sweeper. It is that a correct implementation, with a correct
policy field written by its own writer, sat unreachable for at least nine weeks and nobody noticed
because the code was *there*. Nothing failed. No test went red. The store just grew.

So the reusable check when you add a lifecycle rule: **name the runtime path that calls it, and
measure the backlog before and after.** If you cannot name the caller, the rule is a document. If you
cannot measure the backlog shrinking, the caller is decoration. The 30,861 number matching September's
audit exactly was the whole diagnosis — and it is the number that tells me this one is fixed.
