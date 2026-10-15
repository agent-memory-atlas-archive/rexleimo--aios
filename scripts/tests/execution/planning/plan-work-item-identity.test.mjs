import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';

import { parsePlanArgs } from '../../../lib/tooling/cli/parse-args/govern/plan.mjs';
import { runPlanCommand } from '../../../lib/foundation/planning/ops/cli.mjs';

// A22: `plan start` used to carry no identity, so registering the same work item twice wrote a
// second document (`<slug>-2.md`) and silently made it active — the first ledger then had no CLI
// path back, because task/evidence writes only reach the *active* plan. Identity is now declared
// with --work-item and compared as a canonical id, never as objective text.
const ID = 'dup-item';

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
  return mkdtemp(path.join(os.tmpdir(), 'aios-plan-work-item-identity-'));
}

async function cli(rootDir, argv) {
  const parsed = parsePlanArgs(argv);
  if (parsed.mode !== 'command') {
    return { refused: true, out: '', err: '' };
  }
  const io = makeIo();
  const outcome = await runPlanCommand({ json: true, ...parsed.options }, { rootDir, ...io });
  const { out, err } = io.read();
  return {
    refused: outcome.exitCode !== 0,
    out,
    err,
    state: outcome.state || null,
    created: outcome.created,
    recovered: outcome.recovered,
  };
}

const start = (rootDir, id = ID, title = 'Duplicate probe') =>
  cli(rootDir, ['plan', 'start', '--work-item', id, '--title', title, '--task', 'duplicate probe', '--json']);

async function documents(rootDir) {
  try {
    return (await readdir(path.join(rootDir, 'docs', 'plans'))).filter((n) => n.endsWith('.md')).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

test('W1 the same work-item id lands on one ledger; the second call reports reuse', async () => {
  const rootDir = await makeTemp();
  try {
    const first = await start(rootDir);
    assert.equal(first.refused, false, first.err);
    assert.equal(first.created, true);
    const files = await documents(rootDir);
    assert.equal(files.length, 1, `expected one ledger, got ${files}`);

    const second = await start(rootDir);
    assert.equal(second.created, false, 'a repeat registration created a second ledger');
    assert.equal(second.recovered, false);
    assert.equal(second.state.relativePath, first.state.relativePath);
    assert.deepEqual(await documents(rootDir), files, 'the repeat call added a document');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('W2 identity is the canonical id, so casing and spacing do not fork a ledger', async () => {
  const rootDir = await makeTemp();
  try {
    const first = await start(rootDir);
    const variants = ['DUP item', '  dup-item  ', 'dup.item'];
    for (const variant of variants) {
      const again = await start(rootDir, variant);
      assert.equal(again.created, false, `${variant} opened a second ledger`);
      assert.equal(again.state.relativePath, first.state.relativePath, `${variant} landed elsewhere`);
    }
    assert.equal((await documents(rootDir)).length, 1);
    assert.equal(first.state.workItemId, ID);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('W3 an unsafe id is refused and writes nothing — it is never sanitised into another ledger', async () => {
  const rootDir = await makeTemp();
  try {
    for (const bad of ['../evil', 'a/b', 'a\\b', 'x:y', '..', ' ']) {
      const result = await start(rootDir, bad);
      assert.equal(result.refused, true, `${bad} was accepted`);
      assert.match(result.err, /work item id/iu, `${bad} refused without saying why`);
    }
    assert.deepEqual(await documents(rootDir), [], 'a refused id still wrote a ledger');
    const stateDir = path.join(rootDir, '.aios', 'planning', 'plans');
    await assert.rejects(() => readdir(stateDir), 'a refused id still wrote the id store');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('W4 the unkeyed legacy path keeps its old behaviour (this item did not change defaults)', async () => {
  const rootDir = await makeTemp();
  try {
    await cli(rootDir, ['plan', 'start', '--title', 'Legacy probe', '--task', 'y', '--json']);
    await cli(rootDir, ['plan', 'start', '--title', 'Legacy probe', '--task', 'y', '--json']);
    const files = await documents(rootDir);
    assert.equal(files.length, 2, 'unkeyed plan start stopped minting siblings');
    assert.ok(files.some((name) => name.endsWith('-2.md')), `expected a -2 sibling in ${files}`);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('W5 structured state survives re-registration, so the orphan now has a path back', async () => {
  const rootDir = await makeTemp();
  try {
    await start(rootDir);
    // Switch away to a second work item, then come back by id: before A22 the only way back was
    // nonexistent, and task writes reached whichever plan happened to be active.
    await start(rootDir, 'other-item', 'Other');
    const reopened = await start(rootDir);
    assert.equal(reopened.created, false);
    await cli(rootDir, ['plan', 'task', 't1-understand', '--status', 'done', '--json']);

    await start(rootDir, 'other-item', 'Other');
    const again = await start(rootDir);
    assert.equal(again.created, false);
    const reopenedTask = again.state.tasks.find((task) => task.id === 't1-understand');
    assert.equal(reopenedTask.status, 'done', 're-registration reset the ledger instead of restoring it');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('W6 the identity is in the durable artifact, not only in gitignored state', async () => {
  const rootDir = await makeTemp();
  try {
    await start(rootDir);
    const [fileName] = await documents(rootDir);
    const markdown = await readFile(path.join(rootDir, 'docs', 'plans', fileName), 'utf8');
    assert.match(markdown, /^> work-item: dup-item$/mu, 'the plan document does not record its identity');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('W7 a lost id store re-adopts the existing document instead of reserving -2', async () => {
  const rootDir = await makeTemp();
  try {
    const first = await start(rootDir);
    // `.aios/` is runtime state; losing it must not turn the same work item into two ledgers.
    await rm(path.join(rootDir, '.aios', 'planning', 'plans', 'dup-item.json'), { force: true });

    const reopened = await start(rootDir);
    assert.equal(reopened.created, false);
    assert.equal(reopened.recovered, true, 'a lost store silently minted a sibling instead of reporting recovery');
    assert.equal(reopened.state.relativePath, first.state.relativePath);
    assert.equal((await documents(rootDir)).length, 1, 'a lost id store minted a sibling document');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('W8 distinct ids are distinct work items', async () => {
  const rootDir = await makeTemp();
  try {
    await start(rootDir);
    await start(rootDir, 'second-item');
    const files = await documents(rootDir);
    assert.equal(files.length, 2, 'distinct ids collapsed into one ledger');
    assert.ok(files.every((name) => !name.endsWith('-2.md')));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
