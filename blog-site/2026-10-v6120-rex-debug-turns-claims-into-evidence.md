---
title: "v6.12.0: rex-debug Turns Each Debugging Claim Into Reported Evidence — and a 21-Byte Line Ending Stops Faking an Ownership Problem"
description: "v6.12.0 makes rex-debug state what counts as having done a phase instead of naming the phase: a runnable feedback loop before any hypothesis (10 construction methods, four loop-quality criteria, an execution receipt per loop claim, a reproduction-rate contract for non-deterministic bugs, blocked when no loop exists), 3-5 ranked falsifiable hypotheses whose probes name what they discriminate, a baseline measurement before any performance claim, and 'no correct seam exists' routed back to hypothesis work instead of forced into a red test. It also closes a projection-drift blocker whose whole cause was 21 bytes of CRLF: 68 of 128 skill-source assets materialized as CRLF on Windows while every blob is LF, so skill-sources/** is now pinned LF in both repositories and projection equality no longer merges content drift with checkout conversion."
date: 2026-10-26
tags: ["AIOS", "v6.12.0", "rex-debug", "debugging", "skills", "projection", "CRLF", "release"]
---

# v6.12.0: rex-debug Turns Each Debugging Claim Into Reported Evidence — and a 21-Byte Line Ending Stops Faking an Ownership Problem

> **TL;DR:** A phase list is not a contract. `rex-debug` used to name five phases and never say what
> counts as having completed one, so a model could write "the loop reproduces the bug", "I considered
> five hypotheses", "this is the correct test seam", or "the fix is verified" with no artifact behind
> any of it — and a reviewer could not tell. Five claims are now backed by reported evidence.
> Separately, the projection-drift gate had been red for a reason nobody could read off the error:
> the whole difference was `LICENSE` checked out as CRLF (1089B) instead of LF (1068B) — 21 bytes, one
> per line. Same class of bug, third time in this repository, so the fix is two layers: pin every
> `skill-sources/**` asset to LF in both repositories, and stop letting a line ending masquerade as a
> content change while keeping real content changes loud.

## 1. The skill named phases; it never said what "done" meant

Every debugging skill says "reproduce, hypothesize, instrument, fix, verify". That sentence is not
executable. It does not disqualify any claim, so the model that wrote it and the model that reviewed
it both had to fall back on confidence.

**Phase 1 — build a feedback loop before you have an opinion.** Ten construction methods ordered by
how fast they close the loop (a failing unit test, a CLI invocation with fixed input, an HTTP replay,
a saved fixture diff, a headless browser snapshot, and so on), plus four criteria for whether the loop
is actually a loop:

| criterion | what it rules out |
|---|---|
| `red-capable` | a loop that can only ever pass proves nothing |
| `deterministic` | a coin-flip loop lets the fix take credit for luck |
| `fast` | a 20-minute loop means fewer loops, and fewer loops means guesses |
| `agent-runnable` | if only a human can run it, it is not part of the loop |

Every loop claim now carries an **execution receipt** — the command, the observed exit code, the
reproduction it produced. A non-deterministic bug gets an explicit **reproduction-rate contract**:
measure the rate, raise it, and only then attempt a fix; "intermittent" is not a stopping condition.
If no loop can be built at all, the honest outcome is `blocked`, not a plausible theory.

**Phase 2 — hypotheses before probes.** 3-5 of them, ranked, each falsifiable: each must state what
observation would rule it out. Every probe then has to name which hypotheses it discriminates, so a
probe that discriminates nothing is visible as theatre. Performance work must record a **baseline
measurement** before proposing a cause — "it feels slow, add caching" is exactly the shape this kills.

**Phase 3 — the seam decision is a finding.** When no correct test seam exists, the old behaviour was
to force out *some* red test and call it coverage. That is now routed back to Phase 2 as a reported
finding. And a false red must be proven by diffing against the pristine baseline, not asserted as
flaky.

**Phase 4/5 — leave the site clean and the reasoning reviewable.** Instrumentation is tagged
`[DEBUG-xxxx]` so cleanup is a grep rather than a memory test, secrets are redacted before any capture
enters an artifact, cleanup is listed in the change summary, and the confirmed hypothesis ships in the
commit/PR so the next reader can try to falsify it.

One deliberate non-change: the delivery vocabulary stays `blocked / degraded / partial / complete /
verified`. Per `skill-sources/PROMPT-AUTHORING.md`, new criteria are self-reported evidence fields —
not new status words. Adding a status word is how a closed set leaks.

Certification was re-run rather than asserted: `skill verify-training` first returned
`accepted-hash-differs-from-current-skill`, `skill certify` produced `verified / accepted` against 10
tasks × 3 rounds (42 outputs, local deterministic runner, zero model calls), and the gate went green
on the second pass.

## 2. What 21 bytes were pretending to be

