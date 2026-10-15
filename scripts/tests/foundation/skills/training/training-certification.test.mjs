import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { certifySkillTraining, validateCertifiedTrainingEvidence } from '../../../../lib/tooling/skills/training/training-certification.mjs';
import { runSkillTrainingCertification, runSkillTrainingGate, verifySkillTrainingGate } from '../../../../lib/tooling/skills/training/training-gate.mjs';

async function createGitSkillFixture() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-training-certification-'));
  const relativeSkillPath = 'skill-sources/release-safety/SKILL.md';
  const skillPath = path.join(rootDir, relativeSkillPath);
  await mkdir(path.dirname(skillPath), { recursive: true });
  await writeFile(skillPath, [
    '---',
    'name: release-safety',
    'description: Verify a release before publishing it.',
    '---',
    '',
    '# Release Safety',
    '',
    '1. Run the release checks.',
    '2. Record the command results.',
    '3. Publish only when every required check passes.',
    '',
  ].join('\n'), 'utf8');
  execFileSync('git', ['init'], { cwd: rootDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: rootDir });
  execFileSync('git', ['config', 'user.name', 'Training Fixture'], { cwd: rootDir });
  execFileSync('git', ['add', '.'], { cwd: rootDir });
  execFileSync('git', ['commit', '-m', 'baseline'], { cwd: rootDir, stdio: 'ignore' });
  await writeFile(skillPath, `${await readFile(skillPath, 'utf8')}\nUse the recorded evidence instead of claiming a pass.\n`, 'utf8');
  return { rootDir, relativeSkillPath, skillPath };
}

test('--skill certifies a named Skill even when the content already matches HEAD', async () => {
  const fixture = await createGitSkillFixture();
  // 提交后 --changed 什么都发现不了，但新鲜度契约要求能按 base=HEAD 重新出证。
  execFileSync('git', ['add', '.'], { cwd: fixture.rootDir });
  execFileSync('git', ['commit', '-m', 'skill update'], { cwd: fixture.rootDir, stdio: 'ignore' });
  const auto = await runSkillTrainingCertification(
    { changed: true, base: 'HEAD', json: true },
    { rootDir: fixture.rootDir, stdout: { write() {} } },
  );
  assert.equal(auto.report.skills.length, 0, 'git-derived discovery is empty once committed');

  let output = '';
  const named = await runSkillTrainingCertification(
    { skill: ['release-safety'], base: 'HEAD', json: true },
    { rootDir: fixture.rootDir, stdout: { write: (chunk) => { output += String(chunk); } } },
  );
  assert.equal(named.exitCode, 0, output);
  assert.equal(JSON.parse(output).skills[0].status, 'accepted');

  // 点名不存在的 Skill 是 blocked，不是默默跳过：发布门不能因为拼错名字而放行。
  let blockedOutput = '';
  const blocked = await runSkillTrainingCertification(
    { skill: ['no-such-skill'], base: 'HEAD', json: true },
    { rootDir: fixture.rootDir, stdout: { write: (chunk) => { blockedOutput += String(chunk); } } },
  );
  assert.equal(blocked.exitCode, 1);
  assert.equal(JSON.parse(blockedOutput).status, 'blocked');
  assert.match(JSON.parse(blockedOutput).skills[0].reason, /no SKILL\.md/u);

  const verifiedGate = await runSkillTrainingGate(
    { skill: ['release-safety'], base: 'HEAD', json: true },
    { rootDir: fixture.rootDir, stdout: { write() {} } },
  );
  assert.equal(verifiedGate.exitCode, 0, JSON.stringify(verifiedGate.report));
});

