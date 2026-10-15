/**
 * Solo turn 后果的唯一 owner（work-7 · interaction contract 决策编译器，父侧范围）。
 *
 * 背景（2026-10-15 实测，见 docs/plans/2026-10-14-submodule-boundary-and-loop-closure.md §work-7 F3）：
 * 同一个 `outcome → 后果` 语义映射被手写复制在 ≥6 处——normalizers.mjs 的三个 infer*、
 * backoff.mjs、cadence.mjs、checkpoint.mjs、should-run.mjs——没有任何守卫证明它们彼此一致。
 * work-6 把**状态**收敛成单一写者，本模块把**决策**收敛成单一 owner：
 * 新增一个 outcome 时只允许在这里登记一次，其余各处一律改为读取。
 *
 * 声明通道（三通道，本模块只消费，不从散文猜）：
 * - F 事实：journal/账本已记录的轮次与额度（work-6 的单一写者账本）；
 * - S 自报：provider 的 `selfReport` 类型化声明（progressMade / blockedReason / summary）；
 * - O 操作者：显式声明（resume ack / gate 决定），见 should-run.mjs 的策略分支。
 *
 * 已签决策（operator「按默认」2026-10-15）：
 * - D1 保留 rex `TURN_OUTCOMES` 与 `SOLO_OUTCOMES` 两套词表，映射所有权在这里；
 *   rex↔solo 的跨词表映射**暂不建立**（无 call site 即死代码，ADR 0002），留待 D2 的接线项。
 * - D3 材料性（material）由 S 通道确认：provider 只给 `outcome` 字符串而无 `progressMade` 声明时，
 *   不得产生 material 副作用（不扣额度、不进 active_work 节奏）。
 */
import {
  SOLO_BACKOFF_ACTIONS,
  SOLO_CADENCE_CLASSES,
  SOLO_CHECKPOINT_STATUSES,
  SOLO_FAILURE_CLASSES,
  SOLO_OUTCOMES,
  SOLO_RUN_STATUSES,
} from './constants.mjs';
import { normalizeText } from '../../../../../../../src/shared/normalize.mjs';

/** checkpoint / contextdb 侧的验证结果词表（原来散落在 checkpoint.mjs 的字符串映射里）。 */
export const SOLO_VERIFICATION_RESULTS = Object.freeze(['passed', 'failed', 'partial', 'unknown']);

/**
 * 这两个失败类无论 outcome 是什么都要挂起等操作者（所有权门 / 安全门）。
 * 以前是 state.mjs 自带的字符串判，归入本表后失败类语义也只有一个 owner。
 */
export const SOLO_OPERATOR_GATE_FAILURE_CLASSES = Object.freeze(['ownership-gate', 'safety-gate']);

/** 只有 infra-retry 且失败类属于可重试集合时才退避重试；其余类不允许盲目烧钱。 */
export const SOLO_RETRYABLE_FAILURE_CLASSES = Object.freeze([
  'runtime-error',
  'tool-error',
  'rate-limited',
  'provider-overloaded',
]);

/**
 * 每个 outcome 的全部后果。字段语义（保持迁移前的既有行为，逐条对应原六处手写分支）：
 * - `material`：本身有资格推进工作流/扣额度（D3：仍须 S 通道声明 progressMade）；
 * - `failureClassDefault`：provider 未声明失败类时的默认归类；
 * - `backoffAction`：退避动作；infra-retry 依赖失败类是否在可重试集合内，故为函数；
 * - `checkpointStatus`：`shouldStop` 决定 done/running，其余为固定值；
 * - `verificationResult`：写进 checkpoint 的验证语义；
 * - `resetsBackoff`：是否重置连续失败计数；
 * - `cadenceClass`：节奏归类（active_work / monitor_wait / human_gate）；
 * - `stopByDefault`：默认停机；
 * - `requiresOperator`：必须等操作者显式放行（should-run 的 ask 分支）；
 * - `countsAsNoopPoll`：计入 unchanged-poll 停机建议的连续计数。
 */
