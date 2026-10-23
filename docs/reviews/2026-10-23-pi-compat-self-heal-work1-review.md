# Standards-and-Spec review — pi compat self-heal, work-1 (doctor report)

- **Verdict:** `pass` for work-1, with 1 judgement follow-up recorded below. The delivered slice is
  exactly work-1 of its dependency graph; work-2 (writer), work-3 (init wiring) and work-4 (A3-2
  error-shape test) are separate work items and are not claimed here.
- **Fixed point:** `git:ec080a13` (dependency-graph commit; the range this Command covers).
- **Diff under review:** `git:ec080a13...HEAD` = `git:7f6a062a` + `git:d0af5203`, 330 insertions / 0
  deletions across 4 files (2 new, 1 extended test file, 9 added lines in `doctor.mjs`).
  Non-empty, verified. `git diff --check` clean.
- **Spec source:** `doc:docs/plans/2026-10-23-pi-stall-self-heal-test-scope.md` (contract §2/§5/§6,
  item A4-3) as decomposed by `doc:docs/plans/2026-10-23-pi-compat-self-heal-dependency-graph.md`
  (work-1).
- **Standards sources:** `AGENTS.md` (Coding Style, Testing, 400-line/dir budgets),
  `skill-sources/rex-engineering-standards/SKILL.md` §4, and the Fowler smell baseline from
  `rex-code-review`.
- **Independence note:** reviewed in-session by the same agent that wrote the diff. Static reading of
  the diff plus real measurements; no second agent was dispatched. Treated as self-review, same as
  the A2/A3 review (`git:38118f76` + `git:ba3abad0`).

## Standards

All 12 smell-baseline entries were checked against the diff. `git diff --check` clean;
`node scripts/check-dir-budget.mjs` → `772 dirs, 24 over budget 8: 0 blocking, 0 recovered`;
`scripts/lib/tooling/components/integrations/pi/` holds 4 entries (≤ 8).

| Smell | Result |
|---|---|
| Duplicated Code | **judgement, follow-up only.** The new doctor tests repeat the file's existing `withPiHome` + `mkdir` + `writeFile(mcpJsonPath)` fixture shape (15 occurrences at the fixed point, 19 at HEAD). The repo `duplicateLines` rule flags the file (114 lines at HEAD), but the pattern pre-exists and the rule is approximation-grade, red-by-default stock (600 repo-wide), deliberately not wired into `pretest:scripts`. Extracting a shared fixture helper would churn 8 pre-existing tests — out of scope for this slice. The production code itself went the other way: `git:d0af5203` factored the audit into one `auditPiCompat` owner so the predicate and its wording cannot drift apart. |
| Mysterious Name | none. `findDeveloperRoleCompatGaps`, `auditPiCompat`, `compatAtRisk` state what they hold. |
| Feature Envy / Message Chains / Middle Man / Refused Bequest | none introduced. |
| Data Clumps / Primitive Obsession | judgement note: the `{gaps, warnings, errors}` outcome is a small struct shared by exactly one producer and one consumer; not worth a class. |
| Repeated Switches | the `api`/`baseUrl` cascade reads as one predicate table over provider config; single site. |
| Shotgun Surgery / Divergent Change | none: the judgement lives in the new module that owns it, the doctor only maps the outcome onto its result shape, tests sit beside their seam. |
| Speculative Generality | none: no config key, no flag, no option was invented. The write path this report points at (`--pi-compat-self-heal`) does not exist yet and is work-3, not a stub here. |

File granularity (§4): `compat-self-heal.mjs` 130 lines, `doctor.mjs` 150 lines,
`pi-compat-self-heal.test.mjs` 108 lines — one responsibility each, kebab-case preserved.
**No hard violation found.**

Tests: 83/83 across the pi surface (`scripts/tests/clients/pi-agent/*.test.mjs` +
`scripts/tests/clients/pi-adapter/*.test.mjs`); focused RED `receipt:7a44cdfd-7a02-40cf-8d72-e74f81b38fd0`
(exit 1, 2 fail on `compatAtRisk === undefined` vs the expected ids) → GREEN
`receipt:b735b26a-bb26-47f2-9cf9-285dea9aa507` (exit 0, 10/10) → refactor
`receipt:4439d6c3-748e-4c59-9fe3-3c595f1b1777` (exit 0, post-refactor run of the scenario
command); `npm run test:affected` exit 0 (666 tests). Measured against the real
`~/.pi/agent/models.json`, the predicate names exactly `meqwen/qwen3.8`,
`agnes/agnes-3.0-flash`, `rexai-chat/deepseek-flash` — and stays silent on `bailian` (declared),
`api.openai.com`, `api.deepseek.com`, `opencode.ai` and `anthropic-messages` surfaces.

## Spec

Requirement-by-requirement against work-1 (contract A4-3: "doctorPiBridge 增加 compat 检查 —
缺声明 → 一条 warn 且带 --fix/init 修复指引；已声明 → [ok]，warning 计数为 0"):

- **缺声明 → warn + 修复指引 — covered.** A relay `openai-completions` provider with a reasoning
  model and no `compat` key yields `compatAtRisk === ['testrelay/r-flash']`, one `[warn]` naming the
  model plus the role/400 causality line plus `repair: aios init --agent pi --pi-compat-self-heal`,
  and exactly one added `effectiveWarnings` (the missing-adapter warning in the fixture is orthogonal
  and pre-existing).
- **已声明 → [ok], warning 计数为 0 (compat 部分) — covered.** Declared-false (model level and
  provider level), declared-true (a user choice, still a declaration — nothing is missing), official
  OpenAI host, and `anthropic-messages` surface all yield `compatAtRisk === []` and no
  `supportsDeveloperRole` log line.
- **Fail-closed on malformed models.json — covered beyond the contract floor.** `auditPiCompat`
  returns `{gaps: [], errors: 1}`, logs that AIOS never rewrites it automatically, and the file bytes
  are asserted unchanged. Mirrors the `refusing to clobber` discipline of `extension-settings.mjs`.
- **Read-only — covered.** The audit asserts file bytes identical before/after on the positive path
  too; the repair stays a printed command, not an act.
- **Scope creep:** none. No writer, no init flag, no settings.json touch. The review-referenced
  `--pi-compat-self-heal` string appears only inside a log line pointing at work-3.
- **FOLLOW-UP (judgement, not blocking):** extract the repeated `withPiHome` + managed-servers
  `mcp.json` fixture into a helper shared by `pi-doctor.test.mjs` (and the future A1/A4-1/A4-2
  tests in `pi-compat-self-heal.test.mjs`) when work-2 lands and touches the same fixtures a third
  time. Doing it now would churn 8 passing tests for aesthetics.

## Summary

Standards: 0 findings (12/12 smell entries checked, quantitative gates green, measurements above).
Spec (work-1): 0 findings — every A4-3 clause is asserted, including the fail-closed and read-only
properties the contract implies but does not spell out. 1 non-blocking follow-up: shared doctor
fixture helper at the next slice that repeats the shape. Most severe: none — verdict is `pass` for
work-1; work-2..work-4 remain open work items and are not covered by this verdict.
