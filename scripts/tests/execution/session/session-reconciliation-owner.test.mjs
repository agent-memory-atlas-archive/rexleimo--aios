import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { reconcileUnclosedSessions, interruptionPath } from '../../../lib/execution/lifecycle/run/session-hooks/reconcile.mjs';
import { claimSessionOwner, verifyOwnerLease, OWNER_FILE } from '../../../lib/execution/harness/solo/solo-journal/content/owner.mjs';
import { getSoloHarnessPaths } from '../../../lib/execution/harness/solo/solo-journal/plumbing/paths.mjs';
import { resolveContextDbRoot } from '../../../lib/environment/aios/state-root.mjs';

async function withWorkspace(prefix, fn) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try { await fn(rootDir); } finally { await fs.rm(rootDir, { recursive: true, force: true }); }
}

async function seedSession(rootDir, sessionId) {
  const ctx = resolveContextDbRoot(rootDir, { preferLegacyExisting: true });
  const journal = getSoloHarnessPaths({ rootDir, sessionId });
  await fs.mkdir(journal.dir, { recursive: true });
  await fs.writeFile(journal.summaryPath, JSON.stringify({
    schemaVersion: 1,
    sessionId,
    status: 'running',
    objective: 'long task',
    lastIteration: 2,
    updatedAt: '2026-08-22T10:00:00Z',
  }));
  await fs.mkdir(path.join(ctx, 'sessions', sessionId), { recursive: true });
}

test('reconcile skips a stale summary while owner process is alive', async () => {
  await withWorkspace('aios-reconcile-owner-', async (rootDir) => {
    await seedSession(rootDir, 'owner-session');
    const lease = await claimSessionOwner({ rootDir, sessionId: 'owner-session', heartbeatMs: 60000 });
    try {
      const result = await reconcileUnclosedSessions({
        rootDir,
        now: new Date('2026-08-22T12:00:00Z'),
        logger: { log() {} },
      });
      assert.equal(result.reconciled.length, 0);
      assert.ok(result.skipped.some((entry) => entry.reason === 'owner-alive'));
    } finally {
      await lease.stop();
    }
  });
});

/* 中文注释：B2 的担保。kill(pid,0) 只能证明“这个号有人用”；进程死后 PID 会被回收，
   旧租约于是永远报 owner-alive，卡住恢复。判定用的不是精确身份而是有界比较：
   进程必然在它写下认领时刻之前启动，所以“启动时间晚于认领时刻”就等于不是原来那个进程。 */

async function writeOwnerRecord(rootDir, sessionId, owner) {
  const journal = getSoloHarnessPaths({ rootDir, sessionId });
  await fs.mkdir(journal.dir, { recursive: true });
  await fs.writeFile(path.join(journal.dir, OWNER_FILE), `${JSON.stringify(owner, null, 2)}\n`, 'utf8');
}

test('verifyOwnerLease separates live, dead, recycled, unprovable and invalid', () => {
  const claim = '2026-08-22T10:00:00.000Z';
  const claimMs = Date.parse(claim);
  const alive = () => ({ alive: true, code: 'alive' });
  const probes = (startMs) => ({
    selfPid: 111,
    livenessProbe: alive,
    startTimeProbe: () => (startMs === null ? { startMs: null, source: 'test', detail: 'no backend' } : { startMs, source: 'test', detail: 'fixture' }),
  });

  assert.equal(verifyOwnerLease({ pid: 111, processStartedAt: claim }, probes(claimMs + 9_000)).verdict, 'self');
  assert.equal(verifyOwnerLease({ pid: 222, processStartedAt: claim }, probes(claimMs - 9_000)).verdict, 'ours');
  assert.equal(verifyOwnerLease({ pid: 222, processStartedAt: claim }, probes(claimMs + 9_000)).verdict, 'recycled');
  assert.equal(verifyOwnerLease({ pid: 222, processStartedAt: claim }, probes(null)).verdict, 'unprovable');
  assert.equal(verifyOwnerLease({ pid: 222 }, probes(claimMs - 1000)).verdict, 'unprovable', 'a lease with no claim timestamp cannot be matched, not silently accepted');
  assert.equal(verifyOwnerLease({ pid: 222, processStartedAt: claim }, { ...probes(claimMs - 1000), livenessProbe: () => ({ alive: false, code: 'esrch' }) }).verdict, 'dead');
  assert.equal(verifyOwnerLease({ pid: 'not-a-pid', processStartedAt: claim }, probes(claimMs)).verdict, 'invalid');
  /* 中文注释：容差只防时钟误差，不是用来“凑平”真差异：超出 skew 才判复用。 */
  assert.equal(verifyOwnerLease({ pid: 222, processStartedAt: claim }, { ...probes(claimMs + 60_000), skewMs: 60_000 }).verdict, 'ours');
});

