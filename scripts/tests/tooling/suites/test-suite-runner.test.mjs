import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { suiteSpec, createTempSandbox, disposeTempSandbox, pruneStaleRunDirs, tempSandboxDisabled, RUN_TEMP_PREFIX } from '../../../lib/tooling/test-suite-runner.mjs';

const MANIFEST = JSON.parse(fs.readFileSync('scripts/test-suites.json', 'utf8'));

test('unit suite is manifest-driven and covers only unit tests', () => {
  const unit = suiteSpec('unit');
  assert.equal(unit.concurrency, 4);
  // Explicit files, not `roots` discovery: the manifest is what the wiring guard reads,
  // so root-discovered files could be invisible to it (audit F7).
  assert.equal(unit.roots, undefined, 'unit suite must be explicit files, not roots discovery');
  assert.ok(Array.isArray(unit.files) && unit.files.length > 0);
  // The 2026-10 test-tree reorg dissolved scripts/tests/unit/, so the invariant is no longer a
  // single directory prefix — it is that every declared file is a real path under scripts/tests/.
  assert.ok(
    unit.files.every((file) => file.startsWith('scripts/tests/') && fs.existsSync(file)),
    `unit suite files must exist under scripts/tests/, got ${unit.files.join(', ')}`,
  );
  assert.deepEqual(unit.files, MANIFEST.unit.files, 'the manifest is the single source of truth');
});

test('regression suite uses an explicit legacy manifest', () => {
  const regression = suiteSpec('regression');
  // Concurrency is whatever the manifest declares; asserting a literal here is how this
  // test went stale (it pinned 1 long after the manifest moved to 4).
  assert.equal(regression.concurrency, MANIFEST.regression.concurrency);
  assert.equal(regression.files.length, MANIFEST.regression.files.length);
  assert.ok(regression.files.includes('scripts/tests/learning/model/model-router.test.mjs'));
  // The unit suite's default-mode file must stay out of regression — the two suites are disjoint.
  assert.ok(!regression.files.includes('scripts/tests/foundation/lifecycle-ops/default-mode.test.mjs'));
});

test('unknown suite is rejected', () => {  assert.throws(() => suiteSpec('unknown'), /Unknown test suite/);
});

test('controlled suites are explicit and serial', () => {
  for (const name of ['browser', 'client', 'context', 'harness', 'orchestrator', 'rex', 'team']) {
    const suite = suiteSpec(name);
    assert.equal(suite.concurrency, 1);
    assert.ok(suite.files.length > 0);
    assert.ok(suite.files.every((file) => file.startsWith('scripts/tests/')));
  }
});

/* 中文注释：套件怎么跑”归本模块，因此临时沙箱的生命周期也在这里担保。
 * 起因：测试池自己 mkdtemp 从不回收，本机实测 %TEMP% 堆到 62,773 个 aios-* 沙箱（条目数 92%），
 * 而泄漏的句柄能把下一次 `aios update` 的换入顶死。回收放到拥有运行生命周期的 runner 里，
 * 而不是靠 ~100 个测试文件各自自觉。 */

