import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  DEFAULT_STALL_ABORT_THRESHOLD,
  HOOK_WAIT_BUDGETS_MS,
  classifyWait,
  countsAsRunFailure,
  countsAsStall,
  describeStall,
  hookWaitBudgetMs,
  shouldAbortForConsecutiveStalls,
} from '../../../../lib/execution/harness/solo/solo-runtime/support/stall.mjs';
import { invokeLifecycleHook } from '../../../../lib/execution/harness/solo/solo-runtime/support/hooks.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('verdicts come from declared signals, never from error text', () => {
  assert.equal(classifyWait({}), 'ok');
  assert.equal(classifyWait({ errored: true }), 'failed');
  assert.equal(classifyWait({ timedOut: true }), 'timed-out');
  assert.equal(classifyWait({ aborted: true }), 'cancelled');
  // 优先级：操作者取消 > 超时 > 抛错。一个被取消的等待不能被记成失败。
  assert.equal(classifyWait({ aborted: true, timedOut: true, errored: true }), 'cancelled');
  assert.equal(classifyWait({ timedOut: true, errored: true }), 'timed-out');
});

test('a cancelled or stalled wait is not a run failure, and only stalls feed the stall counter', () => {
  for (const verdict of ['ok', 'cancelled', 'timed-out']) {
    assert.equal(countsAsRunFailure(verdict), false, `${verdict} must not pollute consecutiveFailures`);
  }
  assert.equal(countsAsRunFailure('failed'), true);
  assert.equal(countsAsStall('timed-out'), true);
  assert.equal(countsAsStall('cancelled'), false, 'an operator stop is not a stall');
  assert.equal(countsAsStall('failed'), false);
});

test('budgets are a declared table, overridable, and never guessed from the hook name', () => {
  assert.equal(hookWaitBudgetMs({ phase: 'turn-complete', env: {} }), HOOK_WAIT_BUDGETS_MS['turn-complete']);
  assert.equal(hookWaitBudgetMs({ phase: 'session-end', env: {} }), HOOK_WAIT_BUDGETS_MS['session-end']);
  assert.equal(hookWaitBudgetMs({ phase: 'no-such-phase', env: {} }), HOOK_WAIT_BUDGETS_MS.default);
  assert.equal(hookWaitBudgetMs({ phase: 'turn-start', env: { AIOS_SOLO_HOOK_TIMEOUT_MS: '25' } }), 25);
  assert.equal(hookWaitBudgetMs({ phase: 'turn-start', env: { AIOS_SOLO_HOOK_TIMEOUT_MS: 'off' } }), 0);
  assert.equal(hookWaitBudgetMs({ phase: 'turn-start', env: { AIOS_SOLO_HOOK_TIMEOUT_MS: 'garbage' } }),
    HOOK_WAIT_BUDGETS_MS['turn-start'], 'an unparsable override falls back to the declared budget, not to 0');
  assert.equal(hookWaitBudgetMs({ phase: 'turn-start', env: {}, overrideMs: 5 }), 5, 'explicit override wins');
});

test('stall attribution names component, hook, phase, iteration, budget and elapsed', () => {
  const line = describeStall({
    hook: 'onTurnComplete', phase: 'turn-complete', iteration: 7, budgetMs: 60_000, elapsedMs: 60_004, verdict: 'timed-out',
  });
  for (const needle of ['component=solo-runtime', 'hook=onTurnComplete', 'phase=turn-complete',
    'iteration=7', 'budgetMs=60000', 'elapsedMs=60004', 'verdict=timed-out']) {
    assert.ok(line.includes(needle), `missing ${needle} in: ${line}`);
  }
  assert.match(line, /component=\S+ hook=\S+ phase=\S+/, 'attribution has to lead with the identity fields');
});

test('stall abort has its own threshold so a stalled hook cannot loop forever', () => {
  assert.equal(shouldAbortForConsecutiveStalls({ consecutiveStalls: DEFAULT_STALL_ABORT_THRESHOLD - 1 }), false);
  assert.equal(shouldAbortForConsecutiveStalls({ consecutiveStalls: DEFAULT_STALL_ABORT_THRESHOLD }), true);
  assert.equal(shouldAbortForConsecutiveStalls({ consecutiveStalls: 2, threshold: 2 }), true);
  // 坏阈值退回默认，不退回 0（0 会立刻中止，把偶发一次停滞当成不可恢复）。
  assert.equal(shouldAbortForConsecutiveStalls({ consecutiveStalls: 1, threshold: 'nope' }), false);
});

