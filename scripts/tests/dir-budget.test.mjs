import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_BUDGET,
  countDirEntries,
  evaluateBudgets,
  isDirectRun,
} from '../check-dir-budget.mjs';

test('dir budget counts files and subdirs as entries', () => {
  const counts = countDirEntries([
    'a/x.mjs',
    'a/y.mjs',
    'a/sub/z.mjs',
  ]);
  assert.equal(counts.get('a'), 3, 'x + y + sub/ 各占一位');
  assert.equal(counts.get('a/sub'), 1);
});

test('dir budget fails new violations and baseline growth, never on exempt', () => {
  const counts = new Map([
    ['ok-dir', 8],
    ['new-bad', 9],
    ['frozen', 12],
    ['grown', 11],
    ['gen-out', 200],
  ]);
  const { failures, recovered } = evaluateBudgets(counts, {
    budget: DEFAULT_BUDGET,
    exemptions: { 'gen-out': 'generated' },
    baseline: { frozen: 12, grown: 10 },
  });
  const kinds = Object.fromEntries(failures.map((f) => [f.dir, f.kind]));
  assert.deepEqual(kinds, { 'new-bad': 'new', grown: 'growth' });
  assert.deepEqual(recovered, []);
});

test('dir budget reports recovered baselines so entries get removed', () => {
  const { failures, recovered } = evaluateBudgets(new Map([['fixed', 7]]), {
    budget: DEFAULT_BUDGET,
    exemptions: {},
    baseline: { fixed: 16 },
  });
  assert.deepEqual(failures, []);
  assert.deepEqual(recovered, [{ dir: 'fixed', count: 7 }]);
});

test('dir budget CLI guard does not fire on import', () => {
  assert.equal(isDirectRun(['node', '/other/script.mjs'], 'file:///repo/scripts/check-dir-budget.mjs'), false);
});
