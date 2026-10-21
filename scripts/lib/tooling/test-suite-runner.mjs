import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import manifest from '../../test-suites.json' with { type: 'json' };

/* 中文注释：本文件拥有“一次测试运行怎么执行”这件事：跑哪些文件、多大并发、
 * 以及可变工作区（临时目录）归谁。第三项是后加的：测试池自己 mkdtemp 从不回收，
 * 本机实测 %TEMP% 里堆了 62,773 个 aios-* 沙箱（条目数 92%），而泄漏的句柄会直接
 * 把下一次 `aios update` 的换入顶死。回收责任放到拥有运行生命周期的 runner 里，
 * 而不是让 ~100 个测试文件各自自觉。 */

export const RUN_TEMP_PREFIX = 'aios-test-run-';
export const RUN_TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** 退出开关：调试时需要看到真实 %TEMP% 或复现某个固定路径，置 1 即不隔离。 */
export function tempSandboxDisabled(env = process.env) {
  const flag = env.AIOS_TEST_TEMP_SANDBOX_DISABLE;
  return flag === '1' || flag === 'true';
}

/**
 * 为本轮测试建一个隔离的临时根，返回给子进程的环境变量。
 * TMPDIR/TMP/TEMP 三个都写：POSIX 看 TMPDIR，Windows 看 TMP/TEMP，
 * node 的 os.tmpdir() 在两边读的键不一样，漏一个就有测试继续往真 %TEMP% 里写。
 */
export function createTempSandbox({
  env = process.env,
  base = os.tmpdir(),
  now = Date.now(),
  mkdtemp = (p) => fs.mkdtempSync(p),
  prune = pruneStaleRunDirs,
} = {}) {
  if (tempSandboxDisabled(env)) {
    return { dir: '', disabled: true, env: { ...env } };
  }
  prune({ base, now });
  const dir = mkdtemp(path.join(base, RUN_TEMP_PREFIX));
  const childEnv = {
    ...env,
    TMPDIR: dir,
    TEMP: dir,
    TMP: dir,
    AIOS_TEST_TEMP_SANDBOX: dir,
  };
  return { dir, disabled: false, env: childEnv };
}

/**
 * 运行结束后删掉隔离根。Windows 上目录可能被子进程残留句柄占住（就是本次
 * `aios update` 被拒的那类情形），所以失败不抛错：把路径报给调用方，
 * 让它提醒人去跑 `npm run tmp:gc`。静默吞失败会把同一段历史再演一遂。
 */
export function disposeTempSandbox(dir, { remove = (p) => fs.rmSync(p, { recursive: true, force: true }) } = {}) {
  if (!dir) return { removed: false, skipped: true };
  try {
    remove(dir);
    return { removed: !fs.existsSync(dir), dir };
  } catch (error) {
    return { removed: false, dir, error: String(error.code || error.message || error) };
  }
}

/**
 * 自我愈合：只清理本 runner 自己命名的陈旧隔离根。形状比前缀更严
 * （`aios-test-run-` + 恰好 6 位 mkdtemp 后缀），所以不会误伤名字里含该前缀的别的东西。
 */
export function pruneStaleRunDirs({
  base = os.tmpdir(),
  now = Date.now(),
  maxAgeMs = RUN_TEMP_MAX_AGE_MS,
  remove = (p) => fs.rmSync(p, { recursive: true, force: true }),
  lstat = (p) => fs.lstatSync(p),
  readdir = (p) => fs.readdirSync(p, { withFileTypes: true }),
} = {}) {
  const removed = [];
  const kept = [];
  const shape = new RegExp(`^${RUN_TEMP_PREFIX}[A-Za-z0-9]{6}$`);
  let entries;
  try {
    entries = readdir(base);
  } catch {
    return { removed, kept };
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !shape.test(entry.name)) continue;
    const full = path.join(base, entry.name);
    try {
      if (now - lstat(full).mtimeMs < maxAgeMs) { kept.push(full); continue; }
    } catch { kept.push(full); continue; }
    try { remove(full); removed.push(full); } catch { kept.push(full); }
  }
  return { removed, kept };
}

const SUITES = Object.freeze({
  // The `unit` suite lives in the manifest like every other suite. It used to be defined
  // here with `roots` discovery only, which made scripts/tests/unit/** invisible to the
  // wiring guard: those files could sit outside every suite and every CI job while the
  // guard reported all-clear (audit F7, 2026-09-22).
  unit: Object.freeze({
    concurrency: manifest.unit.concurrency,
    files: Object.freeze([...manifest.unit.files]),
  }),
  regression: Object.freeze({
    concurrency: manifest.regression.concurrency,
    files: Object.freeze([...manifest.regression.files]),
  }),
  browser: Object.freeze({
    concurrency: manifest.browser.concurrency,
    files: Object.freeze([...manifest.browser.files]),
  }),
  context: Object.freeze({
    concurrency: manifest.context.concurrency,
    files: Object.freeze([...manifest.context.files]),
  }),
  orchestrator: Object.freeze({
    concurrency: manifest.orchestrator.concurrency,
    files: Object.freeze([...manifest.orchestrator.files]),
  }),
  harness: Object.freeze({
    concurrency: manifest.harness.concurrency,
    files: Object.freeze([...manifest.harness.files]),
  }),
  team: Object.freeze({
    concurrency: manifest.team.concurrency,
    files: Object.freeze([...manifest.team.files]),
  }),
  rex: Object.freeze({
    concurrency: manifest.rex.concurrency,
    files: Object.freeze([...manifest.rex.files]),
  }),
  client: Object.freeze({
    concurrency: manifest.client.concurrency,
    files: Object.freeze([...manifest.client.files]),
  }),
});

export function suiteSpec(name) {
  const suite = SUITES[name];
  if (!suite) throw new Error(`Unknown test suite: ${name}`);
  return {
    concurrency: suite.concurrency,
    ...(suite.roots ? { roots: [...suite.roots] } : {}),
    ...(suite.files ? { files: [...suite.files] } : {}),
  };
}