test('RED: a hanging hook is bounded, attributed as timed-out, and does not hang the loop', async () => {
  const events = [];
  const result = await invokeLifecycleHook({
    rootDir: null,
    sessionId: 's-stall',
    hook: 'onTurnComplete',
    phase: 'turn-complete',
    iteration: 3,
    env: { AIOS_SOLO_HOOK_TIMEOUT_MS: '40' },
    appendEvent: async (event) => { events.push(event); },
    callback: () => new Promise(() => {}), // 永不 settle —— 旧实现会在这里永久挂住
  });
  assert.equal(result.verdict, 'timed-out');
  assert.equal(result.ok, false);
  assert.equal(result.stall.includes('verdict=timed-out'), true);
  assert.match(result.stall, /hook=onTurnComplete/);
  assert.match(result.stall, /budgetMs=40/);
  assert.ok(result.elapsedMs >= 30, `the wait must actually have been held, elapsed=${result.elapsedMs}`);
  assert.equal(result.result, undefined, 'a timed-out hook must not smuggle a late result into the loop');

  const startEvent = events.map((entry) => entry.event).find((event) => event.status === 'start');
  const endEvent = events.map((entry) => entry.event).find((event) => event.status === 'timed-out');
  assert.ok(startEvent, 'the attempt still gets recorded');
  assert.equal(endEvent.hook, 'onTurnComplete');
  assert.equal(endEvent.budgetMs, 40);
  assert.ok(Number.isFinite(endEvent.elapsedMs));
});

test('RED: a late-settling hook cannot rewrite a verdict that was already recorded', async () => {
  let resolveLate = null;
  const result = await invokeLifecycleHook({
    rootDir: null,
    sessionId: 's-late',
    hook: 'onSessionEnd',
    phase: 'session-end',
    iteration: 9,
    env: { AIOS_SOLO_HOOK_TIMEOUT_MS: '25' },
    appendEvent: async () => {},
    callback: () => new Promise((resolve) => { resolveLate = resolve; }),
  });
  assert.equal(result.verdict, 'timed-out');
  resolveLate('late value');
  await sleep(25);
  assert.equal(result.verdict, 'timed-out', 'the recorded verdict is final once the budget expired');
  assert.equal(result.result, undefined, 'the late value must not be adopted after the fact');
});

test('RED: the callback receives an abort signal so well-behaved work can stop (propagation)', async () => {
  let seen = null;
  const result = await invokeLifecycleHook({
    rootDir: null,
    sessionId: 's-signal',
    hook: 'onTurnComplete',
    phase: 'turn-complete',
    iteration: 1,
    env: { AIOS_SOLO_HOOK_TIMEOUT_MS: '25' },
    appendEvent: async () => {},
    callback: (payload, context = {}) => {
      seen = context;
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve('finished anyway'), 5_000);
        context?.signal?.addEventListener?.('abort', () => { clearTimeout(timer); resolve('stopped early'); });
      });
    },
  });
  assert.equal(result.verdict, 'timed-out');
  assert.equal(seen.signal.aborted, true, 'the guard must abort the signal it handed the callback');
  assert.equal(seen.hook, 'onTurnComplete');
  assert.equal(seen.budgetMs, 25);

  // 边界必须说清楚：JS 杀不掉无视 signal 的回调，本守卫保证的是"循环不再等它"。
  await sleep(40);
  assert.equal(result.result, undefined, 'even a callback that finishes later is not adopted');
});

test('a cancelled wait is reported as cancelled, not failed, and never counts as a stall', async () => {
  const controller = new AbortController();
  let abortOuter = null;
  const result = await invokeLifecycleHook({
    rootDir: null,
    sessionId: 's-cancel',
    hook: 'onTurnComplete',
    phase: 'turn-complete',
    iteration: 4,
    signal: controller.signal,
    env: { AIOS_SOLO_HOOK_TIMEOUT_MS: '5000' },
    appendEvent: async () => {},
    // 回调自己也在等一个“被取消”的信号；30ms 后由外层触发操作者停止。
    callback: (payload, context = {}) => new Promise((resolve, reject) => {
      abortOuter = () => reject(new Error('AbortError: aborted by operator'));
      context?.signal?.addEventListener?.('abort', abortOuter);
      setTimeout(() => controller.abort(), 30);
    }),
  });
  assert.equal(result.verdict, 'cancelled', 'a text-based classifier would have called this a failure');
  assert.equal(result.ok, false);
  assert.equal(countsAsRunFailure(result.verdict), false);
  assert.equal(countsAsStall(result.verdict), false);
  assert.match(result.stall, /verdict=cancelled/);
  assert.ok(result.elapsedMs < 2000, `the loop must return on cancel, not after the 5s budget: ${result.elapsedMs}ms`);
});

