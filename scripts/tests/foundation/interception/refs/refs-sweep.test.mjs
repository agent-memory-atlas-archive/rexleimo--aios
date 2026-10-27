import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  decideRefRetention,
  refsSweepPolicy,
  shouldRunRefsSweep,
} from '../../../../lib/foundation/interception/observability/refs/retention.mjs';
import { sweepInterceptionRefs } from '../../../../lib/foundation/interception/observability/refs/sweep.mjs';
import { runSessionClose } from '../../../../lib/execution/lifecycle/run/session-hooks/close.mjs';

const DAY_MS = 86400_000;
const NOW_MS = Date.parse('2026-10-27T00:00:00.000Z');

function makeTempRoot(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `aios-${name}-`));
}

/* 中文注释：夹具直接落成真实文件对，mtime 用 utimesSync 摆，这样测试覆盖的是
 * "复制/同步会重置 mtime"这个真实世界，而不是一个理想的时钟。 */
function seedRef(rootDir, { session, refId, createdAt, ttlDays = '30', mtimeMs, raw = 'x'.repeat(64) }) {
  const dir = path.join(rootDir, '.aios', 'interception', 'refs', session);
  fs.mkdirSync(dir, { recursive: true });
  const rawPath = path.join(dir, `${refId}.raw`);
  const metaPath = path.join(dir, `${refId}.meta.json`);
  fs.writeFileSync(rawPath, raw);
  const meta = { ref_id: refId, session_id: session, created_at: createdAt, raw_bytes: raw.length };
  if (ttlDays !== null) meta.ttl_days = ttlDays;
  fs.writeFileSync(metaPath, JSON.stringify(meta));
  const stamp = mtimeMs ?? Date.parse(createdAt);
  fs.utimesSync(rawPath, new Date(stamp), new Date(stamp));
  fs.utimesSync(metaPath, new Date(stamp), new Date(stamp));
  return { dir, rawPath, metaPath };
}

test('meta ttl_days beats a refreshed mtime — the exact bug mtime-only pruning had', () => {
  // 文件被复制过一次：mtime 是昨天，但业务时间是 40 天前、TTL 30 天。
  const verdict = decideRefRetention({
    meta: { created_at: new Date(NOW_MS - 40 * DAY_MS).toISOString(), ttl_days: '30' },
    mtimeMs: NOW_MS - DAY_MS,
    nowMs: NOW_MS,
    defaultKeepDays: 30,
  });
  assert.equal(verdict.action, 'prune');
  assert.equal(verdict.clock, 'meta.created_at');
  assert.equal(verdict.basis, 'meta.ttl_days');
});

test('per-ref ttl extends retention beyond the global default', () => {
  const verdict = decideRefRetention({
    meta: { created_at: new Date(NOW_MS - 40 * DAY_MS).toISOString(), ttl_days: '90' },
    mtimeMs: NOW_MS - 40 * DAY_MS,
    nowMs: NOW_MS,
    defaultKeepDays: 30,
  });
  assert.equal(verdict.action, 'keep');
  assert.equal(verdict.reason, 'within-ttl');
});

test('missing ttl_days falls back to the default and says so in basis', () => {
  const verdict = decideRefRetention({
    meta: { created_at: new Date(NOW_MS - 31 * DAY_MS).toISOString() },
    mtimeMs: NOW_MS - 31 * DAY_MS,
    nowMs: NOW_MS,
    defaultKeepDays: 30,
  });
  assert.equal(verdict.action, 'prune');
  assert.equal(verdict.basis, 'default.keepDays');
});

test('unparsable created_at uses mtime and labels the weaker clock', () => {
  const verdict = decideRefRetention({
    meta: { created_at: 'not-a-date', ttl_days: '30' },
    mtimeMs: NOW_MS - 45 * DAY_MS,
    nowMs: NOW_MS,
    defaultKeepDays: 30,
  });
  assert.equal(verdict.clock, 'fs.mtime');
  assert.equal(verdict.action, 'prune');
});

