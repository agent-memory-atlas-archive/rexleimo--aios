/**
 * 边界契约 — AIOS 只允许通过公开面消费 rex-harness（ADR 0001）。
 *
 * Why this exists: `scripts/lib/execution/harness/solo/turn-settlement.mjs` 曾直接 import
 * `rex-harness/src/domain/turn-contract.mjs`（内部模块）。子模块只有向内的检查
 * （rex-harness/tests/architecture/import-boundaries.test.mjs：src 不得 import AIOS 内部），
 * 没有向外的检查，所以那次越界无人拦，一直存活到 2026-10-14 的架构评审。
 * （该桥模块后因零生产 importer 被 work-4 C 裁决删除；这里的反例 fixture 改用现存适配层路径。）
 *
 * User goal:
 *   子模块之所以是子模块，是因为它的内部不能成为父仓库的事实契约。父仓库新增文件
 *   不得再深引子模块内部；已存在的测试树耦合只许收缩，不许扩张。
 *
 * In-scope behavior:
 *   B1 生产源码（`scripts/*.mjs`、`scripts/lib/**`、`packages/**`）解析后落在 `rex-harness/`
 *      的引用只允许 `rex-harness/src/index.mjs`；`rex-harness/bin/**` 放行（进程调用）。
 *   B2 反例：深路径、裸包名深路径必须被判违规；父仓库自己的 `scripts/lib/clients/rex-harness/*`
 *      适配目录不得被误判。
 *   B3 真仓库自检：生产源码违规集合为空。
 *   B4 测试树（`scripts/tests/**`）的已知内部耦合按 TEST_BASELINE 冻结：新增即失败，
 *      修好不删基线也失败（只许收缩）。
 *
 * Explicit non-goals:
 *   - 不检查子模块内部（那是 `rex-harness/tests/architecture/import-boundaries.test.mjs` 的职责）；
 *   - 不自动修 TEST_BASELINE 里的耦合——它们需要子模块补公开面并走 ADR 0001 的发布流，
 *     属独立工作项，不在这里静默处理；
 *   - 不做 AST 解析。
 *
 * Known limitation (explicit, not hidden): 字面量进程入口
 * `const entry = 'rex-harness/bin/rex-harness.mjs'` 与模块 import 在正则层不可区分，
 * 因此 `bin/**` 整体放行。要真正区分需要 AST，成本大于收益。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { collectReferences } from '../../../../lib/tooling/test-impact.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const PUBLIC_ENTRY = 'rex-harness/src/index.mjs';
const PROCESS_ENTRY_PREFIX = 'rex-harness/bin/';

/**
 * 测试树的已知内部耦合（2026-10-14 冻结，只许收缩）。
 * 每项是 `<文件> -> <子模块内部路径>`；两个方向都断言，所以修好一项必须同时删掉基线行。
 */
const TEST_BASELINE = Object.freeze([
  'scripts/tests/execution/rex/runtime/rex-activation-store.test.mjs -> rex-harness/tests/fixtures/requirements-decision.mjs',
  'scripts/tests/execution/rex/runtime/rex-capability-runtime.test.mjs -> rex-harness/tests/fixtures/requirements-decision.mjs',
  'scripts/tests/execution/rex/runtime/rex-explicit-intent.test.mjs -> rex-harness/src/cli/start.mjs',
  'scripts/tests/execution/rex/runtime/rex-harness-adapter.test.mjs -> rex-harness/tests/fixtures/requirements-decision.mjs',
  'scripts/tests/execution/rex/runtime/rex-release-gate.test.mjs -> rex-harness/src/clients/projection-manifest.mjs',
  'scripts/tests/execution/workflow/workflow-adapters.test.mjs -> rex-harness/tests/fixtures/requirements-decision.mjs',
]);

const toPosix = (target) => target.split(path.sep).join('/');

/** 上跳 n 层。 */
const up = (times) => Array.from({ length: times }, () => '..').join('/');
/**
 * 构造 import 行。spec 由分片拼接，因此本文件源码里不存在完整的子模块路径字面量——
 * 否则 B4 会把本测试自己的反例 fixture 当成真实越界（自命中）。
 */
const importLine = (...parts) => `import { value } from '${parts.join('/')}';`;

