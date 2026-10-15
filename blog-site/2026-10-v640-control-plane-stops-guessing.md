---
title: "v6.4.0: A Control Plane That Stops Guessing — Ledgers Cannot Fork, Refusals Are Features, Gates Run Where They Claim"
description: "v6.4.0 pins down three things: a plan ledger can no longer silently fork when you register the same work item twice (A21–A23), the plan CLI stops answering write requests with a read-only view (A19), and declared checks actually run in CI — directory budget, affected-test selection for skill changes, and a training gate that says which base it validated against (A20). The same release lands the mattpocock/skills v1.3 trio on both faces (retro, implement-spec, pr) and deletes the dead barrel with zero importers (A16)."
date: 2026-10-15
tags: ["AIOS", "v6.4.0", "plan", "workflow", "skills", "gates", "release"]
---

# v6.4.0: A Control Plane That Stops Guessing — Ledgers Cannot Fork, Refusals Are Features, Gates Run Where They Claim

> **TL;DR:** This release is about not guessing. Plan ledgers could quietly fork into two documents when the same work item was registered twice, only one of them carrying the capability activation; `aios plan` would hand a write request a read-only view and exit 0; declared checks (directory budget, affected-test selection for skill changes) existed on disk but never ran in CI. v6.4.0 nails each class down: A21 makes a planned turn reuse the active ledger, A22 gives work items a canonical identity, A23 propagates that identity into the Capability Command binding; A19 makes the CLI refuse unimplemented subcommands instead of substituting `status`; A20 makes the training gate say which base it validated against and what the remedy for each rejection is. The same release adopts the mattpocock/skills v1.3 trio on both faces per ADR 0003's landing questions: the parent repo gains `retro` and `implement-spec`, and rex-harness 0.11.0 ships `rex-implement-spec` / `rex-pr` / `rex-retro` as standalone-facing orchestration skills — the install projection grows from 14 to 17 skills.

## The ledger cannot fork (A21 → A22 → A23)

This line fixes three appearances of one disease: **the plan ledger answers to "which document is active," and registering a work item twice could create two.**

A21 fixes reuse first. `workflow-policy.mjs` hardcoded "a planned turn always creates a new ledger," so registering the same item twice (`plan start`, then `plan auto-gate`) produced two documents differing only by a `-2` suffix, and only the newer one carried the capability activation — `plan task` and `plan add-evidence`, which act on the *active* plan, silently orphaned the first. Reuse is now keyed on a state fact (an active, non-terminal plan exists) and never on objective-text similarity; the declared escape hatch is `plan auto-gate --new-work-item`, and `strict` mode reuses too — strict means "always work from a ledger," not "mint one per turn."

A22 adds identity: `plan start --work-item <id>` gives a work item a canonical identity (case/spacing/punctuation normalized; `..`, path separators and control characters refused). Identity is **declared**, never inferred — an existing id re-activates that ledger, a lost store with a surviving document is re-adopted (`recovered: true`) rather than minting another `-2`. The guard caught a hole we did not anticipate: a declared-but-blank `--work-item ""` collapsed into "flag absent" and fell through to the unkeyed path, minting exactly the sibling this feature exists to prevent; identity is now keyed on presence and a blank declaration is refused.

A23 closes the propagation. A22 gave `plan start` an identity, but the gate that writes ledgers for a planned turn still passed none — a gate-created ledger carried `workItemId: ''` while its rex activation was keyed by path or a per-turn hash. The ledger answered to one id and the Command that admits completion answered to something else. Activation keys are now an ordered preference — declared id, then ledger path, then turn hash — with an id→path read-through so pre-A23 path-keyed activations stay reachable. Two precedence rules came from measurement, not design: a declared id whose canonical form *differs* from the active plan's id creates its own ledger (A21's reuse must not swallow an explicitly different declaration); `--work-item X --new-work-item` is refused with exit 1 rather than resolved by precedence, because that combination writes a second ledger whose activation key collides with the first. One counter-intuitive pin: `canonicalizeWorkItemId('')` must return `''`, because the shared slugify falls back to the literal `'plan'` for empty input — which made every undeclared turn look like a *different* work item and silently switched A21's reuse off (five tests failed before the cause was found).

## Refusals are features (A19)

