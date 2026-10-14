import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  spawnCommand,
  spawnCommandWithInput,
  terminateChildTree,
  TASKKILL_TIMEOUT_MS,
} from '../../../lib/foundation/platform/process.mjs';

/* A18：结算预算按封顶总和推导 —— 750ms 触发 + TASKKILL_TIMEOUT_MS 封顶 + 2000ms 树消失轮询 + 300ms 余量。
   旧的 3000ms 常数预算写于 taskkill 封顶之前，在退化宿主（taskkill RPC 自限时 ~60s）下会误报；
   推导预算仍能抓住 A18 指向的 60s 级回归，健康机器实测远低于它。 */
const SETTLE_BUDGET_MS = 750 + TASKKILL_TIMEOUT_MS + 2000 + 300;

async function waitForExit(pid, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error?.code === 'ESRCH') return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

test('spawnCommandWithInput settles timed-out shell shims and reaps their worker', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-spawn-timeout-'));
  try {
    const workerPath = path.join(rootDir, 'worker.mjs');
    const pidPath = path.join(rootDir, 'worker.pid');
    await fs.writeFile(workerPath, [
      "import fs from 'node:fs';",
      `fs.writeFileSync(${JSON.stringify(pidPath)}, String(process.pid), 'utf8');`,
      "process.stdout.write('ready\\n');",
      'setInterval(() => {}, 1000);',
    ].join('\n'), 'utf8');

    const isWindows = process.platform === 'win32';
    const command = isWindows ? path.join(rootDir, 'hang.cmd') : process.execPath;
    const args = isWindows ? [] : [workerPath];
    if (isWindows) {
      await fs.writeFile(command, `@echo off\r\nnode "${workerPath}" %*\r\n`, 'utf8');
    }

    const startedAt = Date.now();
    const result = await spawnCommandWithInput(command, args, {
      input: '',
      timeoutMs: 750,
    });
    const elapsedMs = Date.now() - startedAt;

    assert.equal(result.timedOut, true);
    assert.match(result.stdout, /ready/);
    assert.ok(elapsedMs < SETTLE_BUDGET_MS, `timeout settled after ${elapsedMs}ms (budget ${SETTLE_BUDGET_MS}ms)`);

    const pid = Number.parseInt(await fs.readFile(pidPath, 'utf8'), 10);
    assert.equal(Number.isInteger(pid) && pid > 0, true);
    assert.equal(await waitForExit(pid), true);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});

test('spawnCommand settles a timed-out direct child', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-spawn-timeout-direct-'));
  try {
    const workerPath = path.join(rootDir, 'worker.mjs');
    const pidPath = path.join(rootDir, 'worker.pid');
    await fs.writeFile(workerPath, [
      "import fs from 'node:fs';",
      `fs.writeFileSync(${JSON.stringify(pidPath)}, String(process.pid), 'utf8');`,
      "process.stdout.write('ready\\n');",
      'setInterval(() => {}, 1000);',
    ].join('\n'), 'utf8');

    const startedAt = Date.now();
    const result = await spawnCommand(process.execPath, [workerPath], { timeoutMs: 750 });
    const elapsedMs = Date.now() - startedAt;

    assert.equal(result.timedOut, true);
    assert.match(result.stdout, /ready/);
    assert.ok(elapsedMs < SETTLE_BUDGET_MS, `timeout settled after ${elapsedMs}ms (budget ${SETTLE_BUDGET_MS}ms)`);

    const pid = Number.parseInt(await fs.readFile(pidPath, 'utf8'), 10);
    assert.equal(Number.isInteger(pid) && pid > 0, true);
    assert.equal(await waitForExit(pid), true);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});

