import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

// 中文注释：判定、度量、以及项目配置的加载全部来自子模块公开面；本模块不再持有其中任何一条。
import { applyBudgetRule, loadProjectConfig, measureFileLines } from '../../../../rex-harness/src/index.mjs';
import { DEFAULT_ARCHITECTURE_RULES } from './rules.mjs';

export { DEFAULT_ARCHITECTURE_RULES } from './rules.mjs';

/**
 * 中文注释：行数**度量**的唯一实现是引擎的 `measureFileLines`（清单定义：physical lines，
 * 空行算内容，尾随换行不额外计一行）。本模块不再自己数行，也不再自己判超标——
 * 处置一律来自 `applyBudgetRule`。
 *
 * 迁移时比对过：50 条既有规则的计数**一字不差**，所以这不是换定义，是去掉第二个 owner。
 * 旧实现（先 `trim()` 再切）已删除；它唯一的实际作用是让同一件事在本仓库有两套语义。
 */
/** 中文注释：旧名字保留为引擎度量的别名，避免同一条规则留下两份实现。 */
export const countSourceLines = (text = '') => measureFileLines([{ path: '_', content: String(text) }]).get('_');

// 纯函数：把 Windows 路径统一成仓库相对显示路径，便于测试和报告稳定。
export function normalizeArchitecturePath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\.\/+/u, '');
}

async function pathExists(rootDir, relativePath) {
  try {
    await access(path.join(rootDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

/** 中文注释：从引擎的处置表里取那一条命中项。顺序即优先级：红灯压过赦免。 */
const DISPOSITION_ORDER = Object.freeze(['violation', 'exempt', 'baseline', 'pass']);

function dispositionOf(report) {
  for (const kind of DISPOSITION_ORDER) {
    const entry = report.byDisposition.get(kind)[0];
    if (!entry) continue;
    return {
      disposition: kind,
      count: entry.count,
      reason: entry.reason ?? null,
      detail: entry.detail ?? (kind === 'baseline'
        ? `${entry.count} lines <= baseline ${entry.allowed} (shrink only)`
        : null),
    };
  }
  return { disposition: 'pass', count: 0, reason: null, detail: null };
}

async function evaluateArchitectureRule(rootDir, rule, config) {
  const entryPath = normalizeArchitecturePath(rule.path);
  const failures = [];
  let count = 0;
  let outcome = { disposition: 'pass', detail: null };

  try {
    const content = await readFile(path.join(rootDir, entryPath), 'utf8');
    const report = applyBudgetRule({
      // 中文注释：行数这件事只有 fileLines 一条规则；每条 facade 声明的 maxLines 是喂给引擎的那一次预算，
      // 不是一条新规则——否则同一个数字又要分两处拥有它。
      rule: 'fileLines',
      measurements: measureFileLines([{ path: entryPath, content }]),
      budgets: { fileLines: rule.maxLines },
      exemptions: config?.exemptions ?? {},
      baselines: config?.baselines ?? {},
    });
    outcome = dispositionOf(report);
    count = outcome.count;

    if (outcome.disposition === 'violation' || outcome.disposition === 'baseline') {
      failures.push(outcome.detail);
    }
  } catch {
    failures.push(`missing entrypoint: ${entryPath}`);
    outcome = { disposition: 'violation', detail: `missing entrypoint: ${entryPath}` };
  }

  const requiredModules = Array.isArray(rule.requiredModules) ? rule.requiredModules : [];
  const missingModules = [];
  for (const modulePath of requiredModules) {
    const normalizedPath = normalizeArchitecturePath(modulePath);
    if (!await pathExists(rootDir, normalizedPath)) {
      missingModules.push(normalizedPath);
    }
  }
  if (missingModules.length > 0) {
    // 中文注释：模块归属不是预算，不塞进预算引擎——这条留在 governance 自己名下。
    failures.push(`missing modules: ${missingModules.join(', ')}`);
  }

  const budgetBreached = outcome.disposition === 'violation';
  // 中文注释：入口缺失在旧行为里就是 FAIL，新增的预算突破也是 FAIL；exempt / baseline 不算失败。
  // 结构性失败（缺入口、缺模块）归进 status，处置字段只说预算那一件事——两者不得互相掩盖。
  const failed = budgetBreached || failures.some((message) => message.startsWith('missing '));
  return {
    id: rule.id,
    label: rule.label || rule.id,
    path: entryPath,
    status: failed ? 'FAIL' : 'OK',
    disposition: outcome.disposition,
    count,
    lineCount: count,
    maxLines: rule.maxLines,
    reason: outcome.reason ?? null,
    failures,
    detail: failures.length === 0
      ? (outcome.detail ?? `${count} lines <= ${rule.maxLines}`)
      : failures.join('; '),
  };
}

// 架构治理入口：facade 预算的**判定**来自 rex-harness 公开面的预算引擎，
// 本入口只负责读文件、聚合规则、以及治理自己那两类结构检查。
export async function evaluateArchitectureGovernance({
  rootDir,
  rules = DEFAULT_ARCHITECTURE_RULES,
  config,
} = {}) {
  const resolved = config ?? await loadProjectConfig({ rootDir });
  const checks = [];
  for (const rule of rules) {
    checks.push(await evaluateArchitectureRule(rootDir, rule, resolved.ok === false ? {} : resolved));
  }

  const failed = checks.filter((item) => item.status === 'FAIL');
  const baselined = checks.filter((item) => item.disposition === 'baseline');
  const exempted = checks.filter((item) => item.disposition === 'exempt');
  const notes = [];
  if (baselined.length > 0) {
    notes.push(`baseline (shrink only): ${baselined.map((c) => `${c.path}=${c.count}`).join(', ')}`);
  }
  if (exempted.length > 0) {
    notes.push(`exempt: ${exempted.map((c) => c.path).join(', ')}`);
  }
  const detail = failed.length === 0
    ? `${checks.length} architecture rule(s) passed${notes.length > 0 ? `; ${notes.join('; ')}` : ''}`
    : failed.map((item) => `${item.label}: ${item.detail}`).join(' | ');

  return {
    ok: failed.length === 0,
    status: failed.length === 0 ? 'OK' : 'FAIL',
    detail,
    checks,
  };
}