`aios plan` used to make the ledger unwritable through two silent substitutions: the argv parser rewrote **any** unrecognized subcommand to `status` (so `plan list`, or a mistyped `plan setstatus`, printed the plan and exited 0), and the `status` branch ignored `--status/--note/--force` (so `plan status --status done` exited 0 having changed nothing). A work item that finished on 2026-09-21 therefore stayed `executing` for three weeks — and a stale `executing` plan is exactly what every 「继续」 resume trusts, so the ledger was actively misleading the next session.

The fix fails closed: the parser passes the declared subcommand through verbatim and stops owning a vocabulary copy; the ops layer — which owns the branch set — exports `PLAN_SUBCOMMANDS` and refuses unimplemented names while listing the valid ones; `status` refuses write flags and points at `plan set-status`; help finally advertises `aios plan set-status …` — the missing line is why the trap was survivable. Two mutations are caught independently: reintroducing the parser fallback fails C2 only; deleting the `status` guard fails C3 only.

## Gates that run where they claim (A20 + directory budget + affected tests)

**A20 — the training gate says which base it validated.** `verify-training` used to collapse nine different failures into one sentence, so a cert recorded at the **wrong base** looked identical to stale content — and the remedies differ. Every blocked entry now carries `code` + `reasonKind` + `remedy` (the exact command), a tampered baseline artifact is split from a cert recorded at another base, and the PowerShell-side preflight re-flows captured output on failure instead of swallowing it.

**Directory budget — the rule now runs in CI.** AGENTS.md declares "max 8 entries per directory," and `check-dir-budget.mjs` does exit 1 on a blocking violation — but it had zero execution surfaces: not in `package.json`, not in any workflow, no pre-commit. The repo had drifted to 2 blocking violations while every suite stayed green. It now runs as the second step of `pretest:scripts`, so CI (and releases) fail on a new over-budget directory. The two drifted directories are first frozen in the script's ratchet baseline; the semantic split is a separate item.

**Affected tests — skill changes no longer silently select 0 tests.** Measured this cycle: an 8-file change including `skill-sources/retro/SKILL.md` printed `选中 0/219` ("selected 0 of 219") — skill-sources files are read by the guard suite via directory traversal, never via import, so the static impact graph has no edge for them. Any `skill-sources/` change is now attributed to the skill guard prefix, selecting the 13 guard tests.

## The session-to-environment loop (the trio, both faces + A16)

This release also answers a question: **where do retrospective environment lessons land?**

The parent repo adopts mattpocock/skills v1.3's `retro` and `implement-spec` per ADR 0003's landing questions. `retro` reviews a session for "change the environment, not the code" candidates across seven categories (navigation pointers, deterministic checks, coding standards, AGENTS.md additions/removals, tool economics, wasted instructions, information reachability) — proposals only, never file writes, every candidate needs a source reference, and each of the seven categories must account for "not seen" when it is. `implement-spec` is the execution entry for a spec that already carries acceptance criteria and a work-item graph: take the frontier, dispatch in parallel through the approved `aios work` gate, close on the integration branch, finish with `/review`.

Standalone rex-harness users get neither, so rex-harness 0.11.0 ships `rex-implement-spec` / `rex-pr` / `rex-retro` as framework-free orchestration skills — not Providers, never selected by Capability Commands, sharing the orchestration surface with `rex-workflow`. The standalone install projection grows from 14 to 17 skills. The two-face arrangement follows the same precedent as `grill` ↔ `rex-requirements`.

Finally, the operator-authorized cleanup: `src/core/index.mjs` — a self-described "core infrastructure barrel" with zero importers across the whole repo — is deleted (register A16 closed). Adopting it as the entry point its header describes would rewrite import paths repo-wide for no functional benefit; rebuilding on demand is cheaper than maintaining dead code.

## Upgrade notes

- No breaking migration: after updating, rerun `aios init` (or re-sync skills) to pick up the new `retro` / `implement-spec` skills.
- The rex-harness pointer advances to 0.11.0; standalone-only users gain 3 projected orchestration skills with no behavior change to existing ones.
- Training evidence in this release was re-issued against the v6.3.0 base (deterministic, local, no model involved). If your workspace carries its own skill changes, run the same remedy before tagging: `aios skill certify --changed --base v6.3.0`.
