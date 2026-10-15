# A20: make the Skill certification base agree with the release preflight

> AIOS Planning Contract (schema v3)
> created: 2026-10-15T03:31:02.210Z
> client: cli
> source: aios plan auto-gate
> route: implement

## Objective

When the release preflight blocks on stale Skill training evidence, no available command can
produce evidence that satisfies it. Fix the base-agreement gap so that (a) a blocked preflight
names the exact `certify` invocation that would clear it, and (b) a certification recorded against
a base that the release gate will not use is reported as a **base mismatch**, not as `verified`.

## Facts (measured 2026-10-15, each reproducible)

- **G1** the release gate verifies against the *previous tag*: `scripts/release-preflight.sh:171-177`
  sets `TRAINING_BASE="$(git describe --tags --abbrev=0 --match 'v[0-9]*' HEAD^)"` and runs
  `skill verify-training --changed --base "$TRAINING_BASE"`.
- **G2** a change-cert stores `baseline = git show <base>:<skill path>`
  (`scripts/lib/tooling/skills/training/training-certification.mjs`), so `--base HEAD` and
  `--base <prev tag>` resolve to **different blobs** whenever the Skill content moved since the tag.
  One evidence bundle therefore cannot satisfy both consumers.
- **G3** reproduced on this repo: with base `v6.3.0`, five Skills were `blocked`
  (aios-project-system, memo, promo-video-pipeline, rexai-image-generation, verification-loop);
  re-certifying them with `--base HEAD` left the gate **still blocked**; with `--base v6.3.0` it went
  `verified` 5/5. So the documented habit (`certify` at HEAD, recorded on 2026-10-14) heals only the
  current-hash half.
- **G4** the same preflight fails on *untracked* evidence too (`release-preflight.sh:184-192`,
  the v5.9.0 incident guard), which is why a half-done recovery looks like progress and is not.
- **G5** nothing in the output states which base was used or which base the gate will demand:
  `verify-training` reason text is the generic
  `accepted training evidence is stale, incomplete, or missing the hash of the current Skill content`,
  which conflates "content moved", "evidence incomplete" and "wrong base" into one string.

## Scope decisions (operator sign-off required before t3)

- **D-a (default)** preflight self-documents the remedy: when the training gate blocks, print the exact
  `node scripts/aios.mjs skill certify --skill <ids> --base <TRAINING_BASE>` command it just validated against.
  Blast radius: `scripts/release-preflight.sh` + `.ps1` twin only. No contract change.
- **D-b** `certify` gains `--base release` (derive the previous tag the same way the preflight does), so the
  operator cannot record a cert that the gate will reject. Blast radius: certify CLI + its parse/help surface.
- **D-c** split the blocked reason into `stale-content` / `incomplete-evidence` / `base-mismatch` so a
  base mismatch stops presenting itself as a content problem (touches `training-certification.mjs` reasons
  and the tests that pin them).
- Recommendation: **D-a + D-c**; D-b is the most convenient but adds a second base-resolution policy that must
  then be proven equal to the preflight's — that duplication is exactly what G2 punished. Operator decides.

## Non-goals

- Do not weaken or bypass the preflight gates (G4 exists because of a shipped incident).
- Do not auto-certify from inside the preflight: the executor must not self-verify its completion claims.
- Do not restate the vocabulary-drift or line-ending work already landed (work-7, commit `99c67085`).

## Tasks

- [ ] **t1-understand**: re-derive G1-G5 on the current tree; confirm which Skills a real release cut would gate
- [ ] **t2-plan**: fix the decision (D-a / D-c / D-b) and the owned surfaces, then the dependency order
- [ ] **t3-implement**: implement the chosen surface(s); one owner for base resolution stays with the preflight
- [ ] **t4-verify**: `node --test scripts/tests/foundation/skills/training/*.test.mjs` + a mutation showing a
      base-mismatched cert is reported distinctly + `bash scripts/release-preflight.sh --dry-run` style probe

## Declared work-item fields

- `type`: tooling-correctness (release gate diagnostics)
- `targets`: `scripts/release-preflight.sh`, `scripts/release-preflight.ps1`,
  `scripts/lib/tooling/skills/training/training-certification.mjs`, `scripts/lib/tooling/cli/help/commands/maintenance.mjs`
- `allowedWrites`: those files + `scripts/tests/**` + `docs/evidence/skill-training/**` only if a re-cert is produced
- `failureClass`: `no-progress` if the decision is unsigned (do not guess a surface)

## Acceptance

- A blocked preflight prints the command that clears it, including the base it validated against.
- A certification recorded at a base the gate will not use cannot report plain `verified`; the reason names the base.
- Existing gates keep their teeth: the untracked-evidence guard and `--changed` selection are unchanged.
- Evidence: focused tests + one mutation per new assertion + `test:affected` (full when the manifest moves).

## Decision Log

- 2026-10-15 registered via `plan start` then bound by `plan auto-gate --explicit-intent plan`
  (capability `software.planning.sequence`, activation `26e90d7c-5ad3-4758-8825-c4ccb3d01b16`).
  **Ledger note:** those two steps produced *two* plan documents; the active one is this `-2` file and the
  orphan from `plan start` was moved out to `.aios/tmp/` rather than left to disagree with reality. The
  duplicate-creation behaviour is itself recorded (register A21) because a resume must not have to guess
  which ledger is live.

## Status

- status: active — blocked on the D-a/D-c/D-b sign-off; facts are settled, no code written yet.
