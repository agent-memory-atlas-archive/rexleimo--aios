---
title: "Engineering Standards That Actually Trigger"
description: "AIOS shipped an engineering-standards skill months ago — and it never fired once. A zero-reference audit, a new shared-reference projection lane, and a file-granularity baseline now put classic software engineering discipline on every code-producing path."
date: 2026-09-28
tags: ["AIOS", "engineering-standards", "rex", "skills", "projection", "clean-code"]
---

# Engineering Standards That Actually Trigger

We had a suspicion, and it was worse than we thought: AIOS shipped an
`rex-engineering-standards` skill — Clean Architecture boundaries, deep modules,
naming, a Definition of Done — and it never triggered once. Not because the
content was wrong, but because nothing anywhere referenced it.

## The audit

Three separate breaks, each sufficient on its own:

1. **It was never in the repository.** The skill lived only in a per-machine
   `~/.zcode/skills/` directory. Not versioned, not projected to other clients,
   gone on reinstall.
2. **Zero references.** A repo-wide search found no file that mentions it — not
   AGENTS.md, not the workflow router, and crucially not `rex-implement` itself.
   The standard claimed "read me before implementing", but the implementing
   skill didn't know it existed. Skill loading is pull-per-invocation; nobody
   pulls what nobody names.
3. **No runtime backstop.** File granularity — the thing users actually feel —
   is the easiest rule to machine-check, and nothing checked it.

The result was exactly what you'd predict: code without engineering shape.
Unclear file names, one file piling up a dozen responsibilities.

## The fix: a third kind of skill

Rex skills came in two kinds: the `rex-workflow` entry, and Providers — the
capabilities a Rex Command can select and advance. The standard is neither: it
must not be a Provider (it has no capability contract), but it must travel with
the projection. So the installer grew a third lane:

- `sharedReferenceSkillIds` in `rex-harness/src/clients/install.mjs` — projected
  everywhere the Providers are, but never command-selectable. The skill's own
  contract ("not a Provider process; a prerequisite standard") stays honest.
- The code-producing Providers — `rex-implement`, `rex-design`,
  `rex-code-review`, `rex-refactor-hardening` — now carry an explicit
  prerequisite step: load the standard first, and check its Definition of Done
  alongside their own gates.
- AGENTS.md documents the rule, so every client sees it at session start.

## The missing baseline: file granularity

The standard covered functions and modules but skipped the unit users complain
about most. New §4 adds it:

- **One responsibility per file.** If the file name can't say what it holds,
  the responsibility isn't clear — split or rename before writing.
- **A ~400-line soft budget.** Near it, ask whether a responsibility boundary
  is being crossed. Over it requires a delivery note on why it's still one
  thing (generated, table-driven, and pure-data files excepted).
- **Names follow the repo** (kebab-case action modules, `index.ts` entries),
  and semantically empty splits — `a_v2`, `a_final`, `a_utils` — are banned.

It joins the Definition of Done as row 5, which means `rex-implement`'s
self-check gate now fails closed on "one big file" deliveries.

## The anti-lesson we keep re-learning

The fix that worked wasn't "write a better skill". It was "make the skill
referenced, projected, and checkable" — the same conclusion our competitor
analysis keeps reaching from the other direction: no mature harness leaves
"should this have happened" at the prompt layer. Standards that live only in a
prompt are suggestions. Standards that are named by the runtime are gates.

And a guard so this cannot regress silently: `skill-sources.test.mjs` now fails
the build if any code-producing Provider stops naming the standard. A skill that
nothing references is not a defect anyone sees at runtime — so the check is
objective (string presence in the shipped skill tree), not a review opinion.

Verification: 215 rex-harness tests, the client-install and skill-sources
suites, and the scripts-side projection suite all green; every projected skill
digest is registered append-only in `projection-history.json` (the 0.7.0 digest
of the standard is kept so clients already on it can upgrade), the local
projection refreshed, and `rex-harness doctor` reports zero errors.
