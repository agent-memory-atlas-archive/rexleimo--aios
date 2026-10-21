/* 中文注释：AIOS 运行时根（runtime root）的稳定判定。
 *
 * 背景：客户端配置里的 AIOS 脚本路径必须来自**稳定安装根**（如 ~/.rexcil/aios）。
 * mkdtemp 出来的临时物化目录（/var/folders/…/T/aios-*-XXXX、/tmp/aios-*-XXXX）会被系统
 * 回收，一旦把它写进 home 作用域的客户端配置，该机器上所有 MCP server 从那一刻起永久失联。
 * 本模块把「这个根能不能落进长期配置」这件事收到一处，供迁移器与修复器共同判定。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const AIOS_ROOT_MARKER = ['scripts', 'aios.mjs'];

/* 中文注释：从配置文本里抠出来的 Windows 路径有三副面孔：JSON 转义形态
 * （`"D:\\aios\\scripts\\x.py"`，抠到的 token 里反斜杠是成对的）、直接写正斜杠的形态
 * （`D:/aios/scripts/x.py`）以及原生单反斜杠形态。拿未解码的 token 去做前缀比对，已修好的
 * 稳定根条目会被当成“不存在的 AIOS 路径”一直误报 stale——修复器于是年年重修同一条目。
 * 因此：解码回真实路径后再比对，比对键统一折分隔符，win32 额外折小写（路径大小写不敏感）。
 */
export function decodeConfigPathToken(raw) {
  const token = String(raw || '').replace(/[.,;:]+$/u, '');
  if (!/^[A-Za-z]:/u.test(token)) return token;
  return token.replace(/\\\\/gu, '\\');
}

function comparisonKey(value) {
  const text = String(value).replace(/[\\/]+/gu, '/').replace(/\/+$/u, '');
  return process.platform === 'win32' ? text.toLowerCase() : text;
}

const POSIX_ROOTED = /^\//u;
const DRIVE_ROOTED = /^[A-Za-z]:[\\/]/u;
const UNC_ROOTED = /^[\\/]{2}/u;

/** 该字符串在任何支持的路制下是否像绝对路径（POSIX 根 / 盘符 / UNC）。 */
export function isAbsolutePathLike(value) {
  return typeof value === 'string'
    && (POSIX_ROOTED.test(value) || DRIVE_ROOTED.test(value) || UNC_ROOTED.test(value));
}

/**
 * 从 command/args 这类数组里挑出绝对路径参数。存在理由：调用方（含测试）需要一个
 * 不拿 `startsWith('/')` 当判据的口径——那样 Windows 上盘符路径会被整批丢掉。
 *
 * @param {...(Array<string>|string|null|undefined)} groups
 * @returns {string[]}
 */
export function absolutePathItems(...groups) {
  const flat = [];
  for (const group of groups) {
    if (Array.isArray(group)) flat.push(...group);
    else if (typeof group === 'string') flat.push(group);
  }
  return flat.filter(isAbsolutePathLike);
}

function safeRealpath(value, fsImpl) {
  if (!value) return '';
  try {
    return fsImpl.realpathSync(value);
  } catch {
    return '';
  }
}

/* 中文注释：收集"易失目录"前缀集合。同时纳入 realpath 变体，
 * 因为 macOS 的 os.tmpdir() 返回 /var/folders/…，真实路径却是 /private/var/folders/…。 */
function volatilePrefixes({ env = process.env, tmpdir = os.tmpdir(), fsImpl = fs } = {}) {
  const defaultTmp = os.tmpdir();
  const usingDefault = !tmpdir || path.resolve(String(tmpdir)) === path.resolve(defaultTmp);
  const add = (entry, into) => {
    if (!entry) return;
    const resolved = path.resolve(String(entry));
    into.add(resolved);
    const real = safeRealpath(resolved, fsImpl);
    if (real) into.add(real);
  };
  const prefixes = new Set();
  /* 中文注释：调用方显式注入 tmpdir 时，它就是“易失”的完整定义——不再叠加 env 里的
   * 真实 TMPDIR，否则测试沙箱会被系统临时目录同化，守卫在单测里形同虚设。 */
  if (!usingDefault) {
    add(tmpdir, prefixes);
    return [...prefixes];
  }
  add(defaultTmp, prefixes);
  add(env.TMPDIR, prefixes);
  add(env.TEMP, prefixes);
  add(env.TMP, prefixes);
  // POSIX 兜底：/tmp 与 /private/tmp 在默认模式下也视为易失。
  prefixes.add('/tmp');
  prefixes.add('/private/tmp');
  return [...prefixes];
}

