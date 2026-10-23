# Dependency graph — pi compat self-heal slice (A1 + A4-3 + A4-1/A4-2 + A3-2)

Capability activation `d6adb8c8-b373-4785-a535-de4c3b9d26eb` (`software.planning.sequence`, provider `rex-planning`).
Spec source: `doc:docs/plans/2026-10-23-pi-stall-self-heal-test-scope.md` (contract §2/§5/§6). The A2/A3 slice is
already delivered and closed (`git:b1a4d4c4`, `git:f102aacd`, review `git:38118f76` + `git:ba3abad0`); this graph covers
only what that review recorded as still missing.

```json
{
  "schemaVersion": 1,
  "kind": "rex.delivery-ticket.v1",
  "decisionTicketRef": "doc:docs/plans/2026-10-23-pi-stall-self-heal-test-scope.md",
  "completionClaim": "soft",
  "workItems": [
    {
      "id": "work-1",
      "title": "doctorPiBridge reports reasoning providers whose developer-role compat is undeclared (A4-3)",
      "dependsOn": [],
      "observableOutcome": "doctorPiBridge() over a temp models.json with an openai-completions reasoning provider that omits compat.supportsDeveloperRole returns a warning naming that provider; a provider that declares false, a non-reasoning provider, and an anthropic api surface produce no such warning.",
      "completionCriteria": "the warning exists as an observable doctor result, asserted for both the at-risk and the not-at-risk cases, and the pre-existing doctor tests still pass unchanged.",
      "verification": "node --test scripts/tests/clients/pi-adapter/pi-doctor.test.mjs (focused, via aios rex receipt)",
      "legalRed": "yes - doctorPiBridge is an existing stable public entry, so the assertion fails on behavior (warning absent), not on a missing module.",
      "targets": ["scripts/lib/tooling/components/integrations/pi/doctor.mjs", "scripts/tests/clients/pi-adapter/pi-doctor.test.mjs"],
      "rollbackPoint": "revert the doctor commit; no runtime behavior outside doctor changes."
    },
    {
      "id": "work-2",
      "title": "additive models.json compat self-heal writer (A1)",
      "dependsOn": ["work-1"],
      "observableOutcome": "one entry point over an explicit models.json path: missing compat key -> added; unrelated provider keys and top-level keys kept; declared true or false -> untouched; malformed JSON or unwritable path -> fail closed with no file change; repeated runs -> byte-identical.",
      "completionCriteria": "contract §5 A1-1..A1-6 asserted through the temp-root fixture seam, plus the real-provider-id case, and the writer is the single owner of that judgement (doctor calls it instead of re-implementing the predicate).",
      "verification": "node --test scripts/tests/clients/pi-adapter/pi-compat-self-heal.test.mjs (focused)",
      "legalRed": "partial - the writer's own entry does not exist yet, so its first failure is module-absent (infrastructure, not a legal RED). The classification behavior it shares with work-1 is already pinned by work-1's RED, so this item inherits a real behavioral boundary rather than starting from a guess.",
      "targets": ["scripts/lib/tooling/components/integrations/pi/", "scripts/tests/clients/pi-adapter/pi-compat-self-heal.test.mjs"],
      "rollbackPoint": "delete the new module + test; work-1's doctor check keeps reporting without any write path."
    },
    {
      "id": "work-3",
      "title": "init opt-in wiring and doctor advice (A4-1, A4-2)",
      "dependsOn": ["work-2"],
      "observableOutcome": "`aios init` performs no global write by default; with the compat flag it reports present/added/would-add/kept-user-value for the same file; running it twice yields the same file bytes; a user who already set supportsDeveloperRole true is reported as kept, never rewritten.",
      "completionCriteria": "contract §5 A4-1 and A4-2 asserted, the global settings path stays untouched unless the flag is passed, and the consent rule is written down in the README/init help.",
      "verification": "node --test scripts/tests/clients/pi-adapter/pi-compat-self-heal.test.mjs && npm run test:affected",
      "legalRed": "yes - init already has a public CLI surface, so 'no flag -> no write' is assertable before the wiring exists.",
      "targets": ["scripts/aios-init.mjs", "scripts/lib/tooling/components/integrations/pi/doctor.mjs", "scripts/tests/clients/pi-adapter/pi-compat-self-heal.test.mjs"],
      "rollbackPoint": "drop the init flag; writer and doctor report remain usable on their own."
    },
    {
      "id": "work-4",
      "title": "runAios timeout keeps the AiosCliError shape (A3-2)",
      "dependsOn": [],
      "observableOutcome": "an execFileImpl that calls back with a timeout error yields AiosCliError (exitCode 1, stderr preserved), and a never-callbacking impl does not hang the test run.",
      "completionCriteria": "contract §5 A3-2 asserted as a test, not as a probe.",
      "verification": "node --test scripts/tests/clients/pi-agent/pi-extension.test.mjs (focused)",
      "legalRed": "no - the behavior already holds after work A3 (measured by probe); this closes the review's 'no test' finding, so it lands as characterization, and its green is the assertion being true on the current shape.",
      "targets": ["scripts/tests/clients/pi-agent/pi-extension.test.mjs"],
      "rollbackPoint": "test-only; revert the test commit."
    }
  ],
  "frontier": {
    "ready": ["work-1", "work-4"],
    "blocked": [
      { "id": "work-2", "reason": "needs work-1's classifier owner before the writer can reuse one predicate instead of duplicating it", "evidence": "doc:docs/reviews/2026-10-23-pi-stall-self-heal-a2a3-review.md" },
      { "id": "work-3", "reason": "wires work-2's entry point into init; wiring an absent entry would be a stub", "evidence": "doc:docs/plans/2026-10-23-pi-stall-self-heal-test-scope.md" }
    ]
  },
  "parallelGroups": [
    ["work-1", "work-4"],
    ["work-2"],
    ["work-3"]
  ],
  "convergenceGate": {
    "conditions": [
      "every focused scenario command has a zero-exit receipt",
      "npm run test:affected exits 0",
      "node scripts/check-dir-budget.mjs reports 0 blocking (scripts/lib/tooling/components/integrations/pi/ must stay <= 8 entries)",
      "standards-and-spec review over the fixed-point diff is recorded with its findings"
    ],
    "requiredEvidenceRefs": ["receipt:<per work item>", "doc:docs/plans/2026-10-23-pi-compat-self-heal-slice-a1-doctor-compat-check-a4-3-init-wirin.md"]
  }
}
```

## Shortest critical path

`work-1 → work-2 → work-3`. `work-4` is independent and does not gate anything; it is not strung into the pipeline.

## Ledger

```
ledger: { is_complete: false,
  in_progress: [],
  facts: [work items decomposed and dependency edges declared in this ticket,
          evidence doc:docs/plans/2026-10-23-pi-compat-self-heal-test-scope.md,
          A2/A3 slice closed by receipt:cd50de41-532a-4366-821b-869d6c282121 + review git:ba3abad0],
  assignment: { work-1: implementer, work-4: implementer } }
```

Next-round input: `work-1`'s focused doctor scenario command, which becomes this activation's testability
decision (`behavior-delta`) once its failing receipt exists.