test('reconcile treats a recycled pid as no longer protecting the session', async () => {
  await withWorkspace('aios-reconcile-recycled-', async (rootDir) => {
    await seedSession(rootDir, 'recycled-session');
    const claimMs = Date.parse('2026-08-22T09:00:00.000Z');
    await writeOwnerRecord(rootDir, 'recycled-session', {
      schemaVersion: 1,
      kind: 'session-owner',
      pid: 424242,
      processStartedAt: new Date(claimMs).toISOString(),
      heartbeatAt: new Date(claimMs).toISOString(),
    });

    const result = await reconcileUnclosedSessions({
      rootDir,
      now: new Date('2026-08-22T12:00:00Z'),
      logger: { log() {} },
      ownerLeaseProbe: {
        selfPid: 111,
        livenessProbe: () => ({ alive: true, code: 'alive' }),
        startTimeProbe: () => ({ startMs: claimMs + 60_000, source: 'test', detail: 'pid reused by a later process' }),
      },
    });

    assert.equal(result.reconciled.length, 1, JSON.stringify(result));
    const [entry] = result.reconciled;
    assert.equal(entry.interruption.reason, 'lease-owner-pid-recycled');
    assert.equal(entry.interruption.ownerIdentity.verdict, 'recycled');
    assert.match(entry.interruption.ownerIdentity.detail, /later than claim/);
    assert.ok(result.skipped.every((item) => item.reason !== 'owner-alive'), 'a recycled pid must not be reported as a live owner');
    const written = await fs.readFile(interruptionPath(rootDir, 'recycled-session', process.env), 'utf8');
    assert.match(written, /"reason": "lease-owner-pid-recycled"/);
  });
});

test('an unprovable owner identity keeps the lease instead of guessing it stale', async () => {
  await withWorkspace('aios-reconcile-unprovable-', async (rootDir) => {
    await seedSession(rootDir, 'unprovable-session');
    await writeOwnerRecord(rootDir, 'unprovable-session', {
      schemaVersion: 1,
      kind: 'session-owner',
      pid: 424242,
      processStartedAt: '2026-08-22T09:00:00.000Z',
      heartbeatAt: '2026-08-22T09:00:00.000Z',
    });

    const result = await reconcileUnclosedSessions({
      rootDir,
      now: new Date('2026-08-22T12:00:00Z'),
      logger: { log() {} },
      ownerLeaseProbe: {
        selfPid: 111,
        livenessProbe: () => ({ alive: true, code: 'eperm' }),
        startTimeProbe: () => ({ startMs: null, source: 'powershell', detail: 'probe timed out' }),
      },
    });

    /* 中文注释：探不到启动时间不等于进程死了。这里的处置是尊重租约并留下可诊断原因，
       与发布门禁的“不能证明 ≠ 通过”同一形。 */
    assert.equal(result.reconciled.length, 0, JSON.stringify(result));
    const skipped = result.skipped.find((item) => item.sessionId === 'unprovable-session');
    assert.equal(skipped.reason, 'owner-alive-identity-unprovable');
    assert.equal(skipped.ownerVerdict, 'unprovable');
    assert.match(skipped.ownerIdentityDetail, /probe timed out/);
    await assert.rejects(fs.readFile(interruptionPath(rootDir, 'unprovable-session', process.env), 'utf8'));
  });
});
