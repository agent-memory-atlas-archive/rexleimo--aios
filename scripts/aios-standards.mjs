/* 中文注释：可移植的工程标准命令。ADR 0002 的立项理由写在这里就够了：同一条"每层目录 ≤8"
 * 此前只活在宿主仓库的私有门里，而那扇门把目标根钉成脚本自己的仓库——在别人的仓库里跑它，
 * 报的是 AIOS 的数字，还退出 0。这条命令把判定交给 rex-harness 公开面的引擎，根由调用方给。
 * 用法：node scripts/aios-standards.mjs [--root <dir>] [--rule directoryEntries|fileLines|all] [--json]
 * 退出码：0 达标或 SKIP；1 新增超标 / 存量增长 / 项目配置不合法；2 命令行用法错。 */
import path from 'node:path';

import { QUANTITATIVE_STANDARD_RULES } from '../rex-harness/src/index.mjs';
import { loadProjectConfig, runStandardsRule } from './lib/foundation/architecture/standards-check.mjs';
import { isDirectModuleInvocation } from './lib/foundation/platform/module-entry.mjs';

const RULE_IDS = Object.keys(QUANTITATIVE_STANDARD_RULES);

function parseArgs(argv) {
  const options = { root: '.', rule: 'all', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    // 中文注释：带值选项必须吃掉下一个 token，否则那个值会被当成未知参数——
    // 这条测试里先踩到的是 `--root .` 报 unknown argument: .
    if (arg === '--root') { options.root = argv[i + 1] ?? '.'; i += 1; }
    else if (arg === '--rule') { options.rule = argv[i + 1] ?? 'all'; i += 1; }
    else if (arg === '--json') options.json = true;
    else return { error: `unknown argument: ${arg}` };
  }
  if (options.rule !== 'all' && !RULE_IDS.includes(options.rule)) {
    return { error: `--rule must be one of: all, ${RULE_IDS.join(', ')}` };
  }
  return { options };
}

function printJson(io, rootDir, id, result) {
  io.log(JSON.stringify({
    root: rootDir,
    rule: id,
    status: result.status,
    reason: result.reason ?? null,
    budget: result.report?.budget ?? null,
    measured: result.report?.measured ?? null,
    blocking: result.report?.blocking ?? null,
    violations: result.report?.violations ?? [],
    exempt: result.report?.exempt ?? [],
    baseline: result.report?.baseline ?? [],
    recovered: result.report?.recovered ?? [],
  }));
}

export async function standardsMain({ argv = process.argv.slice(2), io = console, cwd = process.cwd() } = {}) {
  const parsed = parseArgs(argv);
  if (parsed.error) {
    io.log(`[standards] ${parsed.error}`);
    return 2;
  }
  const rootDir = path.resolve(cwd, parsed.options.root);
  const config = await loadProjectConfig({ rootDir });
  if (config.ok !== true) {
    // 中文注释：配置不合法必须响亮失败。静默按默认预算跑，等于让"写了却没生效"继续存在。
    for (const error of config.errors ?? []) {
      io.log(`[standards] config ${error.code} at ${error.path}: ${error.message}`);
    }
    return 1;
  }

  const rules = parsed.options.rule === 'all' ? RULE_IDS : [parsed.options.rule];
  let exitCode = 0;
  for (const id of rules) {
    const result = await runStandardsRule({ rootDir, rule: id, config, io });
    if (result.exitCode > exitCode) exitCode = result.exitCode;
    if (parsed.options.json) {
      printJson(io, rootDir, id, result);
      continue;
    }
    if (result.status === 'skip') {
      io.log(`[standards] SKIP ${id}: ${result.reason}`);
      continue;
    }
    for (const violation of result.report?.violations ?? []) {
      io.log(`[standards] FAIL ${id} ${violation.detail}`);
    }
    for (const item of result.report?.recovered ?? []) {
      io.log(`[standards] RECOVERED ${id} ${item.path} now ${item.count}; remove its baseline entry`);
    }
    io.log(`[standards] ${id}: measured=${result.report.measured} overBudget=${result.report.overBudget}`
      + ` exempt=${result.report.exempt.length} baseline=${result.report.baseline.length}`
      + ` blocking=${result.report.blocking} budget=${result.report.budget} root=${rootDir}`);
  }
  return exitCode;
}

if (isDirectModuleInvocation(import.meta.url)) {
  process.exitCode = await standardsMain();
}
