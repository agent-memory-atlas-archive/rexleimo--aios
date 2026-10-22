#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const NVMRC_PATH = path.join(PROJECT_ROOT, '.nvmrc');
const ACTIVE_ENV = 'AIOS_PROJECT_NODE_ACTIVE';
const AICOS_CHILD_CWD_ENV = 'AIOS_MCP_CHILD_CWD';

/* 中文注释：判定口径与 scripts/lib/foundation/platform/aios-runtime-root.mjs 的
 * resolveCwdOutsideRootDir 同构。本包是可独立发布的产物，不反向 import 宿主脚本
 * （与 browser/session/profiles.ts 同一先例）。 */
const PROJECT_ROOT_KEY = PROJECT_ROOT.replace(/[\\/]+/gu, '/').replace(/\/+$/u, '').toLowerCase();
function insideProjectRoot(value) {
  const n = String(value || '').replace(/[\\/]+/gu, '/').replace(/\/+$/u, '').toLowerCase();
  return n === PROJECT_ROOT_KEY || n.startsWith(`${PROJECT_ROOT_KEY}/`);
}

function readDesiredNodeMajor() {
  const raw = fs.readFileSync(NVMRC_PATH, 'utf8').trim().replace(/^v/u, '');
  const major = Number.parseInt(raw.split('.')[0] || '', 10);
  if (!Number.isFinite(major) || major <= 0) {
    throw new Error(`Invalid .nvmrc version: ${raw}`);
  }
  return { raw, major };
}

function compareVersionDesc(left, right) {
  const toParts = (value) =>
    String(value)
      .replace(/^v/u, '')
      .split('.')
      .map((item) => Number.parseInt(item, 10) || 0);
  const a = toParts(left);
  const b = toParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (b[index] || 0) - (a[index] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function resolveNodeFromNvm(major) {
  const versionsDir = path.join(os.homedir(), '.nvm', 'versions', 'node');
  if (!fs.existsSync(versionsDir)) return '';

  const matches = fs
    .readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`v${major}.`))
    .map((entry) => entry.name)
    .sort(compareVersionDesc);

  for (const version of matches) {
    const candidate = path.join(versionsDir, version, 'bin', 'node');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return '';
}

function resolveNodeFromCommonLocations(major) {
  const candidates = [
    path.join('/opt/homebrew/opt', `node@${major}`, 'bin', 'node'),
    path.join('/usr/local/opt', `node@${major}`, 'bin', 'node'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function resolveProjectNode() {
  const desired = readDesiredNodeMajor();
  const activeMajor = Number.parseInt(process.versions.node.split('.')[0] || '', 10);
  if (process.env[ACTIVE_ENV] === '1' || activeMajor === desired.major) {
    return process.execPath;
  }
  return resolveNodeFromNvm(desired.major)
    || resolveNodeFromCommonLocations(desired.major)
    || '';
}

function main() {
  const [target, ...args] = process.argv.slice(2);
  if (!target) {
    console.error('Usage: node scripts/with-project-node.mjs <script> [args...]');
    process.exit(2);
  }

  const nodeBinary = resolveProjectNode();
  if (!nodeBinary) {
    const { raw } = readDesiredNodeMajor();
    console.error(
      `Unable to resolve a Node runtime matching .nvmrc=${raw}. Install it (for example via nvm) and retry.`
    );
    process.exit(1);
  }

  const targetPath = path.isAbsolute(target) ? target : path.resolve(PROJECT_ROOT, target);
  /* 中文注释：默认仍是 PROJECT_ROOT——mcp-server 的 npm 脚本（dev/test/build/typecheck）靠它解
   * 相对 glob 和 src/index.ts，改掉就把整个包的命令废了（实测：改成继承调用方 cwd 后
   * contextdb-lazy-load 这类跑真 CLI 的套件直接变红）。
   * 长驻服务链由上游入口显式声明工作目录：`AIOS_PROJECT_NODE_CWD` 给出且它不在本包内时才采用。
   * 存在理由：Windows 上“目录改名”只被“某进程 CWD 在该子树内”拦住（文件句柄/watch 句柄不拦），
   * 而 `aios update` 换入正是把旧安装目录改名让位；长驻 MCP 进程把 CWD 钉在本包（=安装树）里，
   * 等于每次启动都在给下一次升级上锁。 */
  const declaredCwd = String(process.env[AICOS_CHILD_CWD_ENV] || '').trim();
  const childCwd = declaredCwd && !insideProjectRoot(declaredCwd) ? declaredCwd : PROJECT_ROOT;
  const result = spawnSync(nodeBinary, [targetPath, ...args], {
    cwd: childCwd,
    env: {
      ...process.env,
      [ACTIVE_ENV]: '1',
    },
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error.message || String(result.error));
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

main();
