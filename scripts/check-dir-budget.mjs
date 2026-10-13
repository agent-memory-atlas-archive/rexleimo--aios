// scripts/check-dir-budget.mjs — 目录条目预算门禁（每层 ≤8 的机器门禁）
// 统计 git 跟踪文件下每个目录的直接条目数（文件+子目录都占一位）。
// 三类处置：exempt（生成物/入口面/发现契约，跳过并注明理由）、
// baseline（存量超标，冻结今日数，只许减少不许增加）、其余超标即红灯。
// 用法：node scripts/check-dir-budget.mjs [--budget 8]
// 退出码：新增超标或存量增长 → 1；否则 0。
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_BUDGET = 8;

// 豁免：拆了反而错的地方（生成物/镜像、CLI 入口面、扁平发现契约）。
export const EXEMPT_DIRS = Object.freeze({
  '.': 'repo layout root (entry surface)',
  'scripts': 'CLI entry surface; moves break package.json bin + hook/docs references',
  'skill-sources': 'skill registry surface (one dir per skill)',
  'docs/plans': 'plan-discovery flat contract (preflight/dry-run/MCP create flat there)',
  'docs/reports': 'report log; same flat-discovery convention as plans',
  'docs/evidence/skill-training': 'training evidence log blobs',
  'blog-site': 'generated site output',
  'blog-site/ja': 'generated locale mirror',
  'blog-site/ko': 'generated locale mirror',
  'blog-site/zh': 'generated locale mirror',
  'blog-site/assets': 'generated site assets',
  'docs-site': 'generated site output',
  'docs-site/ja': 'generated locale mirror',
  'docs-site/ko': 'generated locale mirror',
  'docs-site/zh': 'generated locale mirror',
  'docs-site/assets': 'generated site assets',
  'docs-site/overrides/partials/rex': 'generated site partials',
  'docs/superpowers/plans': 'imported snapshot, not hand-maintained structure',
  'docs/superpowers/specs': 'imported snapshot, not hand-maintained structure',
  'pptx-ai-coding-share/pptxgenjs_helpers': 'vendored helpers',
});

// 存量基线（2026-10-13 普查）：只许减不许增；清零后把条目删掉。
// codemap/ 已拆完（16→7），故不在此列。
export const BASELINE_COUNTS = Object.freeze({
  'scripts/lib': 55,
  'scripts/lib/harness/team/subagent-runtime': 24,
  'scripts/lib/harness/orchestration/orchestrator': 13,
  'scripts/lib/harness/solo/solo-journal': 12,
  'scripts/lib/harness/solo/solo-runtime': 12,
  'scripts/lib/harness/team/groupchat-runtime': 10,
  'scripts/lib/lifecycle/run/harness': 11,
  'scripts/lib/lifecycle/run/orchestrate': 11,
  'scripts/lib/harness/subagent-runtime': 24,
  'agent-sources/roles': 19,
  'scripts/tests/harness-runtime': 17,
  'scripts/lib/rl-core': 14,
  'docs': 13,
  'scripts/lib/cli/commander/specs': 13,
  'scripts/lib/clients': 13,
  'scripts/lib/harness/orchestrator': 13,
  'mcp-server/tests': 12,
  'scripts/lib/cli': 12,
  'scripts/lib/components': 12,
  'scripts/lib/ctx-agent-core': 12,
  'scripts/lib/harness/solo-journal': 12,
  'scripts/lib/harness/solo-runtime': 12,
  'scripts/lib/model-router': 12,
  'scripts/lib/native': 12,
  'mcp-server': 11,
  'scripts/lib/contextdb': 11,
  'scripts/lib/contextdb/shell-bridge': 11,
  'scripts/lib/hud/state': 11,
  'scripts/lib/lifecycle/harness': 11,
  'scripts/lib/lifecycle/orchestrate': 11,
  'scripts/lib/tui-ink': 11,
  'client-sources/native-base/shared/partials': 10,
  'config': 10,
  'mcp-server/src/browser': 10,
  'mcp-server/src/contextdb': 10,
  'scripts/lib/harness/groupchat-runtime': 10,
  'mcp-server/src/contextdb/sqlite': 9,
  'scripts/lib/hud': 9,
  'scripts/lib/rl-shell-v1/eval/temp-runner': 9,
  'scripts/lib/specs': 9,
  'scripts/lib/tui-ink/screens': 9,
  'skill-sources/rexai-image-generation/scripts': 9,
});

export function countDirEntries(trackedFiles) {
  const dirs = new Map();
  for (const file of trackedFiles) {
    const slash = file.lastIndexOf('/');
    const dir = slash < 0 ? '.' : file.slice(0, slash);
    if (!dirs.has(dir)) dirs.set(dir, new Set());
    dirs.get(dir).add(file.slice(slash + 1));
  }
  // 子目录本身占父目录一位。
  for (const dir of [...dirs.keys()]) {
    if (dir === '.') continue;
    const parent = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '.';
    if (!dirs.has(parent)) dirs.set(parent, new Set());
    dirs.get(parent).add(`${dir.slice(parent === '.' ? 0 : parent.length + 1)}/`);
  }
  return new Map([...dirs.entries()].map(([dir, entries]) => [dir, entries.size]));
}

export function evaluateBudgets(dirCounts, { budget = DEFAULT_BUDGET, exemptions = EXEMPT_DIRS, baseline = BASELINE_COUNTS } = {}) {
  const failures = [];
  const recovered = [];
  for (const [dir, count] of dirCounts) {
    if (count <= budget) {
      if (Object.prototype.hasOwnProperty.call(baseline, dir)) recovered.push({ dir, count });
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(exemptions, dir)) continue;
    if (Object.prototype.hasOwnProperty.call(baseline, dir)) {
      if (count > baseline[dir]) {
        failures.push({ dir, count, kind: 'growth', detail: `${dir}: ${count} > baseline ${baseline[dir]} (shrink only)` });
      }
      continue;
    }
    failures.push({ dir, count, kind: 'new', detail: `${dir}: ${count} > budget ${budget}` });
  }
  return { failures, recovered };
}

function listTrackedFiles(rootDir) {
  const stdout = execFileSync('git', ['ls-files', '-z'], { cwd: rootDir, encoding: 'buffer' });
  return stdout.toString('utf8').split('\0').map((line) => line.trim()).filter(Boolean);
}

export function isDirectRun(argv = process.argv, metaUrl = import.meta.url) {
  if (argv[1] == null) return false;
  try {
    return path.resolve(argv[1]) === fileURLToPath(metaUrl);
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  const budgetFlag = process.argv.indexOf('--budget');
  const budget = budgetFlag >= 0 ? Number.parseInt(process.argv[budgetFlag + 1], 10) || DEFAULT_BUDGET : DEFAULT_BUDGET;
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const counts = countDirEntries(listTrackedFiles(rootDir));
  const { failures, recovered } = evaluateBudgets(counts, { budget });
  for (const failure of failures) console.log(`[dir-budget] FAIL ${failure.detail}`);
  for (const item of recovered) console.log(`[dir-budget] RECOVERED ${item.dir} now ${item.count}; remove its baseline entry`);
  const violators = [...counts.entries()].filter(([, n]) => n > budget).length;
  console.log(`[dir-budget] ${counts.size} dirs, ${violators} over budget ${budget}: ${failures.length} blocking, ${recovered.length} recovered`);
  process.exit(failures.length > 0 ? 1 : 0);
}
