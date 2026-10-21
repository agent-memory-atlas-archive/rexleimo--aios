// mcp-server/src/browser/profiles.ts
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { BrowserProfile } from '../capture/types.js';

/* 浏览器 profile 根。契约只有一个环境变量：AIOS_BROWSER_PROFILE_ROOT（绝对路径），
 * 由 AIOS 侧的 mcp-server-builders 注入子进程。不递时退回 `~/.rexcil/browser-profiles`。
 * 为什么不在安装树里：旧位置 `<install>/.browser-profiles` 让升级换入（改名让位）和一个活着的
 * Chrome 争同一个目录，Windows 上那个改名会被直接拒——`aios update` 会“干净地失败”。
 * 语义与 scripts/lib/tooling/components/browser/profile-root.mjs 一致，两边必须同构。 */
export const PROFILE_ROOT_ENV = 'AIOS_BROWSER_PROFILE_ROOT';
export const LEGACY_PROFILE_DIR_NAME = '.browser-profiles';
export const DEFAULT_PROFILE_DIR_NAME = 'browser-profiles';

export function resolveProfileRootDir(): string {
  const raw = (process.env[PROFILE_ROOT_ENV] || '').trim();
  if (raw && path.isAbsolute(raw)) return path.normalize(raw);
  const rexcilRaw = (process.env.REXCIL_HOME || '').trim();
  const base = rexcilRaw && path.isAbsolute(rexcilRaw)
    ? rexcilRaw
    : path.join(os.homedir(), '.rexcil');
  return path.join(base, DEFAULT_PROFILE_DIR_NAME);
}

/**
 * 纯函数（可单独测）：把配置里的 profile 路径解析成绝对路径。
 * - 绝对：原样（用户显式指定的外部目录必须尊重）。
 * - `.browser-profiles/<name>`（含反斜杠同形）：折进 profileRoot——旧配置不改字就能搬家。
 * - 其他相对：按 workspaceRoot 解析，语义不变。
 */
export function resolveProfileRelativePath(raw: string, profileRoot: string, workspaceRoot: string): string {
  const value = (raw || '').trim();
  if (!value) return '';
  if (path.isAbsolute(value)) return value;
  const posix = value.replace(/\\/g, '/');
  if (posix === LEGACY_PROFILE_DIR_NAME || posix.startsWith(`${LEGACY_PROFILE_DIR_NAME}/`)) {
    const rest = posix.slice(LEGACY_PROFILE_DIR_NAME.length).replace(/^\//, '');
    return rest ? path.join(profileRoot, ...rest.split('/')) : profileRoot;
  }
  return path.resolve(workspaceRoot, value);
}

function resolveWorkspaceRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(moduleDir, '..', '..'), // mcp-server/
    path.resolve(moduleDir, '..', '..', '..'), // aios/
  ];

  for (const root of candidates) {
    if (existsSync(path.join(root, 'config', 'browser-profiles.json'))) {
      return root;
    }
  }

  return process.cwd();
}

const WORKSPACE_ROOT = resolveWorkspaceRoot();
const PROFILES_DIR = resolveProfileRootDir();
const CONFIG_PATH = path.join(WORKSPACE_ROOT, 'config', 'browser-profiles.json');

export class ProfileManager {
  private profiles: Map<string, BrowserProfile> = new Map();

  async init(): Promise<void> {
    try {
      await fs.mkdir(PROFILES_DIR, { recursive: true });
    } catch {
      // 目录已存在
    }
    await this.loadProfiles();
  }

  private async loadProfiles(): Promise<void> {
    try {
      const data = await fs.readFile(CONFIG_PATH, 'utf-8');
      const config = JSON.parse(data);
      if (config.profiles) {
        for (const [name, profile] of Object.entries(config.profiles)) {
          this.profiles.set(name, profile as BrowserProfile);
        }
      }
    } catch {
      // 配置文件不存在，使用默认
    }
  }

  getProfile(name: string): BrowserProfile | undefined {
    return this.profiles.get(name);
  }

  getAllProfiles(): Map<string, BrowserProfile> {
    return this.profiles;
  }

  setProfile(name: string, profile: BrowserProfile): void {
    this.profiles.set(name, profile);
  }

  getProfileDir(name: string): string {
    return path.join(PROFILES_DIR, name);
  }

  getWorkspaceRoot(): string {
    return WORKSPACE_ROOT;
  }

  getProfileRoot(): string {
    return PROFILES_DIR;
  }

  resolveWorkspacePath(targetPath: string): string {
    return resolveProfileRelativePath(targetPath, PROFILES_DIR, WORKSPACE_ROOT);
  }
}

export const profileManager = new ProfileManager();
