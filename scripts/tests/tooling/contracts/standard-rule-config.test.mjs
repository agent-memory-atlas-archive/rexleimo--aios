/* 中文注释：这是 test-design 阶段登记的「诚实 RED 候选」，不是实现。
 * 公共入口按仓库契约就是 `rex-harness/src/index.mjs`（CONTEXT.md「公开面」：父仓库唯一允许 import
 * 的子模块入口），所以这里引的是公开面本体，不是 deep import 内部模块。
 * 它今天必须红，而且红的理由必须是行为差异：公开面没有导出规则清单，
 * 于是"目录 8 / 单文件 400"这两个数字没有单一权威（父侧常量或口头约定都是第二权威）。
 * 不允许把红写成"模块解析不到"之类的假失败。 */
import assert from 'node:assert/strict';
import test from 'node:test';

const PUBLIC_FACE = new URL('../../../../rex-harness/src/index.mjs', import.meta.url).href;

test('rex public face exposes the quantitative standard rule manifest', async () => {
  const rex = await import(PUBLIC_FACE);

  // 这条断言即 B1 的红：默认预算必须由公开面提供，父侧不得自写一份。
  assert.ok(
    rex.QUANTITATIVE_STANDARD_RULES,
    '公开面未导出 QUANTITATIVE_STANDARD_RULES：目录 8 / 单文件 400 没有单一权威',
  );

  const manifest = rex.QUANTITATIVE_STANDARD_RULES;
  assert.equal(manifest.directoryEntries.budget, 8, '目录条目预算应为 8');
  assert.equal(manifest.fileLines.budget, 400, '单文件行数预算应为 400（标准 §4 软上限）');
});

test('project config parser rejects unknown keys, illegal budgets and reason-less exemptions', async () => {
  const rex = await import(PUBLIC_FACE);

  // C3 的红：第一轮根本没有解析器，未知键被静默忽略（实测 { fileLines.nonsense: 99 } 返回 400）。
  assert.equal(typeof rex.resolveStandardConfig, 'function',
    '公开面必须提供 resolveStandardConfig，否则项目侧配置得不到结构化错误');

  const cases = [
    ['unknown-key', { budgets: { directoryEntries: 10 }, budgets_x: {} }],
    ['invalid-budget', { budgets: { fileLines: -1 } }],
    ['invalid-budget', { budgets: { fileLines: 1.5 } }],
    // 中文注释：0 不再是非法值：零容忍是合法声明（重复行规则的预算就是 0）。拿 0 当反例
    // 会把产品能力当成 bug 锁住，所以这里同时钉住两头。-1 与 1.5 仍然是非法。
    ['missing-reason', { exemptions: { fileLines: [{ path: 'src/tables.ts' }] } }],
  ];
  assert.equal(rex.resolveStandardConfig({ budgets: { duplicateLines: 0 } }).ok, true,
    '预算 0 必须合法：否则零容忍规则无法在清单里声明');
  for (const [code, config] of cases) {
    const result = rex.resolveStandardConfig(config);
    assert.equal(result.ok, false, `${code} must be rejected`);
    assert.ok(result.errors.some((e) => e.code === code),
      `expected a structured ${code} error, got ${JSON.stringify(result.errors)}`);
  }

  // 合法输入：覆盖项生效，未覆盖项回到清单默认值。
  const ok = rex.resolveStandardConfig({ budgets: { fileLines: 500 } });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  assert.equal(ok.budgets.fileLines, 500);
  assert.equal(ok.budgets.directoryEntries, rex.QUANTITATIVE_STANDARD_RULES.directoryEntries.budget);
});

test('the parent reads its directory budget from the public face, not a second literal', async () => {
  const [rex, parent] = await Promise.all([
    import(PUBLIC_FACE),
    import('../../../check-dir-budget.mjs'),
  ]);
  assert.equal(parent.DEFAULT_BUDGET, rex.QUANTITATIVE_STANDARD_RULES.directoryEntries.budget,
    'C1：父侧读到的默认值必须与子模块清单逐项相等（一条规则只有一个 owner）');
});
