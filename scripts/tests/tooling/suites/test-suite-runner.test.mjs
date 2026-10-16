import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { suiteSpec } from '../../../lib/tooling/test-suite-runner.mjs';

const MANIFEST = JSON.parse(fs.readFileSync('scripts/test-suites.json', 'utf8'));

test('unit suite is manifest-driven and covers only unit tests', () => {
  const unit = suiteSpec('unit');
  assert.equal(unit.concurrency, 4);
  // Explicit files, not `roots` discovery: the manifest is what the wiring guard reads,
  // so root-discovered files could be invisible to it (audit F7).
  assert.equal(unit.roots, undefined, 'unit suite must be explicit files, not roots discovery');
  assert.ok(Array.isArray(unit.files) && unit.files.length > 0);
  // The 2026-10 test-tree reorg dissolved scripts/tests/unit/, so the invariant is no longer a
  // single directory prefix — it is that every declared file is a real path under scripts/tests/.
  assert.ok(
    unit.files.every((file) => file.startsWith('scripts/tests/') && fs.existsSync(file)),
    `unit suite files must exist under scripts/tests/, got ${unit.files.join(', ')}`,
  );
  assert.deepEqual(unit.files, MANIFEST.unit.files, 'the manifest is the single source of truth');
});

test('regression suite uses an explicit legacy manifest', () => {
  const regression = suiteSpec('regression');
  // Concurrency is whatever the manifest declares; asserting a literal here is how this
  // test went stale (it pinned 1 long after the manifest moved to 4).
  assert.equal(regression.concurrency, MANIFEST.regression.concurrency);
  assert.equal(regression.files.length, MANIFEST.regression.files.length);
  assert.ok(regression.files.includes('scripts/tests/learning/model/model-router.test.mjs'));
  // The unit suite's default-mode file must stay out of regression — the two suites are disjoint.
  assert.ok(!regression.files.includes('scripts/tests/foundation/lifecycle-ops/default-mode.test.mjs'));
});

test('unknown suite is rejected', () => {
  assert.throws(() => suiteSpec('unknown'), /Unknown test suite/);
});

test('controlled suites are explicit and serial', () => {
  for (const name of ['browser', 'client', 'context', 'harness', 'orchestrator', 'rex', 'team']) {
    const suite = suiteSpec(name);
    assert.equal(suite.concurrency, 1);
    assert.ok(suite.files.length > 0);
    assert.ok(suite.files.every((file) => file.startsWith('scripts/tests/')));
  }
});
