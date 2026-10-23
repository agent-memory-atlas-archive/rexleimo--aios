# Standards-and-Spec review — pi stall self-heal, work-4 (A3-2 error-shape pin)

- **Verdict:** `pass` for work-4. This closes the last work item of
  `doc:docs/plans/2026-10-23-pi-compat-self-heal-dependency-graph.md`; with it, every item of the
  contract `doc:docs/plans/2026-10-23-pi-stall-self-heal-test-scope.md` that the graph scheduled is
  delivered (A2/A3 fix, work-1 doctor report, work-2 writer, work-3 init wiring, work-4 error-shape
  pin).
- **Fixed point:** `git:fd36253a` (work-3 review commit; the range this Command covers).
- **Diff under review:** `git:fd36253a...HEAD` = `git:4020cc27`, 44 insertions / 0 deletions in one
  test file. Non-empty, verified. `git diff --check` clean.
- **Spec source:** contract §5 item A3-2 via the dependency graph (work-4).
- **Standards sources:** `AGENTS.md`, `skill-sources/rex-engineering-standards/SKILL.md` §4, and the
  Fowler smell baseline from `rex-code-review`.
- **Independence note:** reviewed in-session by the same agent that wrote the diff; static reading
  plus real runs. Treated as self-review.

## Standards

Test-only diff, so the production axes are vacuous — verified vacuously true: no production file
touched, no test-only product出口 added (no new export, no test hook, no flag), no helper
duplicated (the temp-dir fixture follows the file's existing `mkdtemp/rm` shape used across the
repo's pi tests). The live-child case costs ~8s in the focused file and is bounded by an explicit
per-test `{ timeout: 45000 }`; it runs only when this file is selected, so the wider suite pays
nothing unless the seam changes.

## Spec (work-4)

- **Timeout error shape — covered.** An ETIMEDOUT-shaped spawn failure surfaces as `AiosCliError`
  with `exitCode === 1`, `stderr` preserved verbatim, and the invoking argv named in the message.
- **Ceiling actually binds — covered by a real scenario, not a mock.** A 60-second sleeper behind a
  temp `aiosRoot` with the real `child_process` default is killed at the 8s ceiling; the case
  asserts `AiosCliError` and wall-clock < 30s, which can only pass if the timeout fired.
- **No weakened constraints:** 0 deletions — every pre-existing assertion in the file is untouched;
  the suite went from 95 to 97 passing with no other change.
- **Scope creep:** none. No production edit, no seam change, no new file.

## Summary

Standards: 0 findings. Spec (work-4): 0 findings. This was a hardening slice by construction
(`behavior-preserving-hardening`, baseline `receipt:84c44426-79c0-48ca-88ca-8b14a606eed1`):
no RED exists because the behavior already held, and none was fabricated. Verdict `pass` for
work-4 — the remaining-scope list from the earlier reviews is now empty.
