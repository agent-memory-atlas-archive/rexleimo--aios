---
title: "v6.6.0: The Agent's Scratch Space Leaked Into Your Project List — and the Garbage Collector That Refuses to Guess"
description: "v6.6.0 closes a UX defect that no test could have caught: 41 throwaway sandbox directories (9.9 GB) had grown inside the developer's project folder, because `mktemp -d prefix-XXXX` lands in the shell's current directory — and that directory was the parent of the repo. Nothing in version control could hide it, because none of it was in a repo. The fix is a rule (`mktemp -d -p \"${TMPDIR:-/tmp}\"`, never in the project parent) plus `scripts/aios-tmp-gc.mjs`, a collector that classifies only on objective facts — name shape, age, git state, credential presence — and fails closed on everything it cannot read. Its first real run reported `collect=0 keep=34` on the cleaned directory, and its regression list is the 23 project names that must never match."
date: 2026-10-17
tags: ["AIOS", "v6.6.0", "tmp", "sandbox", "hygiene", "gc", "tooling", "release"]
---

# v6.6.0: The Agent's Scratch Space Leaked Into Your Project List — and the Garbage Collector That Refuses to Guess

> **TL;DR:** A screenshot of `~/codes` in Finder showed dozens of folders nobody named: `abhome-1zbU`, `ci-repro-home-R2MG`, `asset-check-EYJZ`, `heal-real-oiHH`, `v650-patch-check-38213`, `rex0111-qLxI`. They were **agent scratch space** — fake `$HOME`s and `npm pack` probes built during verification runs — and they were not in any repository, so no `.gitignore` in the world could have hidden them. Root cause is one flag: `mktemp -d prefix-XXXXXX` without `-p` creates the directory **in the shell's current working directory**, and those shells were sitting in the parent of the repo. v6.6.0 adds the rule that says so out loud, and `scripts/aios-tmp-gc.mjs`, a collector whose every decision is an objective fact and whose default is to touch nothing.

## What was actually in those folders

Two shapes, both recognisable once you open them.

The first is a **fake `$HOME`**: `abhome-1zbU`, `fix-home-9oTm`, `ctl2-home-bvMO`, `revert-probe-4vAl`. Inside, nothing but client config shells — `.qoder/settings.json`, `.workbuddy/mcp.json`, `.zcode/cli/config.json`, `.hermes/config.yaml`. That is an `aios init` projection test that did not want to write into the real `~/.codex`, which is a correct instinct executed in the wrong place.

The second is a **pack probe**: `asset3-zoV2`, `rex0111-qLxI`. Inside, always the same two entries — a tarball (`rex-harness-0.11.1.tar.gz`) and a directory called `x/`. That is `npm pack`, extract, inspect the artifact before publishing.

Then the heavyweights: `ci-repro-aios` (2.8 GB) and `ci-reg-home` (882 MB), a full repository copy plus a full fake home, used to reproduce a CI regression locally; `v650-patch-check-38213` and `ab-v641-x97833`, two complete worktrees used to A/B one version against another. 41 directories, 4.06 GB of sandboxes plus a 5.8 GB stale release pack — **9.9 GB sitting in the folder where real projects live**.

None of it was the codebase's fault. Every test file in this repository already uses `os.tmpdir()` — 603 call sites, 222 test files. The litter came from **ad-hoc commands typed inside a session**, which inherit whatever `cwd` the session happened to be in.

## The rule, stated as a constraint and not a preference

`AGENTS.md` now has a *Temp Sandbox Hygiene* section, and it is one line of substance:

```bash
mktemp -d -p "${TMPDIR:-/tmp}" aios-probe-XXXXXX   # -p is not optional
```

Omit `-p` and `mktemp` writes into `cwd`. The prompt-level version of the same rule: never create a directory in the project parent (`$HOME/codes`), because it is invisible to version control and therefore invisible to every safety net that operates on a repository.

This is the shape of problem that a Definition of Done cannot catch. The verification passed — the fake home proved `aios init` writes the right files. The damage was purely positional, and only visible in a Finder window.

## `aios-tmp-gc`: classify on facts, fail closed on the unreadable

The tool is 275 lines and its interesting part is not the deletion, it is the **refusal ladder**. Every rule below was written after a counter-example, and the ordering is the safety property: the first failing check wins.

