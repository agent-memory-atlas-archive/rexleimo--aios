/* 中文注释：doctor:projection-drift 这条门的实现。aggregate.mjs 是 doctor 的编排入口，
 * 每加一块就越过它的体量预算；这里按同目录已有惯例（reporting.mjs / native-only.mjs）
 * 把门本身拆出来，只把结论交给编排层。 */
import path from 'node:path';

import { collectProjectionDrift } from '../../../clients/rex-harness/projection-drift.mjs';
import { projectionRegenCommand } from '../../../clients/rex-harness/projection-refresh.mjs';

/** 中文注释：定级只看 skillDrift 与 unmanaged；attachmentDrift 只报数（工单 C8）。 */
export function inspectProjectionDelivery({ installRoot, projectRoot }) {
  const drift = collectProjectionDrift({ installRoot, repoRoot: projectRoot });
  const counts = `skillDrift=${drift.skillDrift} attachmentDrift=${drift.attachmentDrift}`
    + ` unmanaged=${drift.unmanaged} checked=${drift.checked}`;
  const drifted = drift.skillDrift > 0 || drift.unmanaged > 0;
  return {
    counts,
    drifted,
    line: `[projection-drift] ${counts}`,
    fix: drifted
      ? `Regenerate: ${projectionRegenCommand({ installRoot, projectRoot }).join(' ')}`
      : `Inspect: ${['node', path.join(installRoot, 'scripts', 'aios-projection-drift.mjs'),
          '--install-root', installRoot, '--repo-root', projectRoot, '--fail-on-drift'].join(' ')}`,
  };
}
