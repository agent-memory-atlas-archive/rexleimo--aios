# Standards-and-Spec review — pi stall self-heal, A2 + A3 slice

- **Verdict:** `incomplete` — the A2/A3 slice is clean on both axes; the spec source also scopes A1 and A4, and no line of them is in this diff. Reporting the delivered slice as `pass` would claim coverage that does not exist.
- **Fixed point:** `git:be18a2da` (the range the Command supplied as `targetRefs`).
- **Diff under review:** `git:be18a2da...HEAD` = `git:b1a4d4c4` + `git:f102aacd`, 149 insertions / 9 deletions across 5 files (`git diff be18a2da...HEAD --stat`). Non-empty, verified.
- **Spec source:** `doc:docs/plans/2026-10-23-pi-stall-self-heal-test-scope.md` — the registered test scope contract for work item `turn:cli:anonymous:dde8e0a3f41fe1f9` (§2 范围内 = A1, A2, A3, A4-3; §6 最小纵向切片).
- **Standards sources:** `AGENTS.md` (Coding Style, Testing, 400-line/dir budgets), `skill-sources/rex-engineering-standards/SKILL.md` §4, and the Fowler smell baseline from `rex-code-review`.
- **Independence note:** reviewed in-session by the same agent that wrote the diff. Static reading of the diff plus real measurements; no second agent was dispatched. Treat the judgement findings below as self-review, not adversarial review.

## Standards

All 12 smell-baseline entries were checked against the diff. `git diff --check` clean; `node scripts/check-dir-budget.mjs` → `771 dirs, 24 over budget 8: 0 blocking, 0 recovered`.

| Smell | Result |
|---|---|
| Duplicated Code | **improved** by `git:f102aacd`: both gate branches now return one `blockedVerdict(reason)` (`packages/aios-pi/lib/gates.mjs:60-62`) instead of two literals. Repo duplicate measure for the touched test file is **unchanged by this diff** — `scripts/tests/clients/pi-agent/pi-extension.test.mjs` reports 9 duplicated-run lines at HEAD *and* 9 at the fixed point (`aios standards check --rule duplicateLines --json`, measured by temporarily restoring the fixed-point copy of that file, then `git reset` + restore; tree verified clean with `git diff --stat HEAD` empty). |
| Mysterious Name | none. `blockedVerdict`, `execFileTimeoutMs` state what they hold. |
| Feature Envy / Message Chains / Middle Man / Refused Bequest | none introduced. |
| Data Clumps / Primitive Obsession | judgement note: the verdict `{block, reason, terminate}` is a shape repeated across two families, already factored into one constructor; not worth a class at this size. |
| Repeated Switches | `decideToolCall`'s tool-name cascade is pre-existing and unchanged in form. |
| Shotgun Surgery / Divergent Change | none: the behavior change lands in exactly the module that owns each judgement (`gates.mjs` for blocking, `aios-cli.mjs` for the spawn ceiling), plus the doc that states it (`packages/aios-pi/README.md`). |
| Speculative Generality | none: `execFileTimeoutMs` is a local constant, not an injected knob; no config key was invented for a single caller. |

File granularity (§4): `gates.mjs` 81 lines, `aios-cli.mjs` 108 lines, `pi-extension.test.mjs` 211 lines — all well inside the ~400 soft budget, one responsibility each, kebab-case names preserved. **No hard violation found.**

Tests: 34 focused tests pass (`receipt:cd50de41-532a-4366-821b-869d6c282121`, exit 0, command `node --test scripts/tests/clients/pi-agent/pi-extension.test.mjs`); the whole pi surface — `scripts/tests/clients/pi-agent/*.test.mjs` plus `scripts/tests/clients/pi-adapter/*.test.mjs` — is 75/75, and `npm run test:affected` exits 0 with 106/106. The red-time receipt for this scenario is `receipt:ce07a923-87ce-4dba-b9f7-cab97595cac6` (exit 1, 8 pass / 2 fail, the two failures being exactly the A2 and A3 assertions).

## Spec

Requirement-by-requirement against the contract:

