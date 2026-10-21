---
title: "v6.8.0: The Test Runner Owns the Temp Directory Now — and Two CLI Commands Stop Lying About Their Exit Code"
description: "v6.8.0 fixes two hygiene defects found while cleaning one Windows machine. First: the regression pool never reclaimed its own temp sandboxes — 62,773 aios-* mkdtemp directories (92% of every entry in %TEMP%, oldest from eight days earlier, 374 distinct fixture prefixes) after a week of normal work. Reclaiming ~100 test files one by one would leak again, so the two runners now create one isolated temp root per run (TMPDIR, TEMP and TMP all redirected), delete it on exit, and tell you where it stayed if a child handle blocked the delete. Second: comparing import.meta.url to a hand-built file:// URL string can never be true on Windows, because the real URL has a third slash and a drive letter — so aios-tmp-gc.mjs --mode purge --yes exited 0 having deleted nothing, and the scorecard drift check silently skipped itself. Both now use the realpath-based entry helper, and a contract test forbids the bare template form."
date: 2026-10-21
tags: ["AIOS", "v6.8.0", "testing", "tooling", "windows", "release"]
---

# v6.8.0: The Test Runner Owns the Temp Directory Now — and Two CLI Commands Stop Lying About Their Exit Code

> **TL;DR:** Two defects, both found by measuring instead of guessing. (1) The test pool never reclaimed its temp sandboxes. One Windows box ended up with **62,773** `aios-*` `mkdtemp` directories — 92% of all entries in `%TEMP%`. The fix is not "ask 100 test files to clean up after themselves"; it is putting reclaim where the run's lifetime already lives: the two runners now create one isolated temp root per run and delete it on exit. (2) Comparing `import.meta.url` against a hand-built `file://` string is true on POSIX and **never** true on Windows, because the real URL is `file:///C:/…` with a third slash plus a drive letter. The consequence was not a crash — it was a silent no-op that **exited 0**. `--mode purge --yes` reported success while deleting nothing.

## Defect one: nobody swept what the pool created

The trigger was a Windows upgrade refusal (v6.7.3 era): `aios update` renamed the install tree aside, and the rename was refused because a leaked browser MCP plus its Chrome held `.browser-profiles` — a directory *inside* the install tree — open. Following that handle backwards led to `%TEMP%`, where the same "nobody reclaims" habit was hiding in a much larger form.

The measurement, not a guess:

| | before cleanup | after cleanup | after a full regression (228 files) |
|---|---|---|---|
| entries in `%TEMP%` | 68,052 | 6,363 | 6,384 |
| `aios-*` fixture dirs | 62,773 | 1,081 | **1,081** |
| `aios-test-run-*` leftovers | — | — | **0** |

62,773 directories across **374 distinct fixture prefixes** (`aios-rex-surface`, `aios-orchestrator`, `aios-bridge-runner`, `aios-learn-eval`, …). Disk space was never the interesting part — those are tiny directories, and `C:` free space measured identically (97.55 GB) before and after deleting 61,693 of them. The cost is entry count, and the hazard is a leaked handle blocking the next swap.

Reclaiming each of ~100 test files would work once and leak forever after, because the next test file written at 2am will forget the `t.after` line. So the responsibility moved to the layer that already owns the run:

```
run-test-suite.mjs / run-affected-tests.mjs
  → createTempSandbox()      one fresh dir under the real temp root
      env.TMPDIR = env.TEMP = env.TMP = <run dir>       (all three: see below)
  → spawnSync / spawn(..., { env: sandbox.env })
  → disposeTempSandbox()     on exit, and the summary line reports what happened
```

Three environment keys, not one, because `os.tmpdir()` reads `TMPDIR` on POSIX and `TEMP`/`TMP` on Windows — redirect one and half the suite keeps writing to the real temp root.

Three deliberate properties:

- **Escape hatch.** `AIOS_TEST_TEMP_SANDBOX_DISABLE=1` runs against the real temp dir, and the summary prints `temp_sandbox=disabled`. Debugging a specific path sometimes requires the path to be where you expect it.
- **A failed delete is reported, not swallowed.** Windows is where a child process leaves a handle open — exactly the failure mode that blocked the upgrade. If removal fails, the run prints `temp_sandbox=KEPT@<path> (EBUSY) -> npm run tmp:gc` and hands you the path.
- **Self-healing, but only for its own family.** Before creating a sandbox, the runner sweeps stale `aios-test-run-<6 chars>` directories older than 24 hours. Name shape is the ownership proof; it spares every other family, including the fixture families that `tmp:gc` owns.