export const TURN_CONSEQUENCES = Object.freeze({
  success: Object.freeze({
    material: true,
    failureClassDefault: 'none',
    backoffAction: () => 'none',
    checkpointStatus: ({ shouldStop }) => (shouldStop ? 'done' : 'running'),
    verificationResult: 'passed',
    runStatus: ({ shouldStop }) => (shouldStop ? 'done' : 'running'),
    resetsBackoff: true,
    cadenceClass: 'active_work',
    stopByDefault: false,
    requiresOperator: false,
    countsAsNoopPoll: false,
    runTerminatesSuccessfully: true,
  }),
  noop: Object.freeze({
    material: false,
    failureClassDefault: 'none',
    backoffAction: () => 'none',
    checkpointStatus: ({ shouldStop }) => (shouldStop ? 'done' : 'running'),
    verificationResult: 'passed',
    runStatus: ({ shouldStop }) => (shouldStop ? 'done' : 'running'),
    resetsBackoff: true,
    // 迁移前 noop 走 monitor_wait（逐步放宽），保持不动：noop 不是进展。
    cadenceClass: 'monitor_wait',
    stopByDefault: false,
    requiresOperator: false,
    countsAsNoopPoll: true,
  }),
  blocked: Object.freeze({
    material: false,
    failureClassDefault: 'no-progress',
    backoffAction: () => 'shrink-scope',
    checkpointStatus: () => 'blocked',
    verificationResult: 'partial',
    runStatus: ({ shouldStop }) => (shouldStop ? 'blocked' : 'running'),
    resetsBackoff: false,
    cadenceClass: 'monitor_wait',
    stopByDefault: false,
    requiresOperator: false,
    countsAsNoopPoll: false,
  }),
  'infra-retry': Object.freeze({
    material: false,
    failureClassDefault: 'runtime-error',
    backoffAction: ({ failureClass }) => (SOLO_RETRYABLE_FAILURE_CLASSES.includes(failureClass)
      ? 'retry-with-backoff'
      : 'none'),
    checkpointStatus: () => 'blocked',
    verificationResult: 'failed',
    runStatus: () => 'backoff',
    // 保持迁移前的分支优先级：infra-retry 的退避状态先于失败类门判（原 state.mjs 次序）。
    runStatusOverridesFailureGate: true,
    resetsBackoff: false,
    cadenceClass: 'monitor_wait',
    stopByDefault: false,
    requiresOperator: false,
    countsAsNoopPoll: false,
  }),
  'human-gate': Object.freeze({
    material: false,
    failureClassDefault: 'safety-gate',
    backoffAction: () => 'human-gate',
    checkpointStatus: () => 'blocked',
    verificationResult: 'partial',
    runStatus: () => 'human-gate',
    resetsBackoff: false,
    cadenceClass: 'human_gate',
    stopByDefault: true,
    requiresOperator: true,
    countsAsNoopPoll: false,
  }),
  stopped: Object.freeze({
    material: false,
    failureClassDefault: 'stop-requested',
    backoffAction: () => 'none',
    checkpointStatus: () => 'done',
    verificationResult: 'partial',
    runStatus: () => 'stopped',
    resetsBackoff: false,
    cadenceClass: 'monitor_wait',
    stopByDefault: true,
    requiresOperator: false,
    countsAsNoopPoll: false,
  }),
  failed: Object.freeze({
    material: false,
    failureClassDefault: 'runtime-error',
    backoffAction: () => 'none',
    checkpointStatus: () => 'blocked',
    verificationResult: 'failed',
    runStatus: () => 'failed',
    resetsBackoff: false,
    cadenceClass: 'monitor_wait',
    stopByDefault: true,
    requiresOperator: false,
    countsAsNoopPoll: false,
  }),
});

const ROW_FIELD_CHECKS = Object.freeze([
  ['failureClassDefault', (value) => SOLO_FAILURE_CLASSES.has(value)],
  ['verificationResult', (value) => SOLO_VERIFICATION_RESULTS.includes(value)],
  ['cadenceClass', (value) => SOLO_CADENCE_CLASSES.has(value)],
]);

