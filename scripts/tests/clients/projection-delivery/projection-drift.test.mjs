/* 中文注释：work-delivery-guarantee 的诚实 RED。断言"漂移变成可机读状态"这一新用户可观察行为：
 * 当前没有任何 projection 检查（grep 实测零命中），审计脚本还躺在 .aios/tmp，验收不可重复。
 * 测试用 fixture 双根目录，不依赖本机安装态；真实安装态只作额外证据。 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { CLIENT_DEFINITIONS } from '../../../lib/foundation/clients/selection/core/definitions.mjs';
import { collectProjectionDrift } from '../../../lib/clients/rex-harness/projection-drift.mjs';

const PROJECTION_MARKER_NAME = '.rex-projection.json';
const TOOL = path.resolve(process.cwd(), 'scripts/aios-projection-drift.mjs');

/** 中文注释：期望值取自客户端注册表本身，不在测试里再拄一份硬编码清单——
 * 否则测试与实现就是同一条规则的两个 owner，而这正是本轮要修的缺陷。 */
function registrySkillRoots() {
  return [...new Set(Object.values(CLIENT_DEFINITIONS)
    .map((definition) => definition.projectSkillRoot)
    .map((relative) => path.dirname(relative)))];
}

async function collectDrift({ install, repo }) {
  return collectProjectionDrift({ installRoot: install, repoRoot: repo });
}

async function makeFixture({ skillContent, attachment = false }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rex-drift-'));
  await makeMarked({ root, client: '.agents', skill: 'rex-code-review', content: skillContent });
  if (attachment) {
    const refs = path.join(root, 'install', 'rex-harness', 'skill-sources', 'rex-code-review', 'references');
    await mkdir(refs, { recursive: true });
    await writeFile(path.join(refs, 'extra.md'), 'only in source');
  }
  return { root, install: path.join(root, 'install'), repo: path.join(root, 'repo') };
}

function runTool({ install, repo }, extraArgs = []) {
  return execFileSync(process.execPath, [
    TOOL, '--json', '--install-root', install, '--repo-root', repo, ...extraArgs,
  ], { encoding: 'utf8' });
}

async function cleanup(...roots) {
  for (const root of roots) await rm(root, { recursive: true, force: true });
}

test('the drift tool reports machine-readable counts for a clean projection', async () => {
  const fx = await makeFixture({ skillContent: '# Rex Code Review\n0. Load `rex-engineering-standards` first.\n' });
  try {
    const report = JSON.parse(runTool(fx));
    assert.equal(report.checked, 1, 'one projected entry under the fixture repo');
    assert.equal(report.skillDrift, 0);
    assert.equal(report.attachmentDrift, 0);
  } finally {
    await cleanup(fx.root);
  }
});

test('a stale SKILL.md is skill drift, an attachment-only difference is not', async () => {
  const stale = await makeFixture({ skillContent: '# Rex Code Review\n0. Load first.\n' });
  const attachment = await makeFixture({ skillContent: '# same\n', attachment: true });
  try {
    assert.equal(JSON.parse(runTool(stale)).skillDrift, 0, 'fixture starts converged');
    await writeFile(path.join(stale.repo, '.agents', 'skills', 'rex-code-review', 'SKILL.md'),
      '# Rex Code Review\n(旧版：没有第 0 步)\n');
    assert.equal(JSON.parse(runTool(stale)).skillDrift, 1, 'stale SKILL.md must count as skill drift');

    const a = JSON.parse(runTool(attachment));
    assert.equal(a.skillDrift, 0, 'attachment-only drift must not count as skill drift (C8)');
    assert.equal(a.attachmentDrift, 1);
  } finally {
    await cleanup(stale.root, attachment.root);
  }
});

test('--fail-on-drift turns skill drift into a nonzero exit so CI can gate on it', async () => {
  const fx = await makeFixture({ skillContent: '# clean\n' });
  try {
    await writeFile(path.join(fx.repo, '.agents', 'skills', 'rex-code-review', 'SKILL.md'), '# stale\n');
    execFileSync(process.execPath, [
      TOOL, '--json', '--install-root', fx.install, '--repo-root', fx.repo, '--fail-on-drift',
    ], { encoding: 'utf8' });
    assert.fail('--fail-on-drift must exit nonzero on skill drift');
  } catch (error) {
    assert.equal(error.status, 1, `expected exit code 1, got ${String(error.status)}`);
  } finally {
    await cleanup(fx.root);
  }
});

