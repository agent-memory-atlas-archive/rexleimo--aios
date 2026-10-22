/* 中文注释：工单 C4——投影状态必须成为 doctor 的一条可机读检查。
 * 为什么在 doctor 而不是只留一个 CLI：漂移工具要人**主动想到**去跑，而本仓库 6 份没人管的老副本
 * 恰恰是"没人想到要跑"才活下来的；绿灯把它们盖住了。doctor 是所有客户端都会跑的那一趟。
 * 机读 = 稳定 key=value 行，不是一句人话总结（只报总数就分不清"送达坏了"和"有人在手改"）。 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runDoctorSuite } from '../../../lib/environment/doctor/aggregate.mjs';

const PROJECTION_MARKER = '.rex-projection.json';

const OTHER_GATES = [
  'doctor:token-discipline',
  'doctor:shell',
  'doctor:skills',
  'doctor:native',
  'doctor:security',
  'doctor:bootstrap',
  'doctor:browser',
  'doctor:codemap',
  'doctor:mcp-build',
  'doctor:pi-bridge',
  'doctor:zcode-agents',
  'doctor:rex-workflow-surface',
].join(',');

/** 中文注释：安装侧与项目侧分开建，才能证明 doctor 把两个根都传给了度量——
 * 只传一个根的话它量的是"安装运行时 ↔ 自己的子模块 checkout"，那是发布加工差异，不是送达。 */
async function makeDoctorFixture({ skillDrift = false, unmanaged = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-doctor-drift-'));
  const installRoot = path.join(root, 'install');
  const projectRoot = path.join(root, 'project');
  const source = path.join(installRoot, 'rex-harness', 'skill-sources', 'rex-demo');
  const projected = path.join(projectRoot, '.agents', 'skills', 'rex-demo');

  await mkdir(path.join(installRoot, 'scripts'), { recursive: true });
  await writeFile(path.join(installRoot, 'scripts', 'aios.mjs'), '#!/usr/bin/env node\n', 'utf8');
  await mkdir(projected, { recursive: true });
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, 'SKILL.md'), '# source\n0. Load `rex-engineering-standards`.\n', 'utf8');
  await writeFile(
    path.join(projected, 'SKILL.md'),
    skillDrift ? '# stale delivered copy\n' : '# source\n0. Load `rex-engineering-standards`.\n',
    'utf8',
  );
  if (!unmanaged) {
    await writeFile(path.join(projected, PROJECTION_MARKER), JSON.stringify({
      schemaVersion: 1, packageVersion: '0.11.1', skillId: 'rex-demo',
    }), 'utf8');
  }
  return { root, installRoot, projectRoot };
}

async function runDoctor(fixture) {
  const logs = [];
  const result = await runDoctorSuite({
    rootDir: fixture.installRoot,
    projectRoot: fixture.projectRoot,
    profile: 'minimal',
    env: { AIOS_DISABLED_GATES: OTHER_GATES },
    io: { log: (line) => logs.push(String(line)) },
  });
  return { logs: logs.join('\n'), result };
}

test('doctor reports projection delivery as a machine-readable check', async () => {
  const fixture = await makeDoctorFixture({ skillDrift: true });
  try {
    const { logs } = await runDoctor(fixture);

    assert.match(logs, /\[check\] doctor:projection-drift/u,
      'doctor must carry a projection delivery check, not only a stand-alone CLI');
    assert.match(logs, /skillDrift=1[^\n]*unmanaged=0/u,
      'skill drift and unmanaged copies are different failures and must be counted separately on one line');
    assert.match(logs, /install-rex-client-projections\.mjs/u,
      'the report must carry the executable regeneration command, not "please regenerate"');
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('a clean projection reads ok and an unmanaged copy still reads as drift-free-but-visible', async () => {
  const clean = await makeDoctorFixture();
  const hand = await makeDoctorFixture({ skillDrift: true, unmanaged: true });
  try {
    const cleanRun = await runDoctor(clean);
    assert.match(cleanRun.logs, /doctor:projection-drift[\s\S]{0,220}?status: ok/u,
      'a faithful delivery must not warn');
    assert.match(cleanRun.logs, /skillDrift=0/u);

    const handRun = await runDoctor(hand);
    assert.match(handRun.logs, /doctor:projection-drift[\s\S]{0,220}?status: (warn|error)/u,
      'a hand-managed stale copy must not read as ok');
    assert.match(handRun.logs, /skillDrift=0[^\n]*unmanaged=1/u,
      'the unmanaged copy is not skill drift; conflating the two hides who owns the file');
  } finally {
    await rm(clean.root, { recursive: true, force: true });
    await rm(hand.root, { recursive: true, force: true });
  }
});
