import assert from 'node:assert/strict';
import test from 'node:test';

import { parseHarnessArgs } from '../../../../../lib/tooling/cli/parse-args/run/harness.mjs';

/* 中文注释：穿过 parser 的用例。command-lifecycle.mjs 里的 dry-run 测试直接注入 options，
 * 因此它**测不到解析层**——而真实缺陷恰恰在那一层：harness 子命令开了 allowUnknownOption(true)，
 * `resume --dry-run` 被接受、不报错、也不生效，于是用户以为在跑只读检查，实际调起了真 provider。
 * 注入式测试能证明"命令函数正确"，只有穿过 parser 的断言能证明"用户打的这条命令正确"。 */

test('harness resume --dry-run survives the parser instead of being silently dropped', () => {
  const parsed = parseHarnessArgs(['harness', 'resume', '--session', 'guard-1', '--dry-run', '--json']);

  assert.equal(parsed.command, 'harness');
  assert.equal(parsed.options.subcommand, 'resume');
  assert.equal(parsed.options.dryRun, true,
    '--dry-run must reach the command layer; an accepted-but-ignored cost guard is worse than an error');
  assert.equal(parsed.options.sessionId, 'guard-1');

  // 反例：不带 --dry-run 时必须保持 false，否则这条断言只是在跟着默认值走。
  const plain = parseHarnessArgs(['harness', 'resume', '--session', 'guard-1']);
  assert.equal(plain.options.dryRun, false, 'dry-run stays opt-in');
});

test('harness run --dry-run keeps its existing mapping', () => {
  const parsed = parseHarnessArgs(['harness', 'run', '--objective', 'x', '--session', 'guard-2', '--dry-run']);
  assert.equal(parsed.options.subcommand, 'run');
  assert.equal(parsed.options.dryRun, true, 'the run branch was already correct; this pins it against drift');
});
