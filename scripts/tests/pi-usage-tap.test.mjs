import assert from 'node:assert/strict';
import test from 'node:test';

import { createLedgerUsageTap, extractUsageFromRecord } from '../lib/pi/usage-tap.mjs';

const assistantMessageEnd = {
  type: 'message_end',
  message: {
    role: 'assistant',
    model: 'kimi-k2.6',
    stopReason: 'stop',
    usage: { input: 120, output: 34, cacheRead: 7, cacheWrite: 9, totalTokens: 170, cost: { total: 0.01 } },
  },
};

test('extractUsageFromRecord normalizes assistant message_end usage', () => {
  assert.deepEqual(extractUsageFromRecord(assistantMessageEnd), {
    input: 120,
    output: 34,
    cache_read: 7,
    cache_write: 9,
    total_tokens: 170,
    cost: 0.01,
    model: 'kimi-k2.6',
    stop_reason: 'stop',
  });
});

test('extractUsageFromRecord ignores non-assistant, non-message_end, usage-less records', () => {
  assert.equal(extractUsageFromRecord(null), null);
  assert.equal(extractUsageFromRecord({ type: 'message_end', message: { role: 'user', usage: { input: 1 } } }), null);
  assert.equal(extractUsageFromRecord({ type: 'message_start', message: { role: 'assistant', usage: { input: 1 } } }), null);
  assert.equal(extractUsageFromRecord({ type: 'message_end', message: { role: 'assistant' } }), null);
  assert.equal(extractUsageFromRecord({ type: 'agent_settled' }), null);
});

test('extractUsageFromRecord coerces non-finite numbers to zero', () => {
  const usage = extractUsageFromRecord({
    type: 'message_end',
    message: { role: 'assistant', stopReason: 'error', usage: { input: NaN, output: '5', cacheRead: undefined, cacheWrite: 2, totalTokens: Infinity } },
  });
  assert.equal(usage.input, 0);
  assert.equal(usage.output, 0);
  assert.equal(usage.cache_read, 0);
  assert.equal(usage.cache_write, 2);
  assert.equal(usage.total_tokens, 0);
  assert.equal(usage.stop_reason, 'error');
});

test('createLedgerUsageTap forwards normalized usage to the ledger writer', async () => {
  const writes = [];
  const tap = createLedgerUsageTap({
    workspaceRoot: '/w',
    sessionId: 's',
    taskId: 'bench-7',
    writeImpl: async (options) => {
      writes.push(options);
    },
  });
  tap(assistantMessageEnd);
  tap({ type: 'message_end', message: { role: 'user', usage: { input: 1 } } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].layer, 'pi_usage');
  assert.equal(writes[0].sessionId, 's');
  assert.equal(writes[0].data.task_id, 'bench-7');
  assert.equal(writes[0].data.input, 120);
  assert.equal(writes[0].data.stop_reason, 'stop');
});

test('createLedgerUsageTap swallows writer failures so transport never breaks', async () => {
  const tap = createLedgerUsageTap({
    workspaceRoot: '/w',
    writeImpl: async () => {
      throw new Error('disk full');
    },
  });
  tap(assistantMessageEnd);
  await new Promise((resolve) => setImmediate(resolve));
});
