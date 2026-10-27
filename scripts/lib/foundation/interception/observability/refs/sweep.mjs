/* 中文注释：refs 回收的执行面——预算化、成对删除、带回执。
 *
 * 修 B5 的"调用方"半段：旧的 `pruneInterceptionRefs` 只能由人敲 `aios refs prune` 触发，
 * 于是实测积压 49,209 个文件 / 161.7MB / 30,861 条超 30 天（与 2026-09-09 那次审计的
 * 数字完全一致，说明这九周里没有任何东西处置过它）。
 *
 * 三条硬约束来自实测，不是审美：
 * 1) 全量扫描实测 2283ms，所以**绝不进会话启动路径**，只挂 close 钩子，并且带 budgetMs
 *    上界；超预算就截断返回 truncated，下次继续（截断的那次不算完成，不会被冷却挡住）。
 * 2) `.raw` 与 `.meta.json` 必须**成对**处置，否则留下孤儿 meta（列表里出现没有原文的
 *    ref）或孤儿 raw（grep 命中却无法解释来源）。
 * 3) 当前会话**整体保护**：长任务可恢复，30 天前的 ref 可能正是本次要引用的证据。 */

import fs from 'node:fs';
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { resolveAiosStateRoot } from '../../../../environment/aios/state-root.mjs';
import { atomicWriteText } from '../../../../memory/memo/storage/base/fs-io.mjs';
import { rawRefsSessionRoot } from './raw-ref-store.mjs';
import { decideRefRetention, refsSweepPolicy, shouldRunRefsSweep } from './retention.mjs';

const STATE_FILENAME = 'refs-sweep-state.json';
const RAW_SUFFIX = '.raw';
const META_SUFFIX = '.meta.json';

function refsRootDir(workspaceRoot) {
  // 中文注释：与写入方（rawRefsSessionRoot）用同一个环境解析，否则“保护当前会话”拼出的
  // 路径可能落在另一个根上，保护就静默失效——这类错位不会报错，只会删错东西。
  return path.join(resolveAiosStateRoot(workspaceRoot), 'interception', 'refs');
}

function statePathFor(workspaceRoot) {
  return path.join(path.dirname(refsRootDir(workspaceRoot)), STATE_FILENAME);
}

