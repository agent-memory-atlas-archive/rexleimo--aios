# Standards-and-Spec review — pi compat self-heal, work-3 (init consent gate)

- **Verdict:** `pass` for work-3. The delivered slice is exactly work-3 of its dependency graph;
  work-4 (A3-2 error-shape test) is the one remaining work item and is not claimed here.
- **Fixed point:** `git:0e1e5afd` (work-2 review commit; the range this Command covers).
- **Diff under review:** `git:0e1e5afd...HEAD` = `git:23dcd348` + `git:c62f312c`, 104 insertions /
  2 deletions across 4 files (step + flag wiring + suite wiring + tests, the 2 deletions being the
  renumbered `2e` comment). Non-empty, verified. `git diff --check` clean.
- **Spec source:** `doc:docs/plans/2026-10-23-pi-stall-self-heal-test-scope.md` (contract §2/§5,
  items A4-1/A4-2) as decomposed by `doc:docs/plans/2026-10-23-pi-compat-self-heal-dependency-graph.md`
  (work-3).
- **Standards sources:** `AGENTS.md` (Coding Style, Testing, 400-line/dir budgets),
  `skill-sources/rex-engineering-standards/SKILL.md` §4, and the Fowler smell baseline from
  `rex-code-review`.
- **Independence note:** reviewed in-session by the same agent that wrote the diff. Static reading of
  the diff plus real measurements, including three live init runs against a temp pi home (since
  removed); no second agent was dispatched. Treated as self-review, same as the work-1/work-2
  reviews.

## Standards

All 12 smell-baseline entries were checked against the diff. `git diff --check` clean;
`node scripts/check-dir-budget.mjs` → `772 dirs, 24 over budget 8: 0 blocking, 0 recovered`;
`scripts/lib/tooling/components/integrations/pi/` still holds 4 entries (≤ 8).

| Smell | Result |
|---|---|
| Duplicated Code | **improved by the diff under review.** The step delegates the consented path to `ensureDeveloperRoleCompat` instead of re-spelling the write, and audits through the shared gap predicate instead of re-deriving it. The two-line relay-provider filter shared with work-1's predicate (noted as a follow-up in the work-2 review) is still shared and still untouched — correctly so, since this slice had no reason to churn it. |
| Mysterious Name | none. `runPiCompatStep`, `consent`, `needs-consent`, `wrote` state what they hold and do. |
| Feature Envy / Message Chains / Middle Man / Refused Bequest | none introduced. `runPiCompatStep` orchestrates module-local helpers; init only passes argv-derived consent and the dry-run flag. |
| Data Clumps / Primitive Obsession | judgement note: the step returns the writer's result shape plus `wrote`, with exactly one consumer (init) — not worth a class. |
| Repeated Switches | the consent/dry-run cascade is one decision site, ordered by irreversibility (advise < preview < write). |
| Shotgun Surgery / Divergent Change | none: the flag parse, usage line, pi-block step and consent semantics land in the two files that own them; the doctor is untouched. |
| Speculative Generality | none: no generic repair framework, no extra flags. `kept`/`wrote` exist for init's report line, the declared consumer. |

File granularity (§4): `compat-self-heal.mjs` 216 lines, `aios-init.mjs` step +22 lines in place —
one responsibility each, kebab-case preserved. **No hard violation found.**

Tests: 95/95 across the pi surface; focused RED `receipt:9edec3cb-7b06-47ad-ba35-109764767f30`
(exit 1, 4 fail on `init step entry must exist`, 14 judgement+writer tests still pass) → GREEN
`receipt:53bec82b-4ca3-4920-80f2-67dfcf3b625b` (exit 0, 18/18) → refactor
`receipt:61923117-1ac8-4596-84dc-4b34a7f9dc3e` (exit 0, post-refactor run of the scenario
command); `npm run test:affected` exit 0 (2337 tests). The wiring gate that caught the new test
file (`test-suite-wiring` W2/W3/W5, 3 fail) is green again after wiring the file into
`scripts/test-suites.json` beside its pi siblings — the failure and its fix are both on record.
Live init runs against a temp `PI_CODING_AGENT_DIR` (since removed): `--dry-run
--pi-compat-self-heal` printed `[plan] would declare …` with bytes unchanged; no flag printed the
`[hint]` pair with the authorizing command and wrote nothing; `--pi-compat-self-heal` printed
`[ok] … declared …` and the re-read file carried the declaration.

## Spec

Requirement-by-requirement against contract A4-1/A4-2:

- **A4-1 — covered.** Consent + dry run returns `would-add` with raw bytes identical and a `[plan]
  would declare …` line naming the model — and the same line was observed in a real
  `aios init --agent pi --dry-run --pi-compat-self-heal` run, so the test pins production
  behavior, not a seam that init bypasses.
- **A4-2 — covered twice.** No consent with gaps: bytes identical, `wrote === false`, and the output
  carries the executable `aios init --agent pi --pi-compat-self-heal` command — the one-line gate
  the contract demands (no user-global write without explicit authorization). No consent without
  gaps: bytes identical, no repair command in the output, nothing to authorize. Both observed live
  as well as asserted.
- **The flag governs the write — covered.** Consent without dry run returns `added` with
  `wrote === true` and the re-read file carries the declaration; a second consented run is
  `present` with `wrote === false`. Without this case the flag could be decorative; it is not.
- **Fail-closed paths preserved.** Malformed JSON still throws refusing-to-clobber through the
  step (the writer owns that path; the step does not swallow it), which init reports as a warning
  like every other step failure. A missing `models.json` returns `skipped` and creates nothing —
  the step never conjures a user-global file into existence.
- **Scope creep:** none. No settings.json touch, no new write surface, no change to the
  extension/MCP steps. The usage line documents the flag where the other consent flags live.

## Summary

Standards: 0 findings (12/12 smell entries checked, quantitative gates green, measurements above).
Spec (work-3): 0 findings — every A4 clause is asserted through a real temp file with re-read
*and* observed in live init runs, and the consent gate holds in both directions (flag repairs,
absence only advises). Most severe: none — verdict is `pass` for work-3; work-4 is the one
remaining work item and is not covered by this verdict.
