/* 中文注释：run-summary 是投影，iteration 记录是账本。本模块只做只读比对，不改写任何状态——
   检测到漂移也绝不“顺手修一下”：修复属独立决定（见 work-6 S3），静默改写会把观测对象消掉。 */
import { readLatestIterationRecord } from '../lifecycle/iteration.mjs';
import { readSoloRunSummary } from './summary.mjs';

export const RUN_SUMMARY_CONSISTENCY_KIND = 'solo-run-summary-consistency.v1';

/**
 * 投影与账本的一致性检查。
 *
 * 为什么需要：一轮内账本先写（`appendSoloIteration`）、投影后写（`persistIterationState`，
 * 唯一 summary 写者，见 work-6 S1），崩溃落在两次写之间时 summary 会滞后于 iteration 记录。
 * 没有这个检查时，恢复路径会把滞后值当成事实（G3），而读侧完全看不出区别（G2）。
 *
 * @param {object} input
 * @param {object} [input.summary] 已读到的 summary；调用方已有值时传入以避免重复读取。
 * @returns 一致性报告；summary 缺失时返回 null（无可比对对象）。
 */
export async function checkRunSummaryConsistency({ rootDir, sessionId, summary } = {}) {
  const resolvedSummary = summary ?? await readSoloRunSummary({ rootDir, sessionId });
  if (!resolvedSummary) return null;

  const record = await readLatestIterationRecord({ rootDir, sessionId });
  const ledger = Object.freeze({
    lastIteration: record?.iteration ?? 0,
    lastOutcome: record?.outcome ?? '',
    lastFailureClass: record?.failureClass ?? 'none',
    lastStage: record?.stage ?? '',
  });
  const projected = Object.freeze({
    iterationCount: resolvedSummary.iterationCount,
    lastIteration: resolvedSummary.lastIteration,
    lastOutcome: resolvedSummary.lastOutcome,
    lastFailureClass: resolvedSummary.lastFailureClass,
    lastStage: resolvedSummary.lastStage,
  });

  const driftFields = [];
  // iterationCount 与 lastIteration 在写入侧都取“最新轮号”，因此二者对账本同源可比。
  if (projected.iterationCount !== ledger.lastIteration) driftFields.push('iterationCount');
  if (projected.lastIteration !== ledger.lastIteration) driftFields.push('lastIteration');
  if (projected.lastOutcome !== ledger.lastOutcome) driftFields.push('lastOutcome');
  if (projected.lastFailureClass !== ledger.lastFailureClass) driftFields.push('lastFailureClass');
  if (projected.lastStage !== ledger.lastStage) driftFields.push('lastStage');
  if (record?.recordUnreadable === true) driftFields.push('ledgerRecordUnreadable');

  return Object.freeze({
    schemaVersion: 1,
    kind: RUN_SUMMARY_CONSISTENCY_KIND,
    sessionId: resolvedSummary.sessionId,
    consistent: driftFields.length === 0,
    driftFields: Object.freeze(driftFields),
    ledger,
    projected,
  });
}
