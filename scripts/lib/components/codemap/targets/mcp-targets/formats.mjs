import { normalizeZcodeServerEntry } from '../../../../clients/mcp/zcode-schema.mjs';

import { injectCrgIntoMcpJson, injectCrgIntoOpencodeJson, inspectJsonNamespace, removeCrgFromMcpJson, removeCrgFromNestedJson, removeCrgFromOpencodeJson } from './json.mjs';
import { inspectCodexToml, removeCrgFromCodexToml, upsertCodexMcpToml } from './toml.mjs';
import { inspectHermesYaml, removeCrgFromHermesYaml, upsertCrgIntoHermesYaml } from './yaml.mjs';

const CODEMAP_TARGET_FORMATS = Object.freeze({
  'codex-toml': Object.freeze({
    inject: (target, projectRoot, options) => upsertCodexMcpToml(target.path, projectRoot, options),
    remove: (target, options) => removeCrgFromCodexToml(target.path, options),
    inspect: (raw) => inspectCodexToml(raw),
  }),
  'opencode-json': Object.freeze({
    inject: (target, _projectRoot, options) => injectCrgIntoOpencodeJson(target.path, options),
    remove: (target, options) => removeCrgFromOpencodeJson(target.path, options),
    inspect: (raw) => inspectJsonNamespace(raw, 'mcp'),
  }),
  'mcp-json': Object.freeze({
    inject: (target, projectRoot, options) => injectCrgIntoMcpJson(target.path, target.clientKey, projectRoot, options),
    remove: (target, options) => removeCrgFromMcpJson(target.path, options),
    inspect: (raw) => inspectJsonNamespace(raw, 'mcpServers'),
  }),
  // zcode 专用：命名空间是点路径 `mcp.servers`，且 server schema 是严格白名单
  // （未知字段会被 ZCode 整条丢弃），因此落盘前必须按共享白名单规范化。
  'mcp-json-nested': Object.freeze({
    inject: (target, projectRoot, options) => injectCrgIntoMcpJson(target.path, target.clientKey, projectRoot, {
      ...options,
      namespace: target.namespace || 'mcpServers',
      normalizeEntry: normalizeZcodeServerEntry,
    }),
    remove: (target, options) => removeCrgFromNestedJson(target.path, target.namespace || 'mcpServers', options),
    inspect: (raw) => inspectJsonNamespace(raw, 'mcp.servers'),
  }),
  // pi 的 mcp.json 是标准 mcpServers，但条目形状由 pi 组件定义（无 type、有 lifecycle），
  // 见 entries.mjs 的 buildCrgPiEntry。这里单独成格式，避免与通用 mcp-json 混淆。
  'pi-json': Object.freeze({
    inject: (target, projectRoot, options) => injectCrgIntoMcpJson(target.path, target.clientKey, projectRoot, options),
    remove: (target, options) => removeCrgFromMcpJson(target.path, options),
    inspect: (raw) => inspectJsonNamespace(raw, 'mcpServers'),
  }),
  'hermes-yaml': Object.freeze({
    inject: (target, projectRoot, options) => upsertCrgIntoHermesYaml(target.path, projectRoot, options),
    remove: (target, options) => removeCrgFromHermesYaml(target.path, options),
    inspect: (raw) => inspectHermesYaml(raw),
  }),
});

// 纯函数：按目标格式选择 MCP 读写策略，避免安装/医生流程维护格式分支。
export function getCodemapTargetFormat(format = 'mcp-json') {
  return CODEMAP_TARGET_FORMATS[format] || CODEMAP_TARGET_FORMATS['mcp-json'];
}
