import fs from 'node:fs';
import path from 'node:path';
import { runCommand } from '../../../../foundation/platform/process.mjs';
import { migrateBrowserMcpConfig, printSnippet } from '../mcp/mcp-config.mjs';
import {
  resolveDefaultCdpUrl,
  resolveLocalBrowserMcpScript,
} from '../runtime/runtime-paths.mjs';
import { PRIMARY_BROWSER_ALIAS } from '../constants.mjs';
import { browserModeAppliesPlaywright, resolveBrowserMode } from '../modes/mcp-mode.mjs';
import { formatErrorMessage, requireCommand } from '../shared.mjs';
import {
  legacyProfileRoot,
  migrateLegacyProfileRoot,
  resolveProfileRoot,
} from '../profile-root.mjs';

/**
 * 中文注释：把浏览器 profile 从安装树里搬到外面，本次修复的真痛点。
 * 旧位置（`<install>/.browser-profiles`）让“升级换入”和“浏览器会话”争同一个目录：
 * `aios update` 靠 `[System.IO.Directory]::Move` 改名让位，而一个活着的 Chrome（带
 * `--user-data-dir` 在安装树里）就让那个改名被 Windows 拒掉——本机实测两次，两次都是
 * “安装特别干净地失败了，但就是升不了”。返回的 status 一定被打出来，不静默。
 * 幂等：只在“旧根存在 && 新根不存在 && 无 SingletonLock”时动文件系统。
 */
export function relocateBrowserProfileRoot({
  rootDir,
  env = process.env,
  io = console,
  dryRun = false,
  fsImpl = fs,
} = {}) {
  const targetRoot = resolveProfileRoot({ env });
  const legacyRoot = legacyProfileRoot({ rootDir });
  const result = dryRun
    ? { status: 'planned', legacyRoot, targetRoot }
    : migrateLegacyProfileRoot({ legacyRoot, targetRoot, fsImpl });

  switch (result.status) {
    case 'migrated':
      io.log(`[ok] browser profiles moved out of the install tree: ${legacyRoot} -> ${targetRoot}`);
      break;
    case 'locked':
      io.log(`[warn] browser profiles still inside the install tree: a live browser session holds ${legacyRoot}.`);
      io.log(`[warn] close that browser (or the client session owning it) and rerun; profile root is ${targetRoot}.`);
      break;
    case 'target-exists':
      io.log(`[warn] two profile roots present; keeping ${targetRoot} as authoritative and leaving ${legacyRoot} untouched (nothing merged).`);
      break;
    case 'error':
      io.log(`[warn] profile migration failed (${result.error}); ${legacyRoot} left intact, nothing deleted.`);
      break;
    case 'planned':
      io.log(`[info] dry-run: would move ${legacyRoot} -> ${targetRoot} when unlocked.`);
      break;
    default:
      io.log(`[info] browser profile root: ${targetRoot}`);
  }

  return { ...result, targetRoot, legacyRoot };
}

export async function installBrowserMcp({
  rootDir,
  mode = null,
  prompt = false,
  skipPlaywrightInstall = false,
  dryRun = false,
  io = console,
  clientHomes = null,
  platform = process.platform,
} = {}) {
  requireCommand('node');

  // 中文注释：先摆 profile 根，再装东西——迁移失败不阻塞安装，但必须说出来。
  const profileRootResult = relocateBrowserProfileRoot({ rootDir, io, dryRun });

  // 选型解析优先级：显式 mode > 交互提问（仅 TTY）> 读 settings 落盘值。
  // 交互提问会把用户选择写入 settings，随后安装按该 mode 走。
  let resolvedMode = typeof mode === 'string' ? mode : null;
  if (!resolvedMode && prompt && !dryRun && process.stdin.isTTY && process.stdout.isTTY) {
    const { promptBrowserMode } = await import('../modes/prompt.mjs');
    resolvedMode = await promptBrowserMode({ rootDir, io });
  }
  if (!resolvedMode) {
    resolvedMode = resolveBrowserMode(rootDir);
  }

  // 先落配置：auth/shell 不受 browser 选型影响，always run（失败只告警不阻塞）。
  const migrationResult = await migrateBrowserMcpConfig({
    rootDir, mode: resolvedMode, io, dryRun, clientHomes,
  }).catch((error) => {
    const message = formatErrorMessage(error).split(/\r?\n/u)[0];
    io.log(`[warn] browser MCP config auto-update skipped: ${message}`);
    return null;
  });

  // 只有选 Playwright 才装配仓库内 Node/Playwright 运行期并投放 launch snippet。
  if (!browserModeAppliesPlaywright(resolvedMode)) {
    io.log(`[info] browser mode=${resolvedMode}; skipping repository-local Playwright MCP.`);
    return {
      launcherPath: null,
      cdpUrl: null,
      browserUseProjectDir: null,
      migrationResult,
      mode: resolvedMode,
    };
  }

  const localMcpScript = resolveLocalBrowserMcpScript(rootDir);
  const localMcpAvailable = fs.existsSync(localMcpScript)
    && fs.existsSync(path.join(rootDir, 'mcp-server', 'package.json'));
  if (!localMcpAvailable) {
    throw new Error(`repository-local browser MCP is unavailable: ${localMcpScript}`);
  }

  io.log('[info] using repository-local Node/Playwright MCP.');
  installLocalBrowserMcpRuntime({ rootDir, skipPlaywrightInstall, dryRun, io });

  const launcherPath = dryRun
    ? `<ABSOLUTE_PATH_TO_REPO>/scripts/${path.basename(localMcpScript)}`
    : path.resolve(localMcpScript);
  const cdpUrl = resolveDefaultCdpUrl(rootDir);
  printSnippet(io, launcherPath, cdpUrl);

  // The runtime exists now, so a Pi-global browser server can actually start.
  // The write itself stays with the Pi component (single owner of Pi config
  // shape); this call only reports the readiness fact install just created.
  const piBridge = await ensurePiBrowserMcpServer({ rootDir, dryRun, io, clientHomes });

  return {
    launcherPath,
    cdpUrl,
    browserUseProjectDir: null,
    migrationResult,
    piBridge,
  };
}

