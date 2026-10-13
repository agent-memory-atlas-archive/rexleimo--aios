/**
 * Release ordering gate for the rex-harness submodule.
 *
 * A host release archives the submodule work tree, so its version claim is only
 * verifiable when the bundled rex-harness commit is itself a published
 * (tagged) release. Without this gate a host release can ship a kernel version
 * that exists nowhere on the rex-harness remote, which makes the host changelog
 * entry unresolvable and leaves standalone rex-harness consumers with nothing.
 *
 * The gate checks objective git facts only (commit shas and ref names); it
 * never infers intent from text.
 */

const TAG_REF_PREFIX = 'refs/tags/';

/**
 * Parse `git ls-remote --tags` output into ref records.
 *
 * Annotated tags appear twice: `refs/tags/v1.2.3` carries the tag object sha and
 * `refs/tags/v1.2.3^{}` carries the peeled commit sha. Only shas equal to a
 * commit identify a release point, so both forms are kept and matched by sha.
 *
 * @param {string} lsRemoteOutput raw `git ls-remote --tags <remote>` stdout
 * @returns {Array<{sha: string, ref: string, peeled: boolean, name: string}>}
 */
export function parseTagRefs(lsRemoteOutput) {
  const lines = String(lsRemoteOutput ?? '').split(/\r?\n/).filter((line) => line.trim());
  const refs = [];
  for (const line of lines) {
    const [sha, ref] = line.split(/\s+/);
    if (!sha || !ref || !ref.startsWith(TAG_REF_PREFIX)) continue;
    const suffix = ref.slice(TAG_REF_PREFIX.length);
    const peeled = suffix.endsWith('^{}');
    refs.push({
      sha,
      ref,
      peeled,
      name: peeled ? suffix.slice(0, -3) : suffix,
    });
  }
  return refs;
}

/**
 * Decide whether a submodule commit is a published release on its remote.
 *
 * @param {object} input
 * @param {string} input.commitSha submodule commit the host release would bundle
 *   (the recorded gitlink, already required to match the checkout)
 * @param {string} input.lsRemoteTags raw `git ls-remote --tags` output of the
 *   submodule remote
 * @param {string[]} [input.tagPrefix=['v']] accepted tag name prefixes
 * @returns {{verdict: 'pass'|'blocked', blockedReasons: string[], tags: string[], evidence: object}}
 */
export function evaluateSubmoduleReleaseGate({ commitSha, lsRemoteTags, tagPrefix = ['v'] }) {
  const refs = parseTagRefs(lsRemoteTags);
  const sha = String(commitSha ?? '').trim();
  const matching = refs.filter((entry) => entry.sha === sha);
  const releaseTags = [...new Set(
    matching
      .filter((entry) => tagPrefix.some((prefix) => entry.name.startsWith(prefix)))
      .map((entry) => entry.name),
  )].sort();

  if (!sha) {
    return {
      verdict: 'blocked',
      blockedReasons: ['missing_submodule_commit'],
      tags: [],
      evidence: { commitSha: '', tagRefs: refs.length },
    };
  }

  if (releaseTags.length === 0) {
    return {
      verdict: 'blocked',
      blockedReasons: ['untagged_submodule_release'],
      tags: [],
      evidence: {
        commitSha: sha,
        tagRefs: refs.length,
        refsAtCommit: matching.map((entry) => entry.ref),
      },
    };
  }

  return {
    verdict: 'pass',
    blockedReasons: [],
    tags: releaseTags,
    evidence: { commitSha: sha, tagRefs: refs.length, releaseTags },
  };
}
