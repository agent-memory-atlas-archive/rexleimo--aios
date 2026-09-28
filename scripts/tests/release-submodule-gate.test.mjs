import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { evaluateSubmoduleReleaseGate, parseTagRefs } from '../lib/release-submodule-gate.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECKER = path.join(repoRoot, 'scripts', 'check-release-submodule.mjs');

const COMMIT = '869b87fee3283cbfcca61d86dbf537e44c5ba202';
const OTHER = '8011956d0c82bed10d15061c6b4392a052137edf';

// `git ls-remote --tags` emits the tag object sha for refs/tags/vX and the peeled
// commit sha for refs/tags/vX^{}. Both shapes must resolve to the same release.
const ANNOTATED = [
  `${'0'.repeat(40)}\trefs/tags/v0.6.2`,
  `${'1'.repeat(40)}\trefs/tags/v0.6.2^{}`,
  `${COMMIT}\trefs/tags/v0.8.0`,
  `${COMMIT}\trefs/tags/v0.8.0^{}`,
].join('\n');

const LIGHTWEIGHT = `${COMMIT}\trefs/tags/v0.8.0`;

test('a tagged submodule commit passes the release ordering gate', () => {
  for (const tags of [ANNOTATED, LIGHTWEIGHT]) {
    const result = evaluateSubmoduleReleaseGate({ commitSha: COMMIT, lsRemoteTags: tags });
    assert.equal(result.verdict, 'pass');
    assert.deepEqual(result.blockedReasons, []);
    assert.deepEqual(result.tags, ['v0.8.0']);
  }
});

test('an untagged submodule commit blocks the host release', () => {
  // The real v6.1.0 shape: the bundled rex-harness commit had no tag at all.
  const result = evaluateSubmoduleReleaseGate({ commitSha: OTHER, lsRemoteTags: ANNOTATED });
  assert.equal(result.verdict, 'blocked');
  assert.deepEqual(result.blockedReasons, ['untagged_submodule_release']);
  assert.equal(result.evidence.commitSha, OTHER);
});

test('non-version refs at the commit do not count as a published release', () => {
  const result = evaluateSubmoduleReleaseGate({
    commitSha: COMMIT,
    lsRemoteTags: `${COMMIT}\trefs/heads/main\n${COMMIT}\trefs/remotes/origin/HEAD`,
  });
  assert.equal(result.verdict, 'blocked');
  assert.deepEqual(result.blockedReasons, ['untagged_submodule_release']);
});

test('a missing commit sha is blocked rather than silently passing', () => {
  const result = evaluateSubmoduleReleaseGate({ commitSha: '', lsRemoteTags: ANNOTATED });
  assert.equal(result.verdict, 'blocked');
  assert.deepEqual(result.blockedReasons, ['missing_submodule_commit']);
});

test('parseTagRefs keeps annotated tag names without the peel suffix', () => {
  const refs = parseTagRefs(ANNOTATED);
  assert.deepEqual(refs.map((entry) => entry.name), ['v0.6.2', 'v0.6.2', 'v0.8.0', 'v0.8.0']);
  assert.equal(refs.filter((entry) => entry.peeled).length, 2);
  assert.deepEqual(parseTagRefs(''), []);
  assert.deepEqual(parseTagRefs('not-a-ref-line'), []);
});

function runChecker(tags, commit = COMMIT) {
  try {
    const stdout = execFileSync('node', [CHECKER, '--commit', commit], { input: `${tags}\n`, stdio: 'pipe' }).toString();
    return { ok: true, status: 0, stdout: stdout.trim(), stderr: '' };
  } catch (error) {
    return { ok: false, status: error.status, stdout: String(error.stdout ?? '').trim(), stderr: String(error.stderr ?? '').trim() };
  }
}

test('the CLI exits 0 only for a published release point', () => {
  const output = runChecker(ANNOTATED);
  assert.equal(output.ok, true, output.stderr);
  assert.match(output.stdout, /v0\.8\.0/u);

  const blocked = runChecker(ANNOTATED, OTHER);
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /untagged_submodule_release/u);
  assert.match(blocked.stderr, /publish the rex-harness release first/u);
});

test('the CLI accepts --tags-file, which the PowerShell preflight uses', () => {
  const tagsFile = path.join(os.tmpdir(), `submodule-tags-${process.pid}.txt`);
  writeFileSync(tagsFile, `${ANNOTATED}\n`, 'utf8');
  try {
    const stdout = execFileSync('node', [CHECKER, '--commit', COMMIT, '--tags-file', tagsFile], { stdio: 'pipe' }).toString();
    assert.match(stdout, /v0\.8\.0/u);
    const blocked = (() => {
      try {
        execFileSync('node', [CHECKER, '--commit', OTHER, '--tags-file', tagsFile], { stdio: 'pipe' });
        return { status: 0 };
      } catch (error) {
        return { status: error.status, stderr: String(error.stderr ?? '') };
      }
    })();
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /untagged_submodule_release/u);
  } finally {
    rmSync(tagsFile, { force: true });
  }
});

test('the CLI fails closed when it cannot prove the release point', () => {
  const emptyTags = runChecker('', COMMIT);
  assert.equal(emptyTags.status, 2, 'no tag refs must not be read as "released"');

  const noCommit = runChecker(ANNOTATED, '');
  assert.equal(noCommit.status, 2, '--commit is required');
});
