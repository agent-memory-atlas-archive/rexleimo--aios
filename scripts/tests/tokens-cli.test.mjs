import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArgs } from '../lib/cli/parse-args.mjs';
import { buildExecutionPlan, loadTaskSet, main, validateTask } from '../token-bench/run.mjs';

test('parseArgs routes the tokens command through the passthrough shape', () => {
  const parsed = parseArgs(['tokens', 'report', '--json']);
  assert.equal(parsed.command, 'tokens');
  assert.deepEqual(parsed.options.args, ['report', '--json']);
});

test('validateTask enforces id shape, objective, and check schema', () => {
  assert.deepEqual(validateTask({ id: 'bench-ok', objective: 'x', checks: [{ type: 'reply_contains', value: 'x' }] }, 'ok.json'), []);
  assert.ok(validateTask({ id: 'bad', objective: 'x' }, 'a.json').some((line) => /id/.test(line)));
  assert.ok(validateTask({ id: 'bench-x', objective: '' }, 'b.json').some((line) => /objective/.test(line)));
  assert.ok(validateTask({ id: 'bench-x', objective: 'x', checks: [{ type: 'unknown' }] }, 'c.json').some((line) => /check/.test(line)));
});

test('loadTaskSet reads the frozen fixture set clean', async () => {
  const { tasks, errors } = await loadTaskSet();
  assert.deepEqual(errors, []);
  assert.ok(tasks.length >= 6, `expected at least 6 frozen tasks, got ${tasks.length}`);
  assert.ok(tasks.every((task) => task.id.startsWith('bench-')));
});

test('buildExecutionPlan describes ledger attribution', () => {
  const plan = buildExecutionPlan([{ id: 'bench-a', checks: [] }], { sessionId: 'bench' });
  assert.equal(plan.session, 'bench');
  assert.equal(plan.ledger_layer, 'pi_usage');
  assert.deepEqual(plan.tasks, [{ id: 'bench-a', checks: 0 }]);
});

test('main --dry validates and plans without spawning any client', async () => {
  const chunks = [];
  const stdout = { write: (text) => chunks.push(text) };
  const result = await main(['--dry', '--json'], { stdout });
  assert.equal(result.ok, true);
  assert.ok(result.plan.tasks.length >= 6);
  const output = chunks.join('');
  assert.match(output, /"ledger_layer": "pi_usage"/);
  assert.match(output, /bench-001-echo/);
});

test('main --dry text mode prints the human plan line', async () => {
  const chunks = [];
  const stdout = { write: (text) => chunks.push(text) };
  const result = await main(['--dry'], { stdout });
  assert.equal(result.ok, true);
  assert.match(chunks.join(''), /dry plan: \d+ tasks/);
});
