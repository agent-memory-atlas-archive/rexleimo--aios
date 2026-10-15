import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parsePlanArgs } from '../../../lib/tooling/cli/parse-args/govern/plan.mjs';
import { canonicalizeWorkItemId } from '../../../lib/foundation/planning/contract/contract.mjs';
import { runPlanCommand } from '../../../lib/foundation/planning/ops/cli.mjs';

// A23: the declared work-item identity has to reach the Capability activation as well, otherwise the
// ledger answers to an id (A22) while its Provider Command answers to a path or a turn hash.
const TASK = 'propagate the declared work-item identity into the capability binding';

function makeIo() {
  let out = '';
  let err = '';
  return {
    stdout: { write(chunk) { out += String(chunk); } },
    stderr: { write(chunk) { err += String(chunk); } },
    read() { return { out, err }; },
  };
}

async function makeTemp() {
  return mkdtemp(path.join(os.tmpdir(), 'aios-auto-gate-identity-'));
}

async function gate(rootDir, extra = []) {
  const argv = ['plan', 'auto-gate', '--task', TASK, ...extra, '--explicit-intent', 'plan', '--json'];
  const parsed = parsePlanArgs(argv);
  assert.equal(parsed.mode, 'command', `plan CLI did not accept: ${argv.join(' ')}`);
  const io = makeIo();
  const outcome = await runPlanCommand({ json: true, ...parsed.options }, { rootDir, ...io });
  const { out, err } = io.read();
  const result = outcome?.result || null;
  return {
    exitCode: outcome.exitCode,
    err,
    created: result?.created,
    action: result?.action,
    plan: result?.plan || null,
    activationId: result?.capabilityActivation?.activationId || null,
    command: result?.capabilityCommand || null,
  };
}

async function documents(rootDir) {
  try {
    return (await readdir(path.join(rootDir, 'docs', 'plans'))).filter((n) => n.endsWith('.md')).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

test('P1 a gate-created ledger carries the declared identity (K1 is closed)', async () => {
  const rootDir = await makeTemp();
  try {
    const first = await gate(rootDir, ['--work-item', 'a23-probe']);
    assert.equal(first.exitCode, 0, first.err);
    assert.equal(first.created, true);
    assert.equal(first.plan.workItemId, 'a23-probe', 'the gate still writes an unkeyed ledger');
    assert.match(first.plan.relativePath, /a23-probe\.md$/u);
    assert.ok(first.command, 'no Provider Command on the declared path');
    assert.equal(first.command.type, 'provider.invoke');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('P2 the same id resolves to the same ledger and the same activation', async () => {
  const rootDir = await makeTemp();
  try {
    const first = await gate(rootDir, ['--work-item', 'a23-probe']);
    const again = await gate(rootDir, ['--work-item', 'A23 probe', '--explicit-intent', 'plan']);
    assert.equal(again.created, false, 'a repeat declaration minted a second ledger');
    assert.equal(again.plan.relativePath, first.plan.relativePath);
    assert.equal(again.activationId, first.activationId, 'the same work item got a second activation');
    assert.deepEqual(await documents(rootDir), [first.plan.relativePath.split('/').pop()]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('P3 a turn that declares nothing still finds the id-keyed activation (read-through)', async () => {
  const rootDir = await makeTemp();
  try {
    const declared = await gate(rootDir, ['--work-item', 'a23-probe']);
    const plain = await gate(rootDir);
    assert.equal(plain.created, false);
    assert.equal(plain.activationId, declared.activationId, 'reuse lost the activation bound under the id');
    assert.equal(plain.plan.relativePath, declared.plan.relativePath);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('P4 pre-existing path-keyed activations keep resolving (no legacy regression)', async () => {
  const rootDir = await makeTemp();
  try {
    const first = await gate(rootDir);
    assert.equal(first.plan.workItemId, '', 'an unkeyed turn must stay unkeyed');
    const again = await gate(rootDir);
    assert.equal(again.created, false);
    assert.equal(again.activationId, first.activationId, 'the path-keyed activation became unreachable');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('P5 a blank or unsafe declaration is refused before anything is written', async () => {
  const rootDir = await makeTemp();
  try {
    for (const [value, expectation] of [['', /must not be empty/iu], ['../out', /unsafe work item id/iu]]) {
      const result = await gate(rootDir, ['--work-item', value]);
      assert.equal(result.exitCode, 1, `--work-item "${value}" was accepted`);
      assert.match(result.err, expectation);
    }
    assert.deepEqual(await documents(rootDir), [], 'a refused declaration still wrote a ledger');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('P6 distinct ids are distinct work items with distinct bindings', async () => {
  const rootDir = await makeTemp();
  try {
    const one = await gate(rootDir, ['--work-item', 'item-one']);
    const two = await gate(rootDir, ['--work-item', 'item-two']);
    assert.equal(two.created, true, 'the second id collapsed into the first ledger');
    assert.notEqual(two.plan.relativePath, one.plan.relativePath);
    assert.notEqual(two.activationId, one.activationId);
    assert.equal((await documents(rootDir)).length, 2);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('P8 an empty declaration means "no declaration", not a slug fallback', () => {
  // `slugify` returns the literal 'plan' for an empty input. Reusing that as the canonical id made
  // every undeclared turn look like a *different* work item, which silently switched off A21's reuse
  // rule. The absence of a declaration is a fact the policy depends on, so it stays empty.
  assert.equal(canonicalizeWorkItemId(''), '');
  assert.equal(canonicalizeWorkItemId('   '), '');
  assert.equal(canonicalizeWorkItemId(undefined), '');
  assert.equal(canonicalizeWorkItemId('A23 probe'), 'a23-probe');
});

test('P7 two contradictory declarations are refused instead of silently resolved', async () => {
  const rootDir = await makeTemp();
  try {
    const one = await gate(rootDir, ['--work-item', 'item-one']);
    assert.equal(one.exitCode, 0, one.err);
    const conflict = await gate(rootDir, ['--work-item', 'item-one', '--new-work-item']);
    assert.equal(conflict.exitCode, 1, 'the contradiction was accepted');
    assert.match(conflict.err, /new-work-item/iu);
    // Silently resolving it would write a second ledger while both answered to the same activation
    // key — an incoherent binding, not a new work item.
    assert.equal((await documents(rootDir)).length, 1, 'the refused combination wrote a ledger');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