test('a failing hook is still reported as failed and keeps the error path intact', async () => {
  const result = await invokeLifecycleHook({
    rootDir: null,
    sessionId: 's-fail',
    hook: 'onTurnComplete',
    phase: 'turn-complete',
    iteration: 2,
    env: {},
    appendEvent: async () => {},
    callback: () => { throw new Error('boom'); },
  });
  assert.equal(result.verdict, 'failed');
  assert.equal(result.ok, false);
  assert.equal(countsAsRunFailure(result.verdict), true);
  assert.match(result.logEntry.detail, /boom/);
});

test('the real journal writer keeps the attribution instead of dropping it via its field whitelist', async () => {
  // 这条必须走真实写盘器：上面的用例注入 appendEvent，因此看不见
  // solo-journal/plumbing/hooks.mjs 的白名单把新字段无声剔掉这种损失。
  const { getSoloHarnessPaths } = await import(
    '../../../../lib/execution/harness/solo/solo-journal/plumbing/paths.mjs');
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-hook-stall-'));
  try {
    const result = await invokeLifecycleHook({
      rootDir,
      sessionId: 'persisted-stall',
      hook: 'onTurnComplete',
      phase: 'turn-complete',
      iteration: 6,
      env: { AIOS_SOLO_HOOK_TIMEOUT_MS: '30' },
      callback: () => new Promise(() => {}),
    });
    assert.equal(result.verdict, 'timed-out');

    const eventsPath = getSoloHarnessPaths({ rootDir, sessionId: 'persisted-stall' }).hookEventsPath;
    const lines = fs.readFileSync(eventsPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const stalled = lines.find((line) => line.verdict === 'timed-out');
    assert.ok(stalled, `persisted events lost the verdict: ${JSON.stringify(lines)}`);
    assert.equal(stalled.hook, 'onTurnComplete');
    assert.equal(stalled.phase, 'turn-complete');
    assert.equal(stalled.iteration, 6);
    assert.equal(stalled.budgetMs, 30);
    assert.ok(Number.isFinite(stalled.elapsedMs) && stalled.elapsedMs >= 20);
    assert.equal(stalled.status, 'timed-out');
    assert.match(stalled.detail, /component=solo-runtime/);
    // 旧阅读者依赖的 status 取值不能因为这次改动而丢: start 仍在。
    assert.ok(lines.some((line) => line.status === 'start'));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('a fast hook still returns ok with attribution and no timer leak', async () => {
  const events = [];
  const result = await invokeLifecycleHook({
    rootDir: null,
    sessionId: 's-ok',
    hook: 'onTurnStart',
    phase: 'turn-start',
    iteration: 1,
    env: {},
    appendEvent: async (event) => { events.push(event); },
    callback: () => 'done',
  });
  assert.equal(result.verdict, 'ok');
  assert.equal(result.ok, true);
  assert.equal(result.result, 'done');
  assert.match(result.stall, /verdict=ok/);
  assert.equal(events.map((entry) => entry.event).filter((event) => event.status === 'ok').length, 1);
});

test('resolveAbortRecord: no counter may invent a reason the agent did not report', async () => {
  const { resolveAbortRecord } = await import(
    '../../../../lib/execution/harness/solo/solo-runtime/loop/abort-records.mjs');
  const tracker = { abortRecord: () => null };
  assert.equal(resolveAbortRecord({ hookWaits: tracker, backoff: { consecutiveFailures: 1 }, reportedFailureClass: 'tool-error' }), null,
    'below the threshold there is no abort at all');

  const aborted = resolveAbortRecord({
    hookWaits: tracker,
    backoff: { consecutiveFailures: 5 },
    reportedFailureClass: 'safety-gate',
  });
  assert.equal(aborted.failureClass, 'safety-gate', 'the reported class survives the abort');
  assert.ok(aborted.evidence.includes('lastReportedFailureClass=safety-gate'), 'and it is visible in the evidence');

  const silent = resolveAbortRecord({ hookWaits: tracker, backoff: { consecutiveFailures: 9 } });
  assert.equal(silent.failureClass, 'none', 'an absent self-report stays absent instead of being filled in');

  const stallWins = { abortRecord: () => ({ summary: 'stall', evidence: ['consecutiveHookStalls=3'], nextAction: 'x', failureClass: 'runtime-error' }) };
  const chosen = resolveAbortRecord({ hookWaits: stallWins, backoff: { consecutiveFailures: 9 }, reportedFailureClass: 'tool-error' });
  assert.equal(chosen.summary, 'stall', 'a stalled hook is the more specific fact about why we stopped');
});

test('an absent callback stays a no-op exactly as before', async () => {
  const result = await invokeLifecycleHook({
    rootDir: null, sessionId: 's-none', hook: 'onTurnComplete', phase: 'turn-complete', iteration: 1,
    appendEvent: async () => { throw new Error('must not be reached'); },
  });
  assert.equal(result, null);
});
