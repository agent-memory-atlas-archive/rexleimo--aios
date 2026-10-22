/* 中文注释：work-delivery-guarantee 的诚实 RED。断言"漂移变成可机读状态"这一新用户可观察行为：
 * 当前没有任何 projection 检查（grep 实测零命中），审计脚本还躺在 .aios/tmp，验收不可重复。
 * 测试用 fixture 双根目录，不依赖本机安装态；真实安装态只作额外证据。 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const TOOL = path.resolve(process.cwd(), 'scripts/aios-projection-drift.mjs');

async function makeFixture({ skillContent, attachment = false }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rex-drift-'));
  const install = path.join(root, 'install', 'rex-harness', 'skill-sources', 'rex-code-review');
  const projected = path.join(root, 'repo', '.agents', 'skills', 'rex-code-review');
  await mkdir(install, { recursive: true });
  await mkdir(projected, { recursive: true });
  await writeFile(path.join(install, 'SKILL.md'), skillContent);
  await writeFile(path.join(projected, 'SKILL.md'), skillContent);
  await writeFile(path.join(projected, '.rex-projection.json'), JSON.stringify({
    schemaVersion: 1, packageVersion: '0.11.1', skill: 'rex-code-review',
  }));
  if (attachment) {
    await mkdir(path.join(install, 'references'), { recursive: true });
    await writeFile(path.join(install, 'references', 'extra.md'), 'only in source');
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