test('a caller that forgets nowMs degrades to wall clock, not to a silent no-op', () => {
  // 这条是回归守卫：上面那个缺陷就是漏传 nowMs → ageMs=NaN → 永不超期 → 回收器看上去
  // 在跑，其实什么也不删，而日志里 clock 仍显示“读到了 created_at”。
  const old = new Date(Date.now() - 40 * DAY_MS).toISOString();
  const verdict = decideRefRetention({
    meta: { created_at: old, ttl_days: '30' },
    mtimeMs: Date.now() - 40 * DAY_MS,
    defaultKeepDays: 30,
  });
  assert.equal(verdict.action, 'prune');
  assert.ok(Number.isFinite(verdict.ageMs));
});

test('no clock at all is not evidence of expiry', () => {
  const verdict = decideRefRetention({
    meta: null,
    mtimeMs: Number.NaN,
    nowMs: NOW_MS,
    defaultKeepDays: 30,
  });
  assert.equal(verdict.action, 'keep');
  assert.equal(verdict.reason, 'clock-unavailable');
});

test('the active session is protected even when its refs are ancient', () => {
  const verdict = decideRefRetention({
    meta: { created_at: new Date(NOW_MS - 200 * DAY_MS).toISOString(), ttl_days: '30' },
    mtimeMs: NOW_MS - 200 * DAY_MS,
    nowMs: NOW_MS,
    defaultKeepDays: 30,
    activeSession: true,
  });
  assert.equal(verdict.action, 'keep');
  assert.equal(verdict.reason, 'active-session');
});

test('sweep defaults to reporting, not deleting, and honors explicit enforce/off', () => {
  assert.deepEqual(
    { enabled: refsSweepPolicy({ env: {} }).enabled, mode: refsSweepPolicy({ env: {} }).mode },
    { enabled: true, mode: 'dry-run' },
  );
  assert.equal(refsSweepPolicy({ env: { AIOS_REFS_SWEEP: 'enforce' } }).mode, 'enforce');
  assert.equal(refsSweepPolicy({ env: { AIOS_REFS_SWEEP: '1' } }).mode, 'enforce');
  assert.equal(refsSweepPolicy({ env: { AIOS_REFS_SWEEP: 'off' } }).enabled, false);
  assert.equal(refsSweepPolicy({ env: { AIOS_REFS_SWEEP_KEEP_DAYS: '7' } }).keepDays, 7);
  assert.equal(refsSweepPolicy({ env: { AIOS_REFS_SWEEP_BUDGET_MS: '250' } }).budgetMs, 250);
  // 名称是 HOURS，语义就必须是小时——这类单位错配靠测试钉，不靠人读文档。
  assert.equal(refsSweepPolicy({ env: {} }).cooldownMs, 6 * 60 * 60 * 1000);
  assert.equal(refsSweepPolicy({ env: { AIOS_REFS_SWEEP_COOLDOWN_HOURS: '2' } }).cooldownMs, 2 * 60 * 60 * 1000);
});

test('cooldown skips a fresh run but a truncated run always continues', () => {
  assert.equal(shouldRunRefsSweep({ lastRunAtMs: null, nowMs: NOW_MS, cooldownMs: DAY_MS }).run, true);
  const cooling = shouldRunRefsSweep({ lastRunAtMs: NOW_MS - 60_000, nowMs: NOW_MS, cooldownMs: DAY_MS });
  assert.equal(cooling.run, false);
  assert.equal(cooling.nextEligibleAtMs, NOW_MS - 60_000 + DAY_MS);
  assert.equal(shouldRunRefsSweep({ lastRunAtMs: NOW_MS - 60_000, lastTruncated: true, nowMs: NOW_MS, cooldownMs: DAY_MS }).run, true);
});

