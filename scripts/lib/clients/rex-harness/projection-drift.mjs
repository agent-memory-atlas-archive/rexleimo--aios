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
      if (!fs.existsSync(marker)) continue;
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
    attachmentDrift: entries.filter((entry) => !entry.skillDrift && entry.attachmentDrift).length,
    sourceRoot,
    entries: Object.freeze(entries),
  });
}
