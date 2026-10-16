# Outstanding work

> Living register. Updated whenever an item opens or closes — update it in the same commit as the change.
> Last updated: 2026-10-15 (final rounds): A16 closed — the dead barrel `src/core/index.mjs` was deleted after a full reference sweep (zero importers; owner authorized the delete-or-adopt choice, deletion chosen). The mattpocock/skills v1.3.0 trio landed on both faces: parent AIOS entries (`retro`, `implement-spec`, descriptions rewritten trigger-first) plus three standalone-facing orchestration skills in rex-harness (`rex-implement-spec` / `rex-pr` / `rex-retro`, not yet committed — pending operator review, then certify + release flow). Release state: work-7's first operator gate is **cleared** — rex-harness v0.10.1 tagged at `20e2179` (gitlink `7336ee69` + two remote website fixes + a release bump; src/ byte-identical to v0.10.0), GitHub Release published with `rex-harness-0.10.1.tar.gz`. work-7 minor (v6.3.0 -> v6.4.0) remains blocked on one gate: the en/zh/ja/ko blog posts must exist before VERSION is bumped. C5 (operator terminal deletion of the 93 backups) is still pending your terminal. Previous: 2026-10-15 (later rounds): A20 closed the Skill certification base mismatch, A21 made a planned turn reuse the active ledger, A22 gave `plan start` a canonical work-item id, A23 propagated that id into the gate's ledger and its Capability binding, and A15 brought the five `shell: pwsh` workflow steps inside the shell-syntax guard. Previous: 2026-10-15 (resume) A19 opened and closed on the same turn — the `aios plan` CLI silently substituted a read-only view for write requests, which is how the finished 2026-09-18 triage plan stayed `executing` for three weeks and kept hijacking every 「继续」 resume. Previous: 2026-10-14 (third round): A18 mitigated by work-9 (taskkill wait capped at 1500 ms; the environment-side degradation stays open) and work-8 shipped in rex-harness 0.10.0 (recovery backups are now pruned on successful installs); C5 added for the still-pending operator deletion of the 93 historical backups. Before that: A17 opened (the turn settlement gate has no production importer); 2026-09-22, after the zcode verification — A14 closed, A15/A16 remained open.
> Source of truth for the last delivered work item: `docs/plans/2026-10-15-a23-make-plan-auto-gate-accept-the-declared-work-item-identity.md` (closed). `docs/plans/2026-10-14-submodule-boundary-and-loop-closure.md` still carries the operator-only remainders (work-5 backup deletion, work-7 release cut, work-10 blocked by ADR 0002).

Items are split by **who owns the fix**, because that is what decides where the change lands:

- **A. This repository** — the AIOS runtime under `scripts/`.
- **B. rex-harness / MCP adapter** — the control plane contract (Fact → Capability → Evidence).
- **C. Owner actions** — not code; only you can do them.

---

## A. This repository (AIOS runtime)

### A1 — Wire the 82 test files that no test entry reaches

- **Status**: **RESOLVED 2026-09-21.** All 82 wired; `knownUnwired` 82 → 73 → 68 → **0**. The last 68 were never failing — bulk probe `node --test <68 files>` gave 589 tests / 588 pass / 0 fail / 1 skipped — so they were appended to the `regression` suite in `scripts/test-suites.json` (129 → 197 files) and the snapshot refreshed to `[]` (guard W1/W2/W3 3/3). Full gate via `npm run test:affected`: 1998 tests / 1989 pass / 0 fail / 9 skipped.
- **Facts**: `scripts/tests/` holds 255 `*.test.mjs`. `scripts/test-suites.json` registers 111. `package.json` entries reach 173. **82 files are reachable from no entry point.** Running those 82 by hand gives 677 tests / 653 pass / 23 fail.
- **Guard already shipped**: `scripts/tests/test-suite-wiring.test.mjs` (W1 dangling refs, W2 new unwired file fails with the file named, W3 baseline drift) plus `scripts/test-wiring-snapshot.json` (82 entries, refresh with `AIOS_UPDATE_TEST_WIRING=1`). The invariant is **entry-point reachability**, not "registered in test-suites.json".
- **Next**: finish A2, then wire family by family, then shrink the snapshot by exactly the wired count (W3 fails until it is refreshed).

### A2 — The 18 remaining failures across 13 files

Counted as 23 minus the 5 fixed in v5.19.2 (derived from the triage data, not re-measured).

