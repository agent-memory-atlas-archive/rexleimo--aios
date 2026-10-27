import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

/* 中文注释：裸 `aios`（无参数）在非 TTY 下必须打印根帮助并退 1，而不是 ReferenceError。
 * 回归来源：dispatch.mjs 从单文件拆成 barrel 时把 getRootHelpText 的 import 丢了，
 * 唯一触发该分支的路径（bare aios / 非交互启动）没有测试，ReferenceError 直接裸奔到用户终端。
 * 断言钉在真实子进程上：注入式单测看不见跨模块 import 缺失。 */

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\//u, ''));
const repoRoot = path.resolve(here, '..', '..', '..', '..');
const cliPath = path.join(repoRoot, 'scripts/aios.mjs');

test('bare aios without a TTY prints the root help and exits 1, never a ReferenceError', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'aios-bare-help-'));
  await mkdir(path.join(home, '.aios', 'bin'), { recursive: true });
  try {
    const result = spawnSync(process.execPath, [cliPath], {
      encoding: 'utf8',
      cwd: repoRoot,
      timeout: 60_000,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        AIOS_PROJECT_ROOT: home,
      },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\[warn\] interactive TUI requires a TTY/u);
    assert.match(result.stdout, /AIOS unified entry/u);
    assert.match(result.stdout, /Usage:/u);
    for (const stream of [result.stdout, result.stderr]) {
      assert.doesNotMatch(stream, /ReferenceError/u);
      assert.doesNotMatch(stream, /is not defined/u);
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
