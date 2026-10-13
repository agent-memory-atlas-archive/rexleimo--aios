// scripts/lib/tooling/components/codemap/ensure.mjs — 启动时 CRG 就绪门禁
// 项目运行入口（ctx-agent run）在启动摘要前调 ensureCodemapInstalled()：
// CRG 没装（无 state 或图目录缺失）就地补装，装不上只告警、永不阻塞启动。
import { existsSync } from 'node:fs';
import path from 'node:path';

import { CRG_DATA_DIR } from './constants.mjs';
import { installCodemap } from './lifecycle/install.mjs';
import { readState } from './state-store.mjs';

export const CODEMAP_AUTO_INSTALL_ENV = 'AIOS_CODEMAP_AUTO_INSTALL';

const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled']);

/**
 * 自动补装总开关。默认开；显式设为 0/false/no/off/disabled 才关。
 */
export function isCodemapAutoInstallEnabled(env = process.env) {
  const raw = String(env?.[CODEMAP_AUTO_INSTALL_ENV] ?? '').trim().toLowerCase();
  if (!raw) return true;
  return !DISABLED_VALUES.has(raw);
}

/**
 * 轻量就绪判定（同步、只做两次 exists 级检查，不调 uvx、不读 git）。
 * ready = 装过（state 文件在）且图目录在。陈旧不管——那是 doctor 的事，
 * 启动门禁只负责「从无到有」，避免每次启动都触发重建。
 */
export function isCodemapReady(projectRoot) {
  const root = path.resolve(projectRoot || process.cwd());
  if (!readState(root)) return false;
  return existsSync(path.join(root, CRG_DATA_DIR));
}

/**
 * 启动时确保 CRG 可用。永远不抛错：
 * - 开关关了 → { status: 'disabled' }
 * - 已就绪 → { status: 'ready' }（零副作用，不调 install）
 * - 缺失 → 跑 installCodemap；成功 { status: 'installed' }，
 *   失败只告警并返回 { status: 'failed', reason }。
 * installImpl 可注入，便于测试。
 */
export async function ensureCodemapInstalled({
  projectRoot,
  rootDir,
  io = console,
  env = process.env,
  client = 'all',
  installImpl = installCodemap,
} = {}) {
  const root = path.resolve(projectRoot || process.cwd());
  if (!isCodemapAutoInstallEnabled(env)) {
    return { status: 'disabled', projectRoot: root };
  }
  if (isCodemapReady(root)) {
    return { status: 'ready', projectRoot: root };
  }
  const log = typeof io?.log === 'function' ? io.log.bind(io) : console.log;
  const warn = typeof io?.warn === 'function' ? io.warn.bind(io) : console.warn;
  log(`[codemap] code-review-graph not installed for ${root}; installing…`);
  try {
    await installImpl({ rootDir, projectRoot: root, client, io });
    if (!isCodemapReady(root)) {
      warn('[codemap] install finished but graph/state still missing; continuing without code-review-graph');
      return { status: 'failed', projectRoot: root, reason: 'post-install check still not ready' };
    }
    log('[codemap] code-review-graph installed');
    return { status: 'installed', projectRoot: root };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warn(`[warn] code-review-graph auto-install skipped: ${reason}`);
    return { status: 'failed', projectRoot: root, reason };
  }
}
