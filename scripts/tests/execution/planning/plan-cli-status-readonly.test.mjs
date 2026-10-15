/**
 * Test scope contract — `aios plan` refuses silently-substituted read requests
 *
 * User goal:
 *   A shell user who asks the plan ledger to change state either gets that state
 *   change, or gets an error that names the correct entry point. Never a green
 *   exit that changed nothing.
 *
 * Explicit non-goals:
 *   - no new subcommand, no change to the done-gate rules, no MCP surface change;
 *   - no change to auto-gate routing or `--explicit-intent` semantics.
 *
 * In-scope behavior (observed at the public CLI seams):
 *   C1 The declared subcommand name reaches the ops layer verbatim, so the write
 *      entry point `set-status` is reachable through the real argv path.
 *   C2 An unrecognized subcommand is refused (exit 1) with the vocabulary named.
 *      Previously the parser rewrote it to `status`, so a typo printed the active
 *      plan and exited 0.
 *   C3 `plan status` carrying write flags is refused and persists nothing. This is
 *      the defect that left a finished plan in `executing`: `plan status --status
 *      done` was accepted, printed the plan, exited 0, and changed no state.
 *   C4 The sanctioned write path still completes — the refusals are not over-wide.
 *   C5 Help advertises `plan set-status`, the reason C3 was survivable at all.
 *
 * Out-of-scope behavior:
 *   evidence accounting, task context candidates, capability-evidence receipts.
 *
 * Allowed test seams:
 *   `parsePlanArgs` (argv -> options) and `runPlanCommand` (options -> exit code +
 *   persisted state) plus the help surface. No internal helper is asserted.
 *
 * Completion criteria:
 *   every C1-C5 has an assertion that can fail independently.
 *
 * Forbidden fake passes:
 *   no "does not throw" assertions; C3 must prove the state did NOT change, not
 *   merely that stderr was written.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getCommandHelpText } from '../../../lib/tooling/cli/help/help.mjs';
import { parsePlanArgs } from '../../../lib/tooling/cli/parse-args/govern/plan.mjs';
import { PLAN_SUBCOMMANDS, runPlanCommand } from '../../../lib/foundation/planning/ops/cli.mjs';
import { readActivePlan } from '../../../lib/foundation/planning/contract/contract.mjs';

function makeIo() {
  let stdoutText = '';
  let stderrText = '';
  return {
    stdout: { write(chunk) { stdoutText += String(chunk); } },
    stderr: { write(chunk) { stderrText += String(chunk); } },
    read() { return { stdoutText, stderrText }; },
  };
}

/** argv -> parsePlanArgs -> runPlanCommand: the real CLI path minus the spawn. */
async function runArgv(rootDir, argv) {
  const parsed = parsePlanArgs(argv);
  const io = makeIo();
  const outcome = await runPlanCommand({ json: true, ...parsed.options }, { rootDir, ...io });
  return { outcome, io: io.read(), parsed };
}

async function makeWorkspace() {
  return mkdtemp(path.join(os.tmpdir(), 'aios-plan-status-readonly-'));
}

async function withPlan(run) {
  const rootDir = await makeWorkspace();
  try {
    const started = await runArgv(rootDir, ['plan', 'start', '--title', 'ledger probe', '--task', 'ledger probe']);
    assert.equal(started.outcome.exitCode, 0, started.io.stderrText);
    return await run(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test('C1: the declared subcommand name survives the parser, so set-status is reachable', () => {
  const parsed = parsePlanArgs(['plan', 'set-status', '--status', 'done', '--force']);
  assert.equal(parsed.mode, 'command');
  assert.equal(parsed.options.subcommand, 'set-status');
  assert.equal(parsed.options.status, 'done');
  assert.equal(parsed.options.force, true);
});

test('C2: an unknown plan subcommand is refused with the vocabulary, not silently shown as status', async () => {
  const rootDir = await makeWorkspace();
  try {
    const { outcome, io } = await runArgv(rootDir, ['plan', 'list', '--json']);
    assert.equal(outcome.exitCode, 1, `unknown subcommand must fail closed: ${io.stdoutText}`);
    assert.match(io.stderrText, /unknown plan subcommand: list/);
    assert.match(io.stderrText, /set-status/);
    assert.equal(readActivePlan(rootDir), null, 'an unknown subcommand must persist nothing');
    // The vocabulary owner is the ops layer, so the refusal must name every entry point.
    const listed = io.stderrText.split('valid subcommands:')[1].trim().split(/\s*\|\s*/);
    assert.deepEqual(listed, [...PLAN_SUBCOMMANDS]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('C3: plan status with write flags is refused and changes no ledger state', async () => {
  await withPlan(async (rootDir) => {
    const before = readActivePlan(rootDir);
    assert.equal(before.status, 'active', 'a freshly started plan is active');

    const attempted = await runArgv(rootDir, ['plan', 'status', '--status', 'done', '--force']);
    assert.equal(attempted.outcome.exitCode, 1, 'a write request on a read-only view must not exit 0');
    assert.match(attempted.io.stderrText, /plan status is read-only/);
    assert.match(attempted.io.stderrText, /aios plan set-status --status/);

    const after = readActivePlan(rootDir);
    assert.equal(after.status, 'active', 'the refusal must prove nothing was written');
    assert.equal(after.updatedAt, before.updatedAt);
  });
});

test('C4: the sanctioned write path still lands, so the refusals are not over-wide', async () => {
  await withPlan(async (rootDir) => {
    const unforced = await runArgv(rootDir, ['plan', 'set-status', '--status', 'done']);
    assert.equal(unforced.outcome.exitCode, 1, 'the done gate still blocks an unverified plan');
    assert.equal(readActivePlan(rootDir).status, 'active');

    const forced = await runArgv(rootDir, [
      'plan', 'set-status', '--status', 'done', '--force', '--note', 'operator closed it',
    ]);
    assert.equal(forced.outcome.exitCode, 0, forced.io.stderrText);
    const closed = readActivePlan(rootDir);
    assert.equal(closed.status, 'done');
    assert.equal(closed.note, 'operator closed it');

    const readBack = await runArgv(rootDir, ['plan', 'status']);
    assert.equal(readBack.outcome.exitCode, 0, readBack.io.stderrText);
  });
});

test('C5: plan help advertises set-status so the write entry point is discoverable', () => {
  const help = getCommandHelpText('plan');
  assert.match(help, /aios plan set-status --status <active\|approved\|executing\|done\|blocked>/);
  assert.match(help, /aios plan status \[--workspace <path>\] \[--json\]/);
});