## Defect two: exit 0 from a command that ran nothing

`scripts/aios-tmp-gc.mjs` gained a `--temp` mode in this release, and building it exposed that **the CLI had never executed on this machine**. Three invocations, three empty outputs, exit code 0 each time:

```
node scripts/aios-tmp-gc.mjs --help                        → (no output)  exit 0
node /e/coding/.../aios-tmp-gc.mjs --help                  → (no output)  exit 0
node E:/coding/.../aios-tmp-gc.mjs --help                  → (no output)  exit 0
```

The guard was:

```js
const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
```

On POSIX that is `file:///tmp/x.mjs` === `file:///tmp/x.mjs`. On Windows `import.meta.url` is `file:///C:/…` — three slashes plus a drive letter — and swapping backslashes cannot invent the missing leading slash. So `main()` never ran, and the process still exited 0. For `--mode purge --yes`, "success with nothing deleted" is the worst possible outcome: the caller — human or CI — gets a passing exit code.

Both affected files (`aios-tmp-gc.mjs`, `client-capability-scorecard.mjs`) now use the repository's existing realpath-based helper, `isDirectModuleInvocation()`. The three MCP server entry points already survived on a `|| process.argv[1]?.endsWith('…')` fallback and were left alone. `scripts/tests/tooling/contracts/cli-entry-guard.test.mjs` now forbids the bare template form across `scripts/**`, and additionally spawns the CLI in a child process through every path shape to prove `main()` really ran — reading source cannot tell you about realpath differences.

The scorecard drift check is a nice confirmation that this was real: it had been silently skipping itself on Windows, and now reports `ok: docs/reports/2026-10-19-client-capability-scorecard.md matches config (13 clients)`.

## `--temp` had to be narrower than the generic shape

The existing classifier matched "a 4–6 character suffix that looks random". Inside `~/codes` that is safe. In the system temp directory it is not: that is where other applications' `.tmpHau8Eb` and `GUID.tmp` entries live, along with real project names that happen to end in a 4–6 character segment. So `--temp` swaps in a strict family predicate — `^aios-[a-z0-9][a-z0-9-]*-[A-Za-z0-9]{6}$` — implies the volatile root (otherwise the volatile-root guard discards the very discovery it just reported), and keeps the existing safety rails: dry-run by default, `--mode purge` still requires `--yes`, secrets-bearing and git-dirty directories are kept.

```
npm run tmp:gc         # preview, >24h, ours only
npm run tmp:gc:trash   # move to a reversible staging dir
```

## Verification

- `npm run test:regression`: 228 files, 438,894 ms, **exit 0 — tests=2241 pass=2232 fail=0 skipped=9**, summary `temp_sandbox=removed`; `%TEMP%` fixture count **1081 → 1081** across the run, `aios-test-run-*` leftovers 0.
- Focused suites: `tests=42 pass=42 fail=0` (`aios-tmp-gc`, `test-suite-runner`, `test-impact`, `cli-entry-guard`, `test-suite-wiring`).
- `--temp` end-to-end in a fabricated temp root: `collect=3 keep=3`; `.tmpHau8Eb`, `someproject-rex-work` and `node-compile-cache` untouched, `purge` without `--yes` returns 1, `purge --yes` deletes only the three `aios-*` families.
- `npm run test:affected` after the docs/version edits: `tests=2241, pass=2231, fail=1` — and that single failure was this repository's own release contract, "the Blog index leads with the current release", which is why this post exists.
- `dir-budget`: 767 directories, 0 blocking.

## Known limits

- Isolation covers the two runner entry points. Direct `node --test scripts/tests/x.test.mjs` still writes to the real temp directory — deliberately, since that is the output you want to look at while debugging — and `npm run tmp:gc` is the sweeper for it.
- `--temp` only reclaims the `aios-*` family. Sandboxes left by other clients or older versions stay "undetermined" and are left alone.
- `.browser-profiles` living inside the install tree — the actual reason that upgrade was refused — is a separate decision about where profile roots belong, not a cleanup task.
