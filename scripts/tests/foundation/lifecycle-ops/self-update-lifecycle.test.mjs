import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ensureWorkingDirectoryOutsideInstallTree, updateHarnessRuntime } from '../../../lib/execution/lifecycle/setup/self-update.mjs';

// 中文注释：macOS 的 TMPDIR（/var/...）是符号链接，chdir 后 process.cwd() 返回
// 解析路径（/private/var/...）；temp 根必须先 realpath，否则与库内 path.resolve 比较不一致。
const TMP_BASE = await realpath(os.tmpdir());

// 中文注释：测试沙箱用完即回收。不留的话，每跑一次全量就在 %TEMP% 堆一批
// aios-selfupdate-* / aios-dl-*（本机实测一次清出 856 个、21MB）。
async function tempRoot(prefix, t) {
  const dir = await mkdtemp(path.join(TMP_BASE, prefix));
  if (t && typeof t.after === 'function') t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function fakeRunner({ statusStdout = '' } = {}) {
  const calls = [];
  const run = async (command, args, options = {}) => {
    const key = [command, ...args].join(' ');
    calls.push(key);
    if (key === 'git status --porcelain') return { stdout: statusStdout, stderr: '' };
    return { stdout: '', stderr: '' };
  };
  run.calls = calls;
  return run;
}

test('ensureWorkingDirectoryOutsideInstallTree moves cwd out of the install tree', async (t) => {
  const root = await tempRoot('aios-selfupdate-', t);
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  const previousCwd = process.cwd();
  try {
    process.chdir(root);
    const logs = [];
    const moved = ensureWorkingDirectoryOutsideInstallTree(root, { log: (line) => logs.push(line) });

    assert.equal(moved, true);
    assert.notEqual(process.cwd(), root);
    assert.equal(process.cwd().startsWith(root + path.sep), false);
    assert.equal(logs.some((line) => line.includes('moved working directory out of install tree')), true);
  } finally {
    process.chdir(previousCwd);
  }
});

test('ensureWorkingDirectoryOutsideInstallTree moves cwd when inside a subdirectory of the install tree', async (t) => {
  const root = await tempRoot('aios-selfupdate-', t);
  const nested = path.join(root, 'scripts');
  await mkdir(nested, { recursive: true });
  const previousCwd = process.cwd();
  try {
    process.chdir(nested);
    const moved = ensureWorkingDirectoryOutsideInstallTree(root, { log: () => {} });

    assert.equal(moved, true);
    assert.equal(process.cwd().startsWith(root + path.sep), false);
  } finally {
    process.chdir(previousCwd);
  }
});

test('ensureWorkingDirectoryOutsideInstallTree keeps cwd when already outside', async (t) => {
  const root = await tempRoot('aios-selfupdate-', t);
  const previousCwd = process.cwd();
  try {
    const moved = ensureWorkingDirectoryOutsideInstallTree(root, { log: () => {} });

    assert.equal(moved, false);
    assert.equal(process.cwd(), previousCwd);
  } finally {
    process.chdir(previousCwd);
  }
});

test('git-path self-update syncs the rex-harness submodule worktree after pull', async (t) => {
  const root = await tempRoot('aios-selfupdate-', t);
  await mkdir(path.join(root, '.git'), { recursive: true });
  const run = fakeRunner();
  const logs = [];

  const result = await updateHarnessRuntime({
    rootDir: root,
    io: { log: (line) => logs.push(line), error: () => {} },
    runCommandImpl: run,
  });

  assert.equal(result.method, 'git');
  assert.equal(result.updated, true);
  assert.equal(result.submodulesSynced, true);
  assert.deepEqual(run.calls, [
    'git status --porcelain',
    'git pull --ff-only',
    'git submodule update --init --recursive',
  ]);
});

test('git-path self-update skips all mutations when the worktree is dirty', async (t) => {
  const root = await tempRoot('aios-selfupdate-', t);
  await mkdir(path.join(root, '.git'), { recursive: true });
  const run = fakeRunner({ statusStdout: ' M scripts/aios.mjs\n' });

  const result = await updateHarnessRuntime({
    rootDir: root,
    io: { log: () => {}, error: () => {} },
    runCommandImpl: run,
  });

  assert.equal(result.skipped, true);
  assert.deepEqual(run.calls, ['git status --porcelain']);
});

test('install-tree self-update uses the release installer and never git commands', async (t) => {
  const root = await tempRoot('aios-selfupdate-', t);
  const run = fakeRunner();

  const result = await updateHarnessRuntime({
    rootDir: root,
    io: { log: () => {}, error: () => {} },
    runCommandImpl: run,
    resolveNewestRelease: async () => null,
    // win32 分支会先试 Node 暂存：给个报失败的桩，让它走安装器下载回退，
    // 断言重点仍是“只跑安装器、不跑 git”。
    downloadImpl: async (t) => { throw new Error('stub: no network in tests'); },
  });

  assert.equal(result.method, 'release-installer');
  assert.equal(result.updated, true);
  assert.equal(run.calls.filter((key) => key.startsWith('git ')).length, 0);
  if (process.platform === 'win32') {
    assert.equal(run.calls[0].startsWith('powershell '), true);
  } else {
    assert.equal(run.calls[0].startsWith('bash -lc set -o pipefail; curl -fsSL https://github.com/'), true);
    assert.equal(run.calls[0].includes('/releases/latest/download/aios-install.sh'), true);
  }
});

test('install-tree self-update refuses to downgrade when releases/latest is older than installed', async (t) => {
  const root = await tempRoot('aios-selfupdate-', t);
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(root, 'VERSION'), '5.17.0\n', 'utf8');
  const run = fakeRunner();
  const logs = [];

  const result = await updateHarnessRuntime({
    rootDir: root,
    io: { log: (line) => logs.push(line), error: () => {} },
    runCommandImpl: run,
    // 模拟 GitHub latest 指针被补发的 v5.16.2 抢占。
    resolveNewestRelease: async () => ({ tag: 'v5.16.2', version: '5.16.2', security: false }),
  });

  assert.equal(result.updated, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'not-newer-than-installed');
  assert.equal(result.remoteVersion, '5.16.2');
  assert.equal(run.calls.filter((key) => key.includes('curl') || key.startsWith('powershell ')).length, 0);
  assert.equal(logs.some((line) => line.includes('refusing to downgrade')), true);
});

