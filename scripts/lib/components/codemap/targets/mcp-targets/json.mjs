import fs from 'node:fs';
import path from 'node:path';

import { CRG_MCP_ALIAS } from '../../constants.mjs';
import { backupFilePath } from '../../paths.mjs';
import { buildCrgEntryForTarget, isCrgServeEntry, isObjectRecord } from './entries.mjs';

function parseJsonConfig(filePath, { dryRun = false } = {}) {
  const exists = fs.existsSync(filePath);
  const raw = exists ? fs.readFileSync(filePath, 'utf8') : '';
  let parsed = {};

  if (exists && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      if (!dryRun) {
        fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
      }
      return {
        exists,
        raw,
        parsed: {},
        error: `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return {
    exists,
    raw,
    parsed: isObjectRecord(parsed) ? parsed : {},
    error: '',
  };
}

function writeJsonConfig(filePath, raw, parsed, exists, { dryRun = false } = {}) {
  const nextRaw = `${JSON.stringify(parsed, null, 2)}\n`;
  if (exists && raw === nextRaw) {
    return { status: 'unchanged' };
  }
  if (dryRun) {
    return { status: 'planned' };
  }
  if (exists) {
    fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, nextRaw, 'utf8');
  return { status: exists ? 'updated' : 'created' };
}

/**
 * 纯函数：按点路径下钻到 server 桶，缺段时创建中��对象。
 *
 * namespaceKey 支持点路径（zcode 是 `mcp.servers`，qoder/claude 是单层 `mcpServers`）。
 * 单层取值 `parsed?.['mcp.servers']` 恒为 undefined —— 那会让 zcode 的
 * inject/remove/inspect 全部静默变成 no-op。browser 组件有同语义实现
 * （`components/browser/mcp-migration.mjs` 的 resolveServersBucket），此处保持一致的语义。
 *
 * `create` 为 false 时只读不建（remove/inspect 用），避免为了探测而改写文件。
 */
function resolveNamespaceBucket(parsed, namespaceKey, { create = true } = {}) {
  const segments = String(namespaceKey || '').split('.').filter(Boolean);
  let container = parsed;
  for (const segment of segments.slice(0, -1)) {
    if (!isObjectRecord(container[segment])) {
      if (!create) return null;
      container[segment] = {};
    }
    container = container[segment];
  }
  const leaf = segments[segments.length - 1] || 'mcpServers';
  if (!isObjectRecord(container[leaf])) {
    if (!create) return null;
    container[leaf] = {};
  }
  return container[leaf];
}

export function injectCrgIntoMcpJson(filePath, clientKey, projectRoot, { dryRun = false, namespace = 'mcpServers', normalizeEntry = null } = {}) {
  const state = parseJsonConfig(filePath, { dryRun });
  if (state.error) {
    return { status: 'error', reason: state.error };
  }

  const parsed = state.parsed;
  const bucket = resolveNamespaceBucket(parsed, namespace, { create: true });

  const desired = buildCrgEntryForTarget(clientKey, projectRoot, filePath);
  const existing = bucket[CRG_MCP_ALIAS];
  // pi 的条目不接受额外字段（其 doctor 做精确比对），因此 pi 直接整体替换，
  // 不做"保留用户既有字段"的合并；其余客户端保持合并语义。
  const merged = clientKey === 'pi' || !isObjectRecord(existing)
    ? { ...desired }
    : { ...existing, ...desired };
  // 用户级配置里残留的 `cwd` 要拔掉：它会把全局注册钉死在某一个仓库上。
  if (!('cwd' in desired)) delete merged.cwd;
  // 严格 schema 宿主（zcode）在落盘前规范化；用户自有的其它 server 不受影响。
  bucket[CRG_MCP_ALIAS] = typeof normalizeEntry === 'function' ? normalizeEntry(merged) : merged;

  return writeJsonConfig(filePath, state.raw, parsed, state.exists, { dryRun });
}

export function injectCrgIntoOpencodeJson(filePath, { dryRun = false } = {}) {
  const state = parseJsonConfig(filePath, { dryRun });
  if (state.error) {
    return { status: 'error', reason: state.error };
  }

  const parsed = state.parsed;
  if (!isObjectRecord(parsed.mcp)) {
    parsed.mcp = {};
  }

  const desired = {
    type: 'local',
    command: ['uvx', 'code-review-graph', 'serve'],
    enabled: true,
  };
  const existing = parsed.mcp[CRG_MCP_ALIAS];
  const nextEntry = { ...desired };
  if (isObjectRecord(existing)) {
    Object.assign(nextEntry, existing, desired);
  }
  parsed.mcp[CRG_MCP_ALIAS] = nextEntry;

  return writeJsonConfig(filePath, state.raw, parsed, state.exists, { dryRun });
}

function removeCrgFromJsonNamespace(filePath, namespaceKey, { io = console } = {}) {
  if (!fs.existsSync(filePath)) return;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    // create:false —— 只读探测，不为删除动作凭空创建中间层。
    const bucket = resolveNamespaceBucket(parsed, namespaceKey, { create: false });
    if (!bucket || !(CRG_MCP_ALIAS in bucket)) return;

    delete bucket[CRG_MCP_ALIAS];
    fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
    fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    io.log(`OK   codemap removed ${CRG_MCP_ALIAS} from ${filePath}`);
  } catch (error) {
    io.log(`ERR  codemap failed to clean ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function removeCrgFromMcpJson(filePath, options = {}) {
  return removeCrgFromJsonNamespace(filePath, 'mcpServers', options);
}

export function removeCrgFromNestedJson(filePath, namespace, options = {}) {
  return removeCrgFromJsonNamespace(filePath, namespace, options);
}

export function removeCrgFromOpencodeJson(filePath, options = {}) {
  return removeCrgFromJsonNamespace(filePath, 'mcp', options);
}

export function inspectJsonNamespace(raw, namespaceKey) {
  const parsed = raw.trim() ? JSON.parse(raw) : {};
  // create:false —— inspect 是只读的，绝不能因探测而改写解析结果。
  const namespace = resolveNamespaceBucket(parsed, namespaceKey, { create: false });
  const entry = isObjectRecord(namespace) ? namespace[CRG_MCP_ALIAS] : null;
  return {
    exists: true,
    hasCrg: Boolean(entry),
    valid: isCrgServeEntry(entry),
    reason: entry ? 'invalid' : 'missing',
  };
}
