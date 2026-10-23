# Standards-and-Spec review — pi compat self-heal, work-2 (additive writer)

- **Verdict:** `pass` for work-2. The delivered slice is exactly work-2 of its dependency graph;
  work-3 (init wiring, A4-1/A4-2) and work-4 (A3-2 error-shape test) are separate work items and are
  not claimed here.
- **Fixed point:** `git:6420d3c9` (work-1 review commit; the range this Command covers).
- **Diff under review:** `git:6420d3c9...HEAD` = `git:7564716c` + `git:c72b7548`, 212 insertions / 0
  deletions across 2 files (writer + its tests). Non-empty, verified. `git diff --check` clean.
- **Spec source:** `doc:docs/plans/2026-10-23-pi-stall-self-heal-test-scope.md` (contract §2/§5,
  items A1-1..A1-6) as decomposed by `doc:docs/plans/2026-10-23-pi-compat-self-heal-dependency-graph.md`
  (work-2).
- **Standards sources:** `AGENTS.md` (Coding Style, Testing, 400-line/dir budgets),
  `skill-sources/rex-engineering-standards/SKILL.md` §4, and the Fowler smell baseline from
  `rex-code-review`.
- **Independence note:** reviewed in-session by the same agent that wrote the diff. Static reading of
  the diff plus real measurements; no second agent was dispatched. Treated as self-review, same as
  the work-1 review (`git:6420d3c9`).

## Standards

All 12 smell-baseline entries were checked against the diff. `git diff --check` clean;
`node scripts/check-dir-budget.mjs` → `772 dirs, 24 over budget 8: 0 blocking, 0 recovered`;
`scripts/lib/tooling/components/integrations/pi/` still holds 4 entries (≤ 8).

| Smell | Result |
|---|---|
| Duplicated Code | **judgement, follow-up only.** `evaluatedRelayModels` repeats the two-line provider filter (`openai-completions` + baseUrl present + not native) that `findDeveloperRoleCompatGaps` already spells. The two functions diverge on the third line (known-nonstandard skip vs evaluated-but-safe), so a shared `isRelayCandidate` helper would save two lines at the cost of churning work-1's reviewed predicate. Below the extraction threshold for this slice; recorded as a follow-up for the next touch of either function. The test file went the other way: REFACTOR deleted the per-test dynamic loader (24 lines) for one static binding. |
| Mysterious Name | none. `ensureDeveloperRoleCompat`, `evaluatedRelayModels`, `declaresTrue`, action names (`added / would-add / kept-user-value / present / skipped`) state what they hold and do. |
| Feature Envy / Message Chains / Middle Man / Refused Bequest | none introduced. |
| Data Clumps / Primitive Obsession | judgement note: `{modelsPath, action, gaps, kept}` is the writer's single result shape with exactly one consumer pending (work-3 init wiring); not worth a class. |
| Repeated Switches | the action cascade is one decision site, ordered by consequence (write > keep > present > skip). |
| Shotgun Surgery / Divergent Change | none: judgement, repair, and their tests live in the module that owns the predicate; the doctor is untouched by this slice. |
| Speculative Generality | none: no new config key, no generic patch API. `kept` in the result exists for work-3's report line, which is the declared next consumer, not a guess. |

File granularity (§4): `compat-self-heal.mjs` 194 lines, test file 259 lines — one responsibility
each (judgement + repair; contract assertions), kebab-case preserved. **No hard violation found.**

Tests: 91/91 across the pi surface; focused RED `receipt:81b8b4c5-0212-4857-adb4-dee1dfa2fc8c`
(exit 1, 8 fail on `writer entry must exist`, 6 judgement tests still pass — the RED is the absent
repair half, sharing work-1's pinned gap predicate) → GREEN
`receipt:1b21c84a-7a6f-4922-b1f9-a3a28dcc173e` (exit 0, 14/14) → refactor
`receipt:b8b4e18b-0501-4606-a35d-6e35dc0b0139` (exit 0, post-refactor run of the scenario command);
`npm run test:affected` exit 0 (680 tests).

## Spec

Requirement-by-requirement against contract A1-1..A1-6:

- **A1-1 — covered.** Relay-shaped fixture (name/baseUrl/api/apiKey/two models) returns `added` with
  `gaps === ['testrelay/r-flash']`; the test re-reads the file from disk and asserts
  `compat.supportsDeveloperRole === false` on the reasoning model, no `compat` key on the
  non-reasoning sibling, the `apiKey` untouched, and the second provider deep-equal.
- **A1-2 — covered.** Explicit `true` returns `kept-user-value` with raw bytes identical; the writer
  never invents a reason to touch a user choice.
- **A1-3 — covered.** `dryRun: true` returns `would-add` with raw bytes identical and a `[plan]
  would declare …` line naming the model — the same preview vocabulary `extension-settings.mjs`
  uses, so work-3's init flag speaks one language.
- **A1-4 — covered.** Malformed JSON rejects with `/refusing to clobber/` and the file bytes are
  asserted unchanged — the same fail-closed discipline as the settings writer.
- **A1-5 — covered.** First run `added`, second run `present` with bytes identical across the second
  run: declaration and idempotence in one case.
- **A1-6 — covered.** Official-OpenAI-host plus `anthropic-messages` fixture returns `skipped` with
  bytes identical — the rule demonstrably applies to nothing there.
- **Beyond the contract floor (kept as characterization, all passing):** an explicit-`true` sibling
  survives an `added` run byte-identical while its undeclared sibling is fixed; a missing
  `models.json` returns `skipped` and creates nothing (the writer never conjures a user-global file
  into existence).
- **Scope creep:** none. No init flag, no settings.json touch, no global write without an explicit
  path argument. The doctor is untouched — it still calls the predicate, never the writer.

## Summary

Standards: 0 findings (12/12 smell entries checked, quantitative gates green, measurements above).
Spec (work-2): 0 findings — every A1 clause is asserted through a real temp file with real fs and a
re-read, plus two fail-safe characterizations. 1 non-blocking follow-up: factor the two-line relay
provider filter if either predicate is touched again. Most severe: none — verdict is `pass` for
work-2; work-3 and work-4 remain open work items and are not covered by this verdict.
