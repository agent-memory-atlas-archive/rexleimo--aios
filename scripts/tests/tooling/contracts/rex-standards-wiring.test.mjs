/* 中文注释：送达侧的 wiring 担保。子模块那边已经有"每个代码生产 Provider 都必须先加载标准"的守卫
 * （rex-harness/tests/skills/standards-provider-wiring.test.mjs），但源侧正确不等于客户端读到的是对的：
 * 本仓库实测过 30 条 SKILL.md 送达漂移。这个文件只担保一件事——投影是逐字节搬运，
 * 交付环节不存在第二道加工会把第 0 步弄丢；一旦有人加了加工，这里就红。 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const REX_PACKAGE = path.resolve(process.cwd(), 'rex-harness');
const STANDARDS = 'rex-engineering-standards';

async function rexPublicFace() {
  // 中文注释：只走公开面（src/index.mjs），这是 ADR 0001 允许的父仓库入口。
  return import(pathToFileURL(path.join(REX_PACKAGE, 'src', 'index.mjs')).href);
}

test('the projection copies each provider SKILL.md byte for byte, precondition included', async () => {
  const rex = await rexPublicFace();
  assert.ok(Array.isArray(rex.standardsReferenceConsumers) && rex.standardsReferenceConsumers.length > 0,
    '公开面必须给出代码生产 Provider 的登记表；测试不得自己抄一份名单');

  const root = await mkdtemp(path.join(os.tmpdir(), 'rex-wiring-'));
  try {
    const projectRoot = path.join(root, 'repo');
    await mkdir(projectRoot, { recursive: true });
    const result = rex.installClientProjection({ client: 'codex', rootDir: projectRoot });
    assert.ok(result, 'installClientProjection must return a result envelope');

    for (const consumer of rex.standardsReferenceConsumers) {
      const source = await readFile(path.join(REX_PACKAGE, 'skill-sources', consumer, 'SKILL.md'));
      const delivered = await readFile(path.join(projectRoot, '.codex', 'skills', consumer, 'SKILL.md'));
      assert.ok(delivered.equals(source),
        `${consumer} was transformed on delivery: the projection must be a byte-for-byte copy`);
      assert.match(delivered.toString('utf8'), new RegExp(STANDARDS, 'u'),
        `${consumer} reached the client without its standards precondition`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
