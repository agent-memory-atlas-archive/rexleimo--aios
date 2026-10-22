/* 中文注释：doctor:projection-drift 这条门的实现。aggregate.mjs 是 doctor 的编排入口，
 * 每加一块就越过它的体量预算；这里按同目录已有惯例（reporting.mjs / native-only.mjs）
 * 把门本身拆出来，只把结论交给编排层。 */
import fs from 'node:fs';
import path from 'node:path';

import { clientSkillRootDirs, collectProjectionDrift, projectionRegenCommand } from '../../../clients/rex-harness/projection-drift.mjs';

/** 中文注释：定级只看 skillDrift 与 unmanaged；attachmentDrift 只报数（工单 C8）。 */
export function inspectProjectionDelivery({ installRoot, projectRoot }) {
  const drift = collectProjectionDrift({ installRoot, repoRoot: projectRoot });
  const counts = `skillDrift=${drift.skillDrift} attachmentDrift=${drift.attachmentDrift}`
    + ` unmanaged=${drift.unmanaged} checked=${drift.checked}`;
  const drifted = drift.skillDrift > 0 || drift.unmanaged > 0;
  // 中文注释：checked=0 有两种相反的含义——“这项目没投过影”（无义务可述，ok）与
  // “项目有副本但我根本没法测”（源侧根不在，warn）。把后者读成绿灯是 C9 的同类错误：
  // 分母为零时的“零漂移”什么也没说；但也不得给本来不用 rex 的项目报噪。
  const projectedHere = clientSkillRootDirs().some(
    (dir) => fs.existsSync(path.join(projectRoot, dir, 'skills')),
  );
  const unmeasured = projectedHere && !fs.existsSync(drift.sourceRoot);
  let remedy;
  if (unmeasured) {
    // 中文注释：源侧根不在就没什么可重生的，此时唯一诚实的补救是修安装——
    // 别让人去跑一条注定失败的命令。
    remedy = `Repair: the AIOS runtime has no skill sources at ${drift.sourceRoot}`;
  } else if (drifted) {
    remedy = `Regenerate: ${projectionRegenCommand({ installRoot, projectRoot }).join(' ')}`;
  } else {
    remedy = `Inspect: ${['node', path.join(installRoot, 'scripts', 'aios-projection-drift.mjs'),
      '--install-root', installRoot, '--repo-root', projectRoot, '--fail-on-drift'].join(' ')}`;
  }
  return {
    counts,
    drifted: drifted || unmeasured,
    checked: drift.checked,
    line: `[projection-drift] ${counts}`,
    fix: remedy,
  };
}
