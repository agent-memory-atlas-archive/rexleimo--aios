import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { LEDGER_LAYERS, aggregateLedgerByLayer, readLedgerRecords, writeLedgerRecord } from '../lib/interception/metrics/ledger.mjs';
import { buildTokensReport, renderTokensReport } from '../lib/interception/metrics/report.mjs';

async function makeWorkspace() {
  return mkdtemp(path.join(os.tmpdir(), 'aios-ledger-'));
}

test('LEDGER_LAYERS covers the four attribution layers', () => {
  assert.deepEqual(LEDGER_LAYERS, ['refs', 'pi_usage', 'headroom', 'rtk_ab']);
});

test('writeLedgerRecord rejects unknown layers and appends layer-attributed records', async () => {
  const workspaceRoot = await makeWorkspace();
  try {
    await assert.rejects(
      () => writeLedgerRecord({ workspaceRoot, layer: 'nope', data: {} }),
      /unknown ledger layer/,
    );
    const fixed = () => new Date('2026-09-30T00:00:00Z');
    await writeLedgerRecord({ workspaceRoot, sessionId: 's1', layer: 'refs', data: { raw_tokens_estimate: 1000, compact_tokens_estimate: 300 }, now: fixed });
    await writeLedgerRecord({ workspaceRoot, sessionId: 's1', layer: 'pi_usage', data: { task_id: 'bench-1', input: 100, output: 20 }, now: fixed });
    const records = await readLedgerRecords({ workspaceRoot, sessionId: 's1' });
    assert.equal(records.length, 2);
    assert.equal(records[0].layer, 'refs');
    assert.equal(records[1].layer, 'pi_usage');
    assert.equal(records[1].task_id, 'bench-1');
    assert.equal(records[0].session_id, 's1');
    assert.equal(records[0].raw_tokens_estimate, 1000);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('aggregateLedgerByLayer defaults legacy layer-less records to refs and computes savings', () => {
  const aggregated = aggregateLedgerByLayer([
    { ts: 't', session_id: 's', raw_tokens_estimate: 1000, compact_tokens_estimate: 250 },
    { ts: 't', session_id: 's', layer: 'refs', raw_tokens_estimate: 500, compact_tokens_estimate: 100 },
    { ts: 't', session_id: 's', layer: 'pi_usage', input: 900, output: 100, cache_write: 50 },
  ]);
  assert.deepEqual(aggregated.map((bucket) => bucket.layer), ['refs', 'pi_usage']);
  const refs = aggregated[0];
  assert.equal(refs.events, 2);
  assert.equal(refs.saved_tokens_estimate, 1150);
  const pi = aggregated[1];
  assert.equal(pi.events, 1);
  assert.equal(pi.saved_tokens_estimate, 0);
  assert.equal(pi.input, 900);
});

test('aggregateLedgerByLayer estimates headroom savings from byte deltas', () => {
  const aggregated = aggregateLedgerByLayer([
    { layer: 'headroom', op: 'compress', bytes_in: 4000, bytes_out: 800 },
  ]);
  assert.equal(aggregated[0].saved_tokens_estimate, 800);
});

test('buildTokensReport and renderTokensReport summarize the unified ledger', async () => {
  const workspaceRoot = await makeWorkspace();
  try {
    const fixed = () => new Date('2026-09-30T01:00:00Z');
    await writeLedgerRecord({ workspaceRoot, sessionId: 'rep', layer: 'refs', data: { raw_tokens_estimate: 4000, compact_tokens_estimate: 1000 }, now: fixed });
    await writeLedgerRecord({ workspaceRoot, sessionId: 'rep', layer: 'pi_usage', data: { input: 50 }, now: fixed });
    const report = await buildTokensReport({ workspaceRoot, sessionId: 'rep', now: fixed });
    assert.equal(report.total_events, 2);
    assert.equal(report.total_saved_tokens_estimate, 3000);
    assert.equal(report.session_id, 'rep');
    const text = renderTokensReport(report);
    assert.match(text, /layer/);
    assert.match(text, /refs/);
    assert.match(text, /pi_usage/);
    assert.match(text, /consumption baseline/);
    assert.match(text, /total_saved_tokens_estimate: 3\.0k/);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
