---
title: "v6.7.0: One Command, Every Client — 'aios skill add' Gives Community Skills a Front Door"
description: "v6.7.0 closes a quiet gap in AIOS's skill system: the skills you love from outside `skill-sources/` had no way in. A great community skill (`clone-website`) lived in exactly one client's global skills directory while nine other clients couldn't see it. The fix is a front door, not a migration: `aios skill add <source>` resolves a local directory or a git URL (shallow clone, `owner/repo` shorthand included), stages it into a canonical external registry (`~/.aios/skills/external/<name>/`) with ownership metadata, and distributes copies to every client's user-level skills root. Rerunning the same command reuses what is identical and refreshes what changed. Selection is fail-closed: a multi-skill source either gets an explicit `--skill <names>`/`--yes` or an interactive prompt — never a guess."
date: 2026-10-18
tags: ["AIOS", "v6.7.0", "skills", "external-skills", "cli", "release"]
---

# v6.7.0: One Command, Every Client — 'aios skill add' Gives Community Skills a Front Door

> **TL;DR:** The best skill on this machine — `clone-website`, which reverse-engineers a live site into a pixel-perfect rebuild — was invisible to 9 of 10 clients. It worked only in `pi`, because that is where it happened to be installed. AIOS's own skill sync (`skill-sources/` + `config/skills-sync-manifest.json`) only ships skills that are part of the release; community skills had no front door at all. v6.7.0 adds one: `aios skill add <source>`. Source can be a local directory or a git URL. It stages into a canonical external registry, then distributes to every client's user-level skills root with ownership metadata. Re-running is idempotent, and the guardrails are the interesting part: fail-closed selection, force that only takes over unmanaged directories, and a self-copy guard that refused to delete the original `clone-website` while installing it.

## The gap, stated precisely

AIOS already had two skill surfaces:

1. **Canonical skills** — authored in `skill-sources/`, projected to every client by the release-time sync. Managed, versioned, tested.
2. **Whatever users drop into client skill directories** — completely unmanaged. This is where `clone-website` lived: `~/.pi/agent/skills/clone-website/`, with its `LICENSE`, `README.md`, and `SKILL.md`, presumably downloaded from a community repo at some point. One client, one directory, no provenance, no propagation.

The failure mode is invisible until it bites: you learn a skill exists in `pi`, switch to `codex`, and the skill simply isn't there. Nothing tells you it could be. That is not a bug in any component — it is a missing door.

## The pipeline: three stages, one command

`aios skill add <source> [--client <list|all>] [--skill <names>] [--yes] [--force] [--json]`

**Stage 1 — resolve the source.** A local directory whose root contains `SKILL.md` is a single skill. A directory whose immediate subdirectories each contain a `SKILL.md` is a multi-skill pack. An `https://` URL, a `*.git` suffix, or an `owner/repo` shorthand is a shallow git clone into a one-shot temp directory that the installer cleans up in a `finally` block. Anything else is refused with a single actionable line.

**Stage 2 — stage into the external registry.** `~/.aios/skills/external/<name>/` (overridable via `AIOS_HOME` for tests). Each entry carries `.aios-skill-install.json` with `client: "registry"`, `scope: "external"`, and the original source recorded in `catalogSource`. This registry runs **parallel to** the in-repo `skill-sources/` tree, not in place of it — the two sync paths converge on the same client skill roots but never share code or ownership.

**Stage 3 — distribute to every client.** The target roots come from the same `getClientHomes()` map the catalog installer uses: `~/.codex/skills`, `~/.claude/skills`, `~/.gemini/skills`, `~/.config/opencode/skills`, `~/.hermes/skills`, `~/.grok/skills`, `~/.workbuddy/skills`, `~/.pi/agent/skills`, `~/.zcode/skills`, and the Qoder edition-aware home (`~/.qoder-cn` or `~/.qoder`). Every copy writes its own metadata with `catalogSource` pointing back at the registry entry, so the whole chain is auditable: *this copy ← registry ← original source*.

The first real run said exactly what it did:

```
[copy] registry skill installed: clone-website
[copy] codex skill installed (global): clone-website
[copy] claude skill installed (global): clone-website
...
[skip] pi target is the source directory itself; keeping the original untouched
[done] ... installed=10 reused=0 replaced=0 skipped=1
```

Re-running produced the shape that makes this a *sync* and not a copy script: `installed=0 reused=10 replaced=0 skipped=0`.

## Three semantics that were decided, not defaulted

**Selection is fail-closed.** A multi-skill source with no explicit choice and no `--yes` outside a TTY does not install "all of it" and does not install "the first one". It errors with the list and the flags that resolve it. Interactive mode asks `Install which skills? [a=all, 1,3 or names, Enter=cancel]`. The principle is the same one that runs through the rest of AIOS: the core never guesses semantics from ambiguity — a missing decision is a refusal, not a default.

**`--force` is not a bulldozer.** It exists to take over an *unmanaged* directory — a target that exists but carries no AIOS metadata, perhaps something the user made or installed by hand. A managed copy whose content is identical to the source is *reused*, force or not. The distinction matters: `replaced` in the output means "AIOS overwrote something that existed", and that line should only ever appear when there was something to take over.

**The self-copy guard is not paranoia.** `copyDirRecursive` does `rmSync` on the target before copying. On the first adoption of a skill, the client target path (`~/.pi/agent/skills/clone-website`) *is* the source path. Without a guard, installing `clone-website` into `pi` would delete the original before copying it — and since the registry copy was made first, the data survives, but the user's directory becomes a re-projection instead of their original. The guard compares resolved paths and refuses to touch a target that resolves to the source, whatever the flags say.

## Known limits, stated in the changelog

The TTY prompt path has logic coverage but no live interactive session test — agents and CI exercise the `--skill`/`--yes` paths. `--mode link` (symlink from registry to clients) is rejected with an actionable error; it is a separate decision. Uninstall is not in this batch: external skills can be removed by hand, but the ownership chain in the metadata is already laid for a future `skill remove`. GitHub sources are shallow clones; there is no tarball or registry protocol.

And one honest process note: during development, a test defaulted to `client: 'all'` while mocking only three client homes — the run wrote test skills into real `~/.gemini`, `~/.hermes`, and friends. The cleanup used the same provenance mechanism the feature itself provides: every polluted directory carried `catalogSource` containing `/aios-home/skills/external/`, so 21 directories were removed precisely, with real user content untouched. The test suite now pins every client selection to the mocked set. The lesson generalizes: *a tool that distributes to many roots must be able to answer "which roots did you touch" from its own metadata* — and now it can.