async function readState(workspaceRoot) {
  try {
    return JSON.parse(await readFile(statePathFor(workspaceRoot), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return {};
    throw error;
  }
}

async function writeState(workspaceRoot, state) {
  const target = statePathFor(workspaceRoot);
  await mkdir(path.dirname(target), { recursive: true });
  await atomicWriteText(target, `${JSON.stringify(state, null, 2)}\n`);
}

/* 中文注释：按 ref 的 stem 分组，保证一对证据只被判定一次。 */
function groupPairs(names) {
  const pairs = new Map();
  for (const name of names) {
    let stem = null;
    let slot = null;
    if (name.endsWith(META_SUFFIX)) {
      stem = name.slice(0, -META_SUFFIX.length);
      slot = 'meta';
    } else if (name.endsWith(RAW_SUFFIX)) {
      stem = name.slice(0, -RAW_SUFFIX.length);
      slot = 'raw';
    }
    if (!stem) continue;
    const entry = pairs.get(stem) || {};
    entry[slot] = name;
    pairs.set(stem, entry);
  }
  return pairs;
}

async function readMeta(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    // 读不到或坏 JSON：不猜。交给 mtime 兜底，判定里会标 basis。
    return null;
  }
}

async function sizeAndMtime(filePath) {
  try {
    const info = await stat(filePath);
    return { size: info.size, mtimeMs: info.mtimeMs };
  } catch {
    return { size: 0, mtimeMs: Number.NaN };
  }
}

/**
 * 执行一次 refs 回收。
 *
 * @returns {Promise<Object>} 回执：ran/reason/mode/scanned/pruned/bytesFreed/truncated/elapsedMs
 */
export async function sweepInterceptionRefs({
  workspaceRoot,
  activeSessionId = '',
  env = process.env,
  nowMs = Date.now(),
  keepDays,
  budgetMs,
  mode,
  cooldownMs,
  force = false,
} = {}) {
  const policy = refsSweepPolicy({ env, nowMs });
  const resolved = {
    keepDays: Number.isFinite(Number(keepDays)) ? Number(keepDays) : policy.keepDays,
    budgetMs: Number.isFinite(Number(budgetMs)) ? Number(budgetMs) : policy.budgetMs,
    cooldownMs: Number.isFinite(Number(cooldownMs)) ? Number(cooldownMs) : policy.cooldownMs,
    mode: mode || policy.mode,
  };
  const startedAt = Date.now();
  if (!policy.enabled && !force) {
    return { ran: false, reason: `disabled (${String(env.AIOS_REFS_SWEEP || '')})`, mode: resolved.mode, pruned: 0, bytesFreed: 0, scanned: 0, truncated: false, elapsedMs: 0 };
  }

  const root = refsRootDir(workspaceRoot);
  if (!fs.existsSync(root)) {
    return { ran: false, reason: 'no refs root', mode: resolved.mode, pruned: 0, bytesFreed: 0, scanned: 0, truncated: false, elapsedMs: 0 };
  }

  const state = await readState(workspaceRoot);
  const gate = shouldRunRefsSweep({
    lastRunAtMs: state.lastRunAtMs,
    lastTruncated: Boolean(state.lastTruncated),
    nowMs,
    cooldownMs: resolved.cooldownMs,
  });
  if (!gate.run && !force) {
    return {
      ran: false,
      reason: gate.reason,
      nextEligibleAtMs: gate.nextEligibleAtMs,
      mode: resolved.mode,
      pruned: 0,
      bytesFreed: 0,
      scanned: 0,
      truncated: false,
      elapsedMs: Date.now() - startedAt,
    };
  }

  const protectedDir = activeSessionId ? rawRefsSessionRoot(workspaceRoot, activeSessionId) : '';
  const sessions = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(root, entry.name);
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(dir).mtimeMs;
      } catch {
        mtimeMs = 0;
      }
      return { name: entry.name, dir, mtimeMs };
    })
    // 中文注释：最旧的会话先扫，这样被预算截断时，进展总是落在积压最重的那头。
    .sort((left, right) => left.mtimeMs - right.mtimeMs);

  const summary = {
    ran: true,
    mode: resolved.mode,
    scanned: 0,
    pruned: 0,
    bytesFreed: 0,
    sessionsScanned: 0,
    sessionsProtected: 0,
    truncated: false,
    clockBasis: {},
    reasons: {},
    startedAtMs: nowMs,
  };

  outer: for (const session of sessions) {
    if (protectedDir && path.resolve(session.dir) === path.resolve(protectedDir)) {
      summary.sessionsProtected += 1;
      summary.reasons['active-session'] = (summary.reasons['active-session'] || 0) + 1;
      continue;
    }
    summary.sessionsScanned += 1;
    let names = [];
    try {
      names = await readdir(session.dir);
    } catch {
      continue; // 并发清理或权限：本轮跳过，不谎报
    }
    for (const [stem, pair] of groupPairs(names)) {
      if (Date.now() - startedAt > resolved.budgetMs) {
        summary.truncated = true;
        break outer;
      }
      const metaPath = pair.meta ? path.join(session.dir, pair.meta) : '';
      const rawPath = pair.raw ? path.join(session.dir, pair.raw) : '';
      const meta = metaPath ? await readMeta(metaPath) : null;
      const rawInfo = rawPath ? await sizeAndMtime(rawPath) : { size: 0, mtimeMs: Number.NaN };
      const metaInfo = metaPath ? await sizeAndMtime(metaPath) : { size: 0, mtimeMs: Number.NaN };
      const verdict = decideRefRetention({
        meta,
        mtimeMs: Number.isFinite(rawInfo.mtimeMs) ? rawInfo.mtimeMs : metaInfo.mtimeMs,
        nowMs,
        defaultKeepDays: resolved.keepDays,
      });
      summary.scanned += 1;
      summary.clockBasis[`${verdict.clock}/${verdict.basis}`] = (summary.clockBasis[`${verdict.clock}/${verdict.basis}`] || 0) + 1;
      summary.reasons[verdict.reason] = (summary.reasons[verdict.reason] || 0) + 1;
      if (verdict.action !== 'prune') continue;

      const freed = rawInfo.size + metaInfo.size;
      if (resolved.mode === 'dry-run') {
        summary.pruned += 1;
        summary.bytesFreed += freed;
        summary.wouldPrune = true;
        continue;
      }
      // 成对删除：先删 raw 再删 meta，任一步失败都保留现场并在回执里记账。
      try {
        await rm(rawPath || metaPath, { force: true });
        if (rawPath && metaPath) await rm(metaPath, { force: true });
      } catch (error) {
        summary.reasons['delete-failed'] = (summary.reasons['delete-failed'] || 0) + 1;
        summary.lastError = error?.message || String(error);
        continue;
      }
      summary.pruned += 1;
      summary.bytesFreed += freed;
    }
    if (Date.now() - startedAt > resolved.budgetMs) {
      summary.truncated = true;
      break;
    }
  }

  summary.elapsedMs = Date.now() - startedAt;
  summary.finishedAtMs = nowMs + summary.elapsedMs;
  // 中文注释：截断不算完成——只记 lastTruncated，让下一次 close 能接着推进，
  // 而不是被自己写的冷却挡住，把积压又锁 6 小时。
  await writeState(workspaceRoot, {
    lastRunAtMs: summary.truncated ? (state.lastRunAtMs || null) : nowMs,
    lastTruncated: summary.truncated,
    lastMode: resolved.mode,
    lastReason: summary.truncated ? 'budget-truncated' : 'completed',
    lastSummary: {
      scanned: summary.scanned,
      pruned: summary.pruned,
      bytesFreed: summary.bytesFreed,
      elapsedMs: summary.elapsedMs,
    },
    lastFinishedAt: new Date(summary.finishedAtMs).toISOString(),
  });

  return summary;
}

/** 供 close 钩子使用：绝不抛错、绝不影响 close 本身（与 runAutodreamPhaseB 同一约定）。 */
export async function runRefsSweepOnSessionClose({ rootDir, sessionId = '', env = process.env, nowMs = Date.now() } = {}) {
  try {
    return await sweepInterceptionRefs({ workspaceRoot: rootDir, activeSessionId: sessionId, env, nowMs });
  } catch (error) {
    return { ran: false, reason: `refs sweep error: ${error?.message || error}`, mode: 'unknown', pruned: 0, bytesFreed: 0, scanned: 0, truncated: false };
  }
}
