/* 中文注释：temp runner facade 只保留稳定 API；策略、工作区、安全命令、补丁、动作执行和验证分别拆分。 */
export { DEFAULT_POLICY, createDefaultExecutionPolicy, ensureBudgets } from './temp-runner/run/policy.mjs';
export { truncateText } from './temp-runner/observe/text.mjs';
export { makeObservation, persistObservation, recordObservation } from './temp-runner/observe/observations.mjs';
export {
  assertWorkspaceState,
  createEnv,
  createEpisodeWorkspace,
  destroyEpisodeWorkspace,
  ensureWorkspaceReadable,
  isWithinRoot,
  resolveWorkspacePath,
} from './temp-runner/run/workspace.mjs';
export { checkForbiddenCommand, collectFailingTests, computeVerificationStatus, normalizeFailureLabel, runCommand } from './temp-runner/run/command.mjs';
export { buildNoProgressFingerprint, getStopConditionCandidate, isNoProgressObservation } from './temp-runner/observe/no-progress.mjs';
export { applyPatch, parsePatchOperations } from './temp-runner/observe/patch.mjs';
export { executeAction } from './temp-runner/run/actions.mjs';
export { runBaselineFailureCheck, runVerification } from './temp-runner/observe/verification.mjs';
