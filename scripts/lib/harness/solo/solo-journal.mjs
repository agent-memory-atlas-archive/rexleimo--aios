/* 中文注释：solo-journal facade 保持旧导入路径稳定；路径、摘要、控制、迭代、hook 和状态已拆分。 */
export {
  CONTROL_FILENAME,
  HOOK_EVENTS_FILENAME,
  OBJECTIVE_FILENAME,
  OPERATOR_NOTES_FILENAME,
  RUN_SUMMARY_FILENAME,
  SOLO_HARNESS_DIRNAME,
  SOLO_STAGES,
} from './solo-journal/plumbing/constants.mjs';
export { clearSoloHarnessStop, readSoloControl, requestSoloHarnessStop, writeSoloControl } from './solo-journal/lifecycle/control.mjs';
export { initSoloRunJournal } from './solo-journal/lifecycle/init.mjs';
export { renderObjectiveMarkdown, safeReadJson } from './solo-journal/plumbing/io.mjs';
export { appendSoloIteration } from './solo-journal/lifecycle/iteration.mjs';
export { appendSoloHookEvent } from './solo-journal/plumbing/hooks.mjs';
export { claimSessionOwner, isProcessAlive, readSessionOwner } from './solo-journal/content/owner.mjs';
export { installSessionSignalHandlers } from './solo-journal/lifecycle/signals.mjs';
export {
  defaultBackoff,
  defaultControl,
  defaultWorktreeState,
  formatRelativePath,
  normalizeAbsolutePath,
  normalizeIterationOutcome,
  normalizeOptionalStage,
  normalizeRunSummary,
  normalizeStage,
  normalizeStringArray,
  normalizeText,
  toPosixPath,
} from './solo-journal/content/normalizers.mjs';
export { getSoloHarnessPaths, iterationFileName, iterationLogFileName, sessionDir, soloHarnessDir } from './solo-journal/plumbing/paths.mjs';
export { readSoloRunStatus } from './solo-journal/content/status.mjs';
export { readSoloRunSummary, writeSoloRunSummary } from './solo-journal/content/summary.mjs';
