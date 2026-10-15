# A22: plan start carries no work-item identity

> AIOS Planning Contract (schema v3)
> created: 2026-10-15T04:20:41.902Z
> client: cli
> source: aios plan auto-gate
> route: implement
> work-item: a22-plan-start-carries-no-work-item-identity

## Objective

Registering the same work item twice must not produce two ledgers. `plan start` had no identity to
compare against, so every repeat call reserved `<slug>-2.md` and silently became the active plan —
leaving the first ledger unreachable, because task/evidence writes only reach the **active** plan.

## Facts (measured 2026-10-15, isolated `--workspace`, repo untouched)

- **J1** two unkeyed `plan start --title "Legacy probe"` calls produced
  `2026-10-15-legacy-probe.md` **and** `…-2.md`.
- **J2** `reservePlanArtifact` (contract.mjs) resolves collisions by trying `open(..., 'wx')` and
  appending `-<attempt>` — there was nothing to compare, so a duplicate was structurally unavoidable.
- **J3** only `.aios/planning/active.json` holds structured plan state. A non-active plan exists as
  markdown only, so even a correct "same item" judgement had nowhere to restore tasks or evidence from.
- **J4** the identity question cannot be answered from text: two phrasings of one sentence are two
  work items under the prompt-authoring norms, and a fuzzy match is how a ledger gets swallowed.

## Delivered

- `plan start --work-item <id>` declares the identity. `canonicalWorkItemId` normalises it
  (case, spacing, punctuation → slug) and **refuses** path separators, `..`, control characters, and
  over-long ids; an unsafe id writes nothing and is never sanitised into a different ledger.
- `openWorkItemPlan` is get-or-create: an existing id store re-activates that ledger; a lost store but
  surviving document **re-adopts the document** (`recovered: true`) instead of reserving `-2`; only a
  genuinely new id creates one. Identity is matched as the canonical id — the document-name suffix match
  is on `<date>-<id>.md`, not on the objective.
- The active plan is mirrored per id under `.aios/planning/plans/<id>.json`, so structured state
  (task statuses, evidence) survives switching away and back. `> work-item: <id>` is written into the
  durable markdown header, not only into gitignored state.
- **Presence, not truthiness**: `--work-item ""` is refused. Collapsing "declared but blank" into
  "flag absent" would route it to the unkeyed path and mint exactly the sibling this item exists to stop
  — that hole was found by the W3 guard, not by review.
- The unkeyed path is unchanged (W4 pins it): this item did not quietly redefine what `plan start` means.

## Non-goals

- `plan auto-gate` still creates ledgers without an id; A21's reuse rule covers that path.
- No migration for pre-existing `-2` siblings; they stay as history.

## Declared work-item fields

- `type`: control-plane bookkeeping correctness
- `targets`: `scripts/lib/foundation/planning/contract/contract.mjs`,
  `scripts/lib/foundation/planning/contract/schema.mjs`, `scripts/lib/foundation/planning/ops/cli.mjs`,
  `scripts/lib/tooling/cli/parse-args/govern/plan.mjs`, `scripts/lib/tooling/cli/help/commands/maintenance.mjs`
- `allowedWrites`: those files + `scripts/tests/execution/planning/**`
- `failureClass`: `wrong-scope` if the fix required changing the unkeyed default

## Acceptance

- Same id → one document, `created:false`, structured state intact (W1, W2, W5).
- Unsafe or blank-declared id → refused, nothing written (W3).
- Lost id store → the surviving document is re-adopted, never duplicated (W7).
- Unkeyed behaviour preserved (W4); distinct ids stay distinct (W8); identity visible in the artifact (W6).

## Verification evidence

- `scripts/tests/execution/planning/plan-work-item-identity.test.mjs` W1-W8, wired into `regression`;
  planning 75/75, wiring+workflow+ctx-agent-core 77/77, context/native/skills/dream/product-L3 35/35.
- Mutations, each flipping an assertion: blank-declared id falls back to unkeyed (W3), id mirror never
  written (W1+W5), lost store cannot re-adopt (W7), unsafe-id rejection removed (W3), document name
  ignores identity (W8). Files hash-verified IDENTICAL after the mutation batch.
- Live probe: `plan start --work-item dup-item` ×3 (incl. `DUP item`, padded spacing) → one
  `docs/plans/2026-10-15-dup-item.md`, calls 2-3 reported `created:false`.

## Status

- status: delivered 2026-10-15. Residual (registered, not guessed): `plan auto-gate` does not yet accept
  `--work-item`, so capability bindings still key on the plan path rather than the declared identity.
