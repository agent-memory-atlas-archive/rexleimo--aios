/* 中文注释：浏览器 profile 根的唯一定义处。
 *
 * 为什么要单独有这一层：profile 目录原本住在 AIOS 安装根里面（`<install>/.browser-profiles`），
 * 于是"升级换入"和"浏览器会话"争同一个目录——换入靠 `Directory::Move` 改名让位，而 Chrome 用
 * `--user-data-dir=<安装树内路径>` 活着时这个改名会被 Windows 直接拒绝（本机实测两次：一次孤儿
 * 会话、一次活会话正在写 `grill`/`headless-check`）。对照事实：十几个只持有安装树内**脚本文件**的
 * bridge 进程并不挡改名，挡的是**目录句柄**。
 *
 * 所以根搬到安装树外（`~/.rexcil/browser-profiles`，与安装根同卷，迁移是一次 rename）。
 * `config/browser-profiles.json` 里的 `.browser-profiles/<name>` 相对串**不改**——那是 profile
 * 的名字不是它的位置，位置由本模块决定。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PROFILE_ROOT_ENV = 'AIOS_BROWSER_PROFILE_ROOT';
export const LEGACY_PROFILE_DIR_NAME = '.browser-profiles';
export const DEFAULT_PROFILE_DIR_NAME = 'browser-profiles';

function toPosix(value) {
  return String(value || '').replace(/\\/g, '/');
}

/** 运行时状态根：沿用既有 REXCIL_HOME 约定（默认 `~/.rexcil`，安装根 `~/.rexcil/aios` 就在它下面）。 */
export function rexcilHome({ env = process.env, homeDir = os.homedir() } = {}) {
  const raw = String(env.REXCIL_HOME || '').trim();
  if (raw && path.isAbsolute(raw)) return raw;
  return path.join(homeDir, '.rexcil');
}

/**
 * profile 根。优先级：AIOS_BROWSER_PROFILE_ROOT（必须是绝对路径）> REXCIL_HOME/browser-profiles。
 * 相对值一律不采纳：一个指向"位置"的契约变量给成相对路径，等于把歧义塞进每个消费者。
 */
export function resolveProfileRoot({ env = process.env, homeDir = os.homedir() } = {}) {
  const raw = String(env[PROFILE_ROOT_ENV] || '').trim();
  if (raw && path.isAbsolute(raw)) return path.normalize(raw);
  return path.join(rexcilHome({ env, homeDir }), DEFAULT_PROFILE_DIR_NAME);
}

/** 旧位置（安装根内）。过渡期只读它、只搬它，不再往里写。 */
export function legacyProfileRoot({ rootDir, dirName = LEGACY_PROFILE_DIR_NAME } = {}) {
  if (!rootDir) return '';
  return path.join(rootDir, dirName);
}

export function isInsideDir(candidate, dir) {
  if (!candidate || !dir) return false;
  const target = path.resolve(candidate);
  const base = path.resolve(dir);
  return target === base || target.startsWith(base + path.sep);
}

/**
 * 把配置里的 profile 路径解析成绝对路径。
 * - 绝对：原样（用户显式指定的外部目录必须尊重）。
 * - `.browser-profiles/<name>`（或反斜杠同形）：折进新的 profile 根——这就是旧配置的兼容读法。
 * - 其它相对：按 workspace 根解析，语义不变（不能把别人的相对路径也吞进来）。
 */
export function resolveProfilePath(targetPath, { profileRoot, workspaceRoot }) {
  const raw = String(targetPath || '').trim();
  if (!raw) return '';
  if (path.isAbsolute(raw)) return raw;
  const posix = toPosix(raw);
  if (posix === LEGACY_PROFILE_DIR_NAME || posix.startsWith(`${LEGACY_PROFILE_DIR_NAME}/`)) {
    const rest = posix.slice(LEGACY_PROFILE_DIR_NAME.length).replace(/^\//, '');
    return rest ? path.join(profileRoot, ...rest.split('/')) : profileRoot;
  }
  return workspaceRoot ? path.resolve(workspaceRoot, raw) : raw;
}

/**
 * Chrome 自己写的 `SingletonLock` 是"这个 profile 正被占用"的客观凭据。
 * 不看进程表、不看文件名猜测——搬活 profile 会直接损坏登录态。
 */
export function chromeProfileLockPresent(dir, { fsImpl = fs } = {}) {
  if (!dir) return false;
  try {
    fsImpl.lstatSync(path.join(dir, 'SingletonLock'));
    return true;
  } catch {
    return false;
  }
}

function childDirs(dir, { fsImpl = fs }) {
  try {
    return fsImpl
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

/** 根目录本身或任何一个 profile 子目录带锁 = 有活会话。 */
export function profileTreeBusy(dir, probes = { fsImpl: fs }) {
  if (chromeProfileLockPresent(dir, probes)) return true;
  return childDirs(dir, probes).some((child) => chromeProfileLockPresent(child, probes));
}

/**
 * 一次性迁移：旧根 -> 新根。幂等，且只在安全时动文件系统。
 * 状态就是返回值，调用方（doctor / 组件安装）负责把状态说出来，绝不静默。
 *   migrated      搬完了
 *   no-legacy     旧根不存在（新装或已迁移）——正常终态
 *   target-exists 新根已存在，绝不合并（宁可不搬，也不把两份 profile 搅在一起）
 *   locked        有活会话，本轮不搬（下轮再来）
 *   error         rename 失败（跨卷等），原因带在 error 里；旧数据原地完好
 */
export function migrateLegacyProfileRoot({
  legacyRoot,
  targetRoot,
  fsImpl = fs,
  rename = (from, to) => fsImpl.renameSync(from, to),
  busyProbe = profileTreeBusy,
} = {}) {
  if (!legacyRoot || !targetRoot) return { status: 'no-legacy', legacyRoot, targetRoot };
  if (isInsideDir(legacyRoot, targetRoot)) {
    return { status: 'target-exists', legacyRoot, targetRoot, reason: 'legacy-root-inside-target' };
  }
  let legacyStat = null;
  try {
    legacyStat = fsImpl.lstatSync(legacyRoot);
  } catch {
    return { status: 'no-legacy', legacyRoot, targetRoot };
  }
  if (!legacyStat.isDirectory() || legacyStat.isSymbolicLink?.()) {
    return { status: 'no-legacy', legacyRoot, targetRoot, reason: 'legacy-not-a-plain-dir' };
  }
  try {
    fsImpl.lstatSync(targetRoot);
    return { status: 'target-exists', legacyRoot, targetRoot, reason: 'target-present' };
  } catch {
    /* 新根不存在才是我们要的情形；这里吞的只是 ENOENT。 */
  }
  if (busyProbe(legacyRoot, { fsImpl })) {
    return { status: 'locked', legacyRoot, targetRoot, reason: 'singleton-lock-present' };
  }
  try {
    fsImpl.mkdirSync(path.dirname(targetRoot), { recursive: true });
    rename(legacyRoot, targetRoot);
    return { status: 'migrated', legacyRoot, targetRoot };
  } catch (error) {
    return { status: 'error', legacyRoot, targetRoot, error: String(error.code || error.message) };
  }
}
