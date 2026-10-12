import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkCitation,
  extractCitations,
  resolveCitationFile,
} from '../check-doc-citations.mjs';

// 用可控的 trackedFiles 夹具覆盖 A1 要求的四种失败态，不依赖真实仓库状态。
const TRACKED = Object.freeze([
  'scripts/lib/a.mjs',
  'scripts/lib/sub/a.mjs',
  'docs/x.md',
]);

function cite(file, start, end) {
  return { ref: `\`${file}:${start}${end === start ? '' : `-${end}`}\``, file, start, end, index: 0 };
}

test('doc citations extract path:line refs and skip non-path backticks', () => {
  const citations = extractCitations('见 `scripts/lib/a.mjs:3` 与 `a.mjs:33-38`，而非 `matcher` 或 `00:15:23`');
  assert.equal(citations.length, 2);
  assert.equal(citations[0].file, 'scripts/lib/a.mjs');
  assert.equal(citations[0].start, 3);
  assert.equal(citations[1].file, 'a.mjs');
  assert.equal(citations[1].start, 33);
  assert.equal(citations[1].end, 38);
});

test('doc citations fail on missing files', () => {
  const reason = checkCitation(cite('nope.mjs', 3, 3), { rootDir: '/repo', trackedFiles: TRACKED });
  assert.match(reason, /no tracked file/u);
});

test('doc citations fail on ambiguous basenames', () => {
  // a.mjs 在 scripts/lib/a.mjs 与 scripts/lib/sub/a.mjs 各出现一次。
  const resolved = resolveCitationFile('a.mjs', { rootDir: '/repo', trackedFiles: TRACKED });
  assert.equal(resolved.status, 'ambiguous');
  const reason = checkCitation(cite('a.mjs', 3, 3), { rootDir: '/repo', trackedFiles: TRACKED });
  assert.match(reason, /matches 2 files/u);
  assert.match(reason, /full path/u);
});

test('doc citations resolve component-relative paths by unique suffix', () => {
  const ok = resolveCitationFile('packets/compact-packet.mjs', {
    rootDir: '/repo',
    trackedFiles: ['scripts/lib/interception/packets/compact-packet.mjs'],
  });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.rel, 'scripts/lib/interception/packets/compact-packet.mjs');

  const dup = resolveCitationFile('sub/p.mjs', {
    rootDir: '/repo',
    trackedFiles: ['x/sub/p.mjs', 'y/sub/p.mjs'],
  });
  assert.equal(dup.status, 'ambiguous');

  // `./` 锚定根目录：同名多命中也不歧义，专治 CLAUDE.md / .gitignore 类根文件。
  const anchored = resolveCitationFile('./CLAUDE.md', {
    rootDir: '/repo',
    trackedFiles: ['CLAUDE.md', 'client-sources/native-base/claude/project/CLAUDE.md'],
  });
  assert.equal(anchored.status, 'missing', '磁盘无此文件时仍报 missing（/repo 是假根）');
});

test('doc citations fail on out-of-range and non-positive lines', async () => {
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = await mkdtemp(path.join(os.tmpdir(), 'aios-citations-'));
  await mkdir(path.join(root, 'scripts', 'lib'), { recursive: true });
  await writeFile(path.join(root, 'scripts', 'lib', 'only.mjs'), 'one\ntwo\nthree\n', 'utf8');
  const tracked = ['scripts/lib/only.mjs'];

  const over = checkCitation(cite('scripts/lib/only.mjs', 4, 4), { rootDir: root, trackedFiles: tracked });
  assert.match(over, /exceeds .* \(3 lines\)/u);

  const zero = checkCitation(cite('scripts/lib/only.mjs', 0, 0), { rootDir: root, trackedFiles: tracked });
  assert.match(zero, /not > 0/u);

  const reversed = checkCitation(cite('scripts/lib/only.mjs', 3, 2), { rootDir: root, trackedFiles: tracked });
  assert.match(reversed, /before start/u);

  const ok = checkCitation(cite('scripts/lib/only.mjs', 2, 3), { rootDir: root, trackedFiles: tracked });
  assert.equal(ok, null);
});
