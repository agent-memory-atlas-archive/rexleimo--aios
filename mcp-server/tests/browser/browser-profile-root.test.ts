import test from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  DEFAULT_PROFILE_DIR_NAME,
  LEGACY_PROFILE_DIR_NAME,
  PROFILE_ROOT_ENV,
  resolveProfileRelativePath,
  resolveProfileRootDir,
} from '../../src/browser/session/profiles.js';

/* 中文注释：浏览器 profile 必须住在安装树外面。安装根里改名让位是 `aios update` 的换入手法，
 * 而一个活着的 Chrome（`--user-data-dir` 指在安装树里）会让那个改名被 Windows 直接拒掉——
 * 本机实测两次"升级干净地失败"。这些测试钉住三件事：根在外部、旧配置的相对路径仍能解析到新根、
 * 契约变量优先于任何默认推导。 */

test('the profile root is derived outside the install tree', () => {
  const previous = { ...process.env };
  try {
    delete process.env[PROFILE_ROOT_ENV];
    delete process.env.REXCIL_HOME;
    const derived = resolveProfileRootDir();
    const rexcil = path.join(os.homedir(), '.rexcil');
    assert.equal(derived, path.join(rexcil, DEFAULT_PROFILE_DIR_NAME));
    assert.ok(!derived.startsWith(rexcil + path.sep + 'aios' + path.sep),
      `profile root 不得落在安装根 ~/.rexcil/aios 里面：${derived}`);
  } finally {
    process.env = previous;
  }
});

test('AIOS_BROWSER_PROFILE_ROOT wins over derivation and honours REXCIL_HOME', () => {
  const previous = { ...process.env };
  try {
    const explicit = path.join(os.tmpdir(), 'aios-profile-root-assert');
    process.env[PROFILE_ROOT_ENV] = explicit;
    assert.equal(resolveProfileRootDir(), path.normalize(explicit));

    // 相对值不采纳：一个指"位置"的契约变量给成相对路径，等于把歧义塞进每个消费者。
    process.env[PROFILE_ROOT_ENV] = 'relative/profiles';
    delete process.env.REXCIL_HOME;
    assert.notEqual(resolveProfileRootDir(), path.resolve('relative/profiles'));

    process.env[PROFILE_ROOT_ENV] = '';
    const alt = path.join(os.tmpdir(), 'aios-rexcil-alt');
    process.env.REXCIL_HOME = alt;
    assert.equal(resolveProfileRootDir(), path.join(alt, DEFAULT_PROFILE_DIR_NAME));
  } finally {
    process.env = previous;
  }
});

test('legacy relative profile paths map onto the new root without editing config', () => {
  const profileRoot = path.join(os.tmpdir(), 'aios-profile-root-map');
  const workspaceRoot = path.join(os.tmpdir(), 'aios-workspace-root-map');

  assert.equal(
    resolveProfileRelativePath('.browser-profiles/default', profileRoot, workspaceRoot),
    path.join(profileRoot, 'default'),
    'config/browser-profiles.json 里的相对串是 profile 的名字，不是它的位置'
  );
  // 反斜杠同形（Windows 手写的配置）也必须折过去。
  assert.equal(
    resolveProfileRelativePath(`${LEGACY_PROFILE_DIR_NAME}\\local`, profileRoot, workspaceRoot),
    path.join(profileRoot, 'local')
  );
  assert.equal(resolveProfileRelativePath(LEGACY_PROFILE_DIR_NAME, profileRoot, workspaceRoot), profileRoot);
  assert.equal(resolveProfileRelativePath('', profileRoot, workspaceRoot), '');

  const absolute = path.join(os.homedir(), 'my-profile');
  assert.equal(resolveProfileRelativePath(absolute, profileRoot, workspaceRoot), absolute,
    '用户显式指定的绝对目录必须尊重');

  assert.equal(
    resolveProfileRelativePath('docs/out.png', profileRoot, workspaceRoot),
    path.resolve(workspaceRoot, 'docs/out.png'),
    '其他相对路径仍按 workspace 解析，不能一起吞掉'
  );
});
