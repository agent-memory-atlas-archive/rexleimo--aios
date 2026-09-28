---
title: "v6.2.0: Engineering Standards That Actually Trigger"
description: "AIOS shipped an engineering-standards skill months ago — and it never fired once. An audit that found the skill distributed but never named by its consumers, a new shared-reference projection lane, and a file-granularity baseline now put classic software engineering discipline on every code-producing path."
date: 2026-09-28
tags: ["AIOS", "v6.2.0", "engineering-standards", "rex", "skills", "projection", "clean-code"]
---

# Engineering Standards That Actually Trigger

We had a suspicion, and it was worse than we thought: AIOS shipped an
`rex-engineering-standards` skill — Clean Architecture boundaries, deep modules,
naming, a Definition of Done — and it never triggered once. Not because the
content was wrong, but because nothing that had to consume it ever named it.

## The audit

Getting the file into the package closed one break, and 0.7.0 had already closed
it: the standard used to live only in a per-machine `~/.zcode/skills/` copy that
nothing versioned — gone on reinstall, never reaching the other clients. It now
ships inside the projected skill tree.

The audit was about what survived that fix. Two breaks, each sufficient on its
own:

1. **Distributed, never named.** `install.mjs` projected the skill and
   `client-install.test.mjs` counted it, so the file sat on disk in every client.
   But nothing on the consuming side told anyone to read it: no code-producing
   Provider named it, and `AGENTS.md` did not mention it either. The referrers that
   did exist — `aios-workflow-router` and `pre-edit-safety-gate` — are host-side
   AIOS guidance, which a client running rex-harness standalone never loads. The
   file was distributed to everyone and required by no sequence. The standard claimed "read me before
   implementing", but the implementing skill didn't know it existed. Skill loading
   is pull-per-invocation; nobody pulls what nobody names.
2. **No runtime backstop.** File granularity — the thing users actually feel —
   is the easiest rule to machine-check, and nothing checked it. Neither was
   "being referenced" itself checked, which is why this break was invisible.

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
named by its consumers, projected, and checkable" — the same conclusion our
competitor analysis keeps reaching from the other direction: no mature harness
leaves "should this have happened" at the prompt layer. Standards that live only
in a prompt are suggestions. Standards that the shipped consumers name are gates.
Distribution was never the missing piece; the file was already on disk in every
client, and it still never fired.

And a guard so this cannot regress silently: `skill-sources.test.mjs` now fails
the build if any code-producing Provider stops naming the standard. A skill
nobody is told to read raises no error at runtime — so the check is objective
(string presence in the shipped skill tree), not a review opinion.

## Also in this release: the host cannot ship an unpublished kernel

The same audit exposed a worse pattern one layer up. The published v6.1.0 archive bundles the
`rex-harness` work tree, and it shipped a rex-harness version that had no tag and
no release artifact on the submodule remote. Nothing failed, because nothing
checked: the host changelog cited a kernel version that resolved to nowhere, and
standalone rex-harness consumers never received it.

`scripts/check-release-submodule.mjs` now proves the recorded gitlink is pointed
at by a tag on the submodule remote, and `release-preflight.sh` refuses to cut a
host release when it is untagged or unprovable. Release order is a gate, not a
convention: submodule release first, host release after.

Verification: 215 rex-harness tests, the client-install and skill-sources
suites, and the scripts-side projection suite all green; every projected skill
digest is registered append-only in `projection-history.json` (the 0.7.0 digest
of the standard is kept so clients already on it can upgrade), the local
projection refreshed, and `rex-harness doctor` reports zero errors.