/** 检查一行的每个固定值是否落在对应词表里（函数型字段跑一个样本调用）。 */
function describeRowGaps(name) {
  const row = TURN_CONSEQUENCES[name];
  const gaps = [];
  for (const [field, isKnown] of ROW_FIELD_CHECKS) {
    if (!isKnown(row[field])) {
      gaps.push(`"${name}".${field} = "${row[field]}" is not in its vocabulary`);
    }
  }
  for (const [field, samples] of [
    ['checkpointStatus', [{ shouldStop: false }, { shouldStop: true }]],
    ['runStatus', [{ shouldStop: false }, { shouldStop: true }]],
    ['backoffAction', [{ failureClass: 'runtime-error' }, { failureClass: 'host-unsupported' }]],
  ]) {
    for (const sample of samples) {
      const value = row[field](sample);
      const known = field === 'checkpointStatus'
        ? SOLO_CHECKPOINT_STATUSES.has(value)
        : field === 'runStatus'
          ? SOLO_RUN_STATUSES.has(value)
          : SOLO_BACKOFF_ACTIONS.has(value);
      if (!known) gaps.push(`"${name}".${field} produced "${value}" which is outside its vocabulary`);
    }
  }
  return gaps;
}

/** 严格查表：只接受已在 `SOLO_OUTCOMES` 登记的 outcome。
 * 未登记名字直接抛错——决策表的存在意义就是"新 outcome 必须在这里登记一次"，
 * 静默兜底会把漂移藏回原处。
 */
export function turnConsequencesFor(outcome) {
  const normalized = normalizeText(outcome);
  if (!SOLO_OUTCOMES.has(normalized)) {
    throw new TypeError(`unknown solo outcome "${normalized}": register it in TURN_CONSEQUENCES first`);
  }
  const consequences = TURN_CONSEQUENCES[normalized];
  if (!consequences) {
    throw new TypeError(`outcome "${normalized}" has no TURN_CONSEQUENCES row`);
  }
  return consequences;
}

/** provider 声明的失败类优先；缺失或非法时按表归类。 */
export function deriveFailureClass({ outcome, failureClass = '' } = {}) {
  const declared = normalizeText(failureClass);
  if (SOLO_FAILURE_CLASSES.has(declared)) return declared;
  return turnConsequencesFor(outcome).failureClassDefault;
}

export function deriveBackoffAction({ outcome, failureClass = '' } = {}) {
  const normalizedFailure = normalizeText(failureClass);
  return turnConsequencesFor(outcome).backoffAction({ failureClass: normalizedFailure });
}

export function deriveCheckpointStatus({ outcome, shouldStop = false } = {}) {
  return turnConsequencesFor(outcome).checkpointStatus({ shouldStop: shouldStop === true });
}

export function deriveVerificationResult(outcome) {
  return turnConsequencesFor(outcome).verificationResult;
}

export function derivesBackoffReset({ outcome, material = false } = {}) {
  const consequences = turnConsequencesFor(outcome);
  if (consequences.resetsBackoff !== true) return false;
  // D3：带 material 资格的那一行（success）必须被 S 通道确认才能重置失败计数；
  // noop 本身就是“未声称进展”，照常重置。
  return consequences.material === true ? material === true : true;
}

/**
 * 节奏归类：scheduler hint 是**输出**，不再从 outcome 字符串推。
 * active_work 只有在 material 被声明时才绐得到；裸 `outcome: 'success'` 进 monitor_wait（逐步放宽）。
 */
export function deriveCadenceClass({ outcome, material = false } = {}) {
  const consequences = turnConsequencesFor(outcome);
  if (consequences.requiresOperator === true) return 'human_gate';
  if (consequences.cadenceClass === 'active_work') {
    return material === true ? 'active_work' : 'monitor_wait';
  }
  return consequences.cadenceClass;
}

export function requiresOperatorRelease(outcome) {
  const normalized = normalizeText(outcome);
  // 宽容入口（策略层会拿到未归一的历史值）：未登记 = 不声称需要操作者，保守返回 false。
  if (!SOLO_OUTCOMES.has(normalized)) return false;
  return TURN_CONSEQUENCES[normalized].requiresOperator === true;
}

