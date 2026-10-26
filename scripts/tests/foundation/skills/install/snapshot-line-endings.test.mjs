import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readGeneratedSkillMetadata } from '../../../../lib/tooling/skills/install/install-metadata.mjs';
import { checkGeneratedSkillsSync, syncGeneratedSkills } from '../../../../lib/tooling/skills/install/sync.mjs';

// 中文注释：这组用例钉住 2026-10-26 那次投影漂移的两条结论。
// 一、行尾差异不得阻断收养：core.autocrlf=true 的 Windows 会把未钉 eol 的资产检出成 CRLF，
// 当时的 LICENSE 是 blob 1068B/LF vs 磁盘 1089B/CRLF，21 字节差就使快照恒不等，
// 于是标记永远写不进去，检查器把行尾问题伪装成所有权问题。
// 二、被挡时必须说出是哪个文件：那时日志只有一行路径，定位靠人反复探针。

const SKILL_BODY = '# sample\n\ntext body\n';
const LICENSE_BODY = 'MIT License\n\nCopyright (c) 2026 sample\n';

function toCrlf(text) {
  return text.replace(/\n/g, '\r\n');
}

async function makeFixture() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-skills-eol-'));
  const sourceDir = path.join(rootDir, 'skill-sources', 'find-skills');
  await mkdir(sourceDir, { recursive: true });
  await writeFile(path.join(sourceDir, 'SKILL.md'), SKILL_BODY, 'utf8');
  await writeFile(path.join(sourceDir, 'LICENSE'), LICENSE_BODY, 'utf8');

  await mkdir(path.join(rootDir, 'config'), { recursive: true });
  await writeFile(
    path.join(rootDir, 'config', 'skills-sync-manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      generatedRoots: { codex: '.codex/skills' },
      skills: [
        {
          relativeSkillPath: 'find-skills',
          installCatalogName: 'find-skills',
          repoTargets: ['codex'],
        },
      ],
      legacyReplaceable: [],
      legacyUnmanaged: [],
    }, null, 2),
    'utf8',
  );

  // 预置一个无标记的历史副本，模拟 AIOS 接管前就存在的目录。
  const targetDir = path.join(rootDir, '.codex', 'skills', 'find-skills');
  await mkdir(targetDir, { recursive: true });
  return { rootDir, targetDir };
}

async function collectLogs(run) {
  const lines = [];
  const io = { log: (line) => lines.push(String(line)) };
  const result = await run({ io });
  return { lines, result };
}

function surfaceStats(result, surface) {
  const entry = (result.results || []).find((item) => item.surface === surface);
  assert.ok(entry, `missing result entry for ${surface}: ${JSON.stringify(result.results)}`);
  return entry;
}

test('a line-ending-only difference no longer blocks adoption of an unmanaged copy', async () => {
  const { rootDir, targetDir } = await makeFixture();
  await writeFile(path.join(targetDir, 'SKILL.md'), toCrlf(SKILL_BODY), 'utf8');
  await writeFile(path.join(targetDir, 'LICENSE'), toCrlf(LICENSE_BODY), 'utf8');
  assert.equal(readGeneratedSkillMetadata(targetDir), null);

  const { lines, result } = await collectLogs((options) => syncGeneratedSkills({ rootDir, ...options }));

  assert.equal(result.ok, true);
  assert.equal(surfaceStats(result, 'codex').skipped, 0);
  assert.deepEqual(
    lines.filter((line) => line.includes('skip unmanaged blocker')),
    [],
    `a CRLF-only copy must be adopted, not blocked: ${lines.join(' | ')}`,
  );
  const metadata = readGeneratedSkillMetadata(targetDir);
  assert.equal(metadata?.managedBy, 'aios');
  assert.equal(metadata?.targetSurface, 'codex');

  // 收养只补标记，不重写历史字节：当时磁盘仍是 CRLF。这是故意的——内容已与 canonical
  // 除去尾外全等，而下次物料变化时 writeMaterializedTarget 会整树重写为 LF。
  assert.equal(await readFile(path.join(targetDir, 'LICENSE'), 'utf8'), toCrlf(LICENSE_BODY));
  // 归一化在摘要层，不靠修改磁盘文件糊住门：源侧字节不被同步 touched。
  assert.equal(await readFile(path.join(rootDir, 'skill-sources', 'find-skills', 'LICENSE'), 'utf8'), LICENSE_BODY);

  const checked = await checkGeneratedSkillsSync({ rootDir });
  assert.equal(checked.ok, true, checked.issues.join(' | '));
});

test('the blocker line names the entries that keep an unmanaged copy from being adopted', async () => {
  const { rootDir, targetDir } = await makeFixture();
  await writeFile(path.join(targetDir, 'SKILL.md'), SKILL_BODY, 'utf8');
  // 目标侧 LICENSE 被人改过：这才是“不能收养”的真差异，必须被点名。
  await writeFile(path.join(targetDir, 'LICENSE'), 'Hand-edited license text\n', 'utf8');
  await writeFile(path.join(targetDir, 'EXTRA.md'), 'stray\n', 'utf8');

  const { lines, result } = await collectLogs((options) => syncGeneratedSkills({ rootDir, ...options }));

  assert.equal(result.ok, true);
  assert.equal(surfaceStats(result, 'codex').updated, 0);
  assert.equal(readGeneratedSkillMetadata(targetDir), null, 'a real content gap must not be adopted');
  const blocker = lines.find((line) => line.includes('skip unmanaged blocker'));
  assert.ok(blocker, `expected a blocker line, got: ${lines.join(' | ')}`);
  assert.match(blocker, /extra in target: EXTRA\.md/);
  assert.match(blocker, /content: LICENSE/);
});

test('the drift gate reports which file drifted instead of only the path', async () => {
  const { rootDir, targetDir } = await makeFixture();
  await writeFile(path.join(targetDir, 'SKILL.md'), SKILL_BODY, 'utf8');
  await writeFile(path.join(targetDir, 'LICENSE'), 'tampered license\n', 'utf8');
  const { result } = await collectLogs((options) => syncGeneratedSkills({ rootDir, ...options }));
  assert.equal(result.ok, true);

  // 未被收养（内容真有差），所以目标里也没有标记。检查器必须说出两件事实：
  // 缺的是哪个文件、内容差的是哪个文件——这正是当年被当成「所有权问题」的那层伪装。
  const checked = await checkGeneratedSkillsSync({ rootDir });
  assert.equal(checked.ok, false);
  assert.equal(checked.issues.length, 1, checked.issues.join(' | '));
  assert.match(checked.issues[0], /\[drift\] .*missing: \.aios-skill-sync\.json/);
  assert.match(checked.issues[0], /content: LICENSE/);
});
