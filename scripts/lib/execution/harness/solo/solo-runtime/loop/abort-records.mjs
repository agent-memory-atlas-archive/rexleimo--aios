/* 中文注释：一条 run 有两种"放弃"，它们必须报告不同的事实（B4）。
 *
 * 单独立法的原因不是行数洁癖：旧代码在中止时把类别写成
 * `consecutiveInfraFailures > 0 ? 'runtime-error' : 'no-progress'`，那是**拿计数器猜语义**——
 * 一个因 tool-error / safety-gate 反复失败的 run 会被贴上"无进展"的标签，后来的人无法从
 * 记录里分辨实际原因，而这恰好是恢复判断要读的那一行。现在一律用本轮真上报的类别。
 *
 * 停滞（钩子有界等待到期）走独立阈值与独立措辞：重试不会让一个卡死的订阅者变好，
 * 而它也不该挤进 consecutiveFailures 的退避里。 */

import { maxConsecutiveFailures, shouldAbortForConsecutiveFailures } from './backoff.mjs';

/** 停滞中止：由 hook 等待跟踪器给出已经发生过的事实。 */
function stallRecord(hookWaits) {
  return hookWaits?.abortRecord?.() || null;
}

/** 失败中止：措辞与证据只引用计数器里已有的数，不新增推断。 */
function failureRecord({ reportedFailureClass, backoff, limit }) {
  const consecutiveFailures = Number(backoff?.consecutiveFailures) || limit;
  return {
    summary: `Aborted after ${limit} consecutive failures.`,
    evidence: [`consecutiveFailures=${consecutiveFailures}`, `lastReportedFailureClass=${reportedFailureClass}`],
    nextAction: 'Inspect the harness journal and checkpoint to diagnose the repeated failure, then resume with a fresh objective.',
    // 中文注释：类别沿用**自报值**；缺席就是 'none'，不替它编一个原因。
    failureClass: reportedFailureClass,
  };
}

/**
 * @returns {Promise<Object>|Object|null} 中止记录（summary/evidence/nextAction/failureClass），
 *          没有该中止就返回 null —— 调用方据此决定是否结束这条 run。
 */
export function resolveAbortRecord({ hookWaits = null, backoff = null, reportedFailureClass = 'none' } = {}) {
  const stall = stallRecord(hookWaits);
  if (stall) return stall;
  if (!shouldAbortForConsecutiveFailures(backoff)) return null;
  return failureRecord({ reportedFailureClass, backoff, limit: maxConsecutiveFailures() });
}
