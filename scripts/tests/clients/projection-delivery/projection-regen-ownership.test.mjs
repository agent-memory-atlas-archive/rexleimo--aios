/* 中文注释：工单 C6 的真正契约。`aios update` 早就在 skills 组件里重生投影
 * （runUpdate → installRexClientProjections），所以这里担保的是**那条既有路径**：
 * 它必须带调用方的项目根、必须在运行时替换之后跑。
 * 本轮我先犯过一次：在 self-update 里又加了一条"升级后刷新"，与既有路径变成两个 owner
 * 管同一条规则，而且新那条靠隐式 cwd 定位项目——已删除，测试改成守卫既有路径的时序与参数。 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { inspectProjectionDelivery } from '../../../lib/environment/doctor/aggregate/projection-drift-gate.mjs';
import { projectionRegenCommand } from '../../../lib/clients/rex-harness/projection-drift.mjs';
import { runUpdate } from '../../../lib/execution/lifecycle/setup/update.mjs';

const QUIET = { log: () => {}, error: () => {} };

/** 中文注释：安装侧有源、项目侧有带 marker 的旧拷贝——这才是"送达落后"的最小真实形状。 */
async function driftFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-regen-'));
  const installRoot = path.join(root, 'install');
  const projectRoot = path.join(root, 'project');
  const source = path.join(installRoot, 'rex-harness', 'skill-sources', 'rex-demo');
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, 'SKILL.md'), '# source\n', 'utf8');
  const projected = path.join(projectRoot, '.codex', 'skills', 'rex-demo');
  await mkdir(projected, { recursive: true });
  await writeFile(path.join(projected, 'SKILL.md'), '# stale delivered copy\n', 'utf8');
  await writeFile(path.join(projected, '.rex-projection.json'), JSON.stringify({
    schemaVersion: 1, packageVersion: '0.11.1', skillId: 'rex-demo',
  }), 'utf8');
  return { root, installRoot, projectRoot };
}

test('aios update regenerates projections for the caller\'s project root, after the runtime update', async () => {
  const calls = [];
  await runUpdate({
    selfUpdate: true,
    components: ['skills'],
    skipDoctor: true,
  }, {
    rootDir: '/tmp/aios-install',
    projectRoot: '/tmp/my-project',
    io: QUIET,
    deps: {
      updateHarnessRuntime: async () => {
        calls.push('runtime');
        return { updated: false, skipped: true };
      },
      installContextDbSkills: async () => {},
      installRexClientProjections: async () => {
        calls.push('projections');
      },
    },
  });

  assert.deepEqual(calls, ['runtime', 'projections'],
    '源侧要到运行时替换之后才是新的；先重生就是把旧技能再拷一遍');
});

test('the regeneration is told which project, never the install root by accident', async () => {
  const seen = [];
  await runUpdate({
    components: ['skills'],
    skipSelfUpdate: true,
    skipDoctor: true,
  }, {
    rootDir: '/tmp/aios-install',
    projectRoot: '/tmp/my-project',
    io: QUIET,
    deps: {
      installContextDbSkills: async () => {},
      installRexClientProjections: async (options) => {
        seen.push(options);
      },
    },
  });

  assert.equal(seen.length, 1, '一次升级只能重生一次');
  assert.equal(seen[0].projectRoot, '/tmp/my-project',
    '拿安装根当项目根，就等于升级看起来成功而客户端继续读旧拷贝');
  assert.equal(seen[0].rootDir, '/tmp/aios-install');
});

test('the doctor fix line reuses the shared regeneration command', async () => {
  // 中文注释：单 owner 的证明不是 grep 计数，而是让两个消费者各自产出命令再要求逐字相同。
  // fixture 必须真的处于"该重生"状态，否则会走到另一条 remedy 分支，断言什么也没测。
  const fx = await driftFixture();
  try {
    const doctor = inspectProjectionDelivery({ installRoot: fx.installRoot, projectRoot: fx.projectRoot });
    const expected = projectionRegenCommand({ installRoot: fx.installRoot, projectRoot: fx.projectRoot }).join(' ');

    assert.equal(doctor.drifted, true, 'fixture must be in a regenerate-worthy state');
    assert.match(doctor.fix, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'),
      'doctor 必须复用共享的命令拼法，而不是自己再拼一遍');
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test('an unmeasurable delivery warns instead of reading as zero drift', async () => {
  // 中文注释：checked=0 时说"没有漂移"是没测——C9 的口径补到门这一侧。
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-unmeasured-'));
  const projectRoot = path.join(root, 'project');
  await mkdir(path.join(projectRoot, '.codex', 'skills', 'rex-demo'), { recursive: true });
  try {
    const report = inspectProjectionDelivery({ installRoot: root, projectRoot });
    assert.equal(report.drifted, true,
      '项目里有副本而安装侧没有源，不能报成"送达完好"');
    assert.match(report.fix, /^Repair: /u,
      '测不了就不该递出一条注定失败的重生命令');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a project that uses no rex skills is not nagged about delivery', async () => {
  // 中文注释：反面也要钉住——不用 rex 的项目不该因为这条新门而被噪。
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-noproject-'));
  try {
    const report = inspectProjectionDelivery({ installRoot: root, projectRoot: root });
    assert.equal(report.checked, 0, 'a project without skill dirs contributes no entries');
    assert.equal(report.drifted, false, '没有投递义务就不是漂移');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
