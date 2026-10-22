/* 中文注释：行数这条规则必须只有一个 owner。
 * 本仓库此前有两套：清单/引擎的 physical lines + applyBudgetRule 处置，和 governance 自己
 * `trim()` 后比 `maxLines` 的第二套判定。实测两种定义在全部 50 条规则上计数完全一致
 * （0 条差异）——也就是说这第二条 owner 没带来任何一个不同的数字，只带来两种可能各自漂移的语义。
 * 这几条测试钉的是：行数的处置由引擎给出、豁免与存量来自项目配置、而 governance 不再自己判超标。 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { evaluateArchitectureGovernance } from '../../../lib/foundation/architecture/governance.mjs';

async function makeRoot({ files = {}, config = {} } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-arch-engine-'));
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await writeFile(path.join(root, rel), content, 'utf8');
  }
  if (Object.keys(config).length > 0) {
    await mkdir(path.join(root, 'config'), { recursive: true });
    await writeFile(path.join(root, 'config', 'standards.json'), JSON.stringify(config), 'utf8');
  }
  return root;
}

const RULE = {
  id: 'demo-facade',
  label: 'Demo Facade',
  path: 'scripts/lib/demo.mjs',
  maxLines: 2,
  requiredModules: [],
};
const OVER = 'line1\nline2\nline3\n';

test('an over-budget facade is reported through the engine disposition, not a local comparison', async () => {
  const root = await makeRoot({ files: { 'scripts/lib/demo.mjs': OVER } });
  try {
    const report = await evaluateArchitectureGovernance({ rootDir: root, rules: [RULE] });
    const check = report.checks[0];

    assert.equal(check.disposition, 'violation',
      '超标这件事必须由预算引擎给出处置，governance 不再自己比大小');
    assert.equal(check.count, 3, '行数用清单定义的 physical lines（尾随换行不额外计一行）');
    assert.equal(check.maxLines, 2,
      '每条 facade 声明的 maxLines 就是喂给引擎的那一次预算；不再新增一个同义 budget 字段');
    assert.equal(report.ok, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a facade exempted in the project config stops being a violation', async () => {
  const root = await makeRoot({
    files: { 'scripts/lib/demo.mjs': OVER },
    config: { exemptions: { fileLines: [{ path: 'scripts/lib/demo.mjs', reason: 'generated facade' }] } },
  });
  try {
    const report = await evaluateArchitectureGovernance({ rootDir: root, rules: [RULE] });

    assert.equal(report.checks[0].disposition, 'exempt', '豁免的唯一来源是项目配置');
    assert.equal(report.checks[0].reason, 'generated facade',
      '理由要跟着回到报告里，静默豁免等于同一条规则又有了第二个 owner');
    assert.equal(report.ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('stock over-budget facades are frozen, not silently forgiven and not blocking forever', async () => {
  const root = await makeRoot({
    files: { 'scripts/lib/demo.mjs': OVER },
    config: { baselines: { fileLines: [{ path: 'scripts/lib/demo.mjs', count: 3 }] } },
  });
  try {
    const report = await evaluateArchitectureGovernance({ rootDir: root, rules: [RULE] });

    assert.equal(report.checks[0].disposition, 'baseline');
    assert.match(report.detail, /baseline/iu, '存量必须在报告里看得见，否则基线就变成永久赦免');

    // 中文注释：基线只许收缩——长一行就得变红灯。
    await writeFile(path.join(root, 'scripts/lib/demo.mjs'), 'l1\nl2\nl3\nl4\n', 'utf8');
    const grew = await evaluateArchitectureGovernance({ rootDir: root, rules: [RULE] });
    assert.equal(grew.checks[0].disposition, 'violation');
    assert.match(grew.checks[0].failures.join(' '), /baseline 3/iu);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the fold keeps the other two judgement kinds it owns', async () => {
  const root = await makeRoot({ files: { 'scripts/lib/demo.mjs': 'l1\nl2\n' } });
  try {
    const missingEntrypoint = await evaluateArchitectureGovernance({
      rootDir: root,
      rules: [{ ...RULE, path: 'scripts/lib/gone.mjs' }],
    });
    assert.equal(missingEntrypoint.checks[0].status, 'FAIL', '入口文件不存在仍然是失败');

    const missingModule = await evaluateArchitectureGovernance({
      rootDir: root,
      rules: [{ ...RULE, maxLines: 5, requiredModules: ['scripts/lib/part.mjs'] }],
    });
    assert.match(missingModule.checks[0].failures.join(' '), /missing modules/iu,
      '模块归属不是预算，不该被塞进预算引擎');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
