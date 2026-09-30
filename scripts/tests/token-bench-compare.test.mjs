import assert from 'node:assert/strict';
import test from 'node:test';

import { diffSessions, renderComparison } from '../token-bench/compare.mjs';

const usage = (taskId, totalTokens, cost = 0.001) => ({
  layer: 'pi_usage',
  task_id: taskId,
  total_tokens: totalTokens,
  cost,
});

test('diffSessions compares per-task tokens between off and on arms', () => {
  const comparison = diffSessions(
    [usage('bench-001', 16454, 0.0033), usage('bench-007', 46000, 0.009)],
    [usage('bench-001', 16454, 0.0033), usage('bench-007', 21000, 0.0042)],
  );
  assert.deepEqual(comparison.rows.map((row) => row.task), ['bench-001', 'bench-007']);
  const big = comparison.rows[1];
  assert.equal(big.off_tokens, 46000);
  assert.equal(big.on_tokens, 21000);
  assert.equal(big.delta_tokens, -25000);
  assert.equal(big.delta_pct, -54);
  assert.equal(comparison.saved_tokens, 25000);
  assert.equal(comparison.saved_pct, 40);
});

test('diffSessions tolerates tasks missing from one arm', () => {
  const comparison = diffSessions([usage('bench-only-off', 1000)], [usage('bench-only-on', 500)]);
  assert.equal(comparison.rows.length, 2);
  assert.equal(comparison.rows[0].on_tokens, 0);
  assert.equal(comparison.rows[1].off_tokens, 0);
});

test('renderComparison prints a readable table and savings line', () => {
  const comparison = diffSessions([usage('bench-007', 46000, 0.009)], [usage('bench-007', 21000, 0.0042)]);
  const text = renderComparison(comparison, { sessionOff: 'bench-ab-off', sessionOn: 'bench-ab-on' });
  assert.match(text, /off session: bench-ab-off/);
  assert.match(text, /bench-007/);
  assert.match(text, /saved: 25000 tokens \(-?54%\)/);
});
