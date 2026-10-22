---
title: "v6.9.0: A Browser Session Should Not Be Able to Block an Upgrade — So the Profile Root Moved Out of the Install Tree"
description: "v6.9.0 moves browser profile data out of the AIOS install tree, to ~/.rexcil/browser-profiles, and closes a bug that blocked two upgrades on one Windows machine. The install swap works by renaming the install directory aside, which is safe even when other processes hold files inside it. A live Chrome whose user-data-dir sits inside that directory is a different thing: it holds the directory, and Windows refuses the rename. The fix is one environment contract (AIOS_BROWSER_PROFILE_ROOT, absolute only), a single resolver module, a migration that refuses whenever Chrome leaves its own lock marker or a live browser process still holds the directory, and two hardcoded path literals removed. config/browser-profiles.json is unchanged, because those relative strings name a profile, not a location."
date: 2026-10-22
tags: ["AIOS", "v6.9.0", "browser", "windows", "self-update", "release"]
---

# v6.9.0: A Browser Session Should Not Be Able to Block an Upgrade — So the Profile Root Moved Out of the Install Tree

> **TL;DR:** `aios update` on Windows swaps an install by **renaming** the install directory aside, then extracting the new archive into place. Renaming a directory is robust: other processes may hold *files* inside it and the rename still succeeds — we proved that repeatedly with 13 `contextdb-shell-bridge` / `ctx-agent` processes alive. It is not robust against a process holding the **directory itself**. A Chrome launched with `--user-data-dir` pointing *inside the install tree* is exactly that, and Windows refuses the rename. Two upgrades on this machine were blocked that way. v6.9.0 moves the profile root outside the install tree and adds a migration that refuses to run when a live browser holds the lock.

> **CORRECTION (v6.10.1, same day).** The causal claim above is **wrong**, and it cost a release. Measured with a reversible rename probe run *inside the real install tree*: with 16 Chrome processes holding tree-internal profiles, a `fs.watch` directory-notification handle, and an open SQLite handle all present at once, `Directory::Move` still returned `MOVE-OK`. Adding a single process whose **current working directory** is inside that subtree flips it to `EPERM`; killing that process returns `MOVE-OK`. So a live Chrome does **not** block the rename — a process **CWD inside the tree** does, and what put that CWD there was our own launcher: `cwd: rootDir` in `scripts/run-local-browser-mcp.mjs`, `cwd: PROJECT_ROOT` in `mcp-server/scripts/with-project-node.mjs`, and the same pin in the MCP registration. Every browser session therefore locked the next `aios update`, and it respawned on its own. Moving the profile root out of the install tree is still the right call — user state does not belong in an artifact we replace — but it was never the blocker, and shipping it *as* the fix is why `aios update` kept failing on 6.9.0.

## What actually happened, twice

First occurrence (21:58, during the v6.7.3 release):

```
+ retire old install dir -> C:\Users\Administrator\.rexcil\aios.retired-20261021-215811
[error] cannot swap the install dir: it is held open by a running process.
```

The refusal was *clean* — this is what the rename-aside design is for: `VERSION` still read 6.7.3, no `.retired-*` debris, no half-extracted tree, no temp leak. Chasing the handle found an orphaned `run-local-browser-mcp.mjs` plus 9 Chrome processes using `.browser-profiles\headless-check` inside the install tree. That stack exited on its own minutes later and the upgrade then completed in one shot.

Second occurrence (00:09, during the v6.8.0 release) — same error, and this time the holder was not an orphan:

| profile (inside the install tree) | chrome processes | last write |
|---|---|---|
| `.browser-profiles\grill` | 9 | 00:08 — minutes before the swap |
| `.browser-profiles\headless-check` | 10 | 00:09 |

Parent chain: `chrome ← tsx preflight ← run-local-browser-mcp ← pi-coding-agent`, all alive. A **live session in another window** was doing browser work. Nothing was going to exit on its own, so the upgrade stayed blocked, and the release shipped while this machine lagged one version behind.

That is the whole bug: two subsystems that have no reason to know about each other — the self-updater and the browser profile store — competing for the same directory name.

## The fix is a location, not a retry

Retrying the rename, or killing the browser, would both be guessing. The invariant is simple: **nothing a long-lived session can hold should live inside the directory the updater renames.**

```
before:  ~/.rexcil/aios/.browser-profiles/<name>     ← inside the swap target
after:   ~/.rexcil/browser-profiles/<name>           ← sibling, same volume
```

Same volume matters: the migration is then a single `renameSync`, not a copy — with 4,756 files in the `default` profile that is the difference between an instant move and a half-written tree.

### One contract across a language boundary

The AIOS side is `.mjs`, the browser MCP is TypeScript in a separate package, and they must agree on one path. Duplicating layout knowledge in both is how you get a login state written into a corner nobody reads. So the contract is one environment variable:

```
AIOS_BROWSER_PROFILE_ROOT   (absolute path only — a relative value is ignored)
```

- `mcp-server-builders.mjs` computes the root and injects it into the browser MCP child environment. A value the user already put in the client config wins; we do not overwrite it.
- `mcp-server/src/browser/session/profiles.ts` reads it, falling back to `REXCIL_HOME` (default `~/.rexcil`) so a standalone run still lands outside the install tree.
- `scripts/lib/tooling/components/browser/profile-root.mjs` is the single definition: root resolution, config-path mapping, lock detection, migration. `cdp-service.mjs` (macOS CDP launchd profile) and the TS side both consume it.

