// scripts/check-dir-budget.mjs — 【已废弃的入口】目录条目预算门禁。
//
// 中文注释：唯一入口是 `aios standards check`（父侧 scripts/aios-standards.mjs 转发到子模块命令）。
// 本文件只剩两件事：CI 的 pretest 还在指它，以及既有测试读的兼容形状。判定与宿主操作一律来自子模块，
// 这里出现任何一条比较语句都算复发（ADR 0001）。新接线请用 aios standards，不要再指向本文件。
//
// 中文注释：判定已搬到 rex-harness 公开面的 `applyBudgetRule`，豁免与存量搬到 `config/standards.json`。
// 这个文件只剩两件事：把本仓库的 tracked 列表交给引擎，以及把引擎的处置表转成 CI 熟悉的
// `failures/recovered` 形状。适配层只换形状，不再自己判定——否则同一条规则又有了第二个 owner。
// 用法：node scripts/check-dir-budget.mjs [--budget N] [--root <dir>]
// 退出码：新增超标或存量增长 → 1；否则 0。
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 中文注释：判定、度量、tracked 列表、配置加载全部来自子模块公开面；本文件不再持有其中任何一条。
import {
  applyBudgetRule,
  loadProjectConfig,
  measureDirectoryEntries,
  QUANTITATIVE_STANDARD_RULES,
  runStandards,
} from '../rex-harness/src/index.mjs';

// 中文注释：既有调用方与测试用的名字保留为别名——引擎才是度量的实现者，这里不再写第二份算法。
export { measureDirectoryEntries as countDirEntries } from '../rex-harness/src/index.mjs';

export const DEFAULT_BUDGET = QUANTITATIVE_STANDARD_RULES.directoryEntries.budget;
export const RULE_ID = 'directoryEntries';

/** 中文注释：保持既有返回形状（failures[].dir/.kind/.detail、recovered[].dir/.count），判定来自引擎。 */
export function evaluateBudgets(dirCounts, { budget = DEFAULT_BUDGET, exemptions = {}, baseline = {} } = {}) {
  const report = applyBudgetRule({
    rule: RULE_ID,
    measurements: dirCounts,
    budgets: { [RULE_ID]: budget },
    exemptions: { [RULE_ID]: Object.entries(exemptions).map(([dir, reason]) => ({ path: dir, reason })) },
    baselines: { [RULE_ID]: Object.entries(baseline).map(([dir, count]) => ({ path: dir, count })) },
  });
  return {
    failures: report.violations.map((v) => ({ dir: v.path, count: v.count, kind: v.kind, detail: v.detail })),
    recovered: report.recovered.map((r) => ({ dir: r.path, count: r.count })),
  };
}

export function isDirectRun(argv = process.argv, metaUrl = import.meta.url) {
  if (argv[1] == null) return false;
  try {
    return path.resolve(argv[1]) === fileURLToPath(metaUrl);
  } catch {
    return false;
  }
}

async function main() {
  const budgetFlag = process.argv.indexOf('--budget');
  const budget = budgetFlag >= 0 ? Number.parseInt(process.argv[budgetFlag + 1], 10) || DEFAULT_BUDGET : undefined;
  // 中文注释：目标根由调用方决定。默认仍是本仓库，因为 CI 就在仓库根跑，数字要与历史对齐；
  // 可移植的那条命令是 scripts/aios-standards.mjs，它默认取 cwd。
  const rootFlag = process.argv.indexOf('--root');
  const rootDir = rootFlag >= 0
    ? path.resolve(process.argv[rootFlag + 1])
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  const config = await loadProjectConfig({ rootDir });
  if (config.ok !== true) {
    for (const error of config.errors ?? []) {
      console.log(`[dir-budget] config ${error.code} at ${error.path}: ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }
  const merged = budget === undefined ? config : { ...config, budgets: { ...config.budgets, [RULE_ID]: budget } };

  const run = await runStandards({ rootDir, rule: RULE_ID, config: merged, io: { log: () => {}, error: () => {} } });
  const entry = run.results[0];
  if (entry.status === 'skip') {
    console.log(`[dir-budget] SKIP: ${entry.reason}`);
    process.exitCode = 0;
    return;
  }
  const report = entry.report;
  for (const violation of report.violations) console.log(`[dir-budget] FAIL ${violation.detail}`);
  for (const item of report.recovered) {
    console.log(`[dir-budget] RECOVERED ${item.path} now ${item.count}; remove its baseline entry`);
  }
  console.log(`[dir-budget] ${report.measured} dirs, ${report.overBudget} over budget ${report.budget}: `
    + `${report.blocking} blocking, ${report.recovered.length} recovered`);
  process.exitCode = report.blocking > 0 ? 1 : 0;
}

if (isDirectRun()) {
  await main();
}