function walkMjs(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walkMjs(full, files);
    } else if (entry.name.endsWith('.mjs')) {
      files.push(toPosix(path.relative(ROOT, full)));
    }
  }
  return files;
}

/** 相对 specifier 解析成仓库根相对路径；越出仓库根返回 ''。 */
function resolveReference(fromFile, spec) {
  if (!spec.startsWith('.')) return spec;
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  return joined.startsWith('..') ? '' : joined;
}

/**
 * 返回对子模块内部的引用（公开入口与 bin 之外的一切）。
 * 复用 test-impact 的引用抽取，避免两处正则漂移导致边界静默漏检。
 */
export function findBoundaryViolations({ files, readFile }) {
  const violations = [];
  for (const file of files.map(toPosix)) {
    let source;
    try {
      source = readFile(file);
    } catch {
      continue;
    }
    for (const spec of collectReferences(source).specs) {
      const resolved = resolveReference(file, spec);
      // 只认"仓库根下的 rex-harness/"：父仓库自己的 scripts/lib/clients/rex-harness/* 不算。
      if (!resolved.startsWith('rex-harness/')) continue;
      if (resolved === PUBLIC_ENTRY || resolved.startsWith(PROCESS_ENTRY_PREFIX)) continue;
      violations.push(`${file} -> ${resolved}`);
    }
  }
  return [...new Set(violations)].sort();
}

function productionFiles() {
  const scripts = walkMjs(path.join(ROOT, 'scripts'));
  const packagesPath = path.join(ROOT, 'packages');
  const packages = fs.existsSync(packagesPath) ? walkMjs(packagesPath) : [];
  return [...scripts.filter((file) => !file.startsWith('scripts/tests/')), ...packages];
}

const readFromDisk = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('B2: submodule internals are violations, the public entry and the parent adapter are not', () => {
  const sources = {
    'scripts/lib/execution/workflows/adapters/rex-capability-runtime.mjs': importLine(up(5), 'rex-harness', 'src', 'domain', 'turn-contract.mjs'),
    'scripts/tests/execution/rex/runtime/rex-release-gate.test.mjs': importLine(up(5), 'rex-harness', 'src', 'clients', 'projection-manifest.mjs'),
    'scripts/lib/execution/workflows/adapters/rex-harness-adapter.mjs': importLine(up(5), 'rex-harness', 'src', 'index.mjs'),
    // 父仓库自己的适配目录：名字里带 rex-harness，但不是子模块。
    'scripts/aios-init.mjs': importLine('.', 'lib', 'clients', 'rex-harness', 'client-projection.mjs'),
    // 进程入口：module import 与字面量路径在正则层不可区分，bin/ 整体放行。
    'scripts/lib/execution/harness/solo/loop.mjs': `const entry = '${['rex-harness', 'bin', 'rex-harness.mjs'].join('/')}';`,
  };
  const violations = findBoundaryViolations({
    files: Object.keys(sources),
    readFile: (file) => sources[file],
  });
  assert.deepEqual(violations, [
    'scripts/lib/execution/workflows/adapters/rex-capability-runtime.mjs -> rex-harness/src/domain/turn-contract.mjs',
    'scripts/tests/execution/rex/runtime/rex-release-gate.test.mjs -> rex-harness/src/clients/projection-manifest.mjs',
  ]);
});

test('B3: production sources never reach into the submodule internals', () => {
  const violations = findBoundaryViolations({ files: productionFiles(), readFile: readFromDisk });
  assert.deepEqual(
    violations,
    [],
    'production code must import the submodule only through rex-harness/src/index.mjs (ADR 0001)',
  );
});

test('B4: the test-tree coupling baseline only shrinks', () => {
  const violations = findBoundaryViolations({
    files: walkMjs(path.join(ROOT, 'scripts', 'tests')),
    readFile: readFromDisk,
  });
  const baseline = new Set(TEST_BASELINE);
  const added = violations.filter((entry) => !baseline.has(entry));
  assert.deepEqual(added, [], `new coupling to submodule internals: ${added.join(', ')}`);
  const stale = TEST_BASELINE.filter((entry) => !violations.includes(entry));
  assert.deepEqual(stale, [], `baseline entries that no longer violate; remove them: ${stale.join(', ')}`);
});
