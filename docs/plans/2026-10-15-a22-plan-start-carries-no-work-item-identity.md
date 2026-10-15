# A22: plan start carries no work-item identity

> AIOS Planning Contract (schema v3)
> created: 2026-10-15T04:51:41.481Z
> client: cli
> source: aios plan start (A21 delivered 2026-10-15; boundary registered as A22)
> route: unknown

## Objective

Two identical plan start calls mint two documents (-2 suffix) and the second silently becomes the active plan, orphaning the first with no CLI path back. Decide the contract: an explicit --work-item <id> whose document name derives from the id and updates in place (additive), or refuse a second ledger while an active non-terminal plan exists (contract change). Never compare objective text.

## Route skills

1. `Rex selects the current provider`

## Tasks

- [ ] **t1-understand**: Clarify objective: Two identical plan start calls mint two documents (-2 suffix) and the se — _Objective restated; constraints listed_
- [ ] **t2-plan**: Break work into executable tasks — _Plan tasks updated beyond scaffold if needed_
- [ ] **t3-implement**: Implement changes — _Code changes match objective_
- [ ] **t4-verify**: Verify with tests/checks — _Evidence recorded (command or artifact path)_

## Progress

- status: active

## Decision Log

- (none yet)

## Acceptance

- Complete planned tasks and record verification evidence.

## Next Actions

- Start with the first pending task.

## Verification evidence

- Attach via `aios plan add-evidence --kind command|path|test --value "..."`
- Plan cannot be `done` without evidence and completed tasks

## Status

- status: active
