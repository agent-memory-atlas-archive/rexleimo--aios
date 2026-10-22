/* 中文注释：送达侧的 wiring 担保。子模块那边已有"每个代码生产 Provider 都必须先加载标准"的守卫
 * （rex-harness/tests/skills/standards-provider-wiring.test.mjs），但源侧正确不等于客户端读到的是对的：
 * 本仓库实测过 30 条 SKILL.md 送达漂移。这个文件只担保一件事——投影是逐字节搬运，
 * 交付环节不存在第二道加工会把第 0 步弄丢；一旦有人加了加工，这里就红。 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// 中文注释：静态相对导入公开面（ADR 0001 允许的父仓库唯一入口），不用 process.cwd() 拼路径——
// 拼出来就依赖运行目录，而 CI 固定在仓库根，那种脆弱是静默的。
import { CLIENT_DEFINITIONS } from '../../../lib/foundation/clients/selection/core/definitions.mjs';
import { collectProjectionDrift } from '../../../lib/clients/rex-harness/projection-drift.mjs';
import {
  installClientProjection,
  sharedReferenceSkillIds,
  standardsReferenceConsumers,
  supportedClients,
} from '../../../../rex-harness/src/index.mjs';

const REX_ROOT = path.resolve(import.meta.dirname, '../../../..', 'rex-harness');

test('the projection copies every provider SKILL.md byte for byte, precondition included', async (t) => {
  assert.ok(standardsReferenceConsumers.length > 0, '登记表为空就等于没有担保');
  const standards = sharedReferenceSkillIds[0];
  assert.ok(standards, 'the standards reference skill must be registered');

  const clients = supportedClients();
  assert.ok(clients.length >= 2, 'supportedClients must report the client set');
  const root = await mkdtemp(path.join(os.tmpdir(), 'rex-wiring-'));
  try {
    for (const client of clients) {
      await t.test(client, async () => {
        const projectRoot = path.join(root, client);
        await mkdir(projectRoot, { recursive: true });
        installClientProjection({ client, rootDir: projectRoot });

        for (const consumer of standardsReferenceConsumers) {
          const source = await readFile(path.join(REX_ROOT, 'skill-sources', consumer, 'SKILL.md'));
          const deliveredPath = path.join(projectRoot, projectSkillRootOf(client), consumer, 'SKILL.md');
          const delivered = await readFile(deliveredPath);
          assert.ok(delivered.equals(source),
            `${client}/${consumer} was transformed on delivery: the projection must be a byte-for-byte copy`);
          assert.match(delivered.toString('utf8'), new RegExp(standards, 'u'),
            `${client}/${consumer} reached the client without its standards precondition`);
        }
      });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a hand-edited projection is never silently stale: the drift tool must see it', async () => {
  // 中文注释：本轮实测出的真机制——安装器只要发现目标与它自己写过的摘要不一致，就归为
  // unmanaged-target-differs 并保留原文，**即使那层 marker 是它自己写的**。也就是说一次意外编辑
  // 会把该文件永久冻结，重生救不回来；只有没被人改过的旧投影才会被覆盖（本仓库实测 30→0 就属于这一类）。
  // 所以这里不断言“重生会修复手改”（那不成立也不应当成立），而是断言手改一定可见。
  const client = supportedClients()[0];
  const consumer = standardsReferenceConsumers[0];
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'rex-stale-'));
  try {
    installClientProjection({ client, rootDir: projectRoot });
    const target = path.join(projectRoot, projectSkillRootOf(client), consumer, 'SKILL.md');
    await writeFile(target, '# 旧版投影：没有第 0 步\n');

    const report = collectProjectionDrift({
      installRoot: path.resolve(REX_ROOT, '..'), repoRoot: projectRoot,
      clientSkillRoots: [CLIENT_DEFINITIONS[client].projectSkillRoot.split('/')[0]],
    });
    const entry = report.entries.find((item) => item.skill === consumer);
    assert.ok(entry, 'the edited projection must still be inside the measured surface');
    assert.equal(entry.skillDrift, true,
      'removing the precondition by hand must show up as skill drift, not pass silently');

    // 手改不会被重生“修好”：这条把期望写死，下一个人不会误以为跑一次 init 就完事
    installClientProjection({ client, rootDir: projectRoot });
    assert.match(await readFile(target, 'utf8'), /旧版投影/u,
      'a diverged target is retained by design; recovery is an explicit human action');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

/** 中文注释：落点由注册表给出，不在测试里维护第二份"客户端 → 目录"映射；
 * 这里只做一件事——把注册表定义的 projectSkillRoot 应用到临时项目根上。 */
function projectSkillRootOf(client) {
  const relative = CLIENT_DEFINITIONS[client]?.projectSkillRoot;
  assert.ok(relative, `client ${client} has no projectSkillRoot in the registry`);
  return relative.split('/').join(path.sep);
}
