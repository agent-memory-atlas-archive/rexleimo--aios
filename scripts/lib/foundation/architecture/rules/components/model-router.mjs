/* 中文注释：模型路由 facade 规则独立维护，避免组件治理入口继续膨胀。 */
export const MODEL_ROUTER_ARCHITECTURE_RULES = Object.freeze([
  Object.freeze({
    id: 'model-router-facade',
    label: 'Model Router Facade',
    path: 'scripts/lib/tooling/model-router.mjs',
    requiredModules: Object.freeze([
      'scripts/lib/tooling/model-router/entry/shared.mjs',
      'scripts/lib/tooling/model-router/entry/registry.mjs',
      'scripts/lib/tooling/model-router/session/profile.mjs',
      'scripts/lib/tooling/model-router/session/signals.mjs',
      'scripts/lib/tooling/model-router/routing/selection.mjs',
      'scripts/lib/tooling/model-router/entry/client-cli.mjs',
      'scripts/lib/tooling/model-router/routing/routing.mjs',
      'scripts/lib/tooling/model-router/session/reporting.mjs',
      'scripts/lib/tooling/model-router/session/history.mjs',
      'scripts/lib/tooling/model-router/entry/command.mjs',
    ]),
  }),
]);
