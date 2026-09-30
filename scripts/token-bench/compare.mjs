#!/usr/bin/env node
// scripts/token-bench/compare.mjs — A/B diff of two bench ledger sessions.
// Reads both sessions' pi_usage records from the unified ledger and prints a
// per-task token/cost comparison. This is the "did the mechanism save money"
// report required by the two-gate acceptance rule.
//   node scripts/token-bench/compare.mjs --a bench-ab-off --b bench-ab-on [--json]
import path from 'node:path';
import process from 'node:process';

import { readLedgerRecords } from '../lib/interception/metrics/ledger.mjs';

export function diffSessions(recordsOff, recordsOn) {
  const perTask = (records) => {
    const map = {};
    for (const record of records) {
      if (record?.layer !== 'pi_usage') continue;
      const bucket = map[record.task_id] ??= { turns: 0, total_tokens: 0, cost: 0 };
      bucket.turns += 1;
      bucket.total_tokens += record.total_tokens ?? 0;
      bucket.cost += record.cost ?? 0;
    }
    return map;
  };
  const off = perTask(recordsOff);
  const on = perTask(recordsOn);
  const ids = [...new Set([...Object.keys(off), ...Object.keys(on)])].sort();
  const rows = ids.map((task) => {
    const a = off[task] ?? { turns: 0, total_tokens: 0, cost: 0 };
    const b = on[task] ?? { turns: 0, total_tokens: 0, cost: 0 };
    const deltaTokens = b.total_tokens - a.total_tokens;
    return {
      task,
      off_turns: a.turns,
      on_turns: b.turns,
      off_tokens: a.total_tokens,
      on_tokens: b.total_tokens,
      delta_tokens: deltaTokens,
      delta_pct: a.total_tokens > 0 ? Math.round((deltaTokens / a.total_tokens) * 100) : null,
      off_cost: Number(a.cost.toFixed(6)),
      on_cost: Number(b.cost.toFixed(6)),
    };
  });
  const totals = rows.reduce((acc, row) => ({
    off_tokens: acc.off_tokens + row.off_tokens,
    on_tokens: acc.on_tokens + row.on_tokens,
    off_cost: acc.off_cost + row.off_cost,
    on_cost: acc.on_cost + row.on_cost,
  }), { off_tokens: 0, on_tokens: 0, off_cost: 0, on_cost: 0 });
  return { rows, totals, saved_tokens: totals.off_tokens - totals.on_tokens, saved_pct: totals.off_tokens > 0 ? Math.round(((totals.off_tokens - totals.on_tokens) / totals.off_tokens) * 100) : 0 };
}

export function renderComparison(comparison, { sessionOff, sessionOn }) {
  const header = ['task', 'off_turns', 'on_turns', 'off_tokens', 'on_tokens', 'delta_tokens', 'delta_pct'];
  const rows = comparison.rows.map((row) => [
    row.task, String(row.off_turns), String(row.on_turns), String(row.off_tokens), String(row.on_tokens), String(row.delta_tokens), row.delta_pct === null ? '—' : `${row.delta_pct}%`,
  ]);
  const widths = header.map((name, index) => Math.max(name.length, ...rows.map((row) => row[index].length)));
  const line = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ');
  const lines = [
    `off session: ${sessionOff}   on session: ${sessionOn}`,
    '',
    line(header),
    line(widths.map((width) => '-'.repeat(width))),
    ...rows.map(line),
    '',
    `off total: ${comparison.totals.off_tokens} tokens ($${comparison.totals.off_cost.toFixed(4)})`,
    `on total:  ${comparison.totals.on_tokens} tokens ($${comparison.totals.on_cost.toFixed(4)})`,
    `saved: ${comparison.saved_tokens} tokens (${comparison.saved_pct}%)`,
  ];
  return lines.join('\n');
}

function parseArgv(argv) {
  const options = { a: '', b: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--a') options.a = String(argv[++index]);
    else if (flag === '--b') options.b = String(argv[++index]);
    else if (flag === '--json') options.json = true;
    else throw new Error(`unknown flag: ${flag}`);
  }
  if (!options.a || !options.b) throw new Error('usage: compare.mjs --a <session-off> --b <session-on> [--json]');
  return options;
}

export async function main(argv = process.argv.slice(2), { workspaceRoot = process.cwd(), stdout = process.stdout } = {}) {
  const options = parseArgv(argv);
  const [recordsOff, recordsOn] = await Promise.all([
    readLedgerRecords({ workspaceRoot, sessionId: options.a }),
    readLedgerRecords({ workspaceRoot, sessionId: options.b }),
  ]);
  const comparison = diffSessions(recordsOff, recordsOn);
  stdout.write(options.json
    ? `${JSON.stringify({ ...comparison, session_off: options.a, session_on: options.b }, null, 2)}\n`
    : `${renderComparison(comparison, { sessionOff: options.a, sessionOn: options.b })}\n`);
  return { ok: true, comparison };
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  await main();
}
