/* 中文注释：可移植标准命令的门面测试。它要钉住的是本项立项的两条真缺陷：
 * C7 目标根必须由调用方决定（私有门过去把根钉成脚本自己的仓库，在别人仓库里报 AIOS 的数字且退 0）；
 * C8 取不到 tracked 列表时必须 SKIP，而不是用文件遍历猜一份口径。
 * 测试一律造 fixture 仓库，不依赖本仓库的数字——依赖自家仓库数字的测试，正是"只对这一个仓库成立"的形状。 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { fileURLToPath } from 'node:url';

import { evaluateBudgets } from '../../../check-dir-budget.mjs';

const TOOL = fileURLToPath(new URL('../../../aios-standards.mjs', import.meta.url));
const REPO = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

function runCli(args, cwd = REPO) {
  try {
    return { stdout: execFileSync(process.execPath, [TOOL, ...args], { cwd, encoding: 'utf8' }), code: 0 };
  } catch (error) {
    return { stdout: String(error.stdout ?? ''), code: error.status ?? 1 };
  }
}

async function makeGitFixture({ dirs, config = { budgets: {} } }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-std-fixture-'));
  const project = path.join(root, 'project');
  await mkdir(project, { recursive: true });
  // 中文注释：这些 fixture 测的是路由/退出码/报告形状，所以声明自己是**已配置项目**；
  // 命令层对从未写过 config/standards.json 的仓库只报不拦（exit 0），那是给用户的第一次体验，
  // 不是这里要的语义。想测那个默认宽请去 standards-command.test.mjs 的 --strict/--freeze 两条。
  await mkdir(path.join(project, 'config'), { recursive: true });
  await writeFile(path.join(project, 'config', 'standards.json'), JSON.stringify(config), 'utf8');
  const git = (args) => execFileSync('git', ['-C', project, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '--quiet']);
  git(['config', 'user.email', 'test@example.invalid']);
  git(['config', 'user.name', 'Test Fixture']);
  for (const entry of dirs) {
    const target = path.join(project, entry.dir);
    await mkdir(target, { recursive: true });
    for (const file of entry.files) {
      await writeFile(path.join(target, file), entry.content ?? 'export const x = 1;\n', 'utf8');
    }
  }
  git(['add', '-A']);
  git(['commit', '--quiet', '-m', 'fixture']);
  return { root, project };
}

async function cleanup(root) {
  await rm(root, { recursive: true, force: true });
}

test('the command reports the target repository, not the one the script lives in (C7)', async () => {
  // 中文注释：9 个条目的 fixture 目录 > 预算 8。如果命令还钉着自己的仓库，这里既不会变红，
  // 也不会出现 fixture 的路径——那正是过去实测到的形状（在非 git 临时目录跑私有门，它输出 767 dirs 并退出 0）。
  const fx = await makeGitFixture({ dirs: [{ dir: 'wide', files: ['a.mjs', 'b.mjs', 'c.mjs', 'd.mjs', 'e.mjs', 'f.mjs', 'g.mjs', 'h.mjs', 'i.mjs'] }] });
  try {
    const out = runCli(['--root', fx.project, '--rule', 'directoryEntries', '--json']);
    const report = JSON.parse(out.stdout.trim().split('\n')[0]);

    assert.equal(report.root, fx.project, 'the measured root must be the caller\'s');
    assert.equal(report.blocking, 1, JSON.stringify(report.violations));
    assert.equal(report.violations[0].path, 'wide');
    assert.equal(report.violations[0].kind, 'new');
    assert.equal(out.code, 1, 'a real violation in the target repo must fail, not read as ok');
  } finally {
    await cleanup(fx.root);
  }
});

test('a directory without git reads SKIP and exits 0 (C8)', () => {
  // 中文注释：SKIP 不是"没检查"的委婉说法：它给出原因，让人知道为什么这条门在这里不适用。
  const out = runCli(['--root', os.tmpdir(), '--rule', 'directoryEntries', '--json']);
  const report = JSON.parse(out.stdout.trim().split('\n')[0]);

  assert.equal(out.code, 0, 'unmeasurable must not be reported as a violation');
  assert.equal(report.status, 'skip');
  assert.match(report.reason, /not a git work tree/u);
  assert.equal(report.measured, null, 'SKIP 时不得给出任何度量数字');
});

test('a project config with an unknown section fails loudly instead of running on defaults', async () => {
  const fx = await makeGitFixture({ dirs: [{ dir: 'ok', files: ['a.mjs'] }] });
  try {
    await mkdir(path.join(fx.project, 'config'), { recursive: true });
    await writeFile(
      path.join(fx.project, 'config', 'standards.json'),
      JSON.stringify({ budget: { directoryEntries: 4 } }),
      'utf8',
    );

    const out = runCli(['--root', fx.project, '--rule', 'directoryEntries']);

    assert.equal(out.code, 1, 'a silently ignored config is the second-owner defect all over again');
    assert.match(out.stdout, /unknown-key/u);
  } finally {
    await cleanup(fx.root);
  }
});

test('the host adapter keeps the legacy verdict shape while the engine owns the judgement', () => {
  const counts = new Map([['ok-dir', 8], ['new-bad', 9]]);
  const { failures } = evaluateBudgets(counts, { budget: 8, exemptions: {}, baseline: {} });
  assert.deepEqual(failures, [{ dir: 'new-bad', count: 9, kind: 'new', detail: 'new-bad: 9 > budget 8' }],
    'CI 读的形状保持稳定，判定却在引擎里——迁移不能靠改测试来"通过"');
});
