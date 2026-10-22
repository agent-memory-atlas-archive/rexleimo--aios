import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

// 中文注释：判定本体在子模块测（tests/domain/duplication.test.mjs）。这里只测**父侧接缝**：
// 工单要求的验收命令就是这条路由，所以"复制成块即红、提取共享结构后转绿"必须在
// `aios standards` 这条真实入口上再证一次，而不是只在引擎内部证。
const ENTRY = path.join(process.cwd(), 'scripts/aios.mjs');

// 6 行归一化文本相同 = 命中窗口（阈值来自子模块清单，改阈值会在这里变红，不会悄悄漂）。
const SHARED = [
  'export function settleTurn(state) {',
  '  const pending = state.pending ?? [];',
  '  const settled = pending.filter((item) => item.settled);',
  '  state.counters.settled = settled.length;',
  '  state.pending = pending.filter((item) => !item.settled);',
  '  return { settled: settled.length, pending: state.pending.length };',
  '}',
].join('\n');

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

async function repo({ config, duplicate = true }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'std-dup-'));
  await mkdir(path.join(root, 'src'), { recursive: true });
  const files = { 'src/a.mjs': `${SHARED}\n`, 'src/b.mjs': `${SHARED}\n` };
  if (!duplicate) {
    // 中文注释：提取共享结枃 = 副本都消失，只留一个持有那块代码的文件；
    // 只改一半（a 还是副本）就仍然是重复，那不是转绿而是 fixture 本身写错了。
    files['src/a.mjs'] = 'import { settleTurn } from "./settle.mjs";\nexport default settleTurn;\n';
    files['src/b.mjs'] = 'import { settleTurn } from "./settle.mjs";\nexport const handler = settleTurn;\n';
    files['src/settle.mjs'] = `${SHARED}\n`;
  }
  for (const [rel, content] of Object.entries(files)) {
    await writeFile(path.join(root, rel), content, 'utf8');
  }
  if (config) {
    await mkdir(path.join(root, 'config'), { recursive: true });
    await writeFile(path.join(root, 'config', 'standards.json'), JSON.stringify(config), 'utf8');
  }
  const git = (args) => execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '--quiet']);
  git(['config', 'user.email', 'dup@example.invalid']);
  git(['config', 'user.name', 'Dup Fixture']);
  git(['add', '-A']);
  git(['commit', '--quiet', '-m', 'fixture']);
  return { root, run: (extra) => aios(['standards', '--root', root, '--rule', 'duplicateLines', ...extra], process.cwd()) };
}

test('a copied block turns red through the parent route and names both owners', async () => {
  const fx = await repo({});
  try {
    const run = fx.run([]);
    assert.equal(run.exitCode, 1, `父侧转发必须把子模块的红灯原样交出来：${run.stdout}${run.stderr ?? ''}`);
    assert.match(run.stdout, /\[standards\] FAIL duplicateLines src\/a\.mjs: 7 > budget 0/u, run.stdout);
    assert.match(run.stdout, /src\/b\.mjs: 7 > budget 0/u, '两个副本都要指名，只报总数就找不到该改谁');
    assert.match(run.stdout, /blocking=2 .*budget=0/u, run.stdout);
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test('extracting the shared block turns the same route green', async () => {
  // 中文注释：同一个 fixture 目录形状、同一批行文本，只改"副本→共享模块"就转绿：
  // 证的是这条度量真的在读重复，而不是在读文件数量。
  const fx = await repo({ duplicate: false });
  try {
    const run = fx.run([]);
    assert.equal(run.exitCode, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /\[standards\] duplicateLines: measured=0/u, run.stdout);
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test('a false positive leaves through the declared disposition, not through silence', async () => {
  const exempt = [
    { path: 'src/a.mjs', reason: 'generated twin kept for wire compatibility' },
    { path: 'src/b.mjs', reason: 'generated twin kept for wire compatibility' },
  ];
  const fx = await repo({ config: { exemptions: { duplicateLines: exempt } } });
  try {
    const run = fx.run([]);
    assert.equal(run.exitCode, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /exempt=2/u, run.stdout);
    const json = fx.run(['--json']);
    const record = JSON.parse(json.stdout.split('\n').find((line) => line.trim()));
    assert.deepEqual(record.exempt.map((item) => item.path).sort(), ['src/a.mjs', 'src/b.mjs']);
    assert.equal(record.exempt[0].reason, 'generated twin kept for wire compatibility',
      '豁免理由要跟着出来：没有理由的绿灯下次没人知道是谁放的水');
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});