- **A2-1 — covered.** Contract: "断言 `result.block === true` 且 `result.terminate !== true`". Implementation returns `{block, reason, terminate: false}` (`gates.mjs:43-52`); the test asserts `assert.equal(verdict.terminate, false)` (`pi-extension.test.mjs:37`), which is *stricter* than the contract floor and therefore not a weakening. Powershell path and an allowed command (`git status --short`) are both asserted in the same case.
- **A2-2 — covered, unchanged.** `write`/`edit` blocks already returned `terminate: false` before this
diff, and the case at `pi-extension.test.mjs:49-50` is untouched by it (`git diff be18a2da...HEAD` on
the test file changes exactly two assertion-bearing things: the renamed bash case and the added A3
case). Verified shape at HEAD: `{block:true, reason, terminate:false}` for both families.
- **A2-3 — covered.** The gate still blocks `rm -rf` forms, `--no-preserve-root`, fork bombs, `mkfs`
and `dd` to devices; those assertions are kept, none deleted.

> Correction, same day: an earlier draft of this review claimed the write-path assertion had been
> weakened to `verdict.block === false` and needed tightening back. That was a misread of the diff -
> no such line existed at the fixed point (`git show be18a2da:scripts/tests/clients/pi-agent/pi-extension.test.mjs`
> lines 45-46 already assert `block === true` and `terminate === false`). Recorded here so the audit
> trail shows the wrong finding was retracted against real file content, not quietly deleted.

- **A3-1 — covered.** `timeout: 120000` → `8000` (`aios-cli.mjs:58-63`), asserted through the injected `execFileImpl` as `options.timeout === 8000` (`pi-extension.test.mjs:53-64`) — the existing injection seam, not a mock that replaces the behavior under test.
- **A3-2 — FINDING (judgement, actionable).** The contract lists the timeout's *error shape* as a scenario: "注入 `execFileImpl` 模拟永不回调 —— 在 8000ms 后得到 `AiosCliError`，而不是让测试悬挂". No test was added. The path is unmodified by this diff, and a probe confirms the shape survives (`runAios` with an `execFile` callback carrying `code: 'ETIMEDOUT'` → `AiosCliError`, `exitCode 1`, empty `stderr`), but a probe is not a gate. **Fix:** add the A3-2 case in the next slice, or explicitly re-scope the contract to drop it with a recorded reason.
- **A1, A4-3, A4-1, A4-2 — FINDING (hard, scope).** Contract §2 puts the `models.json` compat self-heal, the doctor check and the init wiring **in scope**; §6 names A1-1 as the minimal vertical slice. None of them is in this diff — there is no `pi-compat-self-heal.mjs`, no `compatAtRisk` in `doctor.mjs`, no `--pi-compat-self-heal` in `scripts/aios-init.mjs`. This is not drift inside the change, it is the second activation of the same contract, and the acceptance decision recorded for this Command binds `node --test scripts/tests/clients/pi-agent/pi-extension.test.mjs` as its only scenario command, so A1's receipts cannot be attached here. **Fix:** run the compat slice as its own testability decision + TDD cycle. Its honest RED is different in kind from A2/A3: `doctorPiBridge` is an existing public surface, so the missing `compatAtRisk` warning fails on a real assertion — but `pi-compat-self-heal.mjs` has no entry yet, so that half cannot produce a behavior RED before it exists and needs the §3.5 note ("公共入口尚不存在") in its decision record.
- **Scope creep:** none. The only file beyond implementation and tests is the user-visible contract text `packages/aios-pi/README.md:58-62`, which had to change because it previously documented the terminating behavior this diff removes; `CHANGELOG.md` and `VERSION` are untouched (they move at release, per the repo's release commits).

## Summary

Standards: 0 findings (12/12 smell entries checked, quantitative gates green, measurements above).
Spec: 2 findings — 1 hard (A1/A4 scoped by the contract but absent from this diff, i.e. this cycle
delivers a slice, not the contract) and 1 judgement (A3-2 error-shape scenario has no test). Most
severe: the A1/A4 scope gap, which is why the verdict is `incomplete` rather than `pass`. One
review finding (a suspected weakened write-path assertion) was retracted against file content; see
the correction note above.