function startsUnder(candidate, prefix) {
  if (!prefix) return false;
  const normalized = comparisonKey(candidate);
  const base = comparisonKey(prefix);
  if (!base || normalized === base) return false;
  return normalized.startsWith(`${base}/`);
}

/** 该候选根是否位于系统临时目录之下（= 不可写入长期配置）。 */
export function isVolatileAiosRoot(candidate, { env = process.env, fsImpl = fs, tmpdir = os.tmpdir() } = {}) {
  const text = String(candidate || '').trim();
  if (!text) return false;
  const resolved = path.resolve(text);
  const real = safeRealpath(resolved, fsImpl) || resolved;
  const prefixes = volatilePrefixes({ env, tmpdir, fsImpl });
  return prefixes.some((prefix) => startsUnder(resolved, prefix) || startsUnder(real, prefix));
}

/** 是否像一个真的 AIOS 运行时根（存在 scripts/aios.mjs 标记文件）。 */
export function isAiosRuntimeRoot(candidate, { fsImpl = fs } = {}) {
  const text = String(candidate || '').trim();
  if (!text) return false;
  try {
    return Boolean(fsImpl.existsSync(path.join(text, ...AIOS_ROOT_MARKER)));
  } catch {
    return false;
  }
}

/* 中文注释：稳定根解析优先级——
 * 1) 调用方给的 rootDir 只有在"是稳定根 + 像 AIOS 根"时采用；
 * 2) 否则退回环境里声明的安装根（AIOS 安装 shim 会导出 AIOS_ROOT_DIR/AIOS_ROOT/ROOTPATH）；
 * 3) 都没有则返回 null，由调用方 fail-closed（拒写长期配置），绝不猜 cwd。 */
export function resolveStableAiosRoot({ rootDir = '', env = process.env, fsImpl = fs, tmpdir = os.tmpdir() } = {}) {
  const fromArg = String(rootDir || '').trim();
  if (fromArg && !isVolatileAiosRoot(fromArg, { env, fsImpl, tmpdir }) && isAiosRuntimeRoot(fromArg, { fsImpl })) {
    return { root: path.resolve(fromArg), source: 'arg', volatile: false };
  }
  for (const key of ['AIOS_ROOT_DIR', 'AIOS_ROOT', 'ROOTPATH', 'AIOS_INSTALL_DIR']) {
    const candidate = String(env[key] || '').trim();
    if (!candidate) continue;
    if (isVolatileAiosRoot(candidate, { env, fsImpl, tmpdir }) || !isAiosRuntimeRoot(candidate, { fsImpl })) continue;
    return { root: path.resolve(candidate), source: key, volatile: false };
  }
  return { root: null, source: 'none', volatile: Boolean(fromArg) && isVolatileAiosRoot(fromArg, { env, fsImpl, tmpdir }) };
}

/**
 * 找出配置文本里指向易失目录、或指向已消失目录的 AIOS 绝对路径。
 * 只做事实判定（存在性 + 前缀），不做语义猜测，供修复器决定"哪些文件需要重新 materialize"。
 * trustedRoots：已知稳定的根（如本次修复的目标安装根），指向其下的条目不算 stale。
 */
export function findVolatileAiosPaths(text, { env = process.env, fsImpl = fs, tmpdir = os.tmpdir(), trustedRoots = [] } = {}) {
  const prefixes = volatilePrefixes({ env, fsImpl, tmpdir });
  const trusted = trustedRoots.filter(Boolean).map((root) => path.resolve(String(root)));
  const hits = new Set();
  /* 中文注释：只取真正的"绝对路径 token"——前面不能接 . / \ 或 word，否则会把
   * JSON 里的相对条目（"./plugins/aios-memory.ts"）误读成绝对路径。 */
  const absolutePathPattern = /(?<![\w./\\-])(?:\/|\b[A-Za-z]:[\\/])[^\s"'`,)\]}]+/gu;
  for (const match of String(text || '').matchAll(absolutePathPattern)) {
    const candidate = decodeConfigPathToken(match[0]);
    if (trusted.some((root) => comparisonKey(candidate) === comparisonKey(root) || startsUnder(candidate, root))) continue;
    const isVolatile = prefixes.some((prefix) => startsUnder(candidate, prefix));
    if (isVolatile) {
      hits.add(candidate);
      continue;
    }
    // 非易失但已消失的 AIOS 路径同样算 stale（只认带 aios 字样的，避免误报用户自有路径）。
    if (/aios/iu.test(candidate) && !candidate.includes('*')) {
      try {
        if (!fsImpl.existsSync(candidate)) hits.add(candidate);
      } catch {
        /* existsSync 已吞掉常规错误；其余异常按"无法判定"跳过 */
      }
    }
  }
  return [...hits].sort();
}
