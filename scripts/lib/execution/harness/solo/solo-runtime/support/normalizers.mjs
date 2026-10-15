import {
  SOLO_OUTCOMES,
  SOLO_STAGES,
} from './constants.mjs';
// work-7：outcome → 后果 的映射只有一个 owner（turn-consequences.mjs）。
// 本文件不再自己推，只接受声明 + 查表。
import {
  deriveBackoffAction,
  deriveCheckpointStatus,
  deriveFailureClass,
  isMaterialTurn,
  normalizeSelfReport,
  stopsByDefault,
} from './turn-consequences.mjs';

// 纯函数：统一 solo harness 文本归一化，并保留兜底值。
// 注意：`export ... from` 不创建本地绑定，必须先 import 才能在本文件内调用。
import { normalizeText } from '../../../../../../../src/shared/normalize.mjs';
export { normalizeText };

// 纯函数：规整字符串数组，供 evidence/keyChanges 等字段复用。
export function normalizeStringArray(value) {
  const raw = Array.isArray(value) ? value : [];
  return Array.from(new Set(raw.map((item) => String(item ?? '').trim()).filter(Boolean)));
}

function normalizeStage(value) {
  const normalized = normalizeText(value).toLowerCase();
  return SOLO_STAGES.has(normalized) ? normalized : 'development';
}

function deriveEvidence(input = {}) {
  const explicit = normalizeStringArray(input.evidence);
  if (explicit.length > 0) return explicit;

  const keyChanges = normalizeStringArray(input.keyChanges).map((item) => `changed: ${item}`);
  if (keyChanges.length > 0) return keyChanges;

  const nextAction = normalizeText(input.nextAction);
  if (nextAction) return [`next: ${nextAction}`];

  const summary = normalizeText(input.summary);
  if (summary) return [`summary: ${summary}`];

  return [`outcome: ${normalizeText(input.outcome, 'unknown')}`];
}


export function normalizeSoloIterationOutcome(input = {}) {
  const sessionId = normalizeText(input.sessionId);
  if (!sessionId) {
    throw new Error('solo iteration outcome requires sessionId');
  }

  const iteration = Number.isFinite(input.iteration) ? Math.max(1, Math.floor(input.iteration)) : 1;
  const outcome = SOLO_OUTCOMES.has(normalizeText(input.outcome))
    ? normalizeText(input.outcome)
    : 'failed';
  const failureClass = deriveFailureClass({
    failureClass: input.failureClass,
    outcome,
  });
  // S 通道：自报是声明字段，未声明就是缺席（不从 summary 文本猜进展）。
  const selfReport = normalizeSelfReport(input.selfReport);
  const material = isMaterialTurn({ outcome, selfReport });
  const shouldStopDefault = stopsByDefault(outcome);
  const shouldStop = input.shouldStop === true || shouldStopDefault;

  return {
    schemaVersion: 1,
    kind: 'solo-harness.iteration',
    sessionId,
    iteration,
    outcome,
    taskId: normalizeText(input.taskId),
    summary: normalizeText(input.summary, 'No summary recorded.'),
    stage: normalizeStage(input.stage),
    evidence: deriveEvidence(input),
    keyChanges: normalizeStringArray(input.keyChanges),
    keyLearnings: normalizeStringArray(input.keyLearnings),
    nextAction: normalizeText(input.nextAction),
    shouldStop,
    failureClass,
    selfReport,
    // D3：材料性需 S 通道确认；loop 的额度/节奏读这个字段而不是比 outcome 字符串。
    material,
    backoffAction: normalizeText(input.backoffAction, deriveBackoffAction({ outcome, failureClass })),
    checkpointStatus: normalizeText(input.checkpointStatus, deriveCheckpointStatus({ outcome, shouldStop })),
    createdAt: normalizeText(input.createdAt, new Date().toISOString()),
  };
}

export function classifySoloFailure(value = {}) {
  const detail = typeof value === 'string'
    ? value
    : value instanceof Error
      ? `${value.name}: ${value.message}`
      : normalizeText(value?.message || value?.summary || value?.stderr || value?.stdout);
  const normalized = detail.toLowerCase();

  if (normalized.includes('ownedpath')
    || normalized.includes('ownership-gate')
    || normalized.includes('ownership gate')
    || normalized.includes('ownership preflight failed')) return 'ownership-gate';
  if (normalized.includes('safety') || normalized.includes('human gate')) return 'safety-gate';
  // 限流/过载从 runtime-error 中拆出：它们有专属的退避节奏（更长的窗口），不是普通基础设施抖动。
  if (normalized.includes('rate limit') || normalized.includes('429') || normalized.includes('too many requests')) return 'rate-limited';
  if (normalized.includes('overloaded') || normalized.includes('503') || normalized.includes('capacity')) return 'provider-overloaded';
  if (normalized.includes('host_unsupported') || normalized.includes('host unsupported') || normalized.includes('unsupported host')) return 'host-unsupported';
  if (normalized.includes('budget_exhausted') || normalized.includes('quota exhausted') || normalized.includes('budget exhausted')) return 'budget-exhausted';
  if (normalized.includes('timeout') || normalized.includes('econnreset')) return 'runtime-error';
  if (normalized.includes('tool')) return 'tool-error';
  if (normalized.includes('workspace') || normalized.includes('git')) return 'workspace-mutation';
  return 'runtime-error';
}

export function summarizeIterationForContinuity(outcome = {}) {
  const normalized = normalizeSoloIterationOutcome({
    sessionId: normalizeText(outcome.sessionId, 'continuity-session'),
    iteration: Number.isFinite(outcome.iteration) ? outcome.iteration : 1,
    ...outcome,
  });
  return {
    summary: normalized.summary,
    touchedFiles: normalized.keyChanges,
    nextActions: normalizeStringArray([normalized.nextAction]),
  };
}
