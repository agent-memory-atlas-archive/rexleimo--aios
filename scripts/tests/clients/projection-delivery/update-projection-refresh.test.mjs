/* 中文注释：工单 C6——升级路径必须重生投影。为什么放在 update 而不是只靠 init：
 * 投影是**拷贝**，运行时一换，源侧就变了，而客户端读的还是旧拷贝；升级后不重生，就等于
 * 每个项目都要人记得再跑一次 init——本仓库那 6 份老副本就是这么来的。
 * 三条契约：升级成功后重生；从没投过影的项目不去凭空造投影；重生失败只 warn，
 * 因为运行时此刻**已经换好了**，把已成功的升级报成失败比漏一次重生危险得多。 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { updateHarnessRuntime } from '../../../lib/execution/lifecycle/setup/self-update.mjs';

const PROJECTION_MARKER = '.rex-projection.json';

/** 中文注释：`runCommandImpl` 是唯一接缝——记录每一次调用，不真跑任何进程。
 * 这样"升级流程里确实有一次重生调用"是执行出来的事实，不是 grep 出来的印象。 */
function recorder({ dirty = false, regenExitCode = 0 } = {}) {
  const calls = [];
  const runCommandImpl = async (cmd, args, opts = {}) => {
    calls.push({ cmd, args, cwd: opts.cwd });
    if (args[0] === 'status') return { stdout: dirty ? ' M x\n' : '', code: 0 };
    if (String(args[0] || '').endsWith('install-rex-client-projections.mjs') || args.includes('install-rex-client-projections.mjs')) {
      return { stdout: '', stderr: regenExitCode === 0 ? '' : 'installer exploded', code: regenExitCode };
    }
    return { stdout: '', code: 0 };
  };
  return { calls, runCommandImpl };
}

/** 中文注释：fixture 用 git 路径（.git 存在 → updateFromGit），因为它不需要网络也不需要安装器。 */
async function makeProject({ projected = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rex-update-proj-'));
  const installRoot = path.join(root, 'install');
  const projectRoot = path.join(root, 'project');
  await mkdir(path.join(installRoot, '.git'), { recursive: true });
  // 中文注释：真实安装运行时里这个文件一定存在，而刷新前有存在性守卫（installer-missing）——
  // 所以 fixture 必须诚实地造出它，而不是把守卫删掉让测试变绿。
  await mkdir(path.join(installRoot, 'scripts'), { recursive: true });
  await writeFile(
    path.join(installRoot, 'scripts', 'install-rex-client-projections.mjs'),
    '#!/usr/bin/env node\n',
    'utf8',
  );
  const source = path.join(installRoot, 'rex-harness', 'skill-sources', 'rex-demo');
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, 'SKILL.md'), '# source\n0. Load `rex-engineering-standards`.\n', 'utf8');
  if (projected) {
    const projectedDir = path.join(projectRoot, '.codex', 'skills', 'rex-demo');
    await mkdir(projectedDir, { recursive: true });
    await writeFile(path.join(projectedDir, 'SKILL.md'), '# stale delivered copy\n', 'utf8');
    await writeFile(path.join(projectedDir, PROJECTION_MARKER), JSON.stringify({
      schemaVersion: 1, packageVersion: '0.11.1', skillId: 'rex-demo',
    }), 'utf8');
  } else {
    await mkdir(projectRoot, { recursive: true });
  }
  return { root, installRoot, projectRoot };
}

test('a successful runtime update regenerates this project\'s rex projections', async () => {
  const fx = await makeProject();
  const { calls, runCommandImpl } = recorder();
  try {
    const result = await updateHarnessRuntime({
      rootDir: fx.installRoot, projectRoot: fx.projectRoot, runCommandImpl,
      io: { log: () => {}, error: () => {} },
    });

    assert.equal(result.updated, true, 'the fixture must actually take the update path');
    const regen = calls.find((call) => call.args.some((a) => String(a).includes('install-rex-client-projections.mjs')));
    assert.ok(regen, 'the update path must regenerate projections; a copy left behind is a stale standard');
    assert.ok(regen.args.includes('--project-root'), 'the regeneration must be told which project, not the install root');
    assert.ok(regen.args.includes(fx.projectRoot), 'the project root handed to the installer must be the caller\'s');
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test('a project that never had rex projections is not given them by an update', async () => {
  const fx = await makeProject({ projected: false });
  const { calls, runCommandImpl } = recorder();
  try {
    await updateHarnessRuntime({
      rootDir: fx.installRoot, projectRoot: fx.projectRoot, runCommandImpl,
      io: { log: () => {}, error: () => {} },
    });

    assert.equal(
      calls.some((call) => call.args.some((a) => String(a).includes('install-rex-client-projections.mjs'))),
      false,
      'updating the runtime must not install skills the user never opted into; that is init\'s decision',
    );
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test('a failing regeneration warns and never reports the update as failed', async () => {
  const fx = await makeProject();
  const lines = [];
  const { runCommandImpl } = recorder({ regenExitCode: 1 });
  try {
    const result = await updateHarnessRuntime({
      rootDir: fx.installRoot, projectRoot: fx.projectRoot, runCommandImpl,
      io: { log: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)) },
    });

    assert.equal(result.updated, true,
      'the runtime is already swapped by then; a failed refresh must not rewrite the upgrade outcome');
    assert.match(lines.join('\n'), /\[warn\].*projection/iu,
      'the refresh failure has to be visible, not swallowed');
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});
