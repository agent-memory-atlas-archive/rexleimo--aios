---
title: "v6.15.0: A Rejected Flag That Still Ran the Command — and the Destructive Defaults Behind It"
description: "v6.15.0 makes the AIOS CLI's exit code mean something. `aios uninstall --definitely-not-a-real-flag` printed `error: unknown option`, exited 0, and then ran the uninstall with its destructive defaults — components=shell,skills, scope=global, client=all. 24 parsers shared one shape: `try { Command.parse() } catch { return { mode: 'help' } }`, which turns every usage error into a successful-looking help response. The release removes the enable point (`allowUnknownOption(true)`), makes five swallow-into-help parsers rethrow tagged `error.usage`, fixes `isUsageError` (it matched `Unknown option` while Commander emits lowercase, so a rejected flag printed a stack trace shaped like an internal fault), and puts 12 still-permissive parsers in one shrink-only ledger guarded by a test that fails when a name goes stale. `uninstall` now previews unless you pass `--yes`, and `setup --yes` — advertised in help, never declared in the parser, silently `undefined` in the handler — works for the first time."
date: 2026-10-27
tags: ["AIOS", "v6.15.0", "CLI", "exit-codes", "destructive-actions", "testing", "release"]
---

# v6.15.0: A Rejected Flag That Still Ran the Command

> **TL;DR:** `error: unknown option '--definitely-not-a-real-flag'` and then exit code `0`. The parser
> said no, the process said yes, and the command underneath ran anyway. This release makes the exit
> code mean the parser's own answer — and closes the specific case where the answer was "no" and the
> action was an uninstall.

## The repro that set the priority

```
$ aios uninstall --definitely-not-a-real-flag
error: unknown option '--definitely-not-a-real-flag'
Uninstall components: shell,skills
```

Two lines that contradict each other. The first is a refusal. The second is the refusal's own command
doing its work — with defaults that remove shell integration and skills across every client, at global
scope. I did not run this against my real machine. The probe ran `HOME=<temp dir>`, dropped a stub
`~/.bashrc` and `~/.rexcil/aios/VERSION`, and asserted which files survived.

The general shape, measured across 37 commands:

| Outcome | Count | What the process did |
|---|---|---|
| Refused, exited 0, printed help | 6 | Looked like a usage error, scored as success |
| Refused, exited 0, **ran anyway** | 11 | `uninstall` is in this row |
| Refused, exited 1 correctly | 19 | Already honest |
| Hung, no output, killed at 25s | 1 | Still open, filed separately |

## Why 24 parsers had the same disease

Not a shared helper — 24 independent copies of one shape:

```js
try { program.parse(argv, { from: 'user' }); }
catch { return { mode: 'help', command, options, args }; }   // exit 0
```

A commander usage error lands in that `catch`, gets dressed up as "the user wanted help", and returns
successfully. Fixing the 24 catches alone would still have missed `uninstall`, because the enable point
was elsewhere: `.allowUnknownOption(true)` on the root program. With that on, commander never *throws* —
it deletes the unknown token and parses the rest. So `uninstall --typo` became `uninstall`, and `uninstall`
with no arguments means components `shell,skills`, scope `global`, client `all`.

Both mechanisms had to go. The enable point is now one line, and the refusal carries a marker
(`error.usage = true`) so the entry point can classify it without pattern-matching prose.

## The second writer problem this uncovered

`COMMAND_SPECS` advertises `--yes`, `--retry`, `--force` for `setup`. The handler reads `options.yes`,
`options.retry`, `options.force`. The parser in `top-level.mjs` declared none of them — and nothing
mapped them into the options object. `aios setup --yes` was therefore a no-op that *looked* like it was
skipping confirmations. Same story for `orchestrate --force`, whose handler at `dispatch.mjs:156` reads
`parsed.options.force`.

Strictness made this visible instead of quiet: once unknown options throw, a flag that is advertised but
not declared becomes a hard error rather than a shrug. That is the point of the gate — but it also means
the correct repair was to **add the declarations**, not to add an exemption. Same lesson from
`clients --native-strict`, which I initially flagged as collateral damage and was wrong about: the flag
was never declared in either writer, so the right fix was a spec line, not a whitelist entry.

## What the guard test refuses to be

`scripts/tests/execution/aios-setup/cli-usage-error-exit.test.mjs`, 9 tests, real subprocesses:

- **Positive control first**: `aios version` must exit 0 and print a version. Without it, a broken spawn
  path would report "all commands reject the flag" and pass. It caught a real bug in my own first draft —
  a wrong `repoRoot` that resolved to a non-existent `E:\Temp\scripts\aios.mjs` — and every apparent pass
  in that run was a `ENOENT` wearing the costume of a refusal.
- **Matrix from `COMMAND_SPECS`, not a hand-written list**: the iteration set is derived at runtime from
  the same registry that generates help. Hand-typing "all commands" is exactly the drift that produced
  this bug.
- **A ledger that can only shrink**: 12 parsers still declare `allowUnknownOption(true)`. They are named
  in one production-side set, and the test fails if a command in that set *already* refuses — so the
  debt list can't quietly become a graveyard.
- **No stack dumps**: a rejected flag must read as usage, not as `ReferenceError`.

Two mutation proofs, because a guard that can't be broken isn't a guard:

```
flip .allowUnknownOption(false) back to true  → 2 failures, matrix names uninstall
add an already-fixed command to the ledger    → "the deferred ledger is shrink-only; remove: doctor"
```

## One honest correction

The baseline report I wrote claimed the "conditional-rethrow" catches were the correct shape. Measured
against the real CLI, that was wrong: `hud.mjs` rethrows only when the message matches a whitelist of
strings, which is the same judgement the entry point was already making with a regex — it fails whenever
the vocabulary changes, which is precisely how the uppercase/lowercase mismatch got through. I fixed the
claim in the report and in memory before shipping, not after being told.

## Still open

- 12 commands in the deferred ledger (last one measured in this release: `refs --bogus` still runs
  `refs list`, exit 0).
- `perception` produced no output and was killed at the 25s timeout — a hang, not a usage bug.
- `run/harness.mjs` and `knowledge/perception.mjs` swallow errors *outside* the parse call, so a handler
  exception exits 0 there. Different defect, same family.
- The two-writer problem (options declared in `COMMAND_SPECS` and again in parser code) is documented,
  not merged. Merging it is a refactor, not a bug fix, and is deliberately outside this work item.

Uninstall now asks. Everything else at least tells the truth about refusing.