| Class | Files | Action |
| --- | --- | --- |
| Environment-dependent | `platform-smoke` | **RESOLVED 2026-09-21 — the triage premise was wrong.** The two real failures were static-analysis rot, not the absent python interpreter: the TLS pin anchored on the first literal `aios-install.ps1` (now the preferred local installer path — real contract: Tls12 is the first statement of the generated PowerShell script), and the tsx-dispatch pin still read `dispatch.mjs` after TUI startup moved to `dispatch/helpers.mjs`. 19/19 |
| Local state residue | `pi-shipped-content-hygiene` | **RESOLVED 2026-09-21.** The `.pi/skills` junction was removed, which exposed a masked second failure: `REPO_RELATIVE_INVOCATION` matched `scripts\` inside the absolute Windows install-root path the same test demands — Windows-only self-contradiction, third alternative now token-anchored. 7/7 |
| Stale fixture pin | `rex-v2-case-selection`, `rex-batch-invalid-training-evidence`, `rex-planning-training-evidence`, `rex-strict-tdd-training-evidence`, `rex-test-design-training-evidence` | **RESOLVED 2026-09-21 via A+C.** Re-certified all 7 involved skills (deterministic, no LLM), rewrote the 5 tests to read tracked V2 evidence through the production gate instead of the gitignored `.skillopt/` fixtures (unrunnable in CI). All 5 green, wired; `knownUnwired` 73 → 68 |
| Stale reason code | `doctor-bootstrap-task` | **RESOLVED 2026-09-21 — the implementation is the contract** (granular codes from the c85a51c3 split; runtime reads `.current-task` at startup; old code has no other consumer). Test updated to `pending-bootstrap` / `pending-stale`. 7/7 |
| Needs adjudication | `death-notice`, `hook-user-prompt`, `interception-mcp-stdio`, `automem-loop`, `ecc-agent-workflow` | **RESOLVED 2026-09-21 — all five adjudicated; in every case the test was stale.** automem-loop: auto writes land as `candidate` by explicit design (bare runtime identity); death-notice: path derives from the context-db root, not the raw workspace root; interception-mcp-stdio: payload passes through by design since 3b689cc4 (packet rides in `_meta.aios`) — red since 2026-06-11, not a regression; hook-user-prompt: north-star principle — no read-only guessing from free text, so bounded prompts are `guarded`; ecc-agent-workflow: no client is `deprecated` any more, so the compatibility-tier reason cannot fire |

### A3 — Decide what the rex training pin means (blocked 5 files)

- **Status**: **RESOLVED 2026-09-21 — owner approved A+C** ("按计划 fix 掉").
- **Verified fact**: `aios skill certify` writes only `docs/evidence/skill-training/**` and **never** touches `.skillopt/**`, while all five tests read `.skillopt/<skill>-2026-07-18/` (`gate.baselineHash`). Re-certifying alone therefore cannot turn them green by construction.
- **Why they fail**: `hash(rex-harness/skill-sources/rex-implement/SKILL.md)` no longer matches the recorded baseline, because the Skill content changed on 2026-08-02 (submodule `2c33fbd`) after the fixtures were produced on 2026-07-18.
- **Fix (A+C)**: re-certified all 7 involved skills with base=HEAD (all `accepted`; certify/evaluate is deterministic local scoring — no LLM, no network). Rewrote the 5 tests to assert, via the production `verifySkillTrainingGate`, that the current Skill content is covered by tracked V2 evidence whose `acceptedSkillHash` matches it (new shared helper `scripts/tests/fixtures/skill-training-freshness.mjs`); `rex-batch-invalid` keeps its distinctive intent hermetically — accepted evidence verifies, then a `summary.trainHard` tamper on `candidate.scored.json` (the recorded `summary_metric_mismatch` shape) is blocked by the gate.
- **Two traps found and avoided**: (1) `.skillopt/` is gitignored and zero-tracked — the old tests could never run in CI, which is the real reason they were never wired; the rewrite to tracked evidence fixes that. (2) The gate re-derives the baseline from `base` (default HEAD), so old change-certs (baseline = pre-change content, or base = a tag that no longer resolves identically) fail deep validation — certs must be produced at HEAD to be verifiable; a relative `statePath` also breaks the gate's `artifactPath` prefix check (absolute paths required).

### A4 — Small, independent

- **`work-env-py`** — **RESOLVED 2026-09-21**: the premise was wrong (see the `platform-smoke` row); no environment skip was needed.
- **`work-residue`** — **RESOLVED 2026-09-21** (see the `pi-shipped-content-hygiene` row).
- **`work-stale-code`** — **RESOLVED 2026-09-21** (see the `doctor-bootstrap-task` row).
- **`work-adjudicate`** — **RESOLVED 2026-09-21**: all five files adjudicated; the test was stale in every case (details in the table above and in the plan doc's work-item ledger).
- **`work-wire` / `work-snapshot-refresh`** — **RESOLVED 2026-09-21, fully**: all remaining 68 wired (never-failing, bulk-verified green), `knownUnwired` → 0, guard W1/W2/W3 3/3. `npm run test:affected` ran the full pool itself: 1998 tests / 1989 pass / 0 fail / 9 skipped.
- **Release-ceremony correction (2026-09-21)**: `check-site-sync`'s `findCurrentReleaseBlogErrors` demanded a VERSION-marker blog post in en/zh/ja/ko for *every* version bump, which forced a maintenance patch into public marketing copy. Repo history shows the real convention — v5.17.0–v5.17.4 shipped changelog-only with no posts at all. The gate now exempts maintenance (patch > 0) releases; minor/major still require the post, and unknown version shapes default to requiring it.

---

### A5 — RESOLVED 2026-09-21 (v6.0.9): W5 landed; W4 rejected on measurement

- **The gap**: the guard proved a test file was *reachable from a test entry*, never that CI *executed* it. A7 is what that costs: 41 files satisfied W2 through globs in `test:*` scripts no workflow invoked, so they were silently red for weeks — including a real `ReferenceError` in shipped code (A8).
- **W5 (shipped)**: `scripts/tests/tooling/suites/test-suite-wiring.test.mjs` (its location after the 2026-10 test-tree move) now resolves the scripts CI actually invokes — following `npm run` chains and npm’s implicit `pre<name>` hook, then expanding each script’s `scripts/tests/...` globs and `run-test-suite.mjs <suite>` manifests — and fails for any test file no CI-reachable entry executes. Exemptions must be recorded in `scripts/test-wiring-snapshot.json.knownNotInCi` with a reason (currently empty: every file in the `scripts/tests` listing was CI-reachable as measured on 2026-09-21), and a drift test keeps that baseline from rotting, mirroring W3.
- **W5 verified non-vacuous by mutation**: adding a test file wired only to a new `test:*` script that no workflow runs makes W5 fail with the file named while W2 still passes — i.e. W5 catches precisely what W2 missed.
- **W4 (rejected, with evidence)**: the proposed static lint — "a test must not read a gitignored generated root" — was measured over `scripts/tests` and does not work as a text rule: a raw literal scan hits **64/259** files (nearly all legitimate temp-root fixture writes and client-root mappings), and a read-call-scoped scan hits **0 real cases** (2 false positives, one of them a `state.json`\-contains-`stat` substring artefact). It would not have caught the historical bugs at all, because those built their paths through helpers and variables (`resolveGeneratedTargetPath(...)`, `path.join(process.cwd(), root, ...)`). A noisy allow-list or a rule that cannot see the real cases is the fake pass the guard’s own contract forbids, so the decision and its measurements are recorded in the guard’s header instead.
- **W5 supersedes W4 for this class**: a test that depends on a developer-only artifact now fails in CI, where that artifact does not exist. That is the sound mechanism; no text lint can substitute for it.
### A6 — RESOLVED 2026-09-21 (v6.0.11): an indented heredoc terminator, not a health failure

- **The bug**: in `release-health-watch.yml`, the `Run release strict health gate` step's `node - <<'NODE'` heredoc was indented **12** spaces while the YAML block's base indentation was **10**. YAML strips the base indentation, so the terminator survived as `"  NODE"` — and bash only accepts a here-document terminator at column 0 (`<<-` strips *tabs*, not spaces). The heredoc never closed, bash swallowed the rest of the script, and the step died before executing a single command: `syntax error: unexpected end of file from \`if' command` → **exit 2**. Every other heredoc in that file (and in all seven workflows) sits at the block base and works.
- **Why it looked like a health problem**: the step failed while `Fail when release health is unhealthy` was **skipped**, and later steps still succeeded — because `Build release health summary` has a fallback payload for the missing `release-status.json`, and the decision step defaulted the empty `exit_code` output to `1`. A step that dies before running cannot report a verdict, and the old step also captured `gate_exit_code` without ever testing it.
- **How it was found without the job log** (log download returns 403 for non-admins): exit code **2** is the signature of a shell/parse error rather than a gate verdict, so I extracted the step exactly as YAML delivers it and ran it — `bash -n` reported the unterminated here-document and `bash -e` reproduced **exit 2** on the spot. The workflow blob was byte-identical to what ran, so no log was needed.
- **Correction to an earlier note in this register**: I had written that "CRLF is present in the committed blobs of *all* workflows". That was wrong — it was an artefact of a broken `$('\r')` shell pattern that degraded to an empty regex and matched every line. The committed workflow blobs contain **zero** CR characters. The indentation bug above was the real cause, and it is unrelated to line endings.
- **Fix**: dedented the heredoc to the block base (terminator now reaches column 0), recorded which branch ran, and gave the step an explicit contract — a gate verdict (`0` ok / `1` unhealthy) is data for the decision step, while any other exit code means *this step* broke and is re-raised as a failure. The outcome is also published as a `::notice::`/`::error::` annotation, so the next occurrence is readable through the public API without admin rights.
- **Guard (S1/S2)**: new `scripts/tests/workflow-shell-syntax.test.mjs` parses every workflow with `yaml` and asserts (S1) that each here-document terminator is bash-legal and (S2) that `bash -n` accepts every bash `run:` block (`shell: pwsh` steps are out of scope). Wired into the `regression` suite (198 → 199 files). Verified non-vacuous: before the fix both assertions fail naming `release-health-watch.yml :: release-health :: Run release strict health gate`; after it, both pass.
- **Verified end to end**: running the step as YAML delivers it now exits **0**, writes `exit_code=0` to `GITHUB_OUTPUT`, produces `release-status.json` with `health.status = not_configured`, and emits `::notice title=release-gate::branch=not-configured exit=0`.
### A7 — RESOLVED 2026-09-21 (v6.0.8): the `test:rl-*` suites now run in CI

- **Was open**: 41 files were covered only by `test:rl-core` / `test:rl-shell-v1` / `test:rl-browser-v1` / `test:rl-orchestrator-v1` / `test:rl-mixed-v1`, and no workflow invoked any of those scripts — the wiring guard proves a file is reachable from *a script*, never that CI *runs* that script.
- **Fixed**: new `test:rl` script chaining all five (~25s), wired as an explicit step in both `ci-main.yml` (with a failure summary and the log added to the `scripts-tests-log` artifact) and `release.yml`.
- **What the first real run found** — all five were red, now green (160 tests): `rl-orchestrator-v1` 7/17 → **17/17** (A8, a real shipped-code `ReferenceError`), `rl-shell-v1` 68/75 → **75/75** (four fixtures written to the wrong tree + one stale help assertion), `rl-mixed-v1` 12/13 → **13/13** (A9), `rl-browser-v1` 6/6 and `rl-core` 49/49 already green.
- **Residual**: the *reason this was invisible* is still unguarded. See A5 — proposed **W5**: every `test:*` script must be reachable from a workflow, or be listed with an explicit reason.
### A8 — RESOLVED 2026-09-21 (v6.0.7): `normalizeText is not defined` in shipped code

- **The bug**: `scripts/lib/rl-orchestrator-v1/decision-runner/shared.mjs` opened with `export { computeHash, normalizeText } from '../../../../src/shared/normalize.mjs'` and then **called `normalizeText` locally** (6 uses, lines 26/111/136-138). In ESM an `export … from` only forwards a binding — it does not bring the name into the module scope — so every executor-evidence path threw `ReferenceError: normalizeText is not defined`. Fixed by importing and then re-exporting (public surface unchanged).
- **Impact**: repaired **10 tests** in `test:rl-orchestrator-v1` (7/17 → 17/17). This is a genuine production defect that survived because A7 means no CI job runs that suite.
- **Checked and deliberately left alone**: `scripts/lib/harness/groupchat-runtime/shared.mjs` has the same re-export form but never uses the name locally, so it is correct as-is.
- **Verification**: `npm run test:affected` → 613 tests / 612 pass / 0 fail / 1 skipped.

### A9 — RESOLVED 2026-09-21 (v6.0.8): stale path, not a missing task source

- **Correction first**: my earlier analysis here was **wrong**. I concluded `runMixedCampaign` returned `buildNoWorkResult` and wrote nothing. A second probe showed it runs fine (`status: ok`, 3 batches, environment counts 4/4/4) and writes the checkpoint index — under **`<rootDir>/.aios/experiments/rl-mixed-v1/…`**, while the test read `<rootDir>/experiments/rl-mixed-v1/…`, missing the `.aios/` prefix. My first probe only listed `<rootDir>/experiments`, so I "confirmed" the absence I had assumed. Lesson: a probe that reports a negative must look where the code actually writes, not where the test asserts.
- **Fix**: read `seeded.summary.policy_checkpoint.index_path` (the path the campaign reports), matching what the sibling test already did. `rl-mixed-v1` 12/13 → **13/13**.
- **Same class, more instances while fixing A7**: `rl-shell-v1` had four tests writing seeds/config to `<rootDir>/experiments/**` while `task-registry.mjs` reads `<rootDir>/.aios/experiments/rl-shell-v1/**`. Fixed by extracting `scripts/tests/fixtures/rl-shell-benchmark-corpus.mjs`, which owns the path constants and a valid corpus (3 seeds × 16 variants → exactly 32 train / 16 held-out, every seed’s baseline genuinely failing so the tasks are not excluded as `baseline_not_reproduced`).
- **Also fixed in that suite**: two entrypoint tests ran the CLI with `cwd: REPO_ROOT` against a benchmark corpus the repo does not ship (the experiment tree is untracked) — now they seed a temp root and run the CLI there; and the usage test asserted exit 1 plus a `--resume` flag, neither of which the CLI has ever produced (see A10).
### A10 — RESOLVED 2026-09-21 (v6.0.10): per-command flags are discoverable from help

- **The gap**: `createCliParser` (`src/shared/cli-parser.mjs`, backing 12 CLIs) registered each subcommand’s options with commander, but `parse()` returned only `help: true` — the caller could not tell *which* command’s help was requested, so every caller printed `program.helpInformation()`, which renders each subcommand’s options as the placeholder `[options]`. No per-command flag was reachable from any `--help` output; `--resume` on `phase3-train` was one example.
- **Fix**: `parse()` now reports `helpCommand`, `createCliParser` exposes `helpText(name)` (rendering that command’s `Options`, falling back to top level for an empty or unknown name), and the three CLIs that have both subcommands and a help path — `rl-shell-v1.mjs`, `rl-mixed-v1.mjs`, `privacy-guard.mjs` — now print `cli.helpText(parsed.helpCommand)`. `help <command>` and `<command> --help` both work; a bare invocation, `-h`, and `help <unknown>` still print top-level help.
- **Coverage**: `createCliParser` had **no test file at all** across its 12 consumers, so `scripts/tests/cli-parser-help.test.mjs` was added (7 tests: helpCommand for each request form, unknown-command fallback, `helpText` content, and that subcommand flags/positionals still parse). It is wired into the `regression` suite (197 → 198 files).
- **Assertion restored**: the `rl-shell-v1` entrypoint test that had been downgraded now runs `help phase3-train` and asserts `--config`, `--resume`, and `--max-tasks` are documented, plus a separate test for the phase-3 command list.
---

### A11 — RESOLVED 2026-09-21 (v6.0.12): the A8 defect had a second instance, now guarded

- **Defect (audit F1)**: `scripts/lib/rl-core/trainer/core.mjs` opened with `export { clone, computeHash } from ...` and then called `computeHash` locally inside `nextRandom` → `ReferenceError: computeHash is not defined`. **Reproduced**: `nextRandom({})` threw.
- **Why CI stayed green**: `bandit.mjs` gets its state from `ensureBanditState()`, which (correctly importing `computeHash`) seeds `rngState` first, so the branch was rarely reached — a *latent* crash, not a live one. Still wrong: `Number(state.rngState || 0)` also treats a legitimate `rngState === 0` as unset.
- **Process gap this exposed**: A8 was fixed as a one-off patch with no guard, so the class recurred. Fixed the instance (import, then re-export — verified `nextRandom({})` now returns and the public surface still exposes `computeHash`/`clone`) **and** added `scripts/tests/esm-reexport-binding.test.mjs`. It scans every module under `scripts`/`src`/`packages`/`mcp-server/src` for re-exported names used without a local binding, using a comment- and string-aware code view (the naive scan false-positived on a comment header in `src/core/index.mjs` and on its own test data). Wired into `regression`.
- **Non-vacuous**: the guard failed before the fix, naming `scripts/lib/rl-core/trainer/core.mjs -> computeHash`, and passes after. It also unit-tests the detector: comment-only mention, quoted export text, binding via `import`, binding via local declaration.

### A12 — RESOLVED 2026-09-21 (v6.0.12): test entries could reference files that do not exist

- **Defect (audit F2, design gap)**: `node --test` exits **0** when a path is missing or a glob matches nothing — measured both ways (`Could not find <path>` alongside `exit 0`, and `pass 0 / fail 0 / exit 0` for an empty glob). A `test:*` script can therefore shrink coverage in silence. **Live instance**: `test:workflow-policy` referenced `scripts/tests/default-mode.test.mjs`, which had been *moved* to `scripts/tests/unit/` by `62e3ff9c` and never updated; the script kept reporting green with 63 tests.
- **Guard coverage before this**: W1 checked only `test-suites.json`; W2/W5 checked file → entry reachability, never entry → file.
- **Fix + guard**: the stale path is gone from `test:workflow-policy` (that file is registered in the `unit` suite instead), and **W6** now asserts every `scripts/...` reference in a `pretest:*`/`test:*` script resolves — explicit paths must exist, globs must match at least one file, and `run-test-suite.mjs <suite>` must name a known suite that resolves to at least one file. Non-vacuous: W6 failed before the fix, naming `missing file -> scripts/tests/default-mode.test.mjs`.

### A13 — RESOLVED 2026-09-21 (v6.0.12): `scripts/tests/unit/**` was outside every guard and every CI job

- **Defect (audit F7 — worse than it first looked)**: the `unit` suite was defined **in code only** (`roots: ['scripts/tests/unit']`) and not in `test-suites.json`, while `wiring()` listed only the top level of `scripts/tests`. Both `scripts/tests/unit/*.test.mjs` were therefore invisible to W2/W5 — in no suite, in no CI job — and one of them was **red**: `test-suite-runner.test.mjs` pinned `regression.concurrency === 1` long after the manifest moved to 4. A refactor silently dropped coverage, the same family as A1/A7, but structurally hidden from the guard.
- **Fix**: `unit` moved into `test-suites.json` (two explicit files) with `SUITES.unit` manifest-driven like every other suite; the stale concurrency assertion replaced with manifest-consistent checks; `test:unit` added to `ci-main` and `release` so those files actually run; and the guard now walks `scripts/tests/**` recursively and expands suite `roots` when a suite is roots-based.
- **Non-vacuous**: before the fixes W2/W5 failed naming both unit files and W6 named the dangling path; afterwards all six assertions (W1, W2, W3, W5, W5-drift, W6) pass. `npm run test:unit` is 18/18.

### A14 — RESOLVED 2026-09-22 (v6.0.13): the missing key name was `type: "http"` + `url`

- **Defect (audit finding)**: `zcode` was the last entry with `verified: false` / `transport: 'manual'`, reason `http-config-shape-unverified`. Both previous blockers in this area (B1, C2) turned out to be wrong when actually tested, so this one was too.
- **Evidence (from ZCode's own runtime, not from a guess)**: the installed ZCode (3.6.5, `D:\Program Files\ZCode`) ships its CLI runtime at `resources/glm/zcode.cjs`, and that bundle validates every `mcp.servers` entry with a zod `discriminatedUnion("type", [stdio | http | sse])` where **each branch is `.strict()`**:
  - `stdio`: `type` + `command` (required, min 1) + optional `args`/`cwd`/`env`
  - `http`: `type` + `url` (required, min 1) + optional `headers`/`oauth`
  - `sse`: `type` + `url` (required) + optional `headers`/`oauth`
  - shared: `protocolVersion` (`auto`/`legacy`/`2026-07-28`), `enabled`, `timeoutMs`
  - a preprocessor maps legacy aliases first: `enable`→`enabled`, `environment`→`env`, `http_headers`→`headers`, `type:"remote"`→`"http"`, and infers a missing `type` from `command`/`url` (the live `pencil` entry in `~/.zcode/cli/config.json` is such a historical shape: `transport:"stdio"`).
  - an entry that fails validation is **dropped with a `config_mcp_server_invalid` warning** — per-server, non-fatal.
  - the desktop app's "New MCP server" form offers exactly three types: `stdio`, `http`, `sse`.
  - the namespace is `mcp.servers` (the same file AIOS already targets for stdio servers), confirmed by the app's own `readServerMapFromJson`.
- **Fix**: `zcode` moved from `manual` to the `config` plane with `{ type: 'http', url }`, `verified: true`, and the schema quoted in its `evidence` string. `aios integration doctor typesafe` now reports `absent`/`ok` for ZCode instead of `manual-step-required`; `manual-step-required` no longer occurs for any client, so the manual fallback (`manualHttpEntry` + `describeManualTarget`) is documented as the reserved path for the next client whose key name cannot be evidenced — never fabricated.
- **Second defect found by the same evidence (fixed)**: `normalizeZcodeServerEntry`'s allowlist in `scripts/lib/components/browser/mcp-zcode.mjs` had been reverse-engineered from the **stdio** branch only, so it was missing `url`, `protocolVersion`, and `oauth`. Any AIOS-managed *HTTP* server would therefore lose its required `url` during normalisation and be discarded by ZCode's strict union. The allowlist is now the schema's full field set (pinned by `normalizeZcodeServerEntry keeps the http branch fields (url) and drops unknown ones` — non-vacuous: the old list yields `{"type":"http","headers":…,"timeoutMs":45000}` with `url` gone).
- **Live confirmation (ZCode's own logs, `~/.zcode/cli/log/zcode-2026-09-2*.jsonl`)**: `config.mcp_server.skipped` / `config_mcp_server_invalid` / `"<server>: Unrecognized key: \"transport\""` / `diagnosticPath: mcp.servers.pencil`, `configPath: C:\\Users\\...\\.zcode\\cli\\config.json`, `configScope: user` — the app reads exactly the file and namespace AIOS targets, and it drops an entry whose discriminator is spelled `transport`. In the same startup, the AIOS-written `aios-shell` entry (`type: "stdio"` + `timeoutMs`) reached `mcp.server.connected` with `toolCount: 1`, and a plugin-declared HTTP server connected with `transport: "http"` — so the strict schema accepts AIOS's stdio shape today and the HTTP plane is live in the same runtime.
- **Verification**: `node --test scripts/tests/integration.test.mjs scripts/tests/zcode-mcp-nested-migration.test.mjs` 28/28; `node scripts/aios.mjs integration doctor typesafe --clients zcode` now reports `not registered` (was `manual-step-required`) and `integration add typesafe --clients zcode --dry-run --skip-skills` plans a write to the live `C:\\Users\\Administrator\\.zcode\\cli\\config.json`; full gate `npm run test:scripts` → **2013 tests / 2004 pass / 0 fail / 9 skipped, files=200**.

### A15 — RESOLVED 2026-10-15: the five `shell: pwsh` workflow steps are now covered

- **What shipped**: `scripts/tests/execution/workflow/workflow-shell-syntax.test.mjs` grew S3-S5 next to
  the existing S1/S2, and the header sentence that said non-bash steps were out of scope is gone — that
  sentence *was* the gap.
  - **S3** (interpreter-free, every platform): every `@'` / `@"` here-string in a PowerShell `run:` block
    closes. Unclosed is an error in every PowerShell version, so this half never depends on what the
    machine happens to have.
  - **S4**: each PowerShell block is parsed by the real PowerShell AST parser (`Parser::ParseFile`,
    discovery order `pwsh` → `powershell.exe` → `powershell`). **Nothing is executed** — the workflow
    scripts are only tokenized. On this box there is no `pwsh`, so the proxy is Windows PowerShell 5.1,
    which is *stricter* than the runner's pwsh 7 (an indented here-string terminator is legal only in
    6.0+); the header records that a 5.1 indentation complaint is a portability warning, and S3
    deliberately does not enforce column 0.
  - **S5**: coverage is proven non-vacuous twice — the selector must find exactly as many PowerShell
    steps as the raw YAML text declares (5 today), and a synthetic unterminated here-string plus
    unbalanced parentheses must both be reported while a valid script must not be.
- **Guard proven against the real file, not just synthetics**: an unbalanced `@(` injected into
  `windows-shell-smoke.yml` made S4 fail; the file is now byte-identical to HEAD (`git diff --quiet` exit 0).
- **Process note (self-inflicted, recorded)**: during that mutation `git checkout` re-materialized the file
  with CRLF while the pre-mutation worktree was CRLF too, so a hash comparison against a value I had never
  actually printed reported a false DRIFT — and the hash I then “compared” was one I had written down from
  memory rather than read. Restoration was redone against the only objective reference available (the HEAD
  blob), and the stray mutation backup was moved to `.aios/tmp/a15-mutation-residue-20261015/` instead of
  deleted. Lesson: never assert an expected hash that was not captured in visible output.

### A16 — CLOSED (2026-10-15, owner delegated the decision): `src/core/index.mjs` had no importers

- **Status**: **CLOSED 2026-10-15 by deletion（operator 授权 agent 在删除/接为入口之间二选一）**。全仓引用面复核（scripts/ src/ packages/ mcp-server/src/ + 测试 + 文档）：除文件自身、本登记条目和 `esm-reexport-binding.test.mjs` 的注释（记录它的误报史）外零引用，测试代码不 import 它。接为入口需要全仓改 import 路径却无功能收益，dead barrel 按删除处理；`src/core/` 目录随之移除（其下只有这一个文件）。ESM 守卫测试（含 comment-aware 扫描回归）通过。未来若真需要统一入口，按需重建比维持死代码便宜。

### A16 (original record, kept for audit) — OPEN: `src/core/index.mjs` has no importers

- **Status**: open (low). The module calls itself a "core infrastructure barrel" and its header documents the intended import path, but no module in `scripts/`, `src/`, `packages/`, or `mcp-server/src/` imports it.
- **Next**: delete it, or adopt it as the entry point its header describes. It is also why the ESM guard needed comment-aware scanning: its only "uses" were names listed in a comment.

### A17 — CLOSED (2026-10-14, operator 裁决 D+C): the turn settlement gate is unreachable in production

- **Status**: **CLOSED 2026-10-14 by option C**。父侧桥 `scripts/lib/execution/harness/solo/turn-settlement.mjs` 及其测试套件（`scripts/tests/execution/harness/infra/core/turn-settlement.mjs`、`harness-runtime.test.mjs` 的 import）已删除；发布说明在 CHANGELOG [Unreleased] 里更正。子模块 standalone CLI（`settle`/`verify`/`start`）**保留**——它有确认消费者：人工 `aios rex settle`（`scripts/lib/tooling/cli/dispatch/dispatch.mjs` 透传），不属于“无消费者 CLI”。选项 A（把结算接进 live loop）仍是未来可重提的新工作项；若重提，必须同时接上调用点并恢复 ADR 0002 的双向钉定，不得先建桥后接线。
- 以下为原始记录（保持不动供审计）：

- **Status**: open. `scripts/lib/execution/harness/solo/turn-settlement.mjs` (`buildTurnEnvelope` / `settleTurnEnvelope` / `mapIterationToTurnContract`) has no production importer — only `scripts/tests/execution/harness/infra/core/turn-settlement.mjs` and the aggregator that imports it. `git log -S settleTurnEnvelope --all` returns only the introducing commit `513df243` (the v5.13/v5.14 LoopX adoption) and no later call-site addition.
- **Why it matters (high)**: the live solo harness loop (`scripts/lib/execution/lifecycle/run/harness/execution/execute-turn.mjs`, reached from `commands.mjs`) contains zero rex calls, so no turn is verified or settled. The v5.13/v5.14 release notes state that every provider turn now settles into a typed envelope that the executor cannot self-verify; in production that is exercised by tests only. The same holds for the submodule's `settleStandaloneTurn` / `startStandaloneWorkflow` (no production caller under `scripts/`). Settlement is currently reachable only when a human types `aios rex settle` — the `rex` dispatch in `scripts/lib/tooling/cli/dispatch/dispatch.mjs` is a pass-through proxy.
- **Structural cause**: `buildTurnEnvelope` requires an `activationId` and an `executionToken`, i.e. the solo harness must own and advance a rex standalone workflow. It owns no rex workflow state today, so wiring means a session↔activation binding plus token rotation and crash recovery — not a one-line change.
- **Next**: decide between (A) wire settlement into the live loop, (B) add a parent-side independent completion gate without rex settlement, and (C) delete the dead bridge and correct the release notes. Until one lands, do **not** add contract logic to the settlement gate — it would be dead code. Analysis: `docs/plans/2026-10-14-submodule-boundary-and-loop-closure.md` §work-4.

### A18 — MITIGATED (2026-10-14, work-9): `taskkill.exe` RPC degrades to a ~60 s timeout in some host sessions

- **Status**: **repo-side mitigation LANDED 2026-10-14（work-9）**；环境本身的 taskkill 退化仍开放（非仓库可修）。
- **Symptom（修复前）**: `scripts/tests/tooling/runtime-probe/process-spawn-timeout.test.mjs` fails `timeout settled after 62189ms`，两个超时结算用例都挂。
- **Evidence chain (2026-10-14 probes)**: ① `spawnSync('taskkill', ['/pid', <fresh node pid>, '/t'|'/f'])` → ~61.5 s, status 1, GBK stderr “操作超时”；② **决定性对照**：从裸 bash 对无关目标 `ping.exe` 直接 `taskkill //PID x //T //F` 同样 60s+ 失败 → taskkill 在本宿主会话系统性退化，与 node/仓库无关；③ `child.kill()`（TerminateProcess）立即生效；④ `taskkill` 未被 PATH 遮蔽（`C:\Windows\system32\taskkill.exe`）。
- **Mitigation (work-9, landed)**: `terminateChildTree` 给 taskkill 的 `spawnSync` 加 `timeout: TASKKILL_TIMEOUT_MS(1500ms)` 封顶（并传 `killSignal: 'SIGKILL'`），失败仍走 `child.kill()` 兜底；钉定测试 `A18: the taskkill wait is capped and child.kill() fallback still reap the tree (win32)` 用假慢杀手验证封顶传递与兜底有效；结算预算断言改为按封顶总和推导（SETTLE_BUDGET_MS = 750+1500+2000+300，仍能抓住 60s 级回归）。
- **Verification evidence (2026-10-14, this degraded host)**: 修复前同一用例 `timeout settled after 62189ms`；修复后 shell-shim 用例结算耗时 3313ms（在 4250ms 推导预算内）、direct-child 用例 2277ms 绿、A18 钉定用例 342ms 绿（假杀手想挂 10s，被传入的 300ms 上限截断后 `child.kill()` 兜底仍完成树回收）。剩余唯一失败即下方环境残留。
- **Known residual (environment, not repo)**: 在 taskkill 退化的宿主里，shell-shim 用例的孙子进程无法被树杀（唯一树杀机制就是 taskkill），`waitForExit(grandchild)` 仍失败——断言故意保持严格，不因环境退化而放宽；健康 Windows 宿主（taskkill 正常）下两用例全绿。若未来需要无 taskkill 的树杀，候选方案是 PowerShell CIM 枚举 + Stop-Process（新依赖，未批准，未实现）。

### A19 — RESOLVED (2026-10-15, same turn it was found): `aios plan` answered a write request with a read-only view

- **How it surfaced**: a 「继续」 resume read `aios plan status` and got `active plan [executing]` for the **2026-09-18 triage plan**, whose own doc says “still open: nothing” and whose A1-A4 rows are all RESOLVED. Trying to close it with `plan status --status done --force` exited **0 and changed nothing** — so a stale ledger had been steering resumes for three weeks.
- **Two silent substitutions, one class**:
  1. `scripts/lib/tooling/cli/parse-args/govern/plan.mjs` mapped *any* unrecognized subcommand to `status` (`known.has(subcommand) ? subcommand : 'status'`), so `plan list` printed the plan and exited 0, and the ops layer's own `unknown plan subcommand` refusal was **unreachable through the CLI**.
  2. The `status` branch in `scripts/lib/foundation/planning/ops/cli.mjs` ignored `--status/--note/--force` — the write entry point is `set-status`, which **no help surface advertised** (`scripts/lib/tooling/cli/help/commands/maintenance.mjs` listed status/show/start/task/auto-gate/capability-evidence only).
- **Fix (fail closed, no guessing)**: the parser passes the declared name through verbatim and stops owning a vocabulary copy; the ops layer — which owns the branches, so it owns the list — exports `PLAN_SUBCOMMANDS` and refuses unknown names while printing them; `status` refuses write flags and prints the `set-status` form; help advertises `aios plan set-status --status <active|approved|executing|done|blocked> [--note] [--force]` plus an example.
- **Evidence**: `scripts/tests/execution/planning/cli/plan-cli-status-readonly.test.mjs` C1-C5 5/5, wired into `regression` (W1/W2/W3/W5/W6 6/6). Mutation-proved non-vacuous: reintroducing the parser fallback fails **C2** only; deleting the `status` guard fails **C3** only (C3 also asserts the persisted status and `updatedAt` are unchanged, so it cannot pass on stderr text alone); **C4** keeps the refusals from being over-wide (unforced `set-status done` is still blocked by the done gate, `--force` lands, `note` persists). Live checks on this host: `plan status` 0, `plan status --status done` 1, `plan list` 1, `plan set-status --status done --json` 0.
- **Ledger repaired**: the 2026-09-18 plan is now `done` (t3-implement/t4-verify marked done with the 2026-09-21 evidence in their notes), and this register points at the live work item instead of the closed one.
- **Same-move residue also fixed**: the wiring guard's refresh instruction and the snapshot note it generates still said `scripts/tests/test-suite-wiring.test.mjs` after the test-tree move — the documented refresh command could not run. Corrected to `scripts/tests/tooling/suites/`; regenerating now reproduces the committed snapshot byte-for-byte (no drift).
- **Open question this raises (not fixed, needs a decision)**: `runPlanCommand`'s catch-all on a parse failure returns help mode with `subcommand: 'status'`, which is the same substitution shape one level up. It at least prints usage instead of a green exit, so it is not the observed defect; recorded rather than changed.

### A20 — RESOLVED 2026-10-15: the Skill certification base now agrees with the release preflight

- **The trap, measured**: the release CI gate reads evidence from the TAGGED commit, not
  from the working tree… and it validates with `--base <previous tag>`
  (`scripts/release-preflight.sh:171-177`, `TRAINING_BASE=$(git describe --tags --abbrev=0 --match 'v[0-9]*' HEAD^)`) while the docs and the 2026-10-14 lesson taught certifying at `--base HEAD`. A change-cert stores `baseline = git show <base>:<skill>`, so the two bases resolve to **different blobs** whenever the Skill content moved since the tag.
- **Repro on this repo state (v6.3.0 → HEAD)**: `verify-training --changed --base v6.3.0` reported **blocked** for 5 Skills (aios-project-system, memo, promo-video-pipeline, rexai-image-generation, verification-loop). Certifying them with `--base HEAD` left the gate **still blocked**; re-certifying with `--base v6.3.0` turned it **verified** 5/5 — and the four base-correct bundles are now committed.
- **Delivered contract** (work item `docs/plans/2026-10-15-a20-…-pre-2.md`, D-a + D-c, D-b declined):
  - the gate stops collapsing nine different failures into one umbrella sentence. Each blocked entry now
    carries `code` + `reasonKind` + `remedy`, and the remedy is withheld where it cannot work
    (`unreadable-input` — `certify` reads the same file and would fail identically).
  - `release-preflight.sh`/`.ps1` name the base they validated against and print the exact
    `skill certify --skill <id> --base <that base>` line.
- **Three defects found only because the reasons became specific** — the umbrella sentence had been hiding them:
  1. a **tampered baseline artifact** and a **cert recorded at a different base** shared one branch. They need opposite
     remedies (re-run vs re-certify at the other base), so they are now `baseline-artifact-tampered` vs
     `baseline-differs-from-git-base`, distinguished by whether the artifact still matches the hash its own state records.
  2. an evidence state carrying **no/malformed** `acceptedSkillHash` (V1 legacy) was reported as “different content”.
     Now `accepted-hash-malformed` → `incomplete-evidence`, separate from `accepted-hash-differs-from-current-skill` → `stale-content`.
  3. `Invoke-NodeCheck` in `release-preflight.ps1` captured child stdout/stderr into temp files and **deleted them on
     failure**, so every PowerShell-side check failed with only its one-line message. It now re-flows the captured output
     before throwing — this benefits all eleven checks in that script, not just the training gate.
- **Lesson recorded**: five existing tests asserted that umbrella *prose* (`/stale|incomplete|hash|evidence/i`). Pin the
  structure (`code`/`reasonKind`), never the sentence — the prose assertions were precisely what let a diagnostic gap survive.

### A21 — RESOLVED 2026-10-15: a planned turn now reuses the active ledger (the unkeyed `plan start` path survives as A22)

- **Observed 2026-10-15 while registering A20**: `plan start --title … --task …` persisted a plan
  (`status: active`, `route: unknown`, `skills: []` — no capability bound), then
  `plan auto-gate --explicit-intent plan` returned `action: started, created: True` and wrote a **second**
  document (`…-release-pre-2.md`) holding the activation and Command. Two ledgers, one work item, and the
  file names differ only by a `-2` suffix — which is precisely the class of ambiguity that made the stale
  `executing` ledger misleading before A19 was fixed.
- **Also worth noting**: `plan auto-gate --explicit-intent implement` yields `disposition: guarded`,
  `capabilityDecision: null`, `action: none` — it does **not** bind the active plan either. Only
  `--explicit-intent plan` selects a capability (`software.planning.sequence`, required evidence
  `dependency-graph-recorded` / `step-verification-recorded`). So there is currently no declaration that
  says "run the plan I just started".
- **Candidate fixes (undecided)**: ① auto-gate reuses the active plan when its objective matches the
  continuation key instead of creating a sibling; ② `plan start` runs the policy itself and refuses to
  persist an unbound plan (reporting `route: unknown` as an incomplete state); ③ expose an explicit
  `plan bind --capability <id>` declaration. Not implemented — needs a decision on whether matching is
  textual (forbidden by the prompt-authoring norms) or must be an explicit id, which is why this is
  registered rather than guessed.
- **Interim discipline**: register work items through `plan auto-gate --explicit-intent plan` alone, and
  if a `plan start` was run first, move the orphan document out of `docs/plans/` instead of leaving both
  (done for A20: orphan parked at `.aios/tmp/orphan-plan-a20-from-plan-start.md`).
- **Status 2026-10-15**: reproduced a second time while registering the next item (A21 itself produced
  `…two-plan-ledgers.md` + `…-2.md`), so the behaviour is deterministic rather than a race. It is now a live
  work item — `docs/plans/2026-10-15-a21-one-work-item-must-not-produce-two-plan-ledgers-2.md` — with facts
  H1-H5, a declared target set, and one unsigned decision: reuse must be keyed on an explicit work-item id
  (E-c + E-a, the stated default) and never on objective-text similarity.

- **Delivered**: `workflow-policy.mjs` resolved every planned turn to `persistence: 'create'`. It now reuses an
  **active, non-terminal** plan (`reuseActivePlan = planned && !newWorkItem && hasUsableActivePlan(activePlan)`)
  and hands that plan to the adapter via `decision.plan`. Reuse is keyed on a state fact, never on objective-text
  similarity — a fuzzy match is how one work item silently swallows another's ledger.
- **The reason reuse was useless before, and is now**: `applyWorkflowDecision`'s reuse branch only *looked up* a stored
  activation, so reusing a ledger that had never been bound returned `capabilityCommand: null` and the caller had no
  Provider Command — which is what made a fresh plan feel necessary. It now starts one bound to the reused plan.
- **Declared escape hatch**: `plan auto-gate --new-work-item` (parsed, threaded, documented in help). `strict` mode
  reuses too — strict means "always work from a ledger", not "mint a new ledger every turn"; that reading is now pinned
  in both directions (reuse with a live plan, create with none, create when declared).
- **Evidence**: `scripts/tests/execution/planning/flow/plan-single-ledger.test.mjs` N1-N6 (start→gate leaves exactly one
  document, repeated planned turn idempotent, reuse still yields a `provider.invoke` Command, `--new-work-item` opens
  a second ledger, truncated flag not accepted as the declaration, terminal plan never reused, reuse does not rewrite
  the document or its `createdAt`), wired into `regression`; five mutations each flip assertions (always-create 5,
  ignore terminality 7, ignore the declaration 3, reuse-without-Command 1, plan not handed over 3); planning+workflow
  138/138, rex runtime+harness+team 127/127, full regression 2140 tests / 2131 pass / 0 fail / 9 skipped.
- **Boundary of this fix**: the reported defect (start-then-gate) is closed; repeated `plan start` is **not** — see A22.

### A22 — RESOLVED 2026-10-15: `plan start` now carries a canonical work-item id

- **What shipped**: `plan start --work-item <id>`. `canonicalWorkItemId` normalises the id (case, spacing,
  punctuation → slug) and refuses `..`, path separators, `:` and control characters, so an unsafe id writes
  nothing rather than being sanitised into a different ledger. `openWorkItemPlan` is get-or-create: an existing
  id store re-activates that ledger; a **lost store with a surviving document re-adopts the document**
  (`recovered: true`) instead of reserving `-2`; only a genuinely new id creates one. The active plan is mirrored
  to `.aios/planning/plans/<id>.json`, and `> work-item: <id>` is written into the durable markdown header.
- **Why identity had to be declared, not inferred**: two phrasings of one sentence are two work items under the
  prompt-authoring norms, and a fuzzy match is how one ledger gets swallowed by another. Matching is on the
  canonical id (`<date>-<id>.md` suffix), never on objective text.
- **Hole found by the guard, not by review**: `--work-item ""` initially collapsed into "flag absent" and fell
  through to the unkeyed path — minting exactly the sibling this item exists to prevent. Identity is now keyed on
  **presence** (`typeof === 'string'`), so a declared-but-blank id is refused.
- **Boundary respected**: unkeyed `plan start` keeps its old behaviour (W4 pins it, incl. the `-2` sibling), so this
  did not quietly redefine the command. Measured: unkeyed ×2 → `…-legacy-probe.md` + `…-2.md`; keyed ×3 with
  casing/spacing variants → one `…-dup-item.md`, calls 2-3 report `created:false`.
- **Evidence**: `scripts/tests/execution/planning/cli/plan-work-item-identity.test.mjs` W1-W8 wired into `regression`;
  planning 75/75, wiring+workflow+ctx 77/77, context/native/skills/dream/product-L3 35/35; five mutations each flip
  an assertion (blank-fallback, no mirror, no re-adoption, no unsafe-id guard, name ignores identity); files
  hash-verified IDENTICAL after the mutation batch.
- **Residual (open, small)**: closed by A23 below — `plan auto-gate` now accepts `--work-item` and the
  capability binding is keyed on the declared identity.

### A23 — RESOLVED 2026-10-15: the gate carries the declared identity into its Capability binding

- **What shipped**: `plan auto-gate --work-item <id>` threads the declaration into `startPlan`, so a
  gate-created ledger carries `workItemId` instead of `''`. `startCapability` picks its
  `workItemKey` by an ordered preference — declared id, then ledger path, then the
  `turn:<client>:<session>:<sha256>` fallback — and the reuse branch reads a stored activation through
  the same key list, so pre-A23 path-keyed activations stay reachable. `syncEvidenceToMatchingPlan`
  matches either the path or the id, otherwise evidence bound under an id could never return to the
  ledger.
- **Two rules forced by measurement, not by design**:
  1. *A declared id outranks A21's reuse rule when it names a different item.* `--work-item item-two`
     was being swallowed by the active `item-one` ledger (guard P6 caught it). Comparison is canonical
     id equality only — never objective-text similarity, for the same reason as A21/A22.
  2. *`canonicalizeWorkItemId('')` must stay empty.* The shared `slugify` helper returns the literal
     `'plan'` for empty input, so an undeclared turn read as “a different work item” and silently
     switched A21's reuse off — five tests failed at once before the cause was found (pinned by P8).
- **Contradictory declarations are refused, not resolved by precedence**: `--work-item X --new-work-item`
  would write a second ledger whose activation key collides with the first, so it exits 1 and writes
  nothing. Blank and unsafe ids are refused before any file is written, matching A22.
- **Known redundancy (deliberate)**: removing the reuse branch's id read-through flips **no** test,
  because `startCapability` re-derives the same keys and is idempotent on an existing activation. It is
  recorded as a second belt, not as a guarded branch — an unflippable assertion would be a false guard.
- **Evidence**: `scripts/tests/execution/planning/flow/plan-auto-gate-identity.test.mjs` P1-P8 wired into
  `regression`; planning + wiring 89/89, workflow + rex runtime/harness + ctx-agent-core 129/129, full
  `npm run test:regression` exit 0 (2156 tests / 2147 pass / 0 fail / 9 skipped); four mutations flip
  1 / 6 / 2 / 1 assertions; `plan check-done` 4/4 before the ledger was closed without `--force`.

## B. rex-harness / MCP adapter

### B1 — The planning evidence gate cannot be satisfied through the documented surface

- **Status**: **RESOLVED 2026-09-21 — the triage premise was wrong; the validator was never missing.** `normalizePlanningArtifact` lives in `rex-harness/src/domain/planning-artifact.mjs`, reached via `scripts/lib/workflows/rex-capability-runtime.mjs` ← `handleCapabilityEvidence` in `scripts/aios-mcp-server.mjs`. Proven by probe: a well-formed ticket passed directly, while the plan state (`schemaVersion: 3`) fails with the exact reported message (`delivery ticket schemaVersion must be 1`) — identical message for all three repro inputs ⇒ the serving adapter validated the plan state, never the argument. Second footgun found in-repo: the MCP schema only accepts `planningArtifact`, so a caller passing the rex-side name `deliveryTicket` had it silently dropped.
- **Fix**: `handleCapabilityEvidence` now accepts the `deliveryTicket`/`delivery_ticket` alias via exported `resolvePlanningArtifactParam` (+ regression test in `workflow-adapters.test.mjs`, 12/12). Correct call shape: pass the ticket object itself as `planningArtifact` — never wrapped, never the plan state.

---

## C. Owner actions (not code)

- **C1 — TypeSafe usage mystery (open, vendor-side; docs only cover half of it).** The console shows Requests 0 / Tokens 0 / Spend $0.00 while real billed calls were made with a key ending `5d59`. `docs-site/integrations.md` → "Configure the credential" already documents the half AIOS owns: `TYPESAFE_API_KEY` is checked for **presence only** (never read, printed, or stored), the most common failure is **scope** (a variable set in another terminal, or in the *User* scope of a different account, is invisible to an already-running client), and `aios integration doctor typesafe` reports `present`/`unset`. What the docs cannot answer is which **organisation** the key belongs to — AIOS never sees the key value or the account behind it, so a key billed under a different org than the console login is invisible to it. **Actionable**: AIOS *does* record per-judgment provenance — `model`, `x-typesafe-request-id`, and `usage.inputTokens`/`outputTokens` (see `aios judgment ask` output and `~/.aios/judgment/`) — so use a recorded successful judgment's request id as proof of the metered call and hand that id to TypeSafe support; then check the console API Keys page for the `5d59` key's organisation.
- **C2 — RESOLVED 2026-09-21 (v6.0.6, code fix — the premise was wrong).** `codebuddy` 2.137.1's `mcp add` has **no `--agent` option at all** (`codebuddy mcp add --help`: only `-s/--scope`, `-t/--transport`, `-e/--env`, `-H/--header`), and `-t` accepts `http`. Verified by running it: `codebuddy mcp add typesafe-docs <url> -t http` wrote `{"type":"http","url":...}` into an `mcpServers` namespace — exactly the key name AIOS reported as unverified. WorkBuddy moved from `manualHttpEntry` to a verified config-plane entry, so it now reports `planned`/`registered` instead of `manual-step-required`. **One divergence worth knowing**: the CLI's `-s user` scope writes to `~/.codebuddy/.mcp.json`, while AIOS owns `~/.workbuddy/mcp.json` (which `codebuddy mcp list` does read). AIOS keeps writing its own file so ledger, backup, and scoped-removal semantics stay intact.
- **C3 — hermes (open, correctly classified, exact command below).** Earlier note "no `mcp` subcommand" was wrong: `hermes mcp` exists (a TUI) and `hermes mcp add` has `--url`. The `pending-interactive` classification is nevertheless **correct and re-verified**: non-TTY runs print `Connecting to <url>` then `Does this server require authentication? [Y/n]:` and then **hang forever** (timeout 124) — including with `--auth header` supplied, because the prompt fires during connection/discovery before that flag is applied. So this stays a real manual step. **Run in a real terminal**: `hermes mcp add typesafe-docs --url https://docs.typesafe.ai/mcp` and answer the auth prompt.
- **C4 — RESOLVED 2026-09-21.** `~/.rexcil/aios` was 5.20.0 because no 6.x GitHub Release object existed (the `release` workflow was failing, see D). Once v6.0.5 published, `aios update` self-updated the installed runtime to 6.0.5; `aios --version` and `~/.rexcil/aios/VERSION` now agree.
- **C5 — OPEN: delete the 93 historical `.rex-projection-recovery` backups (operator terminal only; agent execution is hard-blocked by the safety gate).** Growth is fixed in code by work-8 (rex-harness 0.10.0 prunes per skill on successful installs), but the pre-existing debris — 93 backups / 7 roots / ~1.16 MB, latest 2026-08-17, verified 93/93 redundant and 0 orphans — is gitignored and outside the repo, so it only leaves the machine when you run the archived command. Command and inventory: `docs/plans/2026-10-14-submodule-boundary-and-loop-closure.md` §work-5 (a rename-first variant is listed if you want a reversible week).
  - **MEASURED 2026-10-15: the work-8 product path cannot reclaim any of this debris — do not wait for it.** Probe on a temporary copy of all 7 roots (real dirs untouched): `pruneRecoveryBackups({retention: 2})` returned **pruned=0 of 80** attributable backups, because the debris is *wide, not deep* — each (root × skill) bucket holds only 1–2 entries (per-skill totals across roots: rex-requirements 13, rex-test-design 11, rex-planning 11, rex-code-review 10, 7 skills × 5), so a keep-recent-2 rule never fires. The remaining 13 entries live in `.opencode/.rex-projection-recovery/_purged-20260826_204215/`, which the pruner is designed **never** to touch (unattributable by policy: “无法归属就没有资格替 operator 决定删除”). So work-8 stops growth only, exactly as its own boundary note says, and **only the whole-root removal in §work-5 clears C5**.
  - **Block is textual, re-confirmed live 2026-10-15**: a command whose *text* contained the cleanup pattern was rejected outright — `rm -rf is blocked by the AIOS safety gate` — before anything ran, in a compound command that also carried a `git commit`, so the commit did not happen either. This is `packages/aios-pi/lib/gates.mjs:6` matching the string, not the target path: an agent cannot even delete its own scratch copy while the pattern is present, and there is no authorization channel. Consequence worth knowing: **any agent turn that touches C5 loses the whole compound command, including unrelated work batched into it** — keep operator-only deletions out of the same shell invocation as commits or edits.

---

## D. Closed (for reference)

- **v6.0.5 — the CI outage that blocked v6.0.2/v6.0.3/v6.0.4 releases.** `release` and `ci-main` both failed at `Run root release tests` on ubuntu while the same suite was green on Windows. Root cause: **five regression tests read gitignored generated roots**, so they could only pass in a worktree where `sync-skills` had already run. They went red in CI the moment the A1 triage wired them into the suite, which is why the first red ci-main is `8bce5864` — the last green was `0d5cea23`, and the three commits between are the wiring + v6.0.2 release.
  - `skills-no-injection-policy` → `.agents/skills/<skill>/SKILL.md`; `skills-source-tree` ×2 → `.grok/skills/...`, `.codex/skills/...`; `pi-shipped-content-hygiene` → 7 projection roots.
  - `rex-minimal-construction-training-evidence` → `.skillopt/rex-minimal-construction-2026-07-18/**` — the same dead-fixture trap A3 fixed for five sibling files but missed here. Its `gate_result.json` (`reject_train_regression`) and `state.json` (`canonicalAction: retain_baseline`) are produced by **no code in this repository**, so those two assertions tested recorded external-trainer output. Replaced with production-reachable assertions through `validateTrainingEvidence` that encode the same hazard (candidate wins validation, gives back train, and **overall looks better**).
  - `memo-events-cache` → inserted a wall-clock micro-benchmark assertion (`warm < cold`, measured 17ms vs 11ms under concurrency 4). Replaced with a best-of-N sample against a noise-tolerant budget; the deterministic `memoEventsCacheStats().hits >= repeats` check remains the hard gate.
  - Fix primitive: `scripts/tests/fixtures/skill-projection.mjs` → `readProjectedSkill()` projects through the same `materializeSkillTree` the installer/sync use.
  - **Method note (why this took so long)**: a bind-mounted Windows worktree cannot reproduce these — it carries the developer's generated roots *and* Windows binaries in `node_modules`. The failure only appears in a **pristine LF copy with container-local, platform-correct deps**. Verified: clean `node:24-bookworm-slim`, CI's exact 4 shims (`codex claude gemini opencode`), CI env → 1997 tests / 1987 pass / **0 fail** / 10 skipped.
- **v6.0.4 (CI repair)** — three genuine POSIX failures found by the same container method: `automem-loop`'s `fakeBin` wrote only a `codex.cmd` shim (unresolvable on POSIX, so the client spawn died before the memo/skip path) and `readLines` crashed on empty input with `String.map`; `team-pi-worker`'s forced-`platform: 'win32'` assertion shelled out to the real `where` binary, absent on POSIX. Classified non-failures: `package-release` needs the `zip` binary (the workflow installs it), and the two POSIX grandchild-kill tests are init-dependent (pass with `--init`).

- **v5.19.2** — `session:<id>` used as a file name, three root causes: `verdict.mjs` renamed onto an NTFS alternate data stream (`EINVAL`); `promotion.mjs` allow-listed the colon so the promotion was stored as a stream that `readdir` never lists and was lost with `errors.length === 0`; `integration.mjs` open-coded a second promotion writer that bypassed `promotionPath()`. Fixed in `b8d87c47`, fixture repair in `681a0487`.
- **v5.19.2** — the release fixture copied `scripts/lib/fs/atomic-write.mjs` as an explicit single file, so a new sibling import broke every preflight run *inside a temporary root only* (`681a0487`).
- **Triage** — the 23 failures across 14 unreachable files classified with a decisive probe per file (`19a9baba`).
