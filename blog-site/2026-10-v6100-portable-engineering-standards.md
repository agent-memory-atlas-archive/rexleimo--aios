---
title: "v6.10.0: A Gate You Never Configured Must Not Fail Your Build — Engineering Standards Became Portable"
description: "v6.10.0 ships the portable engineering standards engine: directory entry budget, file line budget, an approximate duplicate-line measure and a dependency-direction gate that reads a layer order the project declares. It runs in any git repository through `aios standards check`, with one project file (config/standards.json) owning budgets, exemptions, shrink-only baselines and layers. The part that matters most for adoption: a first run on an existing repository now reports stock instead of failing it, and `--freeze` converts the repository's own debt into a gate that turns red the moment it grows. Measured on a real foreign repository: 1077 red lines and exit 1 became a capped advisory report and exit 0, then a working gate whose very next added entry went red."
date: 2026-10-22
tags: ["AIOS", "v6.10.0", "engineering standards", "code quality", "release"]
---

# v6.10.0: A Gate You Never Configured Must Not Fail Your Build

> **TL;DR:** AIOS had its own quality gates — a directory-entry budget, a file-line budget, an architecture check — each with its private copy of the numbers and no way for anybody else to run them. v6.10.0 moves the rules into one engine that any git repository can call: `aios standards check`. Every entity gets a disposition — `pass`, `exempt` (with a written reason), `baseline` (existing debt, shrink only), `violation`. And because the first thing a real user would have seen was 1077 lines of red for debt they never agreed to gate on, an unconfigured repository now gets an **advisory report** instead of a failing exit code, with `--freeze` as the explicit act of accepting the gate.

## The defect was not the missing tool, it was the missing owner

`scripts/check-dir-budget.mjs` enforced 8 entries per directory. `governance.mjs` enforced roughly 400 lines per file. Both were real gates that worked, for exactly one repository, because the number and the judgement lived in the same file as the enforcement. Nothing in the rules said whether 9 entries in a `src/tables/` folder was *exempt*, *stock to be shrunk*, or a *violation* — the script only knew pass/fail, so anything that was neither clean nor acceptable had to be hard-coded into the script that measured it. That is how a gate gets muted rather than fixed: the disposition has nowhere to be written down.

The fix is to make every quantitative rule speak with one vocabulary:

```
config/standards.json
{
  "budgets":    { "directoryEntries": 8, "fileLines": { "default": 400, "entries": [{ "path": "src/generated/tables.ts", "budget": 50 }] } },
  "exemptions": { "duplicateLines": [{ "path": "src/a.ts", "reason": "generated twin kept for wire compatibility" }] },
  "baselines":  { "fileLines": [{ "path": "src/legacy/orchestrate.mjs", "count": 417 }] },
  "layers":     { "order": ["host", "kernel"], "prefixes": { "src": "host", "src/kernel": "kernel" } }
}
```

Defaults live in the rule manifest inside `rex-harness`; a project may only override them. One rule, one owner.

## Four rules, one disposition model

- **`directoryEntries`** — the 8-entry budget, now a public rule rather than a private script.
- **`fileLines`** — the ~400-line soft ceiling, per-file overrides included, because generated and table-driven files are a legitimate different answer.
- **`duplicateLines`** — approximate on purpose: a window of **6 consecutive normalized lines** appearing in more than one file, budget 0. Its limits are declared, not buried: rename identifiers and it stops seeing it; similarity under the window is not reported; self-repetition inside one file is not reported. A zero budget is now a legal declaration — a bigger one would pretend the tool can tell real duplication from coincidence.
- **`reverseDependencies`** — an inner layer pointing outward. Layers are **declared**, never inferred: `foundation` in a directory name does not mean your project forbids inward-outward edges, and the engine refuses to guess. No declaration, or no module graph, means `SKIP` with the reason, never a violation and never a clean bill.

## The number that made us change the default

Before shipping, we ran the command against a real, unrelated repository on this machine:

```
$ aios standards check --root /path/to/rex-ai-tools
directoryEntries: measured=1068 overBudget=169 blocking=169 budget=8
fileLines:        measured=1908 overBudget=28  blocking=28  budget=400
duplicateLines:   measured=880  overBudget=880 blocking=880 budget=0
exit 1   (1077 FAIL lines printed)
```

Every one of those was debt that pre-dated AIOS. A first-time user's very first run would have been a wall of red from a tool they had just agreed to try, and the honest prediction is not that they fix 1077 items — it is that they turn the tool off.

So the default changed, in the one place where a default is allowed to be lenient:

- **No `config/standards.json` in the repository** → the command reports: `STOCK` prefix, at most 20 lines per rule, full list through `--json`, **exit 0**. The library entry point stays strict, so existing host gates (AIOS's own `pretest`) are untouched.
- **`--freeze`** → records the current stock as shrink-only baselines and reports how much it froze. From that moment the repository *is* gated, and the next added item is red:

```
$ aios standards check --root repo --rule directoryEntries --freeze
[standards] frozen stock into config/standards.json: directoryEntries=169
$ echo "export const j = 1;" > repo/wide/j.mjs && git commit -a
[standards] FAIL directoryEntries wide: 10 > baseline 9 (shrink only)
exit 1        # disposition: "kind": "growth"
```

Freezing is a disposition, not an amnesty. That distinction is what makes the lenient default safe.

## Self-contained where it matters

`--write-edges` collects the module graph from the repository's own tracked sources into `.aios/standards/module-edges.json`, so the direction gate does not require a host to feed it data. It is a regular-expression approximation and says so in the rule manifest — the alternative was a second parser that nobody owns.

## What it fixed on the way out

Three silent-wrong behaviours were found while wiring this, all of which had been shipping:

1. The input-availability check treated *"requirement satisfied"* (a `null` return) as *"this build cannot supply it"*, so the direction gate skipped itself on every project.
2. A missing default file reader made every read throw, the throw was swallowed, and `fileLines` reported `measured=0 / status=ok / exit 0` over 1425 candidate files — a gate that always passes. Now measuring nothing while candidates exist is a structured `measure-error` and exit 1.
3. `receipt:` evidence references were only validated for some evidence kinds, so a fabricated reference at review stage could pass. Now every `receipt:` must resolve in the receipt store, and `git:` must be 7–40 lowercase hex characters.

## Try it

```bash
aios standards check --root .                      # advisory on an unconfigured repo, exit 0
aios standards check --root . --json               # machine-readable, one record per rule
aios standards check --root . --freeze             # accept the gate, starting from your own facts
aios standards check --root . --rule fileLines --strict   # gate now, no mercy
```

Landing boundary note: the engine, the rule manifest, the command and this release's fixes live in `rex-harness` (v0.12.0). AIOS's own repository is now one *consumer* of the same public surface, using `config/standards.json` like any other project — which is the only way to be sure the feature is not AIOS-specific in disguise.