// Advertise the browser server in the Pi-global mcp.json. Best-effort: a
// missing Pi home or an unwritable file must never fail the browser install.
export async function ensurePiBrowserMcpServer({
  rootDir = '',
  dryRun = false,
  io = console,
  piHome = null,
  clientHomes = null,
} = {}) {
  try {
    const { getClientHomes } = await import('../../../../foundation/platform/paths.mjs');
    const { buildAiosPiBrowserServer, ensurePiMcpServers, resolvePiMcpJsonPath } = await import('../../integrations/pi/mcp-adapter.mjs');
    // Home resolution mirrors migrateBrowserMcpConfig: an injected clientHomes
    // map wins, so isolated callers (tests, dry runs) never reach the real
    // ~/.pi/agent/mcp.json. piHome === '' explicitly means "no Pi home".
    const homes = clientHomes && typeof clientHomes === 'object' ? clientHomes : getClientHomes(process.env);
    const home = piHome === null ? String(homes.pi || '') : piHome;
    if (!home) return { status: 'skipped', reason: 'no Pi client home resolved' };
    const server = buildAiosPiBrowserServer({ aiosRoot: rootDir });
    if (!server) return { status: 'skipped', reason: 'no AIOS root resolved' };
    const result = ensurePiMcpServers({
      mcpJsonPath: resolvePiMcpJsonPath(home),
      servers: { [PRIMARY_BROWSER_ALIAS]: server },
      dryRun,
      io,
    });
    return { status: result.action, ...result };
  } catch (error) {
    const reason = formatErrorMessage(error);
    io?.log?.(`[warn] Pi browser MCP wiring skipped: ${reason}`);
    return { status: 'error', reason };
  }
}

function installLocalBrowserMcpRuntime({ rootDir, skipPlaywrightInstall, dryRun, io }) {
  const mcpServerDir = path.join(rootDir, 'mcp-server');
  const packageLock = path.join(mcpServerDir, 'package-lock.json');
  const dependencyMarker = path.join(mcpServerDir, 'node_modules', 'playwright', 'package.json');
  if (!fs.existsSync(dependencyMarker)) {
    requireCommand('npm');
    const installArgs = fs.existsSync(packageLock) ? ['ci'] : ['install'];
    io.log(`+ (cd ${mcpServerDir} && npm ${installArgs.join(' ')})`);
    if (!dryRun) {
      runCommand('npm', installArgs, { cwd: mcpServerDir });
    }
  } else {
    io.log(`[ok] local browser MCP dependencies found: ${dependencyMarker}`);
  }

  if (!skipPlaywrightInstall) {
    const playwrightCli = path.join(mcpServerDir, 'node_modules', 'playwright', 'cli.js');
    io.log(`+ (cd ${mcpServerDir} && node ${playwrightCli} install chromium)`);
    if (!dryRun) {
      if (!fs.existsSync(playwrightCli)) {
        throw new Error(`Playwright CLI missing after local MCP dependency install: ${playwrightCli}`);
      }
      runCommand('node', [playwrightCli, 'install', 'chromium'], { cwd: mcpServerDir });
    }
  }

  requireCommand('npm');
  io.log(`+ (cd ${mcpServerDir} && npm run build)`);
  if (!dryRun) {
    runCommand('npm', ['run', 'build'], { cwd: mcpServerDir });
  }
}
