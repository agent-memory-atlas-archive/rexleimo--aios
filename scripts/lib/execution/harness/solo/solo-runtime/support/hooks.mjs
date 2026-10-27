import { appendSoloHookEvent } from '../../solo-journal.mjs';
import { normalizeText } from './normalizers.mjs';
import {
  STALL_COMPONENT,
  classifyWait,
  describeStall,
  hookWaitBudgetMs,
} from './stall.mjs';

function buildHookDetail(value = '') {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  return normalized.length > 280 ? `${normalized.slice(0, 280).trimEnd()}...` : normalized;
}

function buildHookLogEntry({ hook = '', phase = '', iteration = 0, status = 'ok', detail = '', verdict = '', budgetMs = null, elapsedMs = null } = {}) {
  return {
    ts: new Date().toISOString(),
    kind: 'hook',
    component: STALL_COMPONENT,
    hook: normalizeText(hook),
    phase: normalizeText(phase),
    iteration: Number.isFinite(iteration) ? Math.max(0, Math.floor(iteration)) : 0,
    status: normalizeText(status, 'ok'),
    // 中文注释：verdict 与旧 status 共存——status 保持既有取值，新增语义一律进 verdict，
    // 这样已有的阅读者不会因为一个词改名而静默失去信息。
    verdict: normalizeText(verdict, status),
    budgetMs: Number.isFinite(Number(budgetMs)) ? Math.floor(Number(budgetMs)) : null,
    elapsedMs: Number.isFinite(Number(elapsedMs)) ? Math.floor(Number(elapsedMs)) : null,
    detail: buildHookDetail(detail),
  };
}

export async function invokeLifecycleHook({
  rootDir,
  sessionId,
  hook = '',
  phase = '',
  iteration = 0,
  callback = null,
  payload = {},
  env = process.env,
  signal = null,
  budgetMs = null,
  appendEvent = appendSoloHookEvent,
} = {}) {
  if (typeof callback !== 'function') {
    return null;
  }

  const baseEvent = {
    kind: 'lifecycle-hook',
    component: STALL_COMPONENT,
    hook,
    phase,
    iteration,
  };

  try {
    await appendEvent({
      rootDir,
      sessionId,
      event: {
        ...baseEvent,
        status: 'start',
      },
    });
  } catch {
    // Best-effort audit trail only.
  }

  const budget = hookWaitBudgetMs({ phase, hook, env, overrideMs: budgetMs });
  const controller = new AbortController();
  const startedAt = Date.now();
  let settled = false;
  let value;
  let error;
  let timedOut = false;
  let cancelled = false;
  let rejected = false;
  let release;
  const done = new Promise((resolvePromise) => { release = resolvePromise; });

  const settle = (kind) => {
    if (settled) return false;
    settled = true;
    if (kind === 'timed-out') timedOut = true;
    if (kind === 'cancelled') cancelled = true;
    if (timer !== null) clearTimeout(timer);
    outerOff();
    controller.abort(new Error(`solo hook wait ended: ${kind}`));
    release();
    return true;
  };

  let timer = budget > 0 ? setTimeout(() => settle('timed-out'), budget) : null;
  const onOuterAbort = () => { settle('cancelled'); };
  const outerOff = () => {
    if (typeof signal?.removeEventListener === 'function') signal.removeEventListener('abort', onOuterAbort);
  };

  if (signal?.aborted === true) {
    // 进入前已被取消：不再给回调开工会，直接如实记为 cancelled。
    settle('cancelled');
  } else if (typeof signal?.addEventListener === 'function') {
    signal.addEventListener('abort', onOuterAbort, { once: true });
  }

  const context = { signal: controller.signal, hook, phase, iteration, component: STALL_COMPONENT, budgetMs: budget };
  const attempt = Promise.resolve().then(() => callback(payload, context));
  // 中文注释：迟到的 settle 必须不能改写已记录的结论，也不能把值“追认”给循环。
  attempt.then(
    (result) => { if (settle('resolved')) value = result; },
    (caught) => { if (settle('rejected')) { rejected = true; error = caught; } },
  );

  await done;

  const elapsedMs = Date.now() - startedAt;
  const verdict = classifyWait({ aborted: cancelled, timedOut, errored: rejected });
  const stall = describeStall({
    component: STALL_COMPONENT,
    hook,
    phase,
    iteration,
    budgetMs: budget,
    elapsedMs,
    verdict,
  });
  const detail = verdict === 'failed'
    ? buildHookDetail(error instanceof Error ? error.message : String(error))
    : buildHookDetail(verdict === 'ok' ? (typeof value === 'string' ? value : value?.detail || value?.summary || '') : `${stall}`);

  const logEntry = buildHookLogEntry({
    hook,
    phase,
    iteration,
    status: verdict === 'failed' ? 'error' : verdict,
    verdict,
    budgetMs: budget,
    elapsedMs,
    detail: verdict === 'ok' ? detail : `${detail} | ${stall}`,
  });

  try {
    await appendEvent({
      rootDir,
      sessionId,
      event: {
        ...baseEvent,
        status: logEntry.status,
        verdict,
        budgetMs: budget,
        elapsedMs,
        detail: logEntry.detail,
      },
    });
  } catch {
    // Best-effort audit trail only.
  }

  if (verdict === 'ok') {
    return { ok: true, verdict, stall, elapsedMs, budgetMs: budget, logEntry, result: value };
  }
  return {
    ok: false,
    verdict,
    stall,
    elapsedMs,
    budgetMs: budget,
    logEntry,
    ...(verdict === 'failed' ? { error } : {}),
  };
}
