import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCwdOutsideRootDir } from '../../../lib/foundation/platform/aios-runtime-root.mjs';

/* 中文注释：长驻子进程的 CWD 不能落在安装树里——Windows 上目录改名只被这一种持有者拦住
 * （实测：文件句柄、fs.watch 目录通知句柄、Chrome profile 句柄都不拦）。
 * `aios update` 靠把旧安装目录改名让位来换入，所以 CWD 钉在树里 = 每次启动都在给下一次升级上锁。 */

const WIN_ROOT = 'C:\\Users\\Administrator\\.rexcil\\aios';
const WIN_HOME = 'C:\\Users\\Administrator';

function win(input, cwd) {
  const original = process.platform;
  Object.defineProperty(process, 'platform', { value: input, configurable: true });
  try {
    return resolveCwdOutsideRootDir({ cwd, rootDir: WIN_ROOT, homeDir: WIN_HOME });
  } finally {
    Object.defineProperty(process, 'platform', { value: original, configurable: true });
  }
}

test('调用方在树外时原样继承（项目根才是子进程该待的地方）', () => {
  const got = resolveCwdOutsideRootDir({ cwd: 'E:\\coding\\harness-cli', rootDir: WIN_ROOT, homeDir: WIN_HOME });
  assert.equal(got.cwd, 'E:\\coding\\harness-cli');
  assert.equal(got.relocated, false);
});

test('调用方在树内时改选到树外，且不再返回任何树内路径', () => {
  for (const cwd of [
    WIN_ROOT,
    `${WIN_ROOT}\\`,
    `${WIN_ROOT}\\mcp-server`,
    `${WIN_ROOT}\\scripts`,
  ]) {
    const got = resolveCwdOutsideRootDir({ cwd, rootDir: WIN_ROOT, homeDir: WIN_HOME });
    assert.equal(got.relocated, true, `必须判成被树内钉住: ${cwd}`);
    assert.equal(got.cwd, WIN_HOME);
    assert.ok(!got.cwd.toLowerCase().startsWith(WIN_ROOT.toLowerCase()), `改选结果仍在树内: ${got.cwd}`);
  }
});

test('Windows 路径大小写不敏感，同前缀的兄弟目录不算树内', () => {
  assert.equal(win('win32', 'c:\\users\\administrator\\.REXCIL\\AIOS\\scripts').relocated, true);
  assert.equal(win('win32', `${WIN_ROOT}-other`).relocated, false, 'aios-other 只是字符串前缀相同，不是子树');
});

test('POSIX 同样判定：树内改选、树外继承、同前缀不误伤', () => {
  const root = '/home/u/.rexcil/aios';
  const home = '/home/u';
  const pick = (cwd) => resolveCwdOutsideRootDir({ cwd, rootDir: root, homeDir: home });
  assert.equal(pick(root).relocated, true);
  assert.equal(pick(`${root}/mcp-server`).cwd, home);
  assert.equal(pick('/home/u/proj').relocated, false);
  assert.equal(pick('/home/u/.rexcil/aiosx').relocated, false);
});

test('缺 rootDir 或缺 cwd 时不炸，也不把空串当路径传给子进程', () => {
  assert.equal(resolveCwdOutsideRootDir({ cwd: 'E:\\x', rootDir: '' }).cwd, 'E:\\x');
  assert.equal(resolveCwdOutsideRootDir({ cwd: '', rootDir: WIN_ROOT, homeDir: WIN_HOME }).cwd, WIN_HOME);
});
