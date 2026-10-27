import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mkdtemp,
  readFile,
  rm,
  os,
  path,
  runSoloHarnessLoop,
  initSoloRunJournal,
  readSoloRunStatus,
  getSoloHarnessPaths,
} from '../infra/support.mjs';

/* 中文注释：loop 级证据。上一文件（hook-stall-guard.test.mjs）测的是等待策略本身；
 * 这里测的是"停滞在整条 run 里到底产生了什么可复核的后果"——
 * 因为 B4 的实际伤害不是等得久，而是**中止记录把真实原因洗成了一个猜出来的标签**。 */

async function prepareRun(rootDir, sessionId = 'stall-1') {
  await initSoloRunJournal({
    rootDir,
    sessionId,
    objective: 'Stall objective',
    provider: 'stub-host',
    clientId: 'codex-cli',
    profile: 'standard',
    worktree: { enabled: false, baseRef: 'HEAD', path: '', preserved: false, cleanupReason: '' },
  });
}

const BASE_LOOP = (rootDir, sessionId = 'stall-1') => ({
  rootDir,
  sessionId,
  objective: 'Stall objective',
  provider: 'stub-host',
  clientId: 'codex-cli',
  profile: 'standard',
  sleepImpl: async () => {},
});

test('repeated hook stalls trip their own abort gate and the record names the stalled hook', async () => {
  const previous = process.env.AIOS_SOLO_HOOK_TIMEOUT_MS;
  process.env.AIOS_SOLO_HOOK_TIMEOUT_MS = '25';
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-stall-loop-'));
  try {
    await prepareRun(rootDir);
    let turns = 0;
    const result = await runSoloHarnessLoop({
      ...BASE_LOOP(rootDir),
      pacing: null,
      maxIterations: 8,
      executeTurn: async () => {
        turns += 1;
        return { outcome: 'success', summary: `turn ${turns}`, shouldStop: false, failureClass: 'none', keyChanges: [], keyLearnings: [] };
      },
      lifecycleHooks: {
        // 每个 turn-complete 都卡死：这是"慢订阅者"的最坏形态。
        onTurnComplete: () => new Promise(() => {}),
      },
    });

    assert.equal(turns, 3, 'the loop must stop on the third stall, not on a failure count');
    assert.equal(result.summary.lastOutcome, 'failed');
    assert.equal(result.summary.lastFailureClass, 'runtime-error', 'a stall is a runtime fault, not an invented no-progress');

    // 归因必须落在可复核的产物里，而不是只活在内存里：
    // 中止证据要点名“是哪个钩子、预算多少、实际等了多久”。
    const evidence = (result.summary.latestEvidence || []).join(' | ');
    assert.match(evidence, /consecutiveHookStalls=3/);
    assert.match(evidence, /hook=onTurnComplete/);
    assert.match(evidence, /budgetMs=25/);
    assert.match(evidence, /verdict=timed-out/);

    const status = await readSoloRunStatus({ rootDir, sessionId: 'stall-1' });
    assert.equal(status.lastFailureClass, 'runtime-error');
    const eventsRaw = await readFile(getSoloHarnessPaths({ rootDir, sessionId: 'stall-1' }).hookEventsPath, 'utf8');
    const events = eventsRaw.trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const stalledEvents = events.filter((event) => event.status === 'timed-out');
    assert.equal(stalledEvents.length, 3, 'every stalled attempt is recorded');
    for (const event of stalledEvents) {
      assert.equal(event.hook, 'onTurnComplete');
      assert.equal(event.phase, 'turn-complete');
      assert.equal(event.budgetMs, 25);
      assert.ok(Number.isFinite(event.elapsedMs) && event.elapsedMs >= 20);
      assert.match(event.detail, /component=solo-runtime/);
    }
  } finally {
    if (previous === undefined) delete process.env.AIOS_SOLO_HOOK_TIMEOUT_MS;
    else process.env.AIOS_SOLO_HOOK_TIMEOUT_MS = previous;
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('an abort keeps the class the agent actually reported instead of deriving it from a counter', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-stall-class-'));
  try {
    await prepareRun(rootDir, 'classify-1');
    let turns = 0;
    const result = await runSoloHarnessLoop({
      ...BASE_LOOP(rootDir, 'classify-1'),
      pacing: null,
      maxIterations: 12,
      executeTurn: async () => {
        turns += 1;
        // 同一类真实故障反复出现：旧实现会因为 consecutiveInfraFailures>0 一律写成
        // runtime-error，把 tool-error 这个实际原因洗掉。
        return {
          outcome: 'infra-retry',
          summary: `tool blew up ${turns}`,
          shouldStop: false,
          failureClass: 'tool-error',
          keyChanges: [],
          keyLearnings: [],
        };
      },
    });

    const checkpoint = result.summary;
    assert.equal(checkpoint.lastFailureClass, 'tool-error', 'the reported class must survive the abort');
    assert.equal(turns, 5, 'the failure abort fires on its own threshold');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
