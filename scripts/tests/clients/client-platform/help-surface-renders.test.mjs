import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/* 中文注释：这条测试是今天一次真实故障换来的守卫。
 * 我在 help 文案里写了反引号（`created_at`），而文案本身是 template literal——反引号把
 * 字符串提前关掉，模块变成 SyntaxError。它不会在 `node --check` 只查新文件时被发现，
 * 也要等到某个恰好 spawn CLI 的测试才炸；也就是说，**改文案等于改代码，但当时没人按代码验**。
 *
 * 逐文件 `node --check` 全仓实测 72.7s（1276 个 .mjs），不该进回归；所以这里用更对症、
 * 也更便宜的办法：真正把每个帮助主题**渲染一遍**。渲染要求模块能解析、switch 分支能命中、
 * 且产出确实是 help——一次动作覆盖三类缺陷。 */

const HELP_DIR = fileURLToPath(new URL('../../../lib/tooling/cli/help/commands/', import.meta.url));

function topicsFrom(moduleFile) {
  const source = fs.readFileSync(path.join(HELP_DIR, moduleFile), 'utf8');
  return [...source.matchAll(/^\s*case '([a-z0-9-]+)':/gm)].map((match) => match[1]);
}

const SURFACES = [
  ['basic.mjs', 'getBasicCommandHelpText'],
  ['maintenance.mjs', 'getMaintenanceCommandHelpText'],
  ['workflow.mjs', 'getWorkflowCommandHelpText'],
];

for (const [moduleFile, exportName] of SURFACES) {
  test(`${moduleFile}: every documented help topic renders real text`, async () => {
    const module = await import(new URL(`../../../lib/tooling/cli/help/commands/${moduleFile}`, import.meta.url).href);
    const build = module[exportName];
    assert.equal(typeof build, 'function', `${exportName} must be exported`);
    const topics = topicsFrom(moduleFile);
    assert.ok(topics.length > 0, `${moduleFile} declares no help topics`);
    for (const topic of topics) {
      const text = build(topic);
      assert.ok(text.length > 0, `topic "${topic}" rendered empty help`);
      assert.match(text, /Usage:/, `topic "${topic}" is missing a Usage block`);
    }
    // 未知主题必须返回空串，让调用方决定怎么报错——不能抛。
    assert.equal(build('definitely-not-a-real-command'), '');
  });
}

test('refs help documents the automatic sweep and its opt-in, not just the manual prune', async () => {
  const module = await import(new URL('../../../lib/tooling/cli/help/commands/maintenance.mjs', import.meta.url).href);
  const text = module.getMaintenanceCommandHelpText('refs');
  assert.match(text, /--dry-run/, 'the non-destructive mode has to be discoverable');
  assert.match(text, /AIOS_REFS_SWEEP=enforce/, 'deletion must be an explicit opt-in the user can find');
  assert.match(text, /ttl_days/, 'the real retention source, not just the global default');
  assert.match(text, /session close/, 'the automatic caller has to be documented where users look');
});