`check-skills-sync` was red on four surfaces, and `sync-skills` answered with
`skip unmanaged blocker` — a message that names a path and nothing else. Locating the actual
difference cost five probes. It was `LICENSE`: canonical blob 1068 bytes LF, working copy 1089 bytes
CRLF, identical after stripping `\r`, 21 lines × 1 byte = the exact gap. `SKILL.md` never drifted.

The mechanism, measured rather than guessed:

```
git checkout-index  →  LICENSE    1089B  CRLF=21     (unpinned asset)
                     →  SKILL.md  10369B  CRLF=0      (pinned eol=lf)
```

`.gitattributes` pinned `skill-sources/**/SKILL.md` and nothing else, while `core.autocrlf=true`
rewrites every unpinned text file on checkout. Across both repositories, **68 of 128 skill-source
assets were CRLF on disk while all blobs are pure LF** (0 CR in 87 blobs here, 0 in 41 in rex-harness)
— including the 16 `evals.json` files the training flow ships with each skill.

Adoption of a pre-existing unmanaged copy requires snapshots to be equal ignoring only the marker
file. 21 bytes of line ending kept the marker from ever being written, and because the checker's
expected snapshot *includes* the marker file, the result was a permanent `[drift]` that read like an
ownership dispute. A line-ending problem wore the costume of a permissions problem.

Two things are worth saying about how this was handled:

- **The first diagnosis was wrong and stayed in the record.** The v6.12.0 changelog entry originally
  blamed the 2026-09-18 line-ending episode. `git checkout-index` disproved it: the drifted bytes came
  from a Windows checkout, and the `.bak` files from that episode only ever covered `SKILL.md`. The
  wrong claim was corrected in place with a visible `> Correction` block rather than amended away.
- **The projection was adopted through the declaration channel, not by hand.** One
  `legacyReplaceable` entry in `config/skills-sync-manifest.json` — the same mechanism already used
  for `skill-creator` and `skill-opt-lite` — then two sync passes: replace the physical directory,
  then migrate the three symlinked alias surfaces. `.agents/skills/typesafe-ai` turns out to be the
  single physical copy that `.claude`, `.grok` and `.hermes` symlink to, which is why removing one
  orphaned backup made it vanish from four views.

## 3. Two layers, because one alone is wrong

**Layer 1 — pin the source.** `skill-sources/** text=auto eol=lf` in both repositories. `text=auto`
keeps git's own binary detection; this tree has no binary assets today. The working tree was refreshed
by deleting and restoring only the CRLF files that passed `git diff --quiet` first: CRLF count went to
0 and **not one blob changed**, so `git add --renormalize` would have been a no-op.

**Layer 2 — don't let a surface's line endings decide its ownership.** `hashFileBuffer` normalizes
CRLF→LF at the digest input, which serves all six projection guards that share it (they compare
equality only; none decodes the digest back). `describeSnapshotDiff` then makes every rejection
readable:

```
[drift] .codex\skills\find-skills (missing: .aios-skill-sync.json; content: LICENSE)
[skills] skip unmanaged blocker: .agents\skills\sample (extra in target: EXTRA.md; content: LICENSE)
```

This is a deliberate boundary against a doctrine already recorded in `.gitattributes`: *"pin LF instead
of normalizing in tests, because normalization merges two signals"*. That rule is right **for
committed documents**, where the blob is the contract — merging "the content changed" with "git
converted my line endings" there would hide real drift. Here the contract is canonical content versus a
generated surface, so the pin restores cross-platform determinism and the digest normalization is only
a compatibility floor for installs already on disk. Neither layer alone works: the pin without the
floor leaves current users blocked by bytes they cannot rewrite, the floor without the pin merges the
two signals the reviewers were right to protect.

Three counter-example tests hold the line (`scripts/tests/foundation/skills/install/snapshot-line-endings.test.mjs`):
a CRLF-only copy is **adopted** (marker written, `skipped=0`); a real content difference is still
**refused adoption**; and the drift line must name both the missing marker and the tampered asset. A
guard that only passes on its own example is not a guard.

## 4. Evidence

| check | result |
|---|---|
| `check-skills-sync.mjs` | exit 0 (was 1), 9 surfaces carry `.aios-skill-sync.json` |
| skill / projection / native suites | **208 / 208** |
| `llms-txt` + `release-pipeline` + `rex-release-gate` | **23 / 23** |
| `skill verify-training --skill rex-debug` | `verified` after `certify` (`accepted`) |
| blob audit (both repos) | 0 CR in 87 + 41 files; after refresh, worktree CRLF = 0 |
| `npm run test:regression` | 242 files — surfaced the feature-release-post gate fixed above |
| quarantined `*aios-crlf-bak*` | 8 files, each proven redundant (equal to live content after `\r` strip) |

## What this changes for you

If you maintain a skill, the debug workflow now refuses to move until the feedback loop has a receipt
attached, and a probe that discriminates nothing is visible as one. If you work on Windows, the
projection adoption that silently refused for 21-byte reasons is gone, and the next time a guard says
`[drift]` it will name the file rather than the directory.
