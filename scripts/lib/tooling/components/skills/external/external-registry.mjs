// scripts/lib/tooling/components/skills/external/external-registry.mjs — 外部技能 canonical 注册处
// 职责：定义外部技能的规范存放点（~/.aios/skills/external/<name>/）及其归属元数据约定，
// 让客户端分发副本可以追溯回注册处。与 canonical skill-sources（仓库内）并行、互不干扰。

import os from 'node:os';
import path from 'node:path';

import {
  buildInstalledSkillMetadata,
  isManagedInstalledSkill,
} from '../../../../tooling/skills/install/install-metadata.mjs';

// AIOS 用户级状态根：与 environment/aios-init/headroom-mcp/ownership.mjs 同一约定
// （env.AIOS_HOME 绝对路径优先，回退 ~/.aios），保证安装目标可测试重定向。
export function resolveAiosHome(env = process.env, homeDir = os.homedir()) {
  const raw = String(env.AIOS_HOME || '').trim();
  if (raw && path.isAbsolute(raw)) {
    return path.resolve(raw);
  }
  return path.join(homeDir, '.aios');
}

export function resolveExternalSkillRegistry({ env = process.env, homeDir = os.homedir() } = {}) {
  return path.join(resolveAiosHome(env, homeDir), 'skills', 'external');
}

// 注册处副本的归属元数据约定：client=registry / scope=external，catalogSource 记原始来源。
export function buildRegistryInstallMetadata({ skillName, source }) {
  return buildInstalledSkillMetadata({
    skillName,
    relativeSkillPath: skillName,
    client: 'registry',
    scope: 'external',
    installMode: 'copy',
    catalogSource: source,
  });
}

// 纯判定：注册处目录是否由本流程管理（名字 + client + scope 全匹配才算，忽略 catalogSource
// ——同名字技能换个来源重装应当刷新注册处而不是被当成别人家的）。
export function isManagedRegistryInstall(targetPath, skillName) {
  return isManagedInstalledSkill(targetPath, { skillName, client: 'registry', scope: 'external' });
}