test('an undelivered skill copy is counted separately, not silently dropped', async () => {
  const fx = await makeFixture({ skillContent: '# clean\n' });
  try {
    // 安装器对 unmanaged-target-differs 的条目保留原文且不写 marker：
    // 只量 marker 覆盖面的话，"零漂移"会把客户端真正在读的旧副本说成没问题。
    const sourceTdd = path.join(fx.install, 'rex-harness', 'skill-sources', 'rex-tdd');
    await mkdir(sourceTdd, { recursive: true });
    await writeFile(path.join(sourceTdd, 'SKILL.md'), '# source of truth\n');
    await mkdir(path.join(fx.repo, '.agents', 'skills', 'rex-tdd'), { recursive: true });
    await writeFile(path.join(fx.repo, '.agents', 'skills', 'rex-tdd', 'SKILL.md'), '# 手工维护的旧副本\n');
    // 项目自有技能：源侧根本没有这个名字，不该被算成未送达
    await mkdir(path.join(fx.repo, '.agents', 'skills', 'my-own-skill'), { recursive: true });
    await writeFile(path.join(fx.repo, '.agents', 'skills', 'my-own-skill', 'SKILL.md'), '# mine\n');

    const report = JSON.parse(runTool(fx));
    assert.equal(report.unmanaged, 1, '源侧认识但没有 marker 的副本必须现形');
    assert.equal(report.skillDrift, 0, 'unmanaged copies are not counted as drift: overwriting them is a human call');
    assert.equal(report.checked, 2);
  } finally {
    await cleanup(fx.root);
  }
});

/** 中文注释：一条“带 marker 的投影对”只有一个构造方式；两个近乎相同的 fixture helper 就是同一个知识有两处表示。 */
async function makeMarked({ root, client, skill, sourceSkill = skill, content }) {
  const install = path.join(root, 'install', 'rex-harness', 'skill-sources', sourceSkill);
  const projected = path.join(root, 'repo', client, 'skills', skill);
  await mkdir(install, { recursive: true });
  await mkdir(projected, { recursive: true });
  await writeFile(path.join(install, 'SKILL.md'), content);
  await writeFile(path.join(projected, 'SKILL.md'), content);
  await writeFile(path.join(projected, PROJECTION_MARKER_NAME), JSON.stringify({
    schemaVersion: 1, packageVersion: '0.11.1', skillId: skill,
  }));
  return projected;
}

test('the default measurement surface is the whole client registry, not a local list', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rex-drift-registry-'));
  try {
    // .claude 在旧的硬编码清单里，.opencode 只在客户端注册表里有——
    // 默认口径看不见 .opencode 就意味着"零漂移"只说了表面的一部分。
    await makeMarked({ root, client: '.claude', skill: 'rex-implement', content: '# clean\n' });
    await makeMarked({ root, client: '.opencode', skill: 'rex-implement', content: '# clean\n' });
    const fx = { root, install: path.join(root, 'install'), repo: path.join(root, 'repo') };

    const report = await collectDrift(fx);
    assert.equal(report.checked, 2, 'both registry client roots must be measured by default');

    const registryRoots = registrySkillRoots();
    const explicit = await collectProjectionDrift({
      installRoot: fx.install, repoRoot: fx.repo,
      clientSkillRoots: registryRoots,
    });
    assert.equal(report.checked, explicit.checked,
      '默认覆盖面必须等于注册表 projectSkillRoot 全集（一条规则只有一个 owner）');
  } finally {
    await cleanup(root);
  }
});

test('ownership of an unmanaged copy comes from the source directory, not a name prefix', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rex-drift-owner-'));
  try {
    // 源侧有 helper-ui（不带 rex- 前缀），投影侧同名目录存在但没有 marker → 这是没人管的旧副本
    await makeMarked({ root, client: '.claude', skill: 'helper-ui', content: '# source\n' });
    const unmanaged = path.join(root, 'repo', '.claude', 'skills', 'helper-ui');
    await rm(path.join(unmanaged, PROJECTION_MARKER_NAME), { force: true });
    // 项目自有技能：源侧根本没有，不该被算成未送达
    await mkdir(path.join(root, 'repo', '.claude', 'skills', 'my-own-skill'), { recursive: true });
    await writeFile(path.join(root, 'repo', '.claude', 'skills', 'my-own-skill', 'SKILL.md'), '# mine\n');

    const report = await collectDrift({ root, install: path.join(root, 'install'), repo: path.join(root, 'repo') });
    assert.equal(report.unmanaged, 1, 'a source-known skill without a marker is unmanaged regardless of its name');
    assert.equal(report.checked, 1, 'only the marked projection is counted as delivered');
  } finally {
    await cleanup(root);
  }
});
