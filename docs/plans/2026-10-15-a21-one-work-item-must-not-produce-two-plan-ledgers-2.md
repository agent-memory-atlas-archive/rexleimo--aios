# A21: one work item must not produce two plan ledgers

> AIOS Planning Contract (schema v3)
> created: 2026-10-15T04:12:13.742Z
> client: cli
> source: aios plan auto-gate
> route: implement

## Objective

A work item is registered once. Today `plan start` and `plan auto-gate --explicit-intent plan` each
persist their own document, so the same objective ends up with two ledgers whose file names differ only
by a `-2` suffix — and only one of them carries the capability activation.

## Facts (reproduced twice, 2026-10-15)

- **H1** `plan start --title … --task …` writes `docs/plans/<slug>.md` with `status: active`,
  `route: unknown`, `skills: []` — an active plan with **no capability bound to it**.
- **H2** a following `plan auto-gate --task "<same objective>" --explicit-intent plan` answers
  `action: started, created: True` and writes `docs/plans/<slug>-2.md` holding the activation
  (`software.planning.sequence`). The first document is left behind as an orphan.
- **H3** reproduced on both A20 and A21 in the same session, so it is deterministic, not a race:
  A20 produced `…release-pre.md` + `…release-pre-2.md`; A21 produced `…two-plan-ledgers.md` +
  `…-2.md`. Both orphans were parked to `.aios/tmp/` rather than left to disagree with reality.
- **H4** `plan auto-gate --explicit-intent implement` returns `disposition: guarded`,
  `capabilityDecision: null`, `action: none` — it does **not** bind the plan that `plan start` just
  persisted either. There is currently no declaration that means "execute the plan I already started".
- **H5** `plan task … --target/--allow-write` writes only to the **active** plan, so after H2 the
  declarations land in `-2` and the orphan can never be reconciled by the CLI.
- **H6** why this matters more than tidiness: A19 was exactly this class of defect — a stale
  `executing` ledger steered every 「继续」 resume for three weeks. Two live ledgers for one work item
  is the same failure with a smaller blast radius.

## Scope decisions (operator sign-off required)

- **E-c (default)** key plan documents on an explicit work-item id and **update in place** instead of
  appending `-2`. Reuse is proven by identity, never by text similarity.
- **E-a (default, paired with E-c)** let `auto-gate` bind the **active not-done plan** when the caller
  names it (`--plan <relativePath>` or a plan id), instead of deciding to persist a sibling.
- **E-b** make `plan start` run the policy itself, so a persisted plan is never capability-less. Cleanest
  conceptually, but it turns `plan start` into a gate call and changes what that subcommand promises.
- Declined: matching the two by objective text. The prompt-authoring norms forbid guessing intent from
  prose, and a fuzzy match is how one work item silently swallows another's ledger.

Default if unsigned: **E-c + E-a**.

## Non-goals

- Do not touch the capability vocabulary or the recipe (`software.planning.sequence` stays as-is).
- Do not delete historical plan documents; the fix is about creation, not cleanup.

## Tasks

- [ ] **t1-understand**: re-derive H1-H5 on the current tree and confirm which surfaces own document naming
- [ ] **t2-plan**: fix E-c/E-a/E-b and the work-item identity carrier
- [ ] **t3-implement**: one ledger per work item; refuse the silent `-2` sibling
- [ ] **t4-verify**: a guard test that `plan start` + `auto-gate --explicit-intent plan` leaves exactly one
      active document, plus a mutation proving the guard is not vacuous

## Declared work-item fields

- `type`: control-plane bookkeeping correctness
- `targets`: `scripts/lib/foundation/planning/ops/cli.mjs`, `scripts/lib/tooling/cli/parse-args/govern/plan.mjs`,
  `scripts/lib/tooling/cli/help/commands/maintenance.mjs`
- `allowedWrites`: those files + `scripts/tests/execution/planning/**`
- `failureClass`: `no-progress` while the E-c/E-a/E-b decision is unsigned

## Acceptance

- Registering a work item twice (start then gate) yields one document, and the second call reports that it
  bound the existing plan rather than creating a sibling.
- No reuse decision is made by comparing objective text.
- Existing A19 guarantees still hold: unknown subcommands still fail closed, `status` still refuses write flags.

## Verification evidence

- Attach via `aios plan add-evidence --kind command|path|test --value "..."`

## Status

- status: active — blocked on the E-c/E-a/E-b sign-off. Facts are settled (H1-H5 reproduced twice); no code written.
