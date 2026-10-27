import {
  createDefaultUninstallOptions,
  hasComponent,
  normalizeClient,
  normalizeComponents,
  normalizeSkillNames,
  normalizeSkillScope,
} from '../govern/options.mjs';
import { uninstallOrchestratorAgents } from '../../../tooling/components/agents.mjs';
import { uninstallNativeEnhancements } from '../../../tooling/components/native.mjs';
import { uninstallContextDbShell } from '../../../tooling/components/shell.mjs';
import { uninstallContextDbSkills } from '../../../tooling/components/skills/skills.mjs';

export function normalizeUninstallOptions(rawOptions = {}) {
  const defaults = createDefaultUninstallOptions();
  return {
    components: normalizeComponents(rawOptions.components, defaults.components),
    client: normalizeClient(rawOptions.client ?? defaults.client),
    scope: normalizeSkillScope(rawOptions.scope ?? defaults.scope),
    skills: normalizeSkillNames(rawOptions.skills ?? defaults.skills),
    // 中文注释：破坏性执行的显式意图位，默认 false。不从环境、不从“看起来像人提的”推定。
    yes: Boolean(rawOptions.yes ?? defaults.yes ?? false),
  };
}

export function planUninstall(rawOptions = {}) {
  const options = normalizeUninstallOptions(rawOptions);
  const args = [
    'uninstall',
    '--components', options.components.join(','),
    '--client', options.client,
    '--scope', options.scope,
  ];
  if (options.skills.length > 0) args.push('--skills', options.skills.join(','));
  // 预览行要能直接复制执行：带 --yes 时才出现 --yes，否则它仍然是“确认那一步”。
  if (options.yes) args.push('--yes');
  return {
    command: 'uninstall',
    options,
    preview: `aios ${args.join(' ')}`,
  };
}

export async function runUninstall(rawOptions = {}, { io = console, rootDir, projectRoot = rootDir } = {}) {
  const { options, preview } = planUninstall(rawOptions);
  // 中文注释（2026-10-27 P0）：这一步以前只要被调用就会真删，而默认值是
  // components=shell,skills / scope=global / client=all——叠加“未知 flag 被丢掉”的旧行为，
  // 一个拼错的参数就能让整条命令以破坏性默认跑起来。现在删除需要显式 `--yes`；
  // 没有它就是预览，与 refs sweep 默认 dry-run 是同一条教义。
  if (!options.yes) {
    io.log('[preview] uninstall did not run: this removes integrations and needs an explicit --yes');
    io.log(`  would remove components: ${options.components.join(',')}`);
    io.log(`  scope=${options.scope} client=${options.client}`);
    io.log(`  command: ${preview} --yes`);
    return { preview: true, components: options.components };
  }
  io.log(`Uninstall components: ${options.components.join(',')}`);

  if (hasComponent(options.components, 'shell')) {
    await uninstallContextDbShell({ io });
  }

  if (hasComponent(options.components, 'skills')) {
    await uninstallContextDbSkills({ rootDir, projectRoot, client: options.client, scope: options.scope, selectedSkills: options.skills, io });
  }

  if (hasComponent(options.components, 'native')) {
    await uninstallNativeEnhancements({ rootDir, projectRoot, client: options.client, io });
  }

  if (hasComponent(options.components, 'agents')) {
    await uninstallOrchestratorAgents({ rootDir, client: options.client, io });
  }

  if (hasComponent(options.components, 'browser')) {
    io.log('[info] Browser MCP has no destructive auto-uninstall script.');
    io.log('[info] It is safe to keep mcp-server build/runtime artifacts.');
  }

  if (hasComponent(options.components, 'shell')) {
    io.log('');
    io.log(process.platform === 'win32' ? 'Run: . $PROFILE' : 'Run: source ~/.zshrc');
  }

  io.log('Done.');
}
