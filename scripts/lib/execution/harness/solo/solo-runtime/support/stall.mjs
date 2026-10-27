/* 中文注释：等待语义的纯策略层（B4）。无 I/O，因此每个判定在任何平台可单测。
 *
 * 要解决的事实：`hooks.mjs` 里 `await callback(payload)` 是**无界等待**，一个卡住的
 * 生命周期订阅者能把整条 run 永久挂住；而事件状态只有 `ok|error`，于是
 * **"被取消的等待"与"失败的运行"在日志里是同一个词**。后者尤其贵：用户主动打断会被
 * 计入失败，污染 consecutiveFailures、退避与中止判据——而我们恰好有靠这些计数触发的 abort。
 *
 * 三条纪律：
 * 1) 判定只吃**声明信号**（aborted / timedOut / errored 三个布尔），不吃错误文本关键词。
 *    本仓 `classifySoloFailure` 已经踩过这条路（`timeout` 被并进 `runtime-error`，停滞与
 *    普通故障不可区分），这里不再复制第二种猜测。
 * 2) 预算是**声明表**，按 phase 给，不靠拍脑袋的全局常数；关掉要有显式值。
 * 3) 停滞归因必须指到 `component + hook + phase + iteration + budgetMs + elapsedMs`，
 *    否则自愈就只是"再试一次"，同一种 stall 会反复发生。 */

export const STALL_COMPONENT = 'solo-runtime';

export const WAIT_VERDICTS = Object.freeze(['ok', 'cancelled', 'timed-out', 'failed']);

/** 默认预算：故意给得比“钩子通常多快”宽一到两个数量级。
 *  这是**首次引入**的闸门，漏报比误杀便宜：一个真的卡死的钩子多等几分钟可以接受，
 *  而把一个慢但正常的 run 因预算太紧而中止，是一个新造的故障。
 *  需要收紧的地方用 AIOS_SOLO_HOOK_TIMEOUT_MS 显式声明，不靠默认值试。 */
export const HOOK_WAIT_BUDGETS_MS = Object.freeze({
  'turn-start': 60_000,
  'turn-complete': 120_000,
  'before-continuity-commit': 60_000,
  'session-end': 300_000,
  'iteration-start': 60_000,
  default: 120_000,
});

export const DEFAULT_STALL_ABORT_THRESHOLD = 3;
const DISABLE_VALUES = new Set(['off', 'disable', 'disabled', 'none']);

function parseEnvNumber(raw) {
  const text = String(raw ?? '').trim().toLowerCase();
  if (!text) return null;
  if (DISABLE_VALUES.has(text)) return 0; // 0 = 显式不设上界，交给调用方的旧行为
  const value = Number.parseFloat(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** 预算解析顺序：显式 overrideMs > 环境变量 > phase 声明表 > default。 */
export function hookWaitBudgetMs({ phase = '', hook = '', env = process.env, overrideMs = null } = {}) {
  const override = parseEnvNumber(overrideMs);
  if (override !== null) return override;
  const fromEnv = parseEnvNumber(env?.AIOS_SOLO_HOOK_TIMEOUT_MS);
  if (fromEnv !== null) return fromEnv;
  const keyed = Number.isFinite(HOOK_WAIT_BUDGETS_MS[phase]) ? HOOK_WAIT_BUDGETS_MS[phase] : null;
  if (keyed !== null) return keyed;
  if (!phase && hook) return HOOK_WAIT_BUDGETS_MS.default;
  return HOOK_WAIT_BUDGETS_MS.default;
}

/**
 * 只有三个声明布尔参与判定，顺序即优先级：
 * 操作者取消 > 等待超时 > 抛错 > 正常。
 */
export function classifyWait({ aborted = false, timedOut = false, errored = false } = {}) {
  if (aborted === true) return 'cancelled';
  if (timedOut === true) return 'timed-out';
  if (errored === true) return 'failed';
  return 'ok';
}

/** 计入失败退避的只有"失败的运行"。取消与停滞都不进 consecutiveFailures。 */
export function countsAsRunFailure(verdict) {
  return verdict === 'failed';
}

/** 停滞有专属计数与专属中止阈值，不与基础设施失败混成一个数。 */
export function countsAsStall(verdict) {
  return verdict === 'timed-out';
}

export function shouldAbortForConsecutiveStalls({ consecutiveStalls = 0, threshold = DEFAULT_STALL_ABORT_THRESHOLD } = {}) {
  const limit = Number.isFinite(Number(threshold)) && Number(threshold) > 0
    ? Math.floor(Number(threshold))
    : DEFAULT_STALL_ABORT_THRESHOLD;
  return Number(consecutiveStalls) >= limit;
}

/** 归因行：进 evidence，让后来者不用重跑同一次等待就能知道"是谁卡的、卡了多久、预算多少"。 */
export function describeStall({ component = STALL_COMPONENT, hook = '', phase = '', iteration = null, budgetMs = null, elapsedMs = null, verdict = '' } = {}) {
  const parts = [`component=${component || 'unknown'}`, `hook=${hook || 'unknown'}`, `phase=${phase || 'unknown'}`];
  if (Number.isFinite(Number(iteration))) parts.push(`iteration=${Math.floor(Number(iteration))}`);
  if (Number.isFinite(Number(budgetMs))) parts.push(`budgetMs=${Math.floor(Number(budgetMs))}`);
  if (Number.isFinite(Number(elapsedMs))) parts.push(`elapsedMs=${Math.floor(Number(elapsedMs))}`);
  if (verdict) parts.push(`verdict=${verdict}`);
  return parts.join(' ');
}
