/* 中文注释：CLI parser/help 规则独立维护，防止入口解析器回到大 if/else 文件。 */
export const CLI_COMPONENT_RULES = Object.freeze([
  Object.freeze({
    id: 'cli-maintenance-parser-facade',
    label: 'CLI Maintenance Parser Facade',
    path: 'scripts/lib/tooling/cli/parse-args/maintenance.mjs',
    requiredModules: Object.freeze([
      'scripts/lib/tooling/cli/parse-args/platform/internal.mjs',
      'scripts/lib/tooling/cli/parse-args/knowledge/memo.mjs',
      'scripts/lib/tooling/cli/parse-args/knowledge/perception.mjs',
      'scripts/lib/tooling/cli/parse-args/platform/init.mjs',
      'scripts/lib/tooling/cli/parse-args/knowledge/offload.mjs',
      'scripts/lib/tooling/cli/parse-args/govern/model-router.mjs',
      'scripts/lib/tooling/cli/parse-args/platform/interception.mjs',
    ]),
  }),
  Object.freeze({
    id: 'cli-team-parser-facade',
    label: 'CLI Team Parser Facade',
    path: 'scripts/lib/tooling/cli/parse-args/run/team.mjs',
    requiredModules: Object.freeze([
      'scripts/lib/tooling/cli/parse-args/run/team/defaults.mjs',
      'scripts/lib/tooling/cli/parse-args/run/team/shared.mjs',
      'scripts/lib/tooling/cli/parse-args/run/team/run.mjs',
      'scripts/lib/tooling/cli/parse-args/run/team/status.mjs',
      'scripts/lib/tooling/cli/parse-args/run/team/history.mjs',
      'scripts/lib/tooling/cli/parse-args/run/team/watchdog.mjs',
      'scripts/lib/tooling/cli/parse-args/run/team/skill-candidates.mjs',
    ]),
  }),
  Object.freeze({
    id: 'cli-top-level-parser-facade',
    label: 'CLI Top-Level Parser Facade',
    path: 'scripts/lib/tooling/cli/parse-args/top-level.mjs',
    requiredModules: Object.freeze([
      'scripts/lib/tooling/cli/parse-args/top-level/defaults.mjs',
      'scripts/lib/tooling/cli/parse-args/top-level/positionals.mjs',
      'scripts/lib/tooling/cli/parse-args/top-level/component-options.mjs',
      'scripts/lib/tooling/cli/parse-args/top-level/doctor-options.mjs',
      'scripts/lib/tooling/cli/parse-args/top-level/workflow-options.mjs',
      'scripts/lib/tooling/cli/parse-args/top-level/release-options.mjs',
    ]),
  }),
  Object.freeze({
    id: 'cli-help-facade',
    label: 'CLI Help Facade',
    path: 'scripts/lib/tooling/cli/help/help.mjs',
    requiredModules: Object.freeze([
      'scripts/lib/tooling/cli/help/root.mjs',
      'scripts/lib/tooling/cli/help/codemap.mjs',
      'scripts/lib/tooling/cli/help/memo.mjs',
      'scripts/lib/tooling/cli/help/commands.mjs',
      'scripts/lib/tooling/cli/help/commands/basic.mjs',
      'scripts/lib/tooling/cli/help/commands/workflow.mjs',
      'scripts/lib/tooling/cli/help/commands/maintenance.mjs',
      'scripts/lib/tooling/cli/help/internal.mjs',
    ]),
  }),
]);
