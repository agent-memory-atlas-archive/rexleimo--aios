# A23: make plan auto-gate accept the declared work-item identity

> AIOS Planning Contract (schema v3)
> created: 2026-10-15T05:28:55.514Z
> client: cli
> source: aios plan auto-gate
> route: implement

## Objective

A22 gave `plan start` a canonical work-item id, but `plan auto-gate` still has no way to name one: its
capability bindings key on `plan.relativePath`. The declared identity is therefore only half-wired —
the ledger can be found by id, while the Provider Command attached to it is still addressed by path.

## Facts (measured 2026-10-15)

- **K1** `applyWorkflowDecision`'s create branch calls `startPlan(...)`, which does not receive a
  `workItemId`, so every gate-created ledger has `workItemId: ''` (schema default).
- **K2** `startCapability(plan)` derives `workItemKey` from `plan.relativePath`, falling back to a
  `turn:<client>:<session>:<sha256(message)>` hash. So a gate-created ledger has **no** identity that
  matches A22's `canonicalWorkItemId` normalisation (case/spacing/punctuation collapse).
- **K3** consequence: `plan start --work-item X` then `plan auto-gate --task "<text>"` may bind a
  capability under a path/hash key that `openWorkItemPlan` would later restore under a different
  representation of the same id, so "same id, same ledger" does not yet imply "same id, same Command".
- **K4** A21's reuse rule already prevents the duplicate-ledger case; this item is about identity
  **propagation**, not about preventing siblings.

## Scope decisions (operator sign-off required)

- **F-a (default)** `plan auto-gate --work-item <id>`: the gate passes the declared id into
  `startPlan`, and `startCapability` prefers `plan.workItemId` as `workItemKey` over both the path and
  the message hash. Additive: the flag already exists in the parser surface (A22), only its wiring widens.
- **F-b** make the capability key canonical id-only whenever `workItemId` is present, and store a
  migration note for existing path-keyed activations. Riskier: already-stored activations would need a
  lookup fallback (id → path) or they become unreachable.
- Refused: deriving identity from the task text (same reasoning as A21/A22 — identity is declared).
- Default if unsigned: **F-a**, with a read-through fallback in `findStoredAiosCapabilityActivation`
  (try id, then path) so existing activations keep resolving.

## Non-goals

- No change to the capability vocabulary, recipes, or stage advancement.
- No back-filling of `workItemId` onto historical plans; they stay path-keyed and must keep working.

## Tasks

- [ ] **t1-understand**: confirm K1-K3 on the current tree and enumerate every `workItemKey` producer
- [ ] **t2-plan**: pick F-a/F-b and the read-through fallback order
- [ ] **t3-implement**: thread the declared id from parser → gate → startPlan → capability key
- [ ] **t4-verify**: a guard test that the same id yields the same ledger **and** the same activation,
      plus a legacy path-keyed activation still resolving after the change

## Declared work-item fields

- `type`: control-plane identity propagation
- `targets`: `scripts/lib/foundation/planning/flow/auto-gate.mjs`,
  `scripts/lib/tooling/cli/parse-args/govern/plan.mjs`, `scripts/lib/foundation/planning/ops/cli.mjs`,
  the rex capability-activation store module
- `allowedWrites`: those files + `scripts/tests/execution/planning/**` + `scripts/tests/execution/rex/**`
- `failureClass`: `no-progress` while F-a/F-b is unsigned

## Acceptance

- `plan auto-gate --work-item X --explicit-intent plan` twice → one ledger and one activation.
- An activation created before this change (path-keyed) still resolves for the same plan.
- A21's reuse rule and A22's identity refusals stay green (no regression on either).

## Status

- status: active — blocked on the F-a/F-b sign-off; facts settled, no code written.