test('spawnCommand kills grandchildren by process group so timed-out trees cannot orphan agents (POSIX)', { skip: process.platform === 'win32' }, async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-spawn-timeout-tree-'));
  try {
    const grandchildPath = path.join(rootDir, 'grandchild.mjs');
    const parentPath = path.join(rootDir, 'parent.mjs');
    const grandchildPidPath = path.join(rootDir, 'grandchild.pid');
    await fs.writeFile(grandchildPath, [
      'setInterval(() => {}, 1000);',
    ].join('\n'), 'utf8');
    /* 中文注释：父进程记录孙进程 pid 后自己常驻；超时必须把整组一起清掉。 */
    await fs.writeFile(parentPath, [
      "import fs from 'node:fs';",
      "import { spawn } from 'node:child_process';",
      `const child = spawn(process.execPath, [${JSON.stringify(grandchildPath)}], { stdio: 'ignore' });`,
      `fs.writeFileSync(${JSON.stringify(grandchildPidPath)}, String(child.pid), 'utf8');`,
      'setInterval(() => {}, 1000);',
    ].join('\n'), 'utf8');

    const startedAt = Date.now();
    const result = await spawnCommand(process.execPath, [parentPath], { timeoutMs: 1500 });
    const elapsedMs = Date.now() - startedAt;

    assert.equal(result.timedOut, true);
    assert.equal(result.treeAlive, false);
    assert.equal(typeof result.killEscalated, 'boolean');
    assert.ok(elapsedMs < 6000, `tree cleanup settled after ${elapsedMs}ms`);

    const grandchildPid = Number.parseInt(await fs.readFile(grandchildPidPath, 'utf8'), 10);
    assert.equal(Number.isInteger(grandchildPid) && grandchildPid > 0, true);
    assert.equal(await waitForExit(grandchildPid), true);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});

test('A18: the taskkill wait is capped and child.kill() fallback still reaps the tree (win32)', { skip: process.platform !== 'win32' }, async () => {
  // 预算关系钉定：封顶值必须留在结算预算内，防止被调回无界（taskkill 自身可挂 ~60s）。
  assert.ok(TASKKILL_TIMEOUT_MS >= 500 && TASKKILL_TIMEOUT_MS <= 2000, `TASKKILL_TIMEOUT_MS out of budget: ${TASKKILL_TIMEOUT_MS}`);

  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-spawn-timeout-cap-'));
  try {
    const workerPath = path.join(rootDir, 'worker.mjs');
    await fs.writeFile(workerPath, [
      "process.stdout.write('ready\\n');",
      'setInterval(() => {}, 1000);',
    ].join('\n'), 'utf8');

    const child = spawn(process.execPath, [workerPath], { windowsHide: true });
    await new Promise((resolve, reject) => {
      child.stdout.once('data', resolve);
      child.once('error', reject);
    });

    // 假慢杀手：模拟 A18 现场——taskkill 想挂 10s，但必须服从调用方传入的 timeout 上限。
    const seenTimeouts = [];
    const fakeTaskkillRunner = (command, args, options) => {
      assert.equal(command, 'taskkill');
      assert.deepEqual(args.slice(0, 2), ['/pid', String(child.pid)]);
      seenTimeouts.push(options?.timeout);
      const hangFor = Math.min(10_000, Number.isFinite(options?.timeout) ? options.timeout : 10_000);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, hangFor);
      return { status: 1 }; // taskkill “失败”，迫使 child.kill() 兜底
    };

    const startedAt = Date.now();
    const info = await terminateChildTree(child, { taskkillRunner: fakeTaskkillRunner, taskkillTimeoutMs: 300 });
    const elapsedMs = Date.now() - startedAt;

    assert.deepEqual(seenTimeouts, [300], 'the cap must be passed to the killer as its timeout');
    assert.ok(elapsedMs < 2600, `capped termination settled after ${elapsedMs}ms (fake hang 300ms + tree wait <= 2000ms)`);
    assert.equal(info.killEscalated, true, 'a failed taskkill must escalate');
    assert.equal(info.treeAlive, false, 'child.kill() fallback must still reap the worker');
    assert.equal(await waitForExit(child.pid), true);
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});