test('enforce sweep prunes expired pairs on disk and leaves fresh ones alone', async () => {
  const rootDir = makeTempRoot('sweep-enforce');
  try {
    const old = seedRef(rootDir, { session: 's-old', refId: 'r1', createdAt: new Date(NOW_MS - 40 * DAY_MS).toISOString() });
    const fresh = seedRef(rootDir, { session: 's-fresh', refId: 'r2', createdAt: new Date(NOW_MS - 2 * DAY_MS).toISOString() });
    const result = await sweepInterceptionRefs({
      workspaceRoot: rootDir,
      env: { AIOS_REFS_SWEEP: 'enforce' },
      nowMs: NOW_MS,
    });
    assert.equal(result.mode, 'enforce');
    assert.equal(result.pruned, 1);
    assert.ok(result.bytesFreed > 64, `bytesFreed=${result.bytesFreed} must count raw + meta`);
    assert.ok(!fs.existsSync(old.rawPath), '.raw must go');
    assert.ok(!fs.existsSync(old.metaPath), '.meta.json must go with it — no orphan meta');
    assert.ok(fs.existsSync(fresh.rawPath) && fs.existsSync(fresh.metaPath), 'fresh pair survives');
    assert.equal(result.truncated, false);

    const state = JSON.parse(fs.readFileSync(path.join(rootDir, '.aios', 'interception', 'refs-sweep-state.json'), 'utf8'));
    assert.equal(state.lastRunAtMs, NOW_MS);
    assert.equal(state.lastReason, 'completed');
    assert.equal(state.lastTruncated, false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('dry-run reports the same backlog without touching a single file', async () => {
  const rootDir = makeTempRoot('sweep-dry');
  try {
    const victim = seedRef(rootDir, { session: 's1', refId: 'r1', createdAt: new Date(NOW_MS - 90 * DAY_MS).toISOString() });
    const result = await sweepInterceptionRefs({ workspaceRoot: rootDir, env: {}, nowMs: NOW_MS });
    assert.equal(result.mode, 'dry-run');
    assert.equal(result.pruned, 1, 'dry-run still counts what it would remove');
    assert.ok(fs.existsSync(victim.rawPath) && fs.existsSync(victim.metaPath), 'dry-run must not delete');

    const state = JSON.parse(fs.readFileSync(path.join(rootDir, '.aios', 'interception', 'refs-sweep-state.json'), 'utf8'));
    assert.equal(state.lastMode, 'dry-run');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('the active session dir is protected end to end', async () => {
  const rootDir = makeTempRoot('sweep-active');
  try {
    const mine = seedRef(rootDir, { session: 'current-session', refId: 'ancient', createdAt: new Date(NOW_MS - 400 * DAY_MS).toISOString() });
    const other = seedRef(rootDir, { session: 'someone-else', refId: 'ancient', createdAt: new Date(NOW_MS - 400 * DAY_MS).toISOString() });
    const result = await sweepInterceptionRefs({
      workspaceRoot: rootDir,
      activeSessionId: 'current-session',
      env: { AIOS_REFS_SWEEP: 'enforce' },
      nowMs: NOW_MS,
    });
    assert.ok(fs.existsSync(mine.rawPath), 'a resumable long session keeps the refs it is citing');
    assert.ok(!fs.existsSync(other.rawPath));
    assert.equal(result.pruned, 1);
    assert.equal(result.sessionsProtected, 1);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('a truncated pass is not a completion, while a finished pass starts the cooldown', async () => {
  const rootDir = makeTempRoot('sweep-cooldown');
  try {
    seedRef(rootDir, { session: 's1', refId: 'r1', createdAt: new Date(NOW_MS - 90 * DAY_MS).toISOString() });
    seedRef(rootDir, { session: 's2', refId: 'r2', createdAt: new Date(NOW_MS - 95 * DAY_MS).toISOString() });
    const stateFile = path.join(rootDir, '.aios', 'interception', 'refs-sweep-state.json');

    // 1) 预算为零：扫不动 → 必须记 truncated，不能记 completed。
    const trunc = await sweepInterceptionRefs({
      workspaceRoot: rootDir,
      env: { AIOS_REFS_SWEEP: 'enforce' },
      nowMs: NOW_MS,
      budgetMs: -1,
    });
    assert.equal(trunc.ran, true);
    assert.equal(trunc.truncated, true);
    let state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(state.lastTruncated, true, 'a truncated run must not claim completion');
    assert.equal(state.lastReason, 'budget-truncated');

    // 2) 紧接着再进：积压还得继续清，不能被自己写的冷却锁 6 小时。
    const resume = await sweepInterceptionRefs({
      workspaceRoot: rootDir,
      env: { AIOS_REFS_SWEEP: 'enforce' },
      nowMs: NOW_MS + 60_000,
    });
    assert.equal(resume.ran, true, 'truncated backlog keeps draining instead of being locked by cooldown');
    assert.equal(resume.pruned, 2);

    // 3) 真跑完了 → 写 lastRunAt，后续进入冷却。
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(state.lastRunAtMs, NOW_MS + 60_000);
    assert.equal(state.lastTruncated, false);
    const skipped = await sweepInterceptionRefs({
      workspaceRoot: rootDir,
      env: { AIOS_REFS_SWEEP: 'enforce' },
      nowMs: NOW_MS + 120_000,
    });
    assert.equal(skipped.ran, false);
    assert.match(skipped.reason, /cooldown/);
    assert.equal(skipped.nextEligibleAtMs, NOW_MS + 60_000 + 6 * 60 * 60 * 1000);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('session close is the automatic caller — and the sweep can never break the close', async () => {
  // B5 的缺陷本体是“没有调用方”。这条测试钉住两件事：
  // 1) 真的有人调（不靠人敲 aios refs prune）；
  // 2) 它失败/抛错时 close 仍然成功——与 autodream 同一个约定。
  const rootDir = makeTempRoot('sweep-close');
  try {
    seedRef(rootDir, { session: 'ancient-session', refId: 'r1', createdAt: new Date(NOW_MS - 60 * DAY_MS).toISOString() });
    const lines = [];
    const stdout = { write: (text) => lines.push(String(text)) };
    const result = await runSessionClose(
      { session: 'default', json: true },
      { rootDir, stdout, env: { AIOS_REFS_SWEEP: 'enforce' } },
    );
    assert.equal(result.exitCode, 0);
    assert.equal(result.refsSweep.ran, true, 'session close must actually invoke the sweep');
    assert.equal(result.refsSweep.pruned, 1);
    assert.ok(!fs.existsSync(path.join(rootDir, '.aios', 'interception', 'refs', 'ancient-session', 'r1.raw')));
    const payload = JSON.parse(lines.join(''));
    assert.equal(payload.refsSweep.mode, 'enforce', 'the JSON surface has to carry the receipt');

    // 第二次 close：冷却生效，不重复扫，但 close 照样成功。
    const second = await runSessionClose(
      { session: 'default', json: true },
      { rootDir, stdout: { write() {} }, env: { AIOS_REFS_SWEEP: 'enforce' } },
    );
    assert.equal(second.exitCode, 0);
    assert.equal(second.refsSweep.ran, false);
    assert.match(second.refsSweep.reason, /cooldown/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }

  const bare = makeTempRoot('sweep-close-bare');
  try {
    const missing = await runSessionClose(
      { session: 'default', json: true },
      { rootDir: bare, stdout: { write() {} }, env: { AIOS_REFS_SWEEP: 'enforce' } },
    );
    assert.equal(missing.exitCode, 0, 'no refs store must not fail the close');
    assert.equal(missing.refsSweep.ran, false);
    assert.equal(missing.refsSweep.reason, 'no refs root');
  } finally {
    fs.rmSync(bare, { recursive: true, force: true });
  }
});

test('refs prune stays usable when the store does not exist yet', async () => {
  const rootDir = makeTempRoot('sweep-empty');
  try {
    const result = await sweepInterceptionRefs({ workspaceRoot: rootDir, env: { AIOS_REFS_SWEEP: 'enforce' }, nowMs: NOW_MS });
    assert.equal(result.ran, false);
    assert.equal(result.reason, 'no refs root');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