| Gate | Rule | Failure direction |
|---|---|---|
| Name shape | `-[A-Za-z0-9]{4,6}$` **and** the suffix contains an uppercase letter or a digit | all-lowercase random suffix → not collected (missed, never wrong) |
| Age | `--older-than`, default 60 minutes | a probe running right now is untouchable |
| Git state | `dirty`, `unpushed`, `stashed`, **and `unknown`** are all kept | a repo whose state cannot be read is a repo we do not touch |
| Credentials | a root-level `.env` or `.env.*.local` keeps the directory | needs `--allow-secrets` to override |
| Volatile root | the system temp dir is excluded wholesale | needs `--allow-volatile-root`; random names there may belong to other apps |
| Irreversibility | `--mode purge` **requires** `--yes`, or it exits 1 | default is `dry-run`; `to-trash` is a move, not an unlink |

The name rule earned its second clause in the first test run. The original single regex `-[A-Za-z0-9]{4,6}$` matched **`rex-work`** — a real project, four lowercase letters, exactly the shape `mktemp -d rex-XXXX` would produce. So did `hermes-setup`, `rex-videos`, `rex-ppt-codex`, `wordpress-shens`, `rex-ai-tools`, `rex-koubo`, `rex-game`, `rex-hugo`. The assertion list that caught it is now the regression guard, spelled out with real directory names:

```
harness-cli, aios, aios-pro, rex-work, rex-game, rex-hugo, rex-koubo, rex-videos,
rex-ai-tools, rex-ppt-codex, hermes-setup, wordpress-shens, claude-relay-service,
yilang-browser, inkloom.im, inkloom.im.worktrees, docsrag, agno-go, xsapp, huabu,
chrexai, tocraft-wordpass, rex-wordpass-tp        → all must be false
```

Random `mktemp` output contains an uppercase letter or a digit with ~92% probability per draw; a lowercase English word never does. The 8% case costs a missed cleanup. That is the trade this tool makes on purpose: **it would rather leave 9.9 GB on disk than delete one project directory by mistake.**

The `unknown` git state is not paranoia. A repository with commits but no upstream makes `git rev-list @{u}..HEAD` exit non-zero. Reading that as "clean" would have deleted `v650-patch-check-38213` and `ab-v641-x97833` — both real git worktrees, both with unpushed work in the general case. It reads as unreadable, unreadable means keep, keep means a human decides.

## What the real run looked like

```
$ node --test scripts/tests/tooling/tools/aios-tmp-gc.test.mjs   → 12/12 pass
$ node --test scripts/tests/tooling/tools/*.test.mjs             → 62/62 pass (no regression)
$ node scripts/check-dir-budget.mjs                              → 0 blocking
$ node scripts/aios-tmp-gc.mjs --root ~/codes --older-than 30
  collect=0  keep=34
```

`collect=0 keep=34` is the number that matters: after cleanup, the tool looks at 34 surviving real projects and proposes **nothing**. Before cleanup, pointed at the staging folder it identified 37 of 44 items and left the 7 whose names are not sandbox-shaped for a human — including the 5.8 GB release pack, which the tool will never collect by name, and which is exactly why it was checked by content instead: the four `.env*` files were hashed against the live project's copies and found byte-identical, so no credential and no unique file was destroyed.

## Deliberately not in this release

- **The gate is not wired.** A pre-tool check that refuses `mktemp -d` when its target parent is the project root would stop this at the source instead of cleaning up after. That means editing the safety gate itself — larger blast radius, separate decision.
- **The litter source is still live.** New probes appeared at 21:21 and 21:29 while this was being diagnosed, produced by a concurrent release-verification session. The rule is advisory until it is enforced.
- **9.9 GB is staged, not freed.** Everything went to `~/.Trash/aios-sandbox-cleanup-2026-10-17` via `mv`, never `rm`. macOS TCC forbids this process from enumerating `~/.Trash`, so it cannot verify what else lives there, so emptying the Trash stays a human click. `--mode purge --yes` exists for the moment a person chooses to run it.

## Upgrade notes

- If you keep projects under one parent directory and it has started sprouting `*-XXXXXX` folders: `node scripts/aios-tmp-gc.mjs --root "$HOME/codes"` to preview, `--mode to-trash` to stage reversibly, `--mode purge --yes` to actually free the space.
- Sandbox creation in scripts and sessions should be `mktemp -d -p "${TMPDIR:-/tmp}" <prefix>-XXXXXX`. The `-p` is the fix; everything else was already correct.
- Nothing else changes. No config, no CLI contract, no file layout moved in this release.
