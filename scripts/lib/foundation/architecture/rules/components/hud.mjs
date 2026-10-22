/* 中文注释：HUD state/render 规则独立维护，避免 UI 状态治理和组件治理混在一起。 */
export const HUD_COMPONENT_RULES = Object.freeze([
  Object.freeze({
    id: 'hud-state-facade',
    label: 'HUD State Facade',
    path: 'scripts/lib/execution/hud/state.mjs',
    requiredModules: Object.freeze([
      'scripts/lib/execution/hud/state/sessions/shared.mjs',
      'scripts/lib/execution/hud/state/sessions/providers.mjs',
      'scripts/lib/execution/hud/state/sessions/quality-gate.mjs',
      'scripts/lib/execution/hud/state/dispatch/dispatch-insights.mjs',
      'scripts/lib/execution/hud/state/dispatch/dispatch-progress.mjs',
      'scripts/lib/execution/hud/state/sessions/io.mjs',
      'scripts/lib/execution/hud/state/sessions/sessions.mjs',
      'scripts/lib/execution/hud/state/store/artifacts.mjs',
      'scripts/lib/execution/hud/state/dispatch/commands.mjs',
      'scripts/lib/execution/hud/state/dispatch/compose.mjs',
    ]),
  }),
  Object.freeze({
    id: 'hud-state-artifacts-facade',
    label: 'HUD State Artifacts Facade',
    path: 'scripts/lib/execution/hud/state/store/artifacts.mjs',
    requiredModules: Object.freeze([
      'scripts/lib/execution/hud/state/store/artifacts/cache.mjs',
      'scripts/lib/execution/hud/state/store/artifacts/dispatch.mjs',
      'scripts/lib/execution/hud/state/store/artifacts/skill-candidates.mjs',
    ]),
  }),
  Object.freeze({
    id: 'hud-render-facade',
    label: 'HUD Render Facade',
    path: 'scripts/lib/execution/hud/render.mjs',
    requiredModules: Object.freeze([
      'scripts/lib/execution/hud/render/shared.mjs',
      'scripts/lib/execution/hud/render/telemetry.mjs',
      'scripts/lib/execution/hud/render/harness.mjs',
      'scripts/lib/execution/hud/render/dispatch.mjs',
      'scripts/lib/execution/hud/render/watchdog.mjs',
      'scripts/lib/execution/hud/render/quality.mjs',
      'scripts/lib/execution/hud/render/skill-candidate.mjs',
      'scripts/lib/execution/hud/render/messages.mjs',
    ]),
  }),
]);
