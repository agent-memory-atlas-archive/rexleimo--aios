// scripts/lib/pi/usage-tap.mjs — pi RPC token usage collector.
// Spike (2026-09-30, /tmp/pi-usage-spike.mjs) confirmed the contract: assistant
// `message_end` records carry `message.usage` = { input, output, cacheRead,
// cacheWrite, totalTokens, cost{ input, output, cacheRead, cacheWrite, total } }.
// The tap is a pure consumer of rpc-client's existing onEvent transparency
// channel (rpc-client itself stays untouched); telemetry failures are
// fire-and-forget and must never break the transport.
import { writeLedgerRecord } from '../interception/metrics/ledger.mjs';

export function extractUsageFromRecord(record) {
  if (!record || typeof record !== 'object') return null;
  if (record.type !== 'message_end') return null;
  const message = record.message;
  if (!message || typeof message !== 'object' || message.role !== 'assistant') return null;
  const usage = message.usage;
  if (!usage || typeof usage !== 'object') return null;
  const number = (value) => (Number.isFinite(value) ? value : 0);
  return {
    input: number(usage.input),
    output: number(usage.output),
    cache_read: number(usage.cacheRead),
    cache_write: number(usage.cacheWrite),
    total_tokens: number(usage.totalTokens),
    cost: number(usage.cost?.total),
    model: String(message.model || ''),
    stop_reason: String(message.stopReason || ''),
  };
}

export function createLedgerUsageTap({
  workspaceRoot,
  sessionId = 'default',
  taskId = null,
  layer = 'pi_usage',
  writeImpl = null,
  now = () => new Date(),
} = {}) {
  return (record) => {
    const usage = extractUsageFromRecord(record);
    if (!usage) return;
    const data = { task_id: taskId, ...usage };
    const run = writeImpl
      ? Promise.resolve(writeImpl({ workspaceRoot, sessionId, layer, data, now }))
      : writeLedgerRecord({ workspaceRoot, sessionId, layer, data, now });
    run.catch(() => {});
  };
}