test('training certification records reproducible evidence and rejects a forged raw response', async () => {
  const fixture = await createGitSkillFixture();
  const certification = await certifySkillTraining({
    rootDir: fixture.rootDir,
    changedFiles: [fixture.relativeSkillPath],
    base: 'HEAD',
  });

  assert.equal(certification.status, 'verified', JSON.stringify(certification));
  assert.equal(certification.skills[0].status, 'accepted');

  const state = JSON.parse(await readFile(certification.skills[0].statePath, 'utf8'));
  const directValidation = await validateCertifiedTrainingEvidence({
    rootDir: fixture.rootDir,
    statePath: certification.skills[0].statePath,
    state,
    skillId: 'release-safety',
    sourcePath: fixture.relativeSkillPath,
    currentSkillHash: state.acceptedSkillHash,
    base: 'HEAD',
  });
  assert.equal(directValidation.ok, true, JSON.stringify(directValidation));
  const verified = await verifySkillTrainingGate({
    rootDir: fixture.rootDir,
    changedFiles: [fixture.relativeSkillPath],
    base: 'HEAD',
  });
  assert.equal(verified.status, 'verified', JSON.stringify(verified));

  const candidateRawPath = path.join(path.dirname(certification.skills[0].statePath), state.artifacts.candidateRaw);
  const candidateRaw = JSON.parse(await readFile(candidateRawPath, 'utf8'));
  candidateRaw.results[0].targetResponse = '{"forged":true}';
  await writeFile(candidateRawPath, `${JSON.stringify(candidateRaw, null, 2)}\n`, 'utf8');

  const blocked = await verifySkillTrainingGate({
    rootDir: fixture.rootDir,
    changedFiles: [fixture.relativeSkillPath],
    base: 'HEAD',
  });
  assert.equal(blocked.status, 'blocked');
  // 旧断言只要求原因里带 "evidence"——那是门把九种失效压成一句话时代的形状。
  // 现在要求说清是哪一种：伪造的 raw 响应属于“重跑不可复现”。
  assert.match(blocked.skills[0].reason, /does not match a fresh deterministic scenario run/u);
  assert.equal(blocked.skills[0].reasonKind, 'non-reproducible-run');

  let output = '';
  const cliResult = await runSkillTrainingCertification(
    { changed: true, base: 'HEAD', json: true },
    { rootDir: fixture.rootDir, stdout: { write: (chunk) => { output += String(chunk); } } },
  );
  assert.equal(cliResult.exitCode, 0, JSON.stringify(cliResult.report));
  assert.equal(JSON.parse(output).status, 'verified');

  const newSkillPath = path.join(fixture.rootDir, 'skill-sources', 'new-release-safety', 'SKILL.md');
  await mkdir(path.dirname(newSkillPath), { recursive: true });
  await writeFile(newSkillPath, '---\nname: new-release-safety\ndescription: Use when testing new release safety behavior.\n---\n# New Release Safety\n\n- Record reproducible evidence.\n', 'utf8');
  const newSkillCertification = await certifySkillTraining({
    rootDir: fixture.rootDir,
    changedFiles: ['skill-sources/new-release-safety/SKILL.md'],
    base: 'HEAD',
  });
  assert.equal(newSkillCertification.status, 'verified', JSON.stringify(newSkillCertification));
  const newSkillState = JSON.parse(await readFile(newSkillCertification.skills[0].statePath, 'utf8'));
  assert.equal(newSkillState.baseline.kind, 'no-skill-control');
});

test('accepted evidence still verifies after a CRLF checkout of the stored baseline artifact', async () => {
  const fixture = await createGitSkillFixture();
  const certification = await certifySkillTraining({
    rootDir: fixture.rootDir,
    changedFiles: [fixture.relativeSkillPath],
    base: 'HEAD',
  });
  assert.equal(certification.status, 'verified', JSON.stringify(certification));
  const state = JSON.parse(await readFile(certification.skills[0].statePath, 'utf8'));
  const baselinePath = path.join(path.dirname(certification.skills[0].statePath), state.artifacts.baselineSkill);

  // 基线产物是跟 Git blob 做内容哈希比对的字节约定，但 core.autocrlf 的检出会把
  // 工作树实体刷成 CRLF——守卫假设“内容就是 Git 里那东西”，所以它必须与行尾无关。
  const lfContent = await readFile(baselinePath, 'utf8');
  await writeFile(baselinePath, lfContent.replace(/\n/gu, '\r\n'), 'utf8');

  const validated = await validateCertifiedTrainingEvidence({
    rootDir: fixture.rootDir,
    statePath: certification.skills[0].statePath,
    state,
    skillId: 'release-safety',
    sourcePath: fixture.relativeSkillPath,
    currentSkillHash: state.acceptedSkillHash,
    base: 'HEAD',
  });
  assert.equal(validated.ok, true, JSON.stringify(validated));
  const gate = await verifySkillTrainingGate({
    rootDir: fixture.rootDir,
    changedFiles: [fixture.relativeSkillPath],
    base: 'HEAD',
  });
  assert.equal(gate.status, 'verified', JSON.stringify(gate));

  // 反证：归一化只折叠行尾，不放宽内容——真实的基线漂移仍必须被拦。
  await writeFile(baselinePath, '---\r\nname: release-safety\r\ndescription: tampered baseline\r\n---\r\n', 'utf8');
  const tampered = await verifySkillTrainingGate({
    rootDir: fixture.rootDir,
    changedFiles: [fixture.relativeSkillPath],
    base: 'HEAD',
  });
  assert.equal(tampered.status, 'blocked', JSON.stringify(tampered));
  // 篡改产物与“按另一个 base 出证”必须是两个 code：前者的 remedy 是重跑，
  // 后者的 remedy 是换 base——合并成一句话就会指挥操作者去做错的那件事。
  const tamperedEntry = tampered.skills[0];
  assert.equal(tamperedEntry.code, 'baseline-artifact-tampered');
  assert.equal(tamperedEntry.reasonKind, 'inconsistent-evidence');
  assert.doesNotMatch(tamperedEntry.reason, /for base/u);
});
