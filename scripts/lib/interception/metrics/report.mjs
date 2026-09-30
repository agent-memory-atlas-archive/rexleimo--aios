// scripts/lib/interception/metrics/report.mjs — `aios tokens report` builder
// and renderer. Reads the unified ledger (metrics JSONL) and aggregates savings
// per layer; one command answers "which layer saved how much".
import { readLedgerRecords, aggregateLedgerByLayer } from './ledger.mjs';

export async function buildTokensReport({ workspaceRoot, sessionId = 'default', now = () => new Date() } = {}) {
  const records = await readLedgerRecords({ workspaceRoot, sessionId });
  const layers = aggregateLedgerByLayer(records);
  return {
    session_id: sessionId,
    generated_at: now().toISOString(),
    total_events: records.length,
    layers,
    total_saved_tokens_estimate: layers.reduce((sum, bucket) => sum + bucket.saved_tokens_estimate, 0),
  };
}

export function renderTokensReport(report) {
  const rows = report.layers.map((bucket) => [
    bucket.layer,
    String(bucket.events),
    formatTokens(bucket.saved_tokens_estimate),
    layerNote(bucket.layer),
  ]);
  if (!rows.length) rows.push(['(no records)', '0', '0', '']);
  const header = ['layer', 'events', 'saved_tokens_est', 'note'];
  const widths = header.map((name, index) => Math.max(name.length, ...rows.map((row) => row[index].length)));
  const line = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ');
  const lines = [line(header), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)];
  lines.push('', `total_saved_tokens_estimate: ${formatTokens(report.total_saved_tokens_estimate)}`);
  lines.push(`session: ${report.session_id}  generated_at: ${report.generated_at}`);
  return lines.join('\n');
}

function layerNote(layer) {
  if (layer === 'rtk_ab') return 'A/B only; not attributed live';
  if (layer === 'pi_usage') return 'consumption baseline';
  return '';
}

function formatTokens(value) {
  const n = Number(value ?? 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
