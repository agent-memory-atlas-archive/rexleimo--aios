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
