/* 中文注释：浏览器 profile 根位置与其迁移守卫。
 *
 * 起因（现场实测两次）：profile 根住在安装树里时，一个活着的 Chrome 会让 `aios update` 的
 * 换入被拒——换入靠 `[System.IO.Directory]::Move` 给安装目录改名让位，而 Chrome 用
 * `--user-data-dir=<安装树内路径>` 持有目录句柄时，Windows 不允许这个改名。对照组：十几个只
 * 持有安装树内**脚本文件**的 bridge 进程并不挡改名，挡的是目录名占用。
 * 本文件钉住：根在安装树外、旧配置相对串仍能解析到新根、迁移只在安全时动文件系统、
 * 以及两个接线点（CDP 布局、MCP 子进程 env）真的用上了这个根。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  DEFAULT_PROFILE_DIR_NAME,
  LEGACY_PROFILE_DIR_NAME,
  PROFILE_ROOT_ENV,
  chromeProfileLockPresent,
  isInsideDir,
  legacyProfileRoot,
  migrateLegacyProfileRoot,
  profileTreeBusy,
  resolveProfilePath,
  resolveProfileRoot,
} from '../../../lib/tooling/components/browser/profile-root.mjs';
import { resolveCdpServiceLayout } from '../../../lib/tooling/components/browser/runtime/cdp-service.mjs';
import { buildLocalBrowserMcpServer } from '../../../lib/tooling/components/browser/mcp/mcp-server-builders.mjs';
import { relocateBrowserProfileRoot } from '../../../lib/tooling/components/browser/lifecycle/install.mjs';

const INSTALL_ROOT = path.join(path.sep, 'home', 'me', '.rexcil', 'aios');

function sandbox(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-profile-root-'));
  if (typeof t?.after === 'function') t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return base;
}

test('the profile root never sits inside the install tree', () => {
  const home = path.join(path.sep, 'home', 'me');
  assert.equal(
    resolveProfileRoot({ env: {}, homeDir: home }),
    path.join(home, '.rexcil', DEFAULT_PROFILE_DIR_NAME)
  );
  assert.equal(
    isInsideDir(resolveProfileRoot({ env: {}, homeDir: home }), INSTALL_ROOT),
    false,
    'profile 根住进安装树就是本次要消除的争用面'
  );

  // REXCIL_HOME 挪了运行状态根，profile 根必须跟着走（同一处推导，不留第二份布局知识）。
  const alt = path.join(path.sep, 'var', 'aios-state');
  assert.equal(resolveProfileRoot({ env: { REXCIL_HOME: alt }, homeDir: home }), path.join(alt, DEFAULT_PROFILE_DIR_NAME));

  // 契约变量优先，且只接受绝对路径。
  const explicit = path.join(path.sep, 'srv', 'profiles');
  assert.equal(resolveProfileRoot({ env: { [PROFILE_ROOT_ENV]: explicit }, homeDir: home }), explicit);
  assert.notEqual(
    resolveProfileRoot({ env: { [PROFILE_ROOT_ENV]: 'relative/profiles' }, homeDir: home }),
    path.resolve('relative/profiles'),
    '相对契约值不得采纳'
  );
});

test('legacy relative config strings map onto the new root without touching config', () => {
  const profileRoot = path.join(os.tmpdir(), 'aios-profiles');
  const workspaceRoot = path.join(os.tmpdir(), 'aios-workspace');

  assert.equal(
    resolveProfilePath('.browser-profiles/default', { profileRoot, workspaceRoot }),
    path.join(profileRoot, 'default'),
    'config/browser-profiles.json 里写的是 profile 的名字，位置由根决定'
  );
  assert.equal(
    resolveProfilePath(`${LEGACY_PROFILE_DIR_NAME}\\local`, { profileRoot, workspaceRoot }),
    path.join(profileRoot, 'local'),
    'Windows 手写的反斜杠同形也必须折过去'
  );
  assert.equal(resolveProfilePath(LEGACY_PROFILE_DIR_NAME, { profileRoot, workspaceRoot }), profileRoot);
  assert.equal(resolveProfilePath('', { profileRoot, workspaceRoot }), '');

  const absolute = path.join(os.homedir(), 'mine');
  assert.equal(resolveProfilePath(absolute, { profileRoot, workspaceRoot }), absolute);

  assert.equal(
    resolveProfilePath('config/screenshots', { profileRoot, workspaceRoot }),
    path.resolve(workspaceRoot, 'config/screenshots'),
    '其他相对路径保持原语义，不能被 profile 映射吞掉'
  );
});

test('a live Chrome lock is detected from Chrome\'s own marker, not from guesses', (t) => {
  const base = sandbox(t);
  const root = path.join(base, LEGACY_PROFILE_DIR_NAME);
  fs.mkdirSync(path.join(root, 'grill'), { recursive: true });

  assert.equal(chromeProfileLockPresent(path.join(root, 'grill')), false);
  assert.equal(profileTreeBusy(root), false, '没有锁就不算被占用');

  // SingletonLock 在真实 Chrome 里是符号链接，普通文件同样算（判定只看存在性）。
  fs.writeFileSync(path.join(root, 'grill', 'SingletonLock'), '');
  assert.equal(chromeProfileLockPresent(path.join(root, 'grill')), true);
  assert.equal(profileTreeBusy(root), true, '子 profile 带锁 = 整棵树被占用');
});

test('migration moves the tree only when it is safe, and reports every refusal', (t) => {
  const base = sandbox(t);
  const legacyRoot = path.join(base, LEGACY_PROFILE_DIR_NAME);
  const targetRoot = path.join(base, 'profiles');

  assert.deepEqual(
    migrateLegacyProfileRoot({ legacyRoot, targetRoot }).status,
    'no-legacy',
    '旧根不存在是正常终态（新装或已迁移）'
  );

  fs.mkdirSync(path.join(legacyRoot, 'default'), { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, 'default', 'Login Data'), 'cookie-ish');

  // 占用中：绝不搬，数据原地不动。
  fs.writeFileSync(path.join(legacyRoot, 'default', 'SingletonLock'), '');
  const locked = migrateLegacyProfileRoot({ legacyRoot, targetRoot });
  assert.equal(locked.status, 'locked');
  assert.equal(fs.existsSync(targetRoot), false, 'locked 时不得创建新根');
  assert.equal(fs.existsSync(path.join(legacyRoot, 'default', 'Login Data')), true);

  fs.rmSync(path.join(legacyRoot, 'default', 'SingletonLock'));
  // 两个根并存：宁可不搬，也不把两份 profile 搅在一起。
  fs.mkdirSync(targetRoot, { recursive: true });
  assert.equal(migrateLegacyProfileRoot({ legacyRoot, targetRoot }).status, 'target-exists');
  assert.equal(fs.existsSync(path.join(legacyRoot, 'default', 'Login Data')), true);
  assert.deepEqual(fs.readdirSync(targetRoot), [], 'target-exists 时绝不合并任何内容');

  fs.rmSync(targetRoot, { recursive: true, force: true });
  const moved = migrateLegacyProfileRoot({ legacyRoot, targetRoot });
  assert.equal(moved.status, 'migrated');
  assert.equal(fs.existsSync(legacyRoot), false, '旧根应已被改名让位');
  assert.equal(fs.readFileSync(path.join(targetRoot, 'default', 'Login Data'), 'utf8'), 'cookie-ish',
    '登录态必须整树原样过去，不是复制一份新的空目录');

  // 幂等：再跑一次只报 no-legacy，不动任何东西。
  assert.equal(migrateLegacyProfileRoot({ legacyRoot, targetRoot }).status, 'no-legacy');

  // rename 失败（例如跨卷）：状态带原因，旧数据原地完好。
  const other = sandbox(t);
  const legacy2 = path.join(other, LEGACY_PROFILE_DIR_NAME);
  fs.mkdirSync(legacy2, { recursive: true });
  const failed = migrateLegacyProfileRoot({
    legacyRoot: legacy2,
    targetRoot: path.join(other, 'profiles'),
    rename: () => { const e = new Error('EXDEV'); e.code = 'EXDEV'; throw e; },
  });
  assert.equal(failed.status, 'error');
  assert.equal(failed.error, 'EXDEV');
  assert.equal(fs.existsSync(legacy2), true, '搬不动就留在原地，绝不删一半');
});

test('a symlinked legacy root is never moved', (t) => {
  const base = sandbox(t);
  const real = path.join(base, 'somewhere-else');
  const legacyRoot = path.join(base, LEGACY_PROFILE_DIR_NAME);
  fs.mkdirSync(real, { recursive: true });
  try {
    fs.symlinkSync(real, legacyRoot, 'junction');
  } catch {
    t.skip('filesystem refuses symlinks here');
    return;
  }
  const result = migrateLegacyProfileRoot({ legacyRoot, targetRoot: path.join(base, 'profiles') });
  assert.equal(result.status, 'no-legacy', '软链接不是我们自己拥有的目录，不能搬');
  assert.equal(fs.existsSync(real), true, '软链接指向的真实目录必须原地完好');
});

test('the CDP layout puts user-data-dir outside the install root', () => {
  const previous = process.env[PROFILE_ROOT_ENV];
  const previousRexcil = process.env.REXCIL_HOME;
  const profileRoot = path.join(os.tmpdir(), 'aios-cdp-profiles');
  process.env[PROFILE_ROOT_ENV] = profileRoot;
  try {
    const layout = resolveCdpServiceLayout(INSTALL_ROOT, 9222);
    assert.equal(layout.userDataDir, path.join(profileRoot, 'default-cdp'));
    assert.equal(isInsideDir(layout.userDataDir, INSTALL_ROOT), false,
      'CDP profile 住回安装树 = 本次修复白做');

    const otherPort = resolveCdpServiceLayout(INSTALL_ROOT, 9333);
    assert.equal(otherPort.userDataDir, path.join(profileRoot, 'default-cdp-9333'));
  } finally {
    if (previous === undefined) delete process.env[PROFILE_ROOT_ENV];
    else process.env[PROFILE_ROOT_ENV] = previous;
    if (previousRexcil === undefined) delete process.env.REXCIL_HOME;
    else process.env.REXCIL_HOME = previousRexcil;
  }
});

test('the browser MCP child process receives the profile root as an absolute contract value', () => {
  const previous = process.env[PROFILE_ROOT_ENV];
  const server = buildLocalBrowserMcpServer(INSTALL_ROOT, {}, { nodeCommand: 'node' });
  assert.ok(typeof server.env[PROFILE_ROOT_ENV] === 'string' && server.env[PROFILE_ROOT_ENV].length > 0,
    '不把这个值递进子进程，TS 侧只能自己猜安装布局，两侧会漂');
  assert.equal(path.isAbsolute(server.env[PROFILE_ROOT_ENV]), true);
  assert.equal(isInsideDir(server.env[PROFILE_ROOT_ENV], INSTALL_ROOT), false);

  // 用户已经写在配置里的值不被覆盖。
  const explicit = path.join(os.tmpdir(), 'aios-user-chosen');
  const kept = buildLocalBrowserMcpServer(INSTALL_ROOT, { env: { [PROFILE_ROOT_ENV]: explicit } }, {});
  assert.equal(kept.env[PROFILE_ROOT_ENV], explicit);

  if (previous === undefined) delete process.env[PROFILE_ROOT_ENV];
  else process.env[PROFILE_ROOT_ENV] = previous;
});

test('the installer reports the relocation status instead of swallowing it', (t) => {
  const base = sandbox(t);
  const legacyRoot = path.join(base, 'aios-install', LEGACY_PROFILE_DIR_NAME);
  fs.mkdirSync(path.join(legacyRoot, 'default'), { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, 'default', 'Cookies'), 'session');
  const targetRoot = path.join(base, 'state', DEFAULT_PROFILE_DIR_NAME);
  const lines = [];
  const io = { log: (line) => lines.push(String(line)) };
  const env = { [PROFILE_ROOT_ENV]: targetRoot };

  // dry-run 不得碰磁盘。
  const planned = relocateBrowserProfileRoot({ rootDir: path.join(base, 'aios-install'), env, io, dryRun: true });
  assert.equal(planned.status, 'planned');
  assert.equal(fs.existsSync(legacyRoot), true, 'dry-run 不能搬任何东西');

  const moved = relocateBrowserProfileRoot({ rootDir: path.join(base, 'aios-install'), env, io });
  assert.equal(moved.status, 'migrated');
  assert.equal(fs.readFileSync(path.join(targetRoot, 'default', 'Cookies'), 'utf8'), 'session');
  assert.match(lines.join('\n'), /\[ok\].*moved out of the install tree/u);

  // 占用中：同一轮里第二次调用（已迁完）只会报 no-legacy；这里单独造一个活会话现场。
  const base2 = sandbox(t);
  const legacy2 = path.join(base2, 'aios-install', LEGACY_PROFILE_DIR_NAME);
  fs.mkdirSync(path.join(legacy2, 'grill'), { recursive: true });
  fs.writeFileSync(path.join(legacy2, 'grill', 'SingletonLock'), '');
  const lines2 = [];
  const busy = relocateBrowserProfileRoot({
    rootDir: path.join(base2, 'aios-install'),
    env: { [PROFILE_ROOT_ENV]: path.join(base2, 'state', DEFAULT_PROFILE_DIR_NAME) },
    io: { log: (line) => lines2.push(String(line)) },
  });
  assert.equal(busy.status, 'locked');
  assert.match(lines2.join('\n'), /\[warn\].*live browser session/u, '挡住升级的就是这个现场，必须说出来');
  assert.equal(fs.existsSync(path.join(legacy2, 'grill', 'SingletonLock')), true, '活 profile 原地不动');
});

test('legacyProfileRoot points at the historical location and nothing else', () => {
  assert.equal(legacyProfileRoot({ rootDir: INSTALL_ROOT }), path.join(INSTALL_ROOT, LEGACY_PROFILE_DIR_NAME));
  assert.equal(legacyProfileRoot({}), '', '不知道安装根就不给路径，避免拼出当前目录下的假位置');
});
