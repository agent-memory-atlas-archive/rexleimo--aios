// scripts/lib/interception/metrics/ledger.mjs — unified per-layer token ledger.
// Shares the metrics-sink JSONL file (one per session) so there is exactly one
// sink; records gain a `layer` field ('refs' | 'pi_usage' | 'headroom' |
// 'rtk_ab') so savings can be attributed per mechanism. Records still carry
// numbers and pointers only — never raw content.
import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';

import { metricsSessionPath, readMetricsRecords } from './metrics-sink.mjs';

export const LEDGER_LAYERS = ['refs', 'pi_usage', 'headroom', 'rtk_ab'];

export async function writeLedgerRecord({ workspaceRoot, sessionId = 'default', layer, data = {}, now = () => new Date() } = {}) {
  if (!LEDGER_LAYERS.includes(layer)) {
    throw new Error(`unknown ledger layer: ${layer} (expected one of ${LEDGER_LAYERS.join(', ')})`);
  }
  const filePath = metricsSessionPath(workspaceRoot, sessionId);
  await mkdir(path.dirname(filePath), { recursive: true });
  const record = { ts: now().toISOString(), session_id: sessionId, layer, ...data };
  await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

export async function readLedgerRecords(options = {}) {
  return readMetricsRecords(options);
}

// Legacy records (written before the layer field existed) are all refs-layer
// compression events, so aggregation defaults a missing layer to 'refs'.
export function aggregateLedgerByLayer(records = []) {
  const buckets = {};
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const layer = LEDGER_LAYERS.includes(record.layer) ? record.layer : 'refs';
    const bucket = buckets[layer] ??= { layer, events: 0 };
    bucket.events += 1;
    for (const [key, value] of Object.entries(record)) {
      if (key === 'layer' || key === 'ts' || key === 'session_id' || !Number.isFinite(value)) continue;
      bucket[key] = (bucket[key] ?? 0) + value;
    }
  }
  for (const bucket of Object.values(buckets)) {
    bucket.saved_tokens_estimate = estimateSavedTokens(bucket);
  }
  return LEDGER_LAYERS.map((layer) => buckets[layer]).filter(Boolean);
}

function estimateSavedTokens(bucket) {
  if (bucket.layer === 'refs' || bucket.layer === 'rtk_ab') {
    return Math.max(0, (bucket.raw_tokens_estimate ?? 0) - (bucket.compact_tokens_estimate ?? 0));
  }
  if (bucket.layer === 'headroom') {
    return Math.max(0, Math.ceil(((bucket.bytes_in ?? 0) - (bucket.bytes_out ?? 0)) / 4));
  }
  return 0; // pi_usage is the consumption baseline; its savings surface in other layers
}
