/* 中文注释：平台和 native 规则独立分组，减少 components 规则入口职责。 */
export const NATIVE_PLATFORM_COMPONENT_RULES = Object.freeze([
  Object.freeze({
    id: 'platform-process-facade',
    label: 'Platform Process Facade',
    path: 'scripts/lib/foundation/platform/process.mjs',
    maxLines: 80,
    requiredModules: Object.freeze([
      'scripts/lib/foundation/platform/process/env.mjs',
      'scripts/lib/foundation/platform/process/windows-command.mjs',
      'scripts/lib/foundation/platform/process/spawn.mjs',
    ]),
  }),
  Object.freeze({
    id: 'native-route-commands-facade',
    label: 'Native Route Commands Facade',
    path: 'scripts/lib/clients/native/routing/route-commands.mjs',
    maxLines: 80,
    requiredModules: Object.freeze([
      'scripts/lib/clients/native/routing/route-commands/constants.mjs',
      'scripts/lib/clients/native/routing/route-commands/selection.mjs',
      'scripts/lib/clients/native/routing/route-commands/render.mjs',
      'scripts/lib/clients/native/routing/route-commands/io.mjs',
      'scripts/lib/clients/native/routing/route-commands/sync.mjs',
    ]),
  }),
  Object.freeze({
    id: 'native-sync-facade',
    label: 'Native Sync Facade',
    path: 'scripts/lib/clients/native/synchronize/sync.mjs',
    maxLines: 80,
    requiredModules: Object.freeze([
      'scripts/lib/clients/native/synchronize/sync/constants.mjs',
      'scripts/lib/clients/native/synchronize/sync/fs-ops.mjs',
      'scripts/lib/clients/native/synchronize/sync/operations.mjs',
      'scripts/lib/clients/native/synchronize/sync/apply.mjs',
      'scripts/lib/clients/native/synchronize/sync/run.mjs',
    ]),
  }),
  Object.freeze({
    id: 'native-doctor-facade',
    label: 'Native Doctor Facade',
    path: 'scripts/lib/clients/native/health/doctor.mjs',
    maxLines: 80,
    requiredModules: Object.freeze([
      'scripts/lib/clients/native/health/doctor/shared.mjs',
      'scripts/lib/clients/native/health/doctor/inspect-operation.mjs',
      'scripts/lib/clients/native/health/doctor/inspect-client.mjs',
      'scripts/lib/clients/native/health/doctor/check.mjs',
      'scripts/lib/clients/native/health/doctor/report.mjs',
      'scripts/lib/clients/native/health/doctor/run.mjs',
    ]),
  }),
  Object.freeze({
    id: 'native-repairs-facade',
    label: 'Native Repairs Facade',
    path: 'scripts/lib/clients/native/repair/repairs.mjs',
    maxLines: 80,
    requiredModules: Object.freeze([
      'scripts/lib/clients/native/repair/repairs/constants.mjs',
      'scripts/lib/clients/native/repair/repairs/paths.mjs',
      'scripts/lib/clients/native/repair/repairs/snapshot.mjs',
      'scripts/lib/clients/native/repair/repairs/manifest.mjs',
      'scripts/lib/clients/native/repair/repairs/session.mjs',
      'scripts/lib/clients/native/repair/repairs/query.mjs',
      'scripts/lib/clients/native/repair/repairs/rollback.mjs',
    ]),
  }),
]);
