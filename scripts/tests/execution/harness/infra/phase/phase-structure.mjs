import assert from 'node:assert/strict';
import test from 'node:test';

import { path, pathToFileURL, readFile } from '../support.mjs';

test('subagent runtime delegates orchestration responsibilities to focused modules', async () => {
  const entry = await readFile(path.resolve('scripts/lib/execution/harness/team/subagent-runtime.mjs'), 'utf8');
  const entryLines = entry.trim().split(/\r?\n/u).length;
  assert.equal(entryLines <= 260, true, `subagent-runtime.mjs is ${entryLines} lines; keep it as a facade and split orchestration responsibilities under harness/subagent-runtime/*`);

  const modules = [
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/state/constants.mjs', exports: ['SUBAGENT_CLIENT_ENV', 'CLIENT_COMMAND'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/context/text.mjs', exports: ['normalizeText', 'clipText'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/context/file-policy.mjs', exports: ['evaluatePhaseFilePolicy', 'summarizeFilePolicyViolation'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/context/client-args.mjs', exports: ['buildCodexConfigArgs', 'buildRoutedExtraArgs'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/run/one-shot-runner.mjs', exports: ['runOneShot'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/context/paths.mjs', exports: ['resolveRepoRoot'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/state/snapshots.mjs', exports: ['createPreMutationSnapshot', 'withPreMutationSnapshot'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/state/telemetry.mjs', exports: ['collectCostTelemetry', 'mergeCostTelemetry', 'normalizeCostTelemetry'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/context/context-packet.mjs', exports: ['detectSessionIdFromPlan'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/context/role-memory.mjs', exports: ['loadRolePinnedMemory', 'appendJobFindingsToRoleMemory'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/context/prompts.mjs', exports: ['buildSystemPrompt', 'buildUserPrompt', 'renderDependencyContext'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/run/handoff-output.mjs', exports: ['extractJsonCandidate'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/run/job-runs.mjs', exports: ['buildBlockedJobRun', 'buildAutoCompletedReadOnlyReviewRun', 'normalizeSeededJobRun'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/phases/phase-job.mjs', exports: ['executePhaseJob'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/phases/phase-job-helpers.mjs', exports: ['resolveAgentForJob', 'injectAgentIdEnv', 'normalizeResultAttempts', 'buildStructuredOutput'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/phases/phase-death-notice.mjs', exports: ['maybeRecordWorkerDeathNotice'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/phases/phase-plan-sync.mjs', exports: ['maybeSyncPlanOnPhaseSuccess'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/state/merge-gate.mjs', exports: ['executeMergeGateJob'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/run/dispatch-executor.mjs', exports: ['runDispatchJobs'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/phases/phase-output.mjs', exports: ['readSubagentOutputText', 'normalizePhaseHandoffPayload', 'buildCompletedPhaseJobRun'] },
    { file: 'scripts/lib/execution/harness/team/subagent-runtime/phases/phase-blocks.mjs', exports: ['buildBlockedPhaseJobRun'] },
    { file: 'scripts/lib/execution/harness/team/subagent-clients/spawn-result.mjs', exports: ['normalizeSpawnResult'] },
    { file: 'scripts/lib/execution/harness/team/subagent-clients/invocation-runner.mjs', exports: ['runClientInvocation'] },
    { file: 'scripts/lib/execution/harness/team/subagent-clients/codex-exec.mjs', exports: ['runCodexInvocation'] },
  ];

  for (const moduleDef of modules) {
    const mod = await import(pathToFileURL(path.resolve(moduleDef.file)).href);
    for (const exportName of moduleDef.exports) {
      assert.notEqual(mod[exportName], undefined, `${moduleDef.file} should export ${exportName}`);
    }
  }

  const focusedBudgets = [
    ['scripts/lib/execution/harness/team/subagent-runtime/run/one-shot-runner.mjs', 120],
    ['scripts/lib/execution/harness/team/subagent-runtime/phases/phase-job.mjs', 190],
  ];
  for (const [file, maxLines] of focusedBudgets) {
    const raw = await readFile(path.resolve(file), 'utf8');
    const lines = raw.trim().split(/\r?\n/u).length;
    assert.equal(lines <= maxLines, true, `${file} is ${lines} lines; move reusable client/result handling into focused modules`);
  }
});

test('harness runtime tests remain split into focused modules', async () => {
  const budgets = [
    ['scripts/tests/execution/harness/harness-runtime.test.mjs', 12],
    ['scripts/tests/execution/harness/infra/core/core.mjs', 300],
    ['scripts/tests/execution/harness/infra/phase/phase-execution.mjs', 320],
    ['scripts/tests/execution/harness/infra/phase/phase-structure.mjs', 180],
    ['scripts/tests/execution/harness/infra/solo/solo-turn.mjs', 180],
    ['scripts/tests/execution/harness/infra/solo/solo-run.mjs', 300],
    ['scripts/tests/execution/harness/infra/command/command-lifecycle.mjs', 320],
    ['scripts/tests/execution/harness/infra/command/command-hooks.mjs', 220],
    ['scripts/tests/execution/harness/infra/support.mjs', 180],
  ];
  for (const [file, maxLines] of budgets) {
    const source = await readFile(path.resolve(file), 'utf8');
    const lines = source.trim().split(/\r?\n/u).length;
    assert.equal(lines <= maxLines, true, `${file} is ${lines} lines; keep harness runtime test concerns focused`);
  }
});
