/* 中文注释：投影送达的机器门——把"客户端读到的 rex 投影落后安装源码多少条"变成一条可机读、
 * 可进 CI 的输出。立项原因：这条事实此前只存在于一段 gitignore 的临时审计脚本里，
 * 于是"送达"永远没人担保；本仓库实测有 30 条 SKILL.md 送达漂移，而 doctor 里没有任何 projection 检查。
 * 两个根目录必须由调用方给（--install-root / --repo-root），不固定为脚本自身仓库——
 * 那是 work-config-surface 审查里刚踩过的坑（私有门在非 git 目录量的仍是 AIOS 自己）。
 * 用法：node scripts/aios-projection-drift.mjs --json --install-root <aios 安装根> --repo-root <项目根> [--fail-on-drift] */
import path from 'node:path';

import { collectProjectionDrift } from './lib/clients/rex-harness/projection-drift.mjs';
import { isDirectModuleInvocation } from './lib/foundation/platform/module-entry.mjs';

export const USAGE = 'usage: node scripts/aios-projection-drift.mjs --install-root <dir> --repo-root <dir> [--json] [--fail-on-drift]';

export function parseDriftArgs(argv = []) {
  const options = { json: false, failOnDrift: false, installRoot: null, repoRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--json') {
      options.json = true;
    } else if (argument === '--fail-on-drift') {
      options.failOnDrift = true;
    } else if (argument === '--install-root' || argument === '--repo-root') {
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      options[argument === '--install-root' ? 'installRoot' : 'repoRoot'] = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (!options.installRoot || !options.repoRoot) throw new Error(USAGE);
  return options;
}

export function formatDriftReport(report) {
  const versions = [...new Set(report.entries.map((entry) => entry.generated))].sort();
  const lines = [
    `[projection-drift] checked=${report.checked} skillDrift=${report.skillDrift} attachmentDrift=${report.attachmentDrift}`,
    `[projection-drift] source=${report.sourceRoot} 生成版本=${versions.join(', ') || 'none'}`,
  ];
  for (const entry of report.entries.filter((item) => item.skillDrift)) {
    lines.push(`[projection-drift] STALE ${entry.client}/skills/${entry.skill} (generated ${entry.generated}): ${entry.files.join(', ')}`);
  }
  lines.push('[projection-drift] 重生命令：aios init --clients <客户端> --scope local --yes');
  return lines.join('\n');
}

export function run(argv = []) {
  const options = parseDriftArgs(argv);
  const report = collectProjectionDrift(options);
  if (options.json) process.stdout.write(`${JSON.stringify(report)}\n`);
  else process.stdout.write(`${formatDriftReport(report)}\n`);
  return options.failOnDrift && report.skillDrift > 0 ? 1 : 0;
}

if (isDirectModuleInvocation(import.meta.url)) {
  try {
    process.exit(run(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error.message}\n${USAGE}\n`);
    process.exit(2);
  }
}
