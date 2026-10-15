# A21: one work item must not produce two plan ledgers

> AIOS Planning Contract (schema v3)
> created: 2026-10-15T04:12:13.742Z
> client: cli
> source: aios plan auto-gate
> route: implement

## Objective

A work item is registered once. `plan start` and `plan auto-gate --explicit-intent plan` each persisted
their own document, so one objective ended up with two ledgers differing only by a `-2` suffix — and only
the newer one carried the capability activation.

## Facts (reproduced twice, 2026-10-15)

- **H1** `plan start --title … --task …` writes `docs/plans/<slug>.md` with `status: active`,
  `route: unknown`, `skills: []` — an active plan with no capability bound to it.
- **H2** a following `plan auto-gate --task "<same objective>" --explicit-intent plan` answered
  `action: started, created: True` and wrote `docs/plans/<slug>-2.md` holding the activation.
- **H3** deterministic, not a race: reproduced for A20 (`…release-pre.md` + `…-2.md`) and A21
  (`…two-plan-ledgers.md` + `…-2.md`) in the same session.
- **H4** `plan auto-gate --explicit-intent implement` returns `disposition: guarded`,
  `capabilityDecision: null`, `action: none` — it does not bind the plan `plan start` persisted either.
- **H5** `plan task … --target/--allow-write` writes only to the **active** plan, so after H2 the
  declarations land in `-2` and the orphan has no CLI path back.
- **H6** the mechanism, found while fixing: `workflow-policy.mjs` hardcoded
  `persistence: planned ? 'create' : 'none'`. Every planned turn minted a ledger by construction.
- **H7** why reuse could not simply be switched on: `applyWorkflowDecision`'s reuse branch only *looked up*
  a stored activation, so reusing a never-bound ledger returned `capabilityCommand: null`. Reuse was
  therefore useless, which is what made `create` feel necessary.

## Delivered

- Reuse is keyed on a **state fact** — an active, non-terminal plan exists — never on objective-text
  similarity. `decision.plan` now carries the reused plan to the adapter.
- The reuse branch starts a capability bound to the reused plan when none is stored, so a reused ledger
  still yields a `provider.invoke` Command.
- `plan auto-gate --new-work-item` is the declared escape hatch (parsed → threaded → help-documented);
  a truncated spelling is not accepted as the declaration.
- `strict` mode reuses as well: strict means "always work from a ledger", not "mint one per turn". Pinned in
  all three directions — reuse with a live plan, create with none, create when declared.

## Boundary (what this item does NOT fix)

Repeated `plan start` still mints `-2`, because that command carries no work-item identity to compare
against. Measured in an isolated `--workspace`: two identical `plan start` calls produced
`…-residual-probe-work-item.md` and `…-2.md`, the second becoming active and orphaning the first.
That is the E-c half of the decision set and it is registered as **A22**, not silently absorbed here.

## Declared work-item fields

- `type`: control-plane bookkeeping correctness
- `targets`: `scripts/lib/foundation/planning/contract/workflow-policy.mjs`,
  `scripts/lib/foundation/planning/flow/auto-gate.mjs`, `scripts/lib/foundation/planning/ops/cli.mjs`,
  `scripts/lib/tooling/cli/parse-args/govern/plan.mjs`, `scripts/lib/tooling/cli/help/commands/maintenance.mjs`
- `allowedWrites`: those files + `scripts/tests/execution/planning/**` + `scripts/tests/execution/workflow/**`
- `failureClass`: `no-progress` if reuse were decided by text similarity

## Acceptance

- Registering a work item through start-then-gate yields one document, with the capability bound to it.
- No reuse decision compares objective text.
- A19 guarantees still hold: unknown subcommands fail closed, `status` still refuses write flags, an
  unforced `done` is still blocked by the done gate.

## Verification evidence

- `scripts/tests/execution/planning/plan-single-ledger.test.mjs` N1-N6, wired into `regression`.
- Mutations, each flipping assertions: always-create (5), ignore terminality (7), ignore the declaration (3),
  reuse-without-Command (1), plan not handed to the adapter (3).
- Focused: planning + workflow 138/138; rex runtime + harness + team 127/127; A19 pins still green.
- Full regression (`test:affected` bailed to full on the manifest change): 2140 tests / 2131 pass / 0 fail / 9 skipped.

## Decision Log

- E-c + E-a were the stated default; what shipped is E-a's substance (reuse the active ledger, bind the
  capability, explicit `--new-work-item`) plus H7's root cause. **E-c proper** — an explicit
  `--work-item <id>` with update-in-place — is deferred to A22 because it needs a contract decision about
  what `plan start` promises, and that is not this item's symptom.
- Rejected: matching ledgers by objective text (forbidden by the prompt-authoring norms; a fuzzy match
  silently swallows another work item's ledger).
- Registration of this very item reproduced H2 before the fix landed, which is the second copy of the evidence.

## Status

- status: delivered 2026-10-15 within the boundary above; A22 opened for the unkeyed `plan start` path.
