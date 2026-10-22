import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

// 中文注释：方向判定本体在子模块测（tests/domain/layer-declaration.test.mjs）。
// 这里测工单点名的那条验收路径：分层声明 + 边快照 + 父侧唯一入口 = 红灯；
// 缺任一份输入 = SKIP 且必须说清缺的是哪一份（不能把"没数据"报成"很干净"）。
const ENTRY = path.join(process.cwd(), 'scripts/aios.mjs');
const EDGES_RELATIVE = path.join('.aios', 'standards', 'module-edges.json');
const LAYERS = { order: ['host', 'kernel'], prefixes: { src: 'host', 'src/kernel': 'kernel' } };

function aios(args, cwd) {
  try {
    const stdout = execFileSync(process.execPath, [ENTRY, ...args], {
      cwd, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout };
  } catch (error) {
    return { exitCode: error.status ?? -1, stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? '') };
  }
}

async function repo({ layers = LAYERS, edges = { 'src/kernel/core.mjs': ['src/host/app.mjs'] } }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'std-layer-'));
  for (const dir of ['src/host', 'src/kernel', 'config']) {
    await mkdir(path.join(root, dir), { recursive: true });
  }
  // 外层指内层 = 正常方向，但让宿主文件真的有一条 import，这样 --write-edges 生成的图不是空表。
  await writeFile(path.join(root, 'src/host/app.mjs'), "import { core } from '../kernel/core.mjs';\nexport const app = core;\n", 'utf8');
  await writeFile(path.join(root, 'src/kernel/core.mjs'), 'export const core = 1;\n', 'utf8');
  // 中文注释：这个 fixture 永远处于“已配置”状态：没声明 layers 时写空配置，这样“没声明”这件事
  // 只能由 SKIP 原因说出来，不会被“整个仓库还没配置”掩盖成另一种语义。
  await writeFile(path.join(root, 'config/standards.json'), JSON.stringify(layers ? { layers } : { budgets: {} }), 'utf8');
  if (edges) {
    await mkdir(path.dirname(path.join(root, EDGES_RELATIVE)), { recursive: true });
    await writeFile(path.join(root, EDGES_RELATIVE), JSON.stringify(edges), 'utf8');
  }
  const git = (args) => execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '--quiet']);
  git(['config', 'user.email', 'layer@example.invalid']);
  git(['config', 'user.name', 'Layer Fixture']);
  git(['add', '-A']);
  git(['commit', '--quiet', '-m', 'fixture']);
  return { root, run: (extra = []) => aios(['standards', '--root', root, '--rule', 'reverseDependencies', ...extra], process.cwd()) };
}

test('a declared layer order plus a graph in the agreed place turns the inner-to-outer edge red', async () => {
  const fx = await repo({});
  try {
    const run = fx.run();
    assert.equal(run.exitCode, 1, `反向依赖必须把红灯交到父进程：${run.stdout}${run.stderr ?? ''}`);
    assert.match(run.stdout, /FAIL reverseDependencies src\/kernel\/core\.mjs: 1 > budget 0/u, run.stdout);
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test('an outward-pointing edge in the same repository reads clean', async () => {
  // 中文注释：只改边方向（host→kernel）就转绿：证红灯来自方向判定，不是来自"有边就红"。
  const fx = await repo({ edges: { 'src/host/app.mjs': ['src/kernel/core.mjs'] } });
  try {
    const run = fx.run();
    assert.equal(run.exitCode, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /reverseDependencies: measured=0 .*blocking=0/u, run.stdout);
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test('no layer declaration is a skip that names the missing input, not a violation and not a pass', async () => {
  const fx = await repo({ layers: null });
  try {
    const run = fx.run();
    assert.equal(run.exitCode, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /SKIP reverseDependencies: the project config declares no `layers` section/u, run.stdout);
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test('a declaration without a graph is a skip that names the graph as the missing input', async () => {
  const fx = await repo({ edges: null });
  try {
    const run = fx.run();
    assert.equal(run.exitCode, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /SKIP reverseDependencies: no module graph supplied/u, run.stdout);
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test('the route generates the graph itself, so a third repository needs no host help', async () => {
  const fx = await repo({ edges: null });
  try {
    const written = aios(['standards', '--root', fx.root, '--write-edges'], process.cwd());
    assert.equal(written.exitCode, 0, written.stdout + written.stderr);
    assert.match(written.stdout, /wrote .* edge entries to /u, written.stdout);
    const run = fx.run(['--json']);
    assert.equal(run.exitCode, 0, run.stdout + run.stderr);
    const record = JSON.parse(run.stdout.split('\n').find((line) => line.trim()));
    assert.equal(record.status, 'ok', '自己生成的图（host→kernel 正向）不该把这条规则判红');
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});
