import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parsePlanArgs } from '../../../../lib/tooling/cli/parse-args/govern/plan.mjs';
import { runPlanCommand } from '../../../../lib/foundation/planning/ops/cli.mjs';
import { evaluateWorkflowPolicy } from '../../../../lib/foundation/planning/contract/workflow-policy.mjs';

// A21: one work item must not produce two plan ledgers. Before the fix, a planned turn always
// resolved to `persistence: 'create'`, so registering twice (start, then auto-gate) wrote a second
// document whose name differed only by a `-2` suffix — and only the newer one carried the capability.
// Reuse is keyed on a state fact (an active, non-terminal plan exists), never on objective text.
const OBJECTIVE = 'stop one work item from producing two plan ledgers';

function makeIo() {
  let stdoutText = '';
  let stderrText = '';
  return {
    stdout: { write(chunk) { stdoutText += String(chunk); } },
    stderr: { write(chunk) { stderrText += String(chunk); } },
    read() { return { stdoutText, stderrText }; },
  };
}

async function makeTemp() {
  return mkdtemp(path.join(os.tmpdir(), 'aios-plan-single-ledger-'));
}

async function runCli(rootDir, argv) {
  const parsed = parsePlanArgs(argv);
  assert.equal(parsed.mode, 'command', `plan CLI did not accept: ${argv.join(' ')}`);
  const io = makeIo();
  const outcome = await runPlanCommand(
    { json: true, ...parsed.options },
    { rootDir, ...io },
  );
  const { stdoutText } = io.read();
  assert.equal(outcome.exitCode, 0, `${argv.join(' ')} -> ${stdoutText}`);
  return JSON.parse(stdoutText);
}

async function gate(rootDir, extra = []) {
  return runCli(rootDir, ['plan', 'auto-gate', '--task', OBJECTIVE, '--explicit-intent', 'plan', ...extra, '--json']);
}

async function planDocuments(rootDir) {
  const dir = path.join(rootDir, 'docs', 'plans');
  try {
    return (await readdir(dir)).filter((name) => name.endsWith('.md')).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function activeState(rootDir) {
  return JSON.parse(await readFile(path.join(rootDir, '.aios', 'planning', 'active.json'), 'utf8'));
}

function planResult(payload) {
  return payload?.result?.plan || payload?.plan || null;
}

test('N1 plan start then auto-gate leaves exactly one ledger, and it is the one start wrote', async () => {
  const rootDir = await makeTemp();
  try {
    await runCli(rootDir, ['plan', 'start', '--title', OBJECTIVE, '--task', OBJECTIVE, '--json']);
    const afterStart = await planDocuments(rootDir);
    assert.equal(afterStart.length, 1, `start wrote ${afterStart.length} documents`);

    const result = await gate(rootDir);
    assert.equal(result?.result?.created ?? result?.created, false, 'a planned turn wrote a second ledger');
    const reused = planResult(result);
    assert.equal(reused.relativePath, `docs/plans/${afterStart[0]}`);
    assert.deepEqual(await planDocuments(rootDir), afterStart, 'auto-gate added a document beside the active plan');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('N2 a repeated planned turn is idempotent on the ledger', async () => {
  const rootDir = await makeTemp();
  try {
    const first = await gate(rootDir);
    assert.equal(first?.result?.created ?? first?.created, true, 'the first turn must open a ledger');
    const documents = await planDocuments(rootDir);
    const second = await gate(rootDir);
    assert.equal(second?.result?.created ?? second?.created, false);
    assert.deepEqual(await planDocuments(rootDir), documents);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('N4 reuse still delivers a Provider Command, which is why reuse was useless before', async () => {
  const rootDir = await makeTemp();
  try {
    await runCli(rootDir, ['plan', 'start', '--title', OBJECTIVE, '--task', OBJECTIVE, '--json']);
    const result = await gate(rootDir);
    const payload = result?.result || result;
    assert.ok(payload.capabilityActivation, 'reuse returned no activation');
    assert.ok(payload.capabilityCommand, 'reuse returned no Command, so the caller could not execute anything');
    assert.equal(payload.capabilityCommand.type, 'provider.invoke');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('N3 --new-work-item is the declared escape hatch and does create a second ledger', async () => {
  const rootDir = await makeTemp();
  try {
    await gate(rootDir);
    const documents = await planDocuments(rootDir);
    const result = await gate(rootDir, ['--new-work-item']);
    assert.equal(result?.result?.created ?? result?.created, true, '--new-work-item was ignored');
    const after = await planDocuments(rootDir);
    assert.equal(after.length, documents.length + 1);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('N3b the flag parses; a truncated spelling is not accepted as the declared one', () => {
  const parsed = parsePlanArgs(['plan', 'auto-gate', '--task', 'x', '--new-work-item', '--json']);
  assert.equal(parsed.options.newWorkItem, true);

  // 2026-10-27 P0 更新：这里原先只能断言弱性质，因为注释里登记的“把未知输入降级成
  // 只读视图”那个 seam 尚未闭合。现在它闭合了：截断写法不再返回 help 降级对象，
  // 而是抛出一个用法错误——所以断言收紧，而不是放宽。
  const truncated = ['plan', 'auto-gate', '--task', 'x', '--new-work'];
  assert.throws(() => parsePlanArgs(truncated), (error) => {
    assert.match(String(error.message), /unknown option/u, 'a truncated spelling is reported as a usage error');
    assert.equal(error.usage, true, 'and it carries the marker that makes the process exit non-zero');
    return true;
  });
  // 抛错本身就不可能携带那个声明：保留原断言的意图，用新形状表达。
  assert.notEqual(parsePlanArgs(['plan', 'auto-gate', '--task', 'x', '--new-work-item']).options?.newWorkItem, undefined,
    'the declared spelling still parses');
});

test('N5 a terminal active plan never blocks a new work item', () => {
  const activePlan = { relativePath: 'docs/plans/old.md', status: 'done' };
  const reusable = evaluateWorkflowPolicy({
    message: OBJECTIVE,
    activePlan,
    explicitIntent: 'plan',
  });
  assert.equal(reusable.persistence, 'create', 'a done plan must not be reused as a live ledger');

  const live = evaluateWorkflowPolicy({
    message: OBJECTIVE,
    activePlan: { relativePath: 'docs/plans/live.md', status: 'executing' },
    explicitIntent: 'plan',
  });
  assert.equal(live.persistence, 'reuse');
  assert.equal(live.plan.relativePath, 'docs/plans/live.md', 'reuse must hand the adapter the plan it chose');

  const declared = evaluateWorkflowPolicy({
    message: OBJECTIVE,
    activePlan: { relativePath: 'docs/plans/live.md', status: 'executing' },
    explicitIntent: 'plan',
    newWorkItem: true,
  });
  assert.equal(declared.persistence, 'create');
});

test('N6 reuse does not rewrite the ledger document it reused', async () => {
  const rootDir = await makeTemp();
  try {
    await runCli(rootDir, ['plan', 'start', '--title', OBJECTIVE, '--task', OBJECTIVE, '--json']);
    const [fileName] = await planDocuments(rootDir);
    const documentPath = path.join(rootDir, 'docs', 'plans', fileName);
    const before = await readFile(documentPath, 'utf8');
    const beforeState = await activeState(rootDir);
    await gate(rootDir);
    assert.equal(await readFile(documentPath, 'utf8'), before, 'reuse mutated the plan document');
    const afterState = await activeState(rootDir);
    assert.equal(afterState.relativePath, beforeState.relativePath);
    assert.equal(afterState.createdAt, beforeState.createdAt, 'reuse re-created the plan instead of reusing it');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