test('install-tree self-update pins the asset URL to the exact newest tag', async (t) => {
  const root = await tempRoot('aios-selfupdate-', t);
  const stageBase = await tempRoot('aios-selfupdate-stage-', t);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(root, 'VERSION'), '5.16.2\n', 'utf8');
  const run = fakeRunner();
  const envs = [];
  const downloadCalls = [];
  const recordingRun = async (command, args, options = {}) => {
    envs.push(options.env || {});
    return run(command, args, options);
  };
  const stubDownload = async ({ url, destPath }) => {
    downloadCalls.push(url);
    await writeFile(destPath, 'staged-payload');
    return { destPath, bytes: 14, attempts: 1 };
  };

  const result = await updateHarnessRuntime({
    rootDir: root,
    io: { log: () => {}, error: () => {} },
    runCommandImpl: recordingRun,
    resolveNewestRelease: async () => ({ tag: 'v5.17.0', version: '5.17.0', security: false }),
    // 中文注释：注入 platform 后 Windows 形状在任何主机上都能断言，不必等 Windows CI。
    platform: 'win32',
    downloadImpl: stubDownload,
    tempDirBase: stageBase,
  });

  assert.equal(result.updated, true);
  assert.equal(result.skipped, false);
  assert.equal((envs[0] || {}).AIOS_RELEASE_TAG, 'v5.17.0');
  assert.equal(run.calls.filter((key) => key.includes('/download/download/')).length, 0);
  // 中文注释：钉住正确的 tag 资产 URL，并明确拒绝历史畸形形状
  // `/releases/download/<tag>/download/...`（双 download 段 → 404，
  // 正是这个 bug 让 6.1.0 → 6.4.0 升级静默变 no-op）。
  assert.equal(result.remoteAssetUrl, 'https://github.com/rexleimo/aios/releases/download/v5.17.0/aios.zip');
  assert.equal(downloadCalls[0], 'https://github.com/rexleimo/aios/releases/download/v5.17.0/aios.zip');
  assert.equal(downloadCalls[1], 'https://github.com/rexleimo/aios/releases/download/v5.17.0/aios-install.ps1');
  assert.equal(run.calls[0].startsWith('powershell '), true);
  assert.equal(run.calls[0].includes('$ErrorActionPreference = "Stop"'), true);
  // 资产已落到暂存目录，安装器只读本地文件（不再走 Schannel/irm）。
  assert.equal((envs[0] || {}).AIOS_ASSET_URL.endsWith(path.join('aios.zip')), true);
  assert.equal((envs[0] || {}).AIOS_ASSET_URL.startsWith(stageBase), true);
  assert.equal(result.assetSource, 'node-fetch');
  assert.equal(run.calls[0].includes('irm '), false);
});

