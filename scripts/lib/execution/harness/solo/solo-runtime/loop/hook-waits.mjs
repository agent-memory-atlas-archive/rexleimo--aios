/* 中文注释：钩子等待的停滞记账（B4）。单独成文件的理由是客观的：`loop.mjs` 的
 * fileLines 基线是 596 且规则为 shrink-only，把这段塞进去会立刻破棘轮——而破棘轮的
 * 正确反应是拆责任，不是抬基线。
 *
 * 它拥有三件事：
 * 1) 停滞计数（与 consecutiveFailures 完全分开：一个慢订阅者不该把正常 run 推进修退避）；
 * 2) 停滞中止的判断与措辞（阈值独立，因为"重试不会让卡死的钩子变好"）；
 * 3) 归因证据行，供 run-summary / journal 复核"是哪个 hook、多大预算、实际等了多久"。
 * 它不做 I/O，也不自己发事件——事件由 hooks.mjs 写，这里只读回结论。 */

import { invokeLifecycleHook } from '../support/hooks.mjs';
import { countsAsStall, describeStall, shouldAbortForConsecutiveStalls } from '../support/stall.mjs';

export function createHookWaitTracker({ invoke = invokeLifecycleHook, threshold = null } = {}) {
  let consecutiveStalls = 0;
  let lastStall = '';
  let lastStalledHook = '';

  return {
    async run(options = {}) {
      const result = await invoke(options);
      if (countsAsStall(result?.verdict)) {
        consecutiveStalls += 1;
        lastStalledHook = options?.hook || '';
        lastStall = result.stall || describeStall({
          hook: options?.hook,
          phase: options?.phase,
          iteration: options?.iteration,
          verdict: result?.verdict,
        });
      } else if (result?.verdict === 'ok') {
        // 一次干净的通过说明卡的是那一轮，不是这条 run 本身。
        consecutiveStalls = 0;
        lastStall = '';
        lastStalledHook = '';
      }
      // cancelled / failed 一律不动停滞计数：前者是操作者动作，后者由失败计数器负责。
      return result;
    },

    get consecutiveStalls() {
      return consecutiveStalls;
    },

    stalledOut() {
      return shouldAbortForConsecutiveStalls({ consecutiveStalls, threshold });
    },

    /** 停滞中止的措辞与证据：只描述已经发生过的事实，不推断"为什么没进展"。 */
    abortRecord() {
      if (!this.stalledOut()) return null;
      return {
        summary: `Aborted after ${consecutiveStalls} consecutive hook stalls (bounded wait expired).`,
        evidence: [`consecutiveHookStalls=${consecutiveStalls}`, lastStall].filter(Boolean),
        nextAction: `Inspect the hook events for ${lastStalledHook || 'the stalled hook'}, fix or unhook that subscriber, then resume with a fresh objective.`,
        failureClass: 'runtime-error',
      };
    },
  };
}
