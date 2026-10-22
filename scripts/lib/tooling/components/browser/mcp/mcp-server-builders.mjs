/* 中文注释：MCP server block 构建只负责生成配置对象，不读写磁盘。 */
import path from 'node:path';

import { buildAiosMcpProxyServer } from '../../../../foundation/interception/transport/mcp/proxy/proxy-config.mjs';
import { AUTH_TOOLS_ALIAS, PRIMARY_BROWSER_ALIAS, SHELL_ALIAS } from '../constants.mjs';
import {
  resolveDefaultCdpUrl,
  resolveLocalBrowserMcpScript,
  resolvePythonCommand,
} from '../runtime/runtime-paths.mjs';
import { PROFILE_ROOT_ENV, resolveProfileRoot } from '../profile-root.mjs';

/* 中文注释：当外部 browser-use checkout 不存在时，回退到仓库内的 Playwright MCP。 */
export function buildLocalBrowserMcpServer(rootDir, existingAlias = {}, runtime = {}) {
  const existingEnv = existingAlias && typeof existingAlias.env === 'object' ? existingAlias.env : {};
  const nextEnv = { ...existingEnv };
  delete nextEnv.AIOS_BROWSER_USE_REPO;
  delete nextEnv.AIOS_INTERCEPTION_METRICS;
  delete nextEnv.AIOS_MCP_PROXY;
  delete nextEnv.AIOS_MCP_UPSTREAM_HOST;
  /* 中文注释：把 profile 根当绝对路径交给子进程——这是两侧（AIOS .mjs / mcp-server .ts）
   * 唯一的契约变量。不递这个值的话，TS 侧只能自己探安装布局，两边很容易漂到不同目录，
   * 结果是登录态写进一个谁都不看的角落。已有值（用户自己设的）不覆盖：传 nextEnv 进解析。
   */
  nextEnv[PROFILE_ROOT_ENV] = resolveProfileRoot({ env: { ...process.env, ...nextEnv } });
  // 中文注释：不钉 `cwd`。旧写法 `cwd: rootDir` 会把这个长期运行的 MCP 服务器的 CWD 钉到安装树里，
  // 而 Windows 上目录改名只被“某进程 CWD 在该子树内”拦住——等于每次注册都在给自己下一次
  // `aios update` 上锁（实测 EPERM/EBUSY）。不写这个键就是让客户端用自己的工作目录起服务，
  // 子进程再靠 scripts/run-local-browser-mcp.mjs 和 with-project-node.mjs 的树外选路兜底。
  return {
    type: 'stdio',
    command: runtime.nodeCommand || 'node',
    args: [resolveLocalBrowserMcpScript(rootDir)],
    startupTimeoutSec: 60,
    env: nextEnv,
  };
}

/* 中文注释：本地 Node/Playwright MCP 是唯一的浏览器运行入口。 */
export function buildPreferredMcpServer(rootDir, existingAlias = {}, runtime = {}) {
  const cdpUrl = resolveDefaultCdpUrl(rootDir);
  const existingEnv = existingAlias && typeof existingAlias.env === 'object' ? existingAlias.env : {};
  const nextEnv = {
    ...existingEnv,
    BROWSER_USE_CDP_URL: existingEnv.BROWSER_USE_CDP_URL || cdpUrl,
  };
  delete nextEnv.AIOS_BROWSER_USE_REPO;
  delete nextEnv.AIOS_INTERCEPTION_METRICS;
  delete nextEnv.AIOS_MCP_PROXY;
  delete nextEnv.AIOS_MCP_UPSTREAM_HOST;
  return buildLocalBrowserMcpServer(rootDir, { ...existingAlias, env: nextEnv }, runtime);
}

/* 中文注释：auth-tools 仍保持直连，因为它是小型辅助服务，不承载大页面输出。 */
export function buildAuthToolsMcpServer(rootDir, existingEntry = {}) {
  const authScript = path.join(rootDir, 'scripts', 'auth-tools-server.py');
  const cdpUrl = resolveDefaultCdpUrl(rootDir);
  const nextEnv = {
    ...(existingEntry && typeof existingEntry.env === 'object' ? existingEntry.env : {}),
    BROWSER_USE_CDP_URL: cdpUrl,
  };

  return {
    type: 'stdio',
    command: resolvePythonCommand(),
    args: ['-u', authScript],
    startupTimeoutSec: 30,
    env: nextEnv,
  };
}

export { AUTH_TOOLS_ALIAS, PRIMARY_BROWSER_ALIAS, SHELL_ALIAS };

export function buildShellMcpServer(rootDir) {
  return buildAiosMcpProxyServer({
    rootDir,
    upstream: {
      type: 'stdio',
      command: process.execPath,
      args: [path.join(rootDir, 'scripts', 'shell-mcp-server.mjs')],
    },
    host: SHELL_ALIAS,
    workspaceRoot: rootDir,
    startupTimeoutSec: 30,
  });
}