test('install-tree self-update keeps the bash installer shape on non-Windows hosts', async (t) => {
  const root = await tempRoot('aios-selfupdate-', t);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(root, 'VERSION'), '5.16.2\n', 'utf8');
  const run = fakeRunner();
  const envs = [];

  const result = await updateHarnessRuntime({
    rootDir: root,
    io: { log: () => {}, error: () => {} },
    runCommandImpl: async (command, args, options = {}) => {
      envs.push(options.env || {});
      return run(command, args, options);
    },
    resolveNewestRelease: async () => ({ tag: 'v5.17.0', version: '5.17.0', security: false }),
    platform: 'linux',
  });

  assert.equal(result.updated, true);
  // 中文注释：Linux/macOS 不注入 Node 暂存（OpenSSL 通道无此问题），保持
  // `set -o pipefail` + 精确 tag 资产 URL 的既有形状。
  assert.equal(run.calls[0].startsWith('bash -lc set -o pipefail; curl -fsSL '), true);
  assert.equal(run.calls[0].includes('releases/download/v5.17.0/aios-install.sh'), true);
  assert.equal(run.calls[0].includes('/download/download/'), false);
  assert.equal((envs[0] || {}).AIOS_ASSET_URL, 'https://github.com/rexleimo/aios/releases/download/v5.17.0/aios.tar.gz');
});

test('win32 self-update runs the local installer against the Node-staged asset', async (t) => {
  const root = await tempRoot('aios-selfupdate-', t);
  const stageBase = await tempRoot('aios-selfupdate-stage-', t);
  const { writeFile, access } = await import('node:fs/promises');
  await writeFile(path.join(root, 'VERSION'), '6.3.0\n', 'utf8');
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  const localInstaller = path.join(root, 'scripts', 'aios-install.ps1');
  await writeFile(localInstaller, 'param()', 'utf8');
  const run = fakeRunner();
  const envs = [];
  const logs = [];
  let stagedPath = '';

  const result = await updateHarnessRuntime({
    rootDir: root,
    io: { log: (line) => logs.push(line), error: () => {} },
    runCommandImpl: async (command, args, options = {}) => {
      envs.push(options.env || {});
      return run(command, args, options);
    },
    resolveNewestRelease: async () => ({ tag: 'v6.7.0', version: '6.7.0', security: false }),
    platform: 'win32',
    tempDirBase: stageBase,
    downloadImpl: async ({ destPath }) => {
      stagedPath = destPath;
      await writeFile(destPath, 'staged-zip');
      return { destPath, bytes: 10, attempts: 2 };
    },
  });

  assert.equal(result.assetSource, 'node-fetch');
  assert.equal(result.stagedBytes, 10);
  assert.equal(run.calls[0].includes(`& '${localInstaller}'`), true);
  assert.equal(run.calls[0].includes('irm '), false);
  assert.equal(envs[0].AIOS_ASSET_URL, stagedPath);
  assert.equal(logs.some((line) => line.includes('staging release asset via Node fetch')), true);
  // 暂存目录用完即清，不在易失目录里堆残骸。
  await assert.rejects(access(stagedPath), /ENOENT/u);
});

test('win32 self-update falls back to the installer download when Node staging fails', async (t) => {
  const root = await tempRoot('aios-selfupdate-', t);
  const stageBase = await tempRoot('aios-selfupdate-stage-', t);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(root, 'VERSION'), '6.3.0\n', 'utf8');
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await writeFile(path.join(root, 'scripts', 'aios-install.ps1'), 'param()', 'utf8');
  const run = fakeRunner();
  const envs = [];
  const logs = [];

  const result = await updateHarnessRuntime({
    rootDir: root,
    io: { log: (line) => logs.push(line), error: () => {} },
    runCommandImpl: async (command, args, options = {}) => {
      envs.push(options.env || {});
      return run(command, args, options);
    },
    resolveNewestRelease: async () => ({ tag: 'v6.7.0', version: '6.7.0', security: false }),
    platform: 'win32',
    tempDirBase: stageBase,
    downloadImpl: async (t) => { throw new Error('unexpected EOF from transport stream'); },
  });

  assert.equal(result.updated, true);
  assert.equal(result.assetSource, 'installer-fetch');
  // 回退语义：把远端 URL 交回安装器（安装器自己现在也带重试 + 截断校验）。
  assert.equal(envs[0].AIOS_ASSET_URL, 'https://github.com/rexleimo/aios/releases/download/v6.7.0/aios.zip');
  assert.equal(logs.some((line) => line.includes('Node asset staging failed') && line.includes('unexpected EOF')), true);
  // 中文注释：回退路径不得在暂存根里留下任何目录——旧写法只置空变量，
  // 已建的空目录就留在 %TEMP%（跑一次全量漏一批）。
  const { readdir } = await import('node:fs/promises');
  assert.deepEqual(await readdir(stageBase), [], `回退后暂存根应为空：${JSON.stringify(await readdir(stageBase))}`);
});