test('createTempSandbox redirects every temp env key into the run dir', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-sbx-contract-'));
  try {
    const sandbox = createTempSandbox({ env: {}, base });
    assert.ok(sandbox.dir.startsWith(base), `run dir 必须在给定 base 里: ${sandbox.dir}`);
    assert.equal(fs.existsSync(sandbox.dir), true, 'run dir 必须当场创建');
    /* 中文注释：TMPDIR / TEMP / TMP 三个都指过去——POSIX 读 TMPDIR，Windows 读 TEMP/TMP，
     * node 的 os.tmpdir() 两边取的键不一样，漏一个就有测试继续往真 %TEMP% 里写。 */
    for (const key of ['TMPDIR', 'TEMP', 'TMP']) {
      assert.equal(sandbox.env[key], sandbox.dir, `${key} 必须指向本轮沙箱`);
    }
    assert.equal(sandbox.env.AIOS_TEST_TEMP_SANDBOX, sandbox.dir, '沙箱路径要可观察（失败时能告诉用户去哪收尾）');
    assert.equal(path.basename(sandbox.dir).startsWith(RUN_TEMP_PREFIX), true);
    const dispose = disposeTempSandbox(sandbox.dir);
    assert.equal(dispose.removed, true);
    assert.equal(fs.existsSync(sandbox.dir), false, '运行结束沙箱必须消失');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('createTempSandbox hands parent env through when disabled', () => {
  assert.equal(tempSandboxDisabled({ AIOS_TEST_TEMP_SANDBOX_DISABLE: '1' }), true);
  assert.equal(tempSandboxDisabled({ AIOS_TEST_TEMP_SANDBOX_DISABLE: 'true' }), true);
  assert.equal(tempSandboxDisabled({}), false);
  const sandbox = createTempSandbox({ env: { TEMP: 'D:\RealTemp', TMPDIR: '/real/tmp', AIOS_TEST_TEMP_SANDBOX_DISABLE: '1' } });
  assert.equal(sandbox.disabled, true);
  assert.equal(sandbox.dir, '', '关闭隔离时不得凭空造目录');
  assert.equal(sandbox.env.TEMP, 'D:\RealTemp', '关闭隔离时父环境原样透传');
  assert.equal(sandbox.env.TMPDIR, '/real/tmp');
  assert.equal(disposeTempSandbox(sandbox.dir).skipped, true, '没有目录就不存在“删除失败”');
});

test('disposeTempSandbox reports the path when a handle keeps the dir alive', () => {
  /* 中文注释：Windows 上子进程残留句柄会让删除失败（本次 aios update 被拒就是这一族）。
   * 失败必须带路径报给调用方，不能静默吞——吞掉就是把同一件事再演一遍。 */
  const fake = path.join(os.tmpdir(), `${RUN_TEMP_PREFIX}Fa1SeB`);
  const result = disposeTempSandbox(fake, {
    remove: () => { const e = new Error('locked'); e.code = 'EBUSY'; throw e; },
  });
  assert.equal(result.removed, false);
  assert.equal(result.dir, fake, '要把路径交出去，用户才能跑 tmp:gc');
  assert.equal(result.error, 'EBUSY');
});

test('pruneStaleRunDirs sweeps only its own naming family and only stale entries', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-sbx-prune-'));
  try {
    const oldMs = Date.now() - 48 * 3600 * 1000;
    const mk = (name, mtimeMs) => {
      const dir = path.join(base, name);
      fs.mkdirSync(dir);
      fs.utimesSync(dir, new Date(mtimeMs), new Date(mtimeMs));
      return dir;
    };
    const staleMine = mk(`${RUN_TEMP_PREFIX}0AbCdE`, oldMs);
    const freshMine = mk(`${RUN_TEMP_PREFIX}9ZyXwV`, Date.now());
    const strangerOld = mk('aios-orchestrator-01XBgK', oldMs);
    const lookalike = mk(`${RUN_TEMP_PREFIX}short`, oldMs);
    const { removed } = pruneStaleRunDirs({ base });
    assert.deepEqual(removed, [staleMine], '只收 aios-test-run-+6 位随机后缀这一族');
    assert.equal(fs.existsSync(staleMine), false);
    assert.equal(fs.existsSync(freshMine), true, '新鲜的一律保留：此刻可能有并发运行正在写');
    assert.equal(fs.existsSync(strangerOld), true, '别的 fixture 家族不属于本 runner 的清理面（那是 tmp:gc 的事）');
    assert.equal(fs.existsSync(lookalike), true, '后缀长度不符就不算自己造的目录');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('both test runners route the child process through the run sandbox', () => {
  /* 中文注释：两个 runner 一个是 async spawn、一个是 spawnSync，但都必须做三件事：
   * 建沙箱、把 env 传给子进程、退出时回收。漏一件，%TEMP% 就重新开始堆。 */
  const runners = ['scripts/run-test-suite.mjs', 'scripts/run-affected-tests.mjs'];
  const root = path.resolve(import.meta.dirname, '../../../..');
  for (const rel of runners) {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.match(source, /createTempSandbox\(\)/, `${rel} 必须创建运行沙箱`);
    assert.match(source, /env:\s*sandbox\.env/, `${rel} 必须把沙箱 env 传给子进程`);
    assert.match(source, /disposeTempSandbox\(sandbox\.dir\)/, `${rel} 必须在退出时回收`);
  }
});
