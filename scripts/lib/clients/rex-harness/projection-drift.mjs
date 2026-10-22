/* 中文注释：投影送达的度量。客户端实际读的是本仓库里的 `<client>/skills/<skill>/`，
 * 而它们由安装运行时的 `rex-harness/skill-sources/` 原样拷贝而来（installer 用
 * `fs.cpSync`，无加工）——所以"内容不一致"只可能意味着"没重生"，这就是干净口径的依据。
 * 两个根目录一律由调用方传入：不得像旧私有门那样把目标固定成脚本自己的仓库。 */
import fs from 'node:fs';
import path from 'node:path';

export const PROJECTION_MARKER = '.rex-projection.json';
export const CLIENT_SKILL_ROOTS = Object.freeze([
  '.agents', '.claude', '.codex', '.grok', '.gemini',
]);

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
  clients = CLIENT_SKILL_ROOTS,
} = {}) {
  if (!installRoot || !repoRoot) throw new TypeError('collectProjectionDrift requires installRoot and repoRoot');
  const sourceRoot = path.join(installRoot, 'rex-harness', 'skill-sources');
  const entries = [];
  for (const client of clients) {
    const skillsDir = path.join(repoRoot, client, 'skills');
    if (!fs.existsSync(skillsDir)) continue;
    for (const skill of fs.readdirSync(skillsDir).sort()) {
      const projected = path.join(skillsDir, skill);
      const marker = path.join(projected, PROJECTION_MARKER);
      if (!fs.existsSync(marker)) {
        // 中文注释：安装器会把“目标已被人管”的 skill 原文保留（unmanaged-target-differs），于是它
        // 不在这张度量面里。只看 marker 会把“零漂移”说满：客户端读的可能正是这份没人管的旧副本。
        // 所以没 marker 但是 rex-* 的目录单独计入 unmanaged（不进 skillDrift：覆盖它是人的决定）。
        if (/^rex-/u.test(skill) && fs.statSync(projected).isDirectory()) {
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
