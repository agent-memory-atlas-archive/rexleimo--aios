import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile, writeFile as write } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

// 中文注释：父侧只有一条**转发**，所以这里断言的全是"转发没把契约弄丢"：
// 退出码逐字透传、--json 记录原样、无 git 时 SKIP 且退 0、命令在根 help 里登记过。
// 判定本身不在这里测（那是子模块 tests/standards 的职责），此处测的是接缝。
const ENTRY = path.join(process.cwd(), 'scripts/aios.mjs');

function aios(args, cwd = process.cwd()) {
  try {
    const stdout = execFileSync(process.execPath, [ENTRY, ...args], {
      cwd, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout };
  } catch (error) {
    return { exitCode: error.status ?? -1, stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? '') };
  }
}

async function gitFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'std-route-'));
  const repo = path.join(root, 'repo');
  await mkdir(path.join(repo, 'wide'), { recursive: true });
  for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']) {
    await writeFile(path.join(repo, 'wide', `${name}.mjs`), 'export const x = 1;\n', 'utf8');
  }
  const git = (args) => execFileSync('git', ['-C', repo, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '--quiet']);
  git(['config', 'user.email', 'route@example.invalid']);
  git(['config', 'user.name', 'Route Fixture']);
  git(['add', '-A']);
  git(['commit', '--quiet', '-m', 'over budget directory']);
  return { root, repo };
}

test('a violation in the target repository reaches the parent process exit code', async () => {
  const fx = await gitFixture();
  try {
    const run = aios(['standards', '--root', fx.repo, '--rule', 'directoryEntries']);
    assert.equal(run.exitCode, 1, `转发必须把子模块的 1 原样交出来：${run.stdout}${run.stderr ?? ''}`);
    assert.match(run.stdout, /\[standards\] FAIL directoryEntries wide: 9 > budget 8/u);
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test('--json records survive the forwarding layer unchanged', async () => {
  const fx = await gitFixture();
  try {
    const run = aios(['standards', '--root', fx.repo, '--rule', 'directoryEntries', '--json']);
    assert.equal(run.exitCode, 1);
    const records = run.stdout.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));
    assert.equal(records.length, 1);
    assert.equal(records[0].status, 'fail');
    assert.equal(records[0].root, fx.repo);
    assert.equal(records[0].budget, 8);
    assert.equal(records[0].violations[0].path, 'wide');
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test('a directory that is not a git work tree is skipped with exit 0, not measured by guesswork', async () => {
  const plain = await mkdtemp(path.join(os.tmpdir(), 'std-plain-'));
  try {
    await write(path.join(plain, 'loose.mjs'), 'export const x = 1;\n', 'utf8');
    const run = aios(['standards', '--root', plain, '--rule', 'directoryEntries']);
    assert.equal(run.exitCode, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /\[standards\] SKIP directoryEntries: not a git work tree/u);
  } finally {
    await rm(plain, { recursive: true, force: true });
  }
});

test('the command is registered in the root help instead of staying a hidden entry', () => {
  const run = aios(['--help']);
  assert.equal(run.exitCode, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /aios standards check/u,
    '命令没进 help 就等于没有入口——work-cli-surface 要的"唯一入口"包含可发现性');
});
