// scripts/check-dir-budget.mjs — 目录条目预算门禁（本仓库的入口，判定不在此处）
//
// 中文注释：判定已搬到 rex-harness 公开面的 `applyBudgetRule`，豁免与存量搬到 `config/standards.json`。
// 这个文件只剩两件事：把本仓库的 tracked 列表交给引擎，以及把引擎的处置表转成 CI 熟悉的
// `failures/recovered` 形状。适配层只换形状，不再自己判定——否则同一条规则又有了第二个 owner。
// 用法：node scripts/check-dir-budget.mjs [--budget N] [--root <dir>]
// 退出码：新增超标或存量增长 → 1；否则 0。
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { measureDirectoryEntries, QUANTITATIVE_STANDARD_RULES, applyBudgetRule } from '../rex-harness/src/index.mjs';
import { loadProjectConfig, runStandardsRule } from './lib/foundation/architecture/standards-check.mjs';

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

  const result = await runStandardsRule({ rootDir, rule: RULE_ID, config: merged });
  if (result.status === 'skip') {
    console.log(`[dir-budget] SKIP: ${result.reason}`);
    process.exitCode = 0;
    return;
  }
  const report = result.report;
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
