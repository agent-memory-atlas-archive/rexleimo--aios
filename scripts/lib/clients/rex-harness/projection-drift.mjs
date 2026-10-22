/* 中文注释：投影送达的度量。客户端实际读的是本仓库里的 `<client>/skills/<skill>/`，
 * 而它们由安装运行时的 `rex-harness/skill-sources/` 原样拷贝而来（installer 用
 * `fs.cpSync`，无加工）——所以"内容不一致"只可能意味着"没重生"，这就是干净口径的依据。
 * 两个根目录一律由调用方传入：不得像旧私有门那样把目标固定成脚本自己的仓库。 */
import fs from 'node:fs';
import path from 'node:path';

import { CLIENT_DEFINITIONS } from '../../foundation/clients/selection/core/definitions.mjs';

export const PROJECTION_MARKER = '.rex-projection.json';

/**
 * 参数 `clientSkillRoots` 接受的是相对项目根的 skill 目录名（如 .codex），不是客户端 id：
 * pi 与 zcode 共用 .agents，按目录去重才是真实的覆盖面。
 *
 * 度量面的权威是客户端注册表，不是本模块里的一份清单：`projectSkillRoot` 己在
 * `definitions.mjs` 里逐客户端登记过，在这里再拄一份就会让"零漂移"只说表面的一部分
 * （实测：硬编码 5 个根 checked=85 vs 注册表全集 checked=153）。
 */
/** 中文注释：客户端注册表里的投影目录名集合（去重：pi 与 zcode 共用 .agents）。
 * 默认度量面用它；升级侧判断“这个项目投过影没有”也用它——两处必须同一口径。 */
/**
 * 中文注释：重生命令的唯一拼法。它一度在漂移 CLI、doctor 的 fix 行、以及升级路径里各拼了一次，
 * “--scope / --client” 一变就是三处要记得改——本项目立项要消灭的就是这种"一条知识多个 owner"。
 */
export function projectionRegenCommand({ installRoot, projectRoot }) {
  return [
    process.execPath,
    path.join(installRoot, 'scripts', 'install-rex-client-projections.mjs'),
    '--root', installRoot,
    '--project-root', projectRoot,
    '--client', 'all',
    '--scope', 'project',
  ];
}

export function clientSkillRootDirs() {
  return [...new Set(Object.values(CLIENT_DEFINITIONS)
    .map((definition) => definition.projectSkillRoot)
    .filter(Boolean)
    .map((relative) => String(relative).split('/')[0]))];
}

function payload(dir) {
  const map = new Map();
  const visit = (current, rel = '') => {
    if (!fs.existsSync(current)) return;
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = rel ? `${rel}/${entry.name}` : entry.name;
      if (relative === PROJECTION_MARKER) continue;
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) map.set(relative, fs.readFileSync(absolute));
    }
  };
  visit(dir);
  return map;
}

function comparePayloads(sourceDir, projectedDir) {
  const source = payload(sourceDir);
  const projected = payload(projectedDir);
  const attachment = [];
  let skillDiffers = false;
  for (const [relative, content] of source) {
    if (relative !== 'SKILL.md' && !projected.has(relative)) attachment.push(`${relative} 仅源侧`);
    else if (projected.has(relative) && !projected.get(relative).equals(content)) {
      if (relative === 'SKILL.md') skillDiffers = true;
      else attachment.push(relative);
    }
  }
  for (const relative of projected.keys()) {
    if (source.has(relative)) continue;
    if (relative === 'SKILL.md') skillDiffers = true;
    else attachment.push(`${relative} 仅投影侧`);
  }
  return { skillDiffers, attachment };
}

export function collectProjectionDrift({
  installRoot,
  repoRoot,
  clientSkillRoots = clientSkillRootDirs(),
} = {}) {
  if (!installRoot || !repoRoot) throw new TypeError('collectProjectionDrift requires installRoot and repoRoot');
  const sourceRoot = path.join(installRoot, 'rex-harness', 'skill-sources');
  const entries = [];
  for (const client of clientSkillRoots) {
    const skillsDir = path.join(repoRoot, client, 'skills');
    if (!fs.existsSync(skillsDir)) continue;
    for (const skill of fs.readdirSync(skillsDir).sort()) {
      const projected = path.join(skillsDir, skill);
      const marker = path.join(projected, PROJECTION_MARKER);
      if (!fs.existsSync(marker)) {
        // 中文注释：安装器会把“目标已被人管”的 skill 原文保留（unmanaged-target-differs），于是它
        // 不在这张度量面里。只看 marker 会把“零漂移”说满：客户端读的可能正是这份没人管的旧副本。
        // 归属由源侧目录名决定（而不是猜 `rex-` 前缀）：源侧有这个名字且投影无 marker 才是未送达；
        // 项目自有技能源侧根本没有，不该被算成问题。
        if (fs.existsSync(path.join(sourceRoot, skill))) {
          entries.push({
            client, skill, generated: 'unmanaged', unmanaged: true,
            skillDrift: false, attachmentDrift: false, files: ['无 projection marker'],
          });
        }
        continue;
      }
      let generated = 'unknown';
      try {
        generated = JSON.parse(fs.readFileSync(marker, 'utf8')).packageVersion ?? 'unknown';
      } catch {
        // 中文注释：marker 读不动就报 unknown，不猜版本；猜出来的新鲜度比不报更坏。
      }
      const source = path.join(sourceRoot, skill);
      if (!fs.existsSync(source)) {
        entries.push({ client, skill, generated, skillDrift: true, attachmentDrift: false, files: ['源侧不存在'] });
        continue;
      }
      const { skillDiffers, attachment } = comparePayloads(source, projected);
      entries.push({
        client, skill, generated,
        skillDrift: skillDiffers,
        attachmentDrift: attachment.length > 0,
        files: [...(skillDiffers ? ['SKILL.md'] : []), ...attachment],
      });
    }
  }
  return Object.freeze({
    checked: entries.length,
    skillDrift: entries.filter((entry) => entry.skillDrift).length,
    unmanaged: entries.filter((entry) => entry.unmanaged).length,
    // 中文注释：只算“没别的差异、只有附属物差异”的条目。SKILL.md 与附属物同时不一致的条目已经
    // 被 skillDrift 计入，再计一次会把同一个条目数两个错——而附属物差异本身按 C8 不作通过条件。
    attachmentDrift: entries.filter((entry) => !entry.skillDrift && entry.attachmentDrift).length,
    installRoot: path.resolve(installRoot),
    sourceRoot,
    entries: Object.freeze(entries),
  });
}