`config/browser-profiles.json` keeps its `.browser-profiles/default` and `.browser-profiles/local` strings **unchanged**. Those name a profile; they never chose a location. The resolver maps `.browser-profiles/<name>` (and the Windows backslash spelling) onto the new root, so relocation does not require touching user config — the same reason `package-release.sh` keeps config keys stable.

## Migration refuses, and says why

Moving a live Chrome profile corrupts login state. That is not a risk to take "usually", so the predicate starts from the marker Chrome itself writes — and here the real machine corrected my first version. I wrote it checking POSIX's `SingletonLock`, then ran the new doctor against this machine while 10 Chrome processes held `.browser-profiles\grill`, and it cheerfully reported **"unlocked"**. Windows Chrome does not write `SingletonLock`; it writes a zero-byte **`Lockfile`** (measured: present in `headless-check`, absent in `grill`, whose main process had already exited and left orphaned renderers holding the directory handles).

```js
PROFILE_LOCK_MARKERS = ['SingletonLock', 'Lockfile']   // root or any child profile dir
```

Markers alone are still not enough: a profile can be held by processes with no marker at all, which is exactly the `grill` case. So the check adds a process probe — enumerate browser images and match their `--user-data-dir` against the tree, in both the bare and the Windows `"--user-data-dir=path"` spelling:

```js
profileTreeState(root) // { busy, reason, holders }
// reason: 'free' | 'lockfile' | 'live-process' | 'probe-failed'
```

`probe-failed` counts as **busy**. "I could not check" must not turn into permission to move somebody's login state.

| status | condition | filesystem effect |
|---|---|---|
| `migrated` | legacy root present, target absent, tree free | one rename |
| `no-legacy` | nothing to do (fresh install, or already moved) | none — the normal end state |
| `target-exists` | both roots present | **never merged**; new root stays authoritative |
| `locked` | a `Lockfile`/`SingletonLock` marker, or N browser processes holding a `--user-data-dir` inside the tree, or an unavailable probe | nothing touched, reason printed |
| `error` | rename failed (e.g. cross-device) | old tree left fully intact, code reported |

Symlinked legacy roots are also refused: a symlink is not a directory AIOS owns, and renaming it could move something it points at. Every status is printed, never swallowed — `locked` in particular now says *"an `aios update` swap will be refused while that holds; close the browser, then run `aios internal browser install`"*, which is the sentence that would have saved an hour today.

`aios internal browser doctor` gained a line reporting where the root is and whether a stale one still sits inside the install tree, as warnings (which do not flip the doctor result) rather than errors — and the warning names what holds the tree: `Chrome keeps its own lock marker in the profile`, `N processes hold a --user-data-dir inside the tree`, or `the occupancy probe is unavailable, so we fail closed and do not move it`.

## Two literals that would have welded the old path back in

- `launcher.ts` fallback: `{ name: 'local', userDataDir: '.browser-profiles/local' }` → now `{ name: 'local' }`, resolved through `getProfileDir('local')`.
- `cdp-service.mjs`: `path.join(rootDir, '.browser-profiles', …)` → resolved against the profile root.

The installers' `preservePaths` deliberately still list `.browser-profiles`, `mcp-server/.browser-profiles` and `config/browser-profiles.json`. During the transition a not-yet-migrated install must survive a swap; removing that line is a later cleanup, not this release's job.

## Verification

- `node --test scripts/tests/clients/browser-core/profile-root.test.mjs` → **tests=12 pass=12 fail=0**: root outside the install tree; contract value wins and rejects relative; legacy and backslash spellings map onto the new root; absolute paths respected; unrelated relative paths keep workspace semantics; both lock markers (POSIX `SingletonLock` and Windows `Lockfile`); `live-process` counted from injected command lines in both spellings; `probe-failed` fails closed; all five migration statuses including "old tree intact on EXDEV", idempotent rerun, symlink refusal, dry-run touching nothing; CDP `userDataDir` outside the install root; builder injects an absolute contract value without clobbering a user-set one.
- `npm --prefix mcp-server run typecheck` → clean; `npm --prefix mcp-server test` → tests=117 pass=105 fail=0, including three new TS-side tests asserting the same mapping and precedence.
- Real-process validation, not mocks: a real headless Chrome was launched against a sandbox profile. With its `Lockfile` present the tree read `busy / lockfile`; deleting the marker while the process kept running still matched **10** real command lines; after the kill the tree read `free`. That run is what exposed the `SingletonLock`-only false negative above.
- Existing consumers re-run without edits: browser-core suite 61/61; `browser-local-mcp` + `aios-components` + `aios-doctor` + `aios-lifecycle-plan` + `platform-smoke` → 102/102 (the new env key breaks no config snapshot).
- Repo grep audit: no hardcoded `.browser-profiles` root remains outside the resolver, the installer preserve list, and the profile *names* in config.

## Known limits

- On this machine the stale root cannot move while a live session holds it, so `aios update` is still refused until that browser closes — now with the reason and the remedy printed instead of a bare error.
- A user who previously ran `npm run build` inside `mcp-server` may execute a stale `dist/` (the release archive excludes `dist`, so installs normally run TypeScript through `tsx` and get the new logic immediately). Rebuild or upgrade, which recreates the whole tree.
- Profile-root relocation removes the contention; it does not add a general lock protocol around the swap. If a future component stores state inside the install root, the same class of failure returns — which is why the rule is now written into `AGENTS.md` instead of left as tribal knowledge.
