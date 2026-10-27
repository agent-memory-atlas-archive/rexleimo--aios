/**
 * Session owner and heartbeat records for crash reconciliation.
 *
 * The owner record lets recovery distinguish a live long-running session
 * from a dead process whose summary merely looks stale. The heartbeat is
 * best-effort and intentionally unref'ed so it never keeps Node alive.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteText } from '../../../../../memory/memo/storage/base/fs-io.mjs';
import { normalizeProcessPid, probeProcessLiveness, readProcessStartTimeMs } from '../../../../../foundation/platform/process/identity.mjs';
import { getSoloHarnessPaths } from '../plumbing/paths.mjs';

const OWNER_FILE = 'owner.json';
const DEFAULT_HEARTBEAT_MS = 30_000;
/* 中文注释：启动时间只会早于认领时刻；这个容差只防“反向”误差（时钟跳变、秒级精度），
   不是用来“凑平”真实差异的——取不到启动时间永远帰 unprovable，不当作匹配。 */
const OWNER_IDENTITY_SKEW_MS = 5_000;

function ownerPath(rootDir, sessionId) {
  return path.join(getSoloHarnessPaths({ rootDir, sessionId }).dir, OWNER_FILE);
}

async function writeOwner(rootDir, sessionId, owner) {
  const target = ownerPath(rootDir, sessionId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await atomicWriteText(target, `${JSON.stringify(owner, null, 2)}\n`);
  return owner;
}

export async function readSessionOwner(rootDir, sessionId) {
  try {
    return JSON.parse(await fs.readFile(ownerPath(rootDir, sessionId), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    return null;
  }
}

export function isProcessAlive(pid) {
  return probeProcessLiveness(pid).alive;
}

/* 中文注释：租约身份判定——把“pid 有人用”和“还是当初那个进程”分成两件不同的事。
 * verdict：
 *   self        同一进程自己持有的租约（不起任何 OS 探测）
 *   ours        活着且启动时间不晚于认领时刻
 *   dead        确认不存在（ESRCH）
 *   recycled    活着但启动时间晚于认领时刻 => PID 已被复用，旧租约不再可信
 *   unprovable  活着但拿不到启动时间 => 继续尊重租约（“证明不了”不是“已过世”）
 *   invalid     租约里没有可用 pid
 */
export function verifyOwnerLease(owner, {
  selfPid = process.pid,
  nowMs = Date.now(),
  skewMs = OWNER_IDENTITY_SKEW_MS,
  livenessProbe = probeProcessLiveness,
  startTimeProbe = readProcessStartTimeMs,
} = {}) {
  const pid = normalizeProcessPid(owner?.pid);
  if (pid === null) {
    return { verdict: 'invalid', pid: null, detail: 'owner record has no usable pid' };
  }

  const liveness = livenessProbe(pid);
  if (!liveness.alive) {
    return { verdict: 'dead', pid, detail: `liveness=${liveness.code}` };
  }
  if (pid === Number(selfPid)) {
    return { verdict: 'self', pid, detail: 'lease is held by this very process' };
  }

  const claimedMs = Date.parse(String(owner?.processStartedAt || ''));
  if (!Number.isFinite(claimedMs)) {
    return { verdict: 'unprovable', pid, detail: 'lease has no parsable processStartedAt' };
  }

  const probed = startTimeProbe(pid) || {};
  if (!Number.isFinite(probed.startMs)) {
    return { verdict: 'unprovable', pid, detail: `start-time unprovable (${probed.source || 'unknown'}: ${probed.detail || ''})` };
  }
  if (probed.startMs > claimedMs + skewMs) {
    return {
      verdict: 'recycled',
      pid,
      detail: `process start ${new Date(probed.startMs).toISOString()} is later than claim ${new Date(claimedMs).toISOString()} by ${probed.startMs - claimedMs}ms`,
    };
  }
  return { verdict: 'ours', pid, detail: `start ${new Date(probed.startMs).toISOString()} <= claim ${new Date(claimedMs).toISOString()} (${probed.source || 'probe'})` };
}

export async function claimSessionOwner({
  rootDir,
  sessionId,
  pid = process.pid,
  heartbeatMs = DEFAULT_HEARTBEAT_MS,
} = {}) {
  if (!rootDir || !sessionId) return null;
  const owner = {
    schemaVersion: 1,
    kind: 'session-owner',
    pid,
    processStartedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
  };
  await writeOwner(rootDir, sessionId, owner);
  const timer = setInterval(() => {
    writeOwner(rootDir, sessionId, { ...owner, heartbeatAt: new Date().toISOString() }).catch(() => {});
  }, Math.max(1000, heartbeatMs));
  timer.unref?.();
  return {
    owner,
    heartbeat: timer,
    async stop() {
      clearInterval(timer);
      try {
        const current = await readSessionOwner(rootDir, sessionId);
        if (current?.pid === pid && current?.processStartedAt === owner.processStartedAt) {
          await fs.rm(ownerPath(rootDir, sessionId), { force: true });
        }
      } catch {
        // Best-effort cleanup; dead PIDs are handled by reconciliation.
      }
    },
  };
}

export { DEFAULT_HEARTBEAT_MS, OWNER_FILE, ownerPath };
