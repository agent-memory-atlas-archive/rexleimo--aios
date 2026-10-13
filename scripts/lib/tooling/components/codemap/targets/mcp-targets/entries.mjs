import path from 'node:path';

import { CLIENT_MCP_ENTRY_OVERRIDES, CRG_MCP_ALIAS } from '../../constants.mjs';

/**
 * pi 的 server entry 形状**独立构造**，不走 `CLIENT_MCP_ENTRY_OVERRIDES`。
 *
 * 原因：overrides 是 `{...base, ...overrides}` 合并，只能覆盖/新增字段，**删不掉**
 * base 的 `type:'stdio'`；而 pi 的 mcp.json 条目不带 `type`、带 `lifecycle:'lazy'`。
 * pi 组件（`components/pi/mcp-adapter.mjs` 的 `buildAiosPiMcpServers`）是形状的
 * 权威定义，其 `doctor` 用 `JSON.stringify` 精确比对（键序敏感），所以这里必须
 * 逐字段、按同序构造，否则 pi doctor 会永久报 kept-differs。
 */
export function buildCrgPiEntry() {
  return {
    command: 'uvx',
    args: ['code-review-graph', 'serve'],
    lifecycle: 'lazy',
  };
}

export function buildCrgMcpServerEntry(clientKey) {
  if (clientKey === 'pi') return buildCrgPiEntry();
  const entry = {
    command: 'uvx',
    args: ['code-review-graph', 'serve'],
    type: 'stdio',
  };
  return { ...entry, ...(CLIENT_MCP_ENTRY_OVERRIDES[clientKey] || {}) };
}

export function buildCrgMcpServerEntryForProject(clientKey, projectRoot) {
  const entry = buildCrgMcpServerEntry(clientKey);
  entry.cwd = projectRoot;
  return entry;
}

/** 配置写在了项目里吗（项目级才钉 `cwd`）。 */
export function isProjectScopedTarget(targetPath, projectRoot) {
  if (!targetPath || !projectRoot) return false;
  const target = path.resolve(targetPath);
  const root = path.resolve(projectRoot);
  return target === root || target.startsWith(root + path.sep);
}

/**
 * 按目标位置选入口：**写进客户级（全局）配置的不钉 `cwd`**。
 *
 * 实测坑：以前无差别带上 `cwd = <项目根>`，于是 `~/.codex/config.toml` 这类全局配置
 * 被钉死在某个仓库——换个项目用，CRG 还在索引旧仓库的图。只有项目级配置（如 `.mcp.json`）
 * 才应该限定到本项目。
 */
export function buildCrgEntryForTarget(clientKey, projectRoot, targetPath) {
  return isProjectScopedTarget(targetPath, projectRoot)
    ? buildCrgMcpServerEntryForProject(clientKey, projectRoot)
    : buildCrgMcpServerEntry(clientKey);
}

// 纯函数：统一判断 JSON/TOML 解析后的节点是否为普通对象。
export function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// 纯函数：识别 code-review-graph serve 入口，兼容数组命令和 command+args 两种客户端格式。
export function isCrgServeEntry(entry) {
  if (!isObjectRecord(entry)) return false;
  if (entry.enabled === false) return false;

  if (Array.isArray(entry.command)) {
    const command = entry.command.map((part) => String(part || ''));
    return command[0] === 'uvx' && command[1] === CRG_MCP_ALIAS && command.includes('serve');
  }

  const command = String(entry.command || '');
  const args = Array.isArray(entry.args) ? entry.args.map((part) => String(part || '')) : [];
  return command === 'uvx' && args[0] === CRG_MCP_ALIAS && args.includes('serve');
}