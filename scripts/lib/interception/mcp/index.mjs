/* 中文注释：MCP 层在 JSON-RPC 边界压缩 tools/list 与 tools/call，同时保持协议兼容。 */
export { shrinkToolsList } from './shrink/tools-list-shrink.mjs';
export { extractToolCallText } from './shrink/tools-call-shrink.mjs';
export { createJsonRpcProxyHandler } from './proxy/json-rpc-proxy.mjs';
export { runJsonRpcStdioProxy } from './proxy/stdio-proxy.mjs';
