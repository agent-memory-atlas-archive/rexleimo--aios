/* 中文注释：升级后将本项目已存在的 rex 投影重生一遍。
 * 职责边界：这里只决定"要不要重生、重生结果如何报告"；怎么拷仍是安装器（
 * install-rex-client-projections.mjs）的知识，本模块不复制它的拷贝逻辑。
 * 归属判定沿用 C10 的口径——以源侧目录名为权威，不用 `rex-` 前缀猜：源侧没有这个名字，
 * 就是项目自有技能，跟本次升级无关。 */
import fs from 'node:fs';
import path from 'node:path';

import { clientSkillRootDirs, collectProjectionDrift } from './projection-drift.mjs';

/** 中文注释：项目里已经存在的 rex 投影目录（数量，不是名字）——0 就意味着这个项目从没投过影。 */
export function countProjectedRexSkills({ installRoot, projectRoot }) {
  const sourceRoot = path.join(installRoot, 'rex-harness', 'skill-sources');
  if (!fs.existsSync(sourceRoot)) return 0;
  const sources = new Set(
    fs.readdirSync(sourceRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name),
  );
  let count = 0;
  for (const clientDir of clientSkillRootDirs()) {
    const skillsDir = path.join(projectRoot, clientDir, 'skills');
    if (!fs.existsSync(skillsDir)) continue;
    for (const entry of fs.readdirSync(skillsDir)) {
      if (sources.has(entry) && fs.existsSync(path.join(skillsDir, entry, 'SKILL.md'))) count += 1;
    }
  }
  return count;
}

export async function refreshProjectProjections({
  installRoot,
  projectRoot = process.cwd(),
  io = console,
  runImpl,
} = {}) {
  const projected = countProjectedRexSkills({ installRoot, projectRoot });
  if (projected === 0) {
    // 中文注释：升级不改项目选择。给用户装上他没要的技能是 init 的决定，不是 update 的副作用。
    return { ran: false, reason: 'no-rex-projections', projected: 0 };
  }

  const installer = path.join(installRoot, 'scripts', 'install-rex-client-projections.mjs');
  if (!fs.existsSync(installer)) {
    io.log(`[warn] projection refresh skipped: installer not found at ${installer}`);
    return { ran: false, reason: 'installer-missing', projected, ok: false };
  }

  const before = collectProjectionDrift({ installRoot, repoRoot: projectRoot }).skillDrift;
  io.log(`+ refresh rex projections for ${projectRoot} (${projected} projected skills, skillDrift=${before})`);
  const result = await runImpl(process.execPath, [
    installer, '--root', installRoot, '--project-root', projectRoot, '--client', 'all', '--scope', 'project',
  ], { cwd: projectRoot, io });

  // 中文注释：运行时此刻已经换好了，重生失败只能 warn——把已成功的升级报成失败，
  // 会让人去做更危险的事（重跑整个安装）。但失败必须可见且带可执行补救命令。
  if ((result?.code ?? 0) !== 0) {
    io.log(`[warn] projection refresh failed (exit ${result?.code}): stale skill copies remain in ${projectRoot}`);
    io.log(`[warn]   retry manually: node ${installer} --root ${installRoot} --project-root ${projectRoot} --client all --scope project`);
    return { ran: true, ok: false, projected, before, exitCode: result?.code };
  }

  const after = collectProjectionDrift({ installRoot, repoRoot: projectRoot });
  io.log(`[ok] projections refreshed: skillDrift ${before} → ${after.skillDrift}; unmanaged copies left for a human: ${after.unmanaged}`);
  if (after.unmanaged > 0) {
    // 中文注释：无 marker 的副本安装器只会 warn 并保留原文（覆盖人是改过的文件是人的决定），
    // 所以这里报数并指回 doctor，不假装重生能救回它们。
    io.log(`[warn] ${after.unmanaged} unmanaged rex skill copies remain; see: aios doctor (doctor:projection-drift)`);
  }
  return { ran: true, ok: true, projected, before, after: after.skillDrift, unmanaged: after.unmanaged };
}
