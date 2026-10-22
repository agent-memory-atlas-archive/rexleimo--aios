/* 中文注释：父侧的**转发器**，不是实现。
 *
 * 立项目的（ADR 0002）：同一条"每层目录 ≤8"此前只活在宿主仓库的私有门里，而那扇门把目标根钉成
 * 脚本自己的仓库——在别人的仓库里跑它，报的是 AIOS 的数字，还退出 0。
 * 落点边界（ADR 0001）：命令的实现属于子模块公开面，第三方装完 rex-harness 就该能直接跑；
 * 本文件只准把参数交给 `rex-harness standards check`。这里只要再出现一条 `if (count > budget)`，
 * 就是"决策语义外泄"重新发生。
 *
 * 用法：node scripts/aios-standards.mjs [--root <dir>] [--rule directoryEntries|fileLines|all] [--json]
 * 退出码语义与子模块命令逐字一致：0 达标或 SKIP，1 违规或项目配置不合法，2 用法错。 */
import { runStandardsArgs } from '../rex-harness/src/index.mjs';
import { isDirectModuleInvocation } from './lib/foundation/platform/module-entry.mjs';

export async function standardsMain({ argv = process.argv.slice(2), io = console, cwd = process.cwd() } = {}) {
  // 中文注释：子模块命令的形状是 `standards check <flags>`，转发时补上那条固定的 check。
  const result = await runStandardsArgs(['check', ...argv], { io, cwd });
  return result.exitCode ?? 2;
}

if (isDirectModuleInvocation(import.meta.url)) {
  process.exitCode = await standardsMain();
}
