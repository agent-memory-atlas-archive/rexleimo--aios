import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveRepoRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // 本模块位于 scripts/lib/execution/harness/team/subagent-runtime/，向上六层回到仓库根目录。
  return path.resolve(here, '..', '..', '..', '..', '..', '..', '..');
}
