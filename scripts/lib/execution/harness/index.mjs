/* 中文注释：Harness barrel，集中导出 orchestrator/solo/eval/gate 等被外部域消费的能力。 */
export {
  buildDispatchPolicy,
  buildEffectiveDispatchPolicy,
  buildExecutorCapabilityManifest,
  buildLocalDispatchPlan,
  buildOrchestrationPlan,
  normalizeOrchestratorBlueprint,
  normalizeOrchestratorFormat,
  renderOrchestrationReport,
} from './orchestration/orchestrator.mjs';

export {
  createDispatchRuntimeRegistry,
  normalizeDispatchRuntimeResult,
  resolveDispatchRuntime,
} from './orchestration/orchestrator-runtimes.mjs';

export { compactRlDecisionEvidence, persistDispatchEvidence } from './orchestration/orchestrator-evidence.mjs';
export {
  evaluateClarityGate,
  persistClarityGateDecision,
} from './quality/clarity-gate.mjs';
export { buildDispatchInsights } from './team/dispatch-insights.mjs';
export { buildHindsightEval } from './quality/hindsight-eval.mjs';
export { persistQualityGateEvidence } from './quality/verification-evidence.mjs';
export { buildWorkItemTelemetry } from './orchestration/work-item-telemetry.mjs';
export { buildLearnEvalReport, renderLearnEvalReport } from './quality/learn-eval.mjs';
export { persistLearnEvalHindsightEvidence } from './quality/learn-eval-evidence.mjs';

export {
  HARNESS_PROFILE_NAMES,
  getDisabledGateIds,
  isHarnessGateEnabled,
  normalizeHarnessProfile,
} from './ops/profile.mjs';

export {
  checkSoloHarnessProfileReadiness,
  buildSoloHarnessCommand,
  resolveSoloHarnessProfile,
} from './solo/solo-profiles.mjs';
export {
  classifySoloFailure,
  normalizeSoloIterationOutcome,
  runSoloHarnessLoop,
} from './solo/solo-runtime.mjs';
export {
  clearSoloHarnessStop,
  initSoloRunJournal,
  readSoloControl,
  readSoloRunStatus,
  readSoloRunSummary,
  requestSoloHarnessStop,
  writeSoloRunSummary,
} from './solo/solo-journal.mjs';
export { finalizeSoloWorktree, prepareSoloWorktree } from './solo/solo-worktree.mjs';
export { getHarnessTarget } from './ops/targets.mjs';
