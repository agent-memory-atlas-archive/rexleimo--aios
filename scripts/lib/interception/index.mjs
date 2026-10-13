/* 中文注释：集中导出拦截运行时公开能力，避免 CLI 和 Skill 层直接依赖内部目录。 */
export { createInterceptionEngine } from './runtime/core/engine.mjs';
export { readRawRef, writeRawRef, rawRefsSessionRoot } from './observability/refs/raw-ref-store.mjs';
export { buildCompactPacket } from './runtime/packets/compact-packet.mjs';
export { shrinkToolOutput } from './transport/shell/output-shrinker.mjs';
export { buildClaudePreToolUseRewriteResponse, rewriteShellCommand } from './transport/shell/command-rewrite.mjs';
export { buildAiosMcpProxyServer, buildCapabilityMatrix, isAiosMcpProxyEntry, loadHostCapabilities, unwrapAiosMcpProxyEntry } from './transport/clients/capabilities.mjs';
export { collectInterceptionMcpTargets, inspectMcpProxyTarget, inspectMcpProxyTargets } from './transport/clients/capabilities.mjs';
export { TURN_COMPRESSION_CLIENT_IDS, compressPostReceiveTurn, compressPreSendTurn, compressTurn, emitTurnCompressionLog, formatTurnCompressionLog, recordUncontrolledTurn, requireTurnCompression, runTurnCompressionMatrixProof } from './runtime/turn/turn-gateway.mjs';
