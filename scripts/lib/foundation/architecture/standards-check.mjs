/**
 * 工程标准的宿主适配层：决定「测哪个根、怎么取文件列表、哪些文件算源码」。
 *
 * 判定本身不在这里——那是 rex-harness 公开面的 `applyBudgetRule`（度量 → 处置）。
 * 本模块只补三件宿主才知道的事：
 * 1. 目标根由**调用方**给出（此前私有门把根钉成脚本自己的仓库，在外部仓库跑报的还是 AIOS 的数字）；
 * 2. tracked 列表取不到（非 git 目录）时给 SKIP + 原因，而不是用文件系统遍历猜一份口径；
 * 3. 行数度量要读文件，读哪些扩展名是本宿主的策略，不写进引擎。
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// 中文注释：公开面只从子模块入口取（ADR 0001）；判定与配置解析都在那边，本模块只做宿主适配。
import { applyBudgetRule, measureDirectoryEntries, measureFileLines, resolveStandardConfig } from '../../../../rex-harness/src/index.mjs';

// 中文注释：宿主侧的源码扩展名策略。引擎不认识扩展名，所以这份清单只能待在这里，
// 但它不再散进判定逻辑——改它不会改变处置语义。
export const SOURCE_FILE_EXTENSIONS = Object.freeze(['.mjs', '.js', '.cjs', '.ts', '.tsx']);

export function listTrackedFiles({ rootDir, gitImpl = defaultGit }) {
  const inside = gitImpl(['rev-parse', '--is-inside-work-tree'], rootDir);
  if (!inside.ok || String(inside.stdout).trim() !== 'true') {
    return { ok: false, reason: `not a git work tree: ${rootDir}` };
  }
  const listed = gitImpl(['ls-files', '-z'], rootDir);
  if (!listed.ok) {
    return { ok: false, reason: `git ls-files failed in ${rootDir}: ${String(listed.stderr).trim()}` };
  }
  return {
    ok: true,
    files: listed.stdout.toString('utf8').split('\0').map((line) => line.trim()).filter(Boolean),
  };
}

function defaultGit(args, cwd) {
  try {
    const stdout = execFileSync('git', args, { cwd, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stdout, stderr: '' };
  } catch (error) {
    return { ok: false, stdout: '', stderr: error?.stderr?.toString?.() ?? String(error?.message ?? error) };
  }
}

export async function loadProjectConfig({ rootDir, configRelativePath = 'config/standards.json', readImpl = readFile }) {
  let raw;
  try {
    raw = await readImpl(path.join(rootDir, configRelativePath), 'utf8');
  } catch {
    // 中文注释：没有项目配置就按清单默认跑，这不是豁免——处置仍逐条执行，只是没有覆盖项。
    raw = '{}';
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, configErrors: [{ code: 'invalid-config', path: configRelativePath, message: error.message }] };
  }
  return resolveStandardConfig(parsed);
}

async function measureForRule({ rule, trackedFiles, rootDir, extensions, readImpl }) {
  const files = selectFiles(trackedFiles, { rule, extensions });
  if (rule !== 'fileLines') return measureDirectoryEntries(files);
  const reads = [];
  for (const file of files) {
    try {
      reads.push({ path: file, content: await readImpl(path.join(rootDir, file), 'utf8') });
    } catch {
      // 中文注释：tracked 但读不到（工作树里被删）就不计入，也不猜行数——
      // 报一条凭空的超标，和漏报一条真超标，是同一种不诚实。
      continue;
    }
  }
  return measureFileLines(reads);
}

function selectFiles(files, { rule, extensions = SOURCE_FILE_EXTENSIONS }) {
  if (rule !== 'fileLines') return files;
  return files.filter((file) => extensions.some((ext) => file.endsWith(ext)));
}

/**
 * @param {string} rootDir    调用方决定的目标根（引擎不接收根，也不回传根）
 * @param {string} rule       directoryEntries | fileLines
 */
export async function runStandardsRule({
  rootDir,
  rule = 'directoryEntries',
  config,
  io = console,
  gitImpl,
  readImpl = readFile,
  extensions = SOURCE_FILE_EXTENSIONS,
} = {}) {
  const tracked = listTrackedFiles({ rootDir, gitImpl });
  if (!tracked.ok) {
    // 中文注释：C8——取不到 tracked 列表就 SKIP 并退出 0。用目录遍历猜一份口径，
    // 等于把"未发布结构"和"人没提交的文件"当成违规来报，那不是这条门说的话。
    return { status: 'skip', reason: tracked.reason, exitCode: 0 };
  }

  const resolved = config ?? await loadProjectConfig({ rootDir });
  if (!resolved || resolved.ok === false) {
    const errors = resolved.configErrors ?? resolved.errors ?? [];
    io.log(`[standards] project config rejected for ${rootDir}`);
    for (const error of errors) {
      io.log(`[standards] config ${error.code} at ${error.path}: ${error.message}`);
    }
    return { status: 'config-error', errors, exitCode: 1 };
  }

  const measurements = await measureForRule({ rule, trackedFiles: tracked.files, rootDir, extensions, readImpl });

  const report = applyBudgetRule({
    rule,
    measurements,
    budgets: resolved.budgets,
    exemptions: resolved.exemptions,
    baselines: resolved.baselines,
  });

  return {
    status: report.blocking > 0 ? 'fail' : 'ok',
    report,
    exitCode: report.blocking > 0 ? 1 : 0,
  };
}