export function countsAsNoopPoll(outcome) {
  const normalized = normalizeText(outcome);
  // 同上：未登记字符串不去抬高 noop 计数（宁可不推停机）。
  if (!SOLO_OUTCOMES.has(normalized)) return false;
  return TURN_CONSEQUENCES[normalized].countsAsNoopPoll === true;
}

export function stopsByDefault(outcome) {
  return turnConsequencesFor(outcome).stopByDefault === true;
}

/** 运行收尾的 exit 语义投影（不是 material 判定，仅“这个 outcome 算不算成功收尾”）。 */
export function terminatesSuccessfully(outcome) {
  const normalized = normalizeText(outcome);
  if (!SOLO_OUTCOMES.has(normalized)) return false;
  return TURN_CONSEQUENCES[normalized].runTerminatesSuccessfully === true;
}

/**
 * 表与词表的一致性缺口。返回缺口描述数组，空数组 = 表与 `outcomeNames` 一一对应。
 * 这是“新 outcome 必须登记一次”的可执行形式：测试直接拿合成集合驱动它。
 */
export function findTurnTableGaps(outcomeNames = [...SOLO_OUTCOMES]) {
  const declared = new Set(outcomeNames);
  const gaps = [];
  for (const name of declared) {
    if (!Object.prototype.hasOwnProperty.call(TURN_CONSEQUENCES, name)) {
      gaps.push(`outcome "${name}" has no TURN_CONSEQUENCES row`);
      continue;
    }
    gaps.push(...describeRowGaps(name));
  }
  for (const name of Object.keys(TURN_CONSEQUENCES)) {
    if (!declared.has(name)) gaps.push(`TURN_CONSEQUENCES row "${name}" is not in SOLO_OUTCOMES`);
  }
  return gaps;
}

/**
 * run summary 的状态词表投影（work-7 前是 state.mjs 里八个字符串分支）。
 * 未登记的 outcome 不猜：没声明就是在跑。
 */
export function deriveRunStatus({ outcome, failureClass = '', shouldStop = false } = {}) {
  const normalizedOutcome = normalizeText(outcome);
  const normalizedFailureClass = normalizeText(failureClass);
  if (!SOLO_OUTCOMES.has(normalizedOutcome)) {
    return shouldStop === true ? 'done' : 'running';
  }
  const consequences = TURN_CONSEQUENCES[normalizedOutcome];
  if (consequences.runStatusOverridesFailureGate === true) {
    return consequences.runStatus({ shouldStop: shouldStop === true });
  }
  if (SOLO_OPERATOR_GATE_FAILURE_CLASSES.includes(normalizedFailureClass)
    || consequences.requiresOperator === true) {
    return 'human-gate';
  }
  return consequences.runStatus({ shouldStop: shouldStop === true });
}

/**
 * S 通道 intake：自报是**声明字段**，不是文本猜测（提示词规范 #2）。
 * 未声明 = 通道缺席，返回空声明而不是编造默认值。
 */
export function normalizeSelfReport(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return Object.freeze({ declared: false, progressMade: false, blockedReason: '', summary: '' });
  }
  return Object.freeze({
    declared: true,
    progressMade: value.progressMade === true,
    blockedReason: normalizeText(value.blockedReason),
    summary: normalizeText(value.summary),
  });
}

/**
 * D3 规则：材料性必须由 S 通道确认。
 * `outcome: 'success'` 而无 `selfReport.progressMade` 声明 → 没有 material 资格。
 * （2026-10-15 实测：现网 provider 本来就不发 success，`rg "outcome: 'success'" ` 在
 *  solo 循环路径为空，所以此规则不剥夺任何既有真实声明，只堵住"裸字符串声称进展"。）
 */
export function isMaterialTurn({ outcome, selfReport = null } = {}) {
  const consequences = turnConsequencesFor(outcome);
  const report = selfReport && typeof selfReport === 'object' ? selfReport : normalizeSelfReport(null);
  return consequences.material === true && report.progressMade === true;
}
