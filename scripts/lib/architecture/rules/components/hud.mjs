/* 中文注释：HUD state/render 规则独立维护，避免 UI 状态治理和组件治理混在一起。 */
export const HUD_COMPONENT_RULES = Object.freeze([
  Object.freeze({
    id: 'hud-state-facade',
    label: 'HUD State Facade',
    path: 'scripts/lib/hud/state.mjs',
    maxLines: 80,
    requiredModules: Object.freeze([
      'scripts/lib/hud/state/sessions/shared.mjs',
      'scripts/lib/hud/state/sessions/providers.mjs',
      'scripts/lib/hud/state/sessions/quality-gate.mjs',
      'scripts/lib/hud/state/dispatch/dispatch-insights.mjs',
      'scripts/lib/hud/state/dispatch/dispatch-progress.mjs',
      'scripts/lib/hud/state/sessions/io.mjs',
      'scripts/lib/hud/state/sessions/sessions.mjs',
      'scripts/lib/hud/state/store/artifacts.mjs',
      'scripts/lib/hud/state/dispatch/commands.mjs',
      'scripts/lib/hud/state/dispatch/compose.mjs',
    ]),
  }),
  Object.freeze({
    id: 'hud-state-artifacts-facade',
    label: 'HUD State Artifacts Facade',
    path: 'scripts/lib/hud/state/store/artifacts.mjs',
    maxLines: 80,
    requiredModules: Object.freeze([
      'scripts/lib/hud/state/store/artifacts/cache.mjs',
      'scripts/lib/hud/state/store/artifacts/dispatch.mjs',
      'scripts/lib/hud/state/store/artifacts/skill-candidates.mjs',
    ]),
  }),
  Object.freeze({
    id: 'hud-render-facade',
    label: 'HUD Render Facade',
    path: 'scripts/lib/hud/render.mjs',
    maxLines: 180,
    requiredModules: Object.freeze([
      'scripts/lib/hud/render/shared.mjs',
      'scripts/lib/hud/render/telemetry.mjs',
      'scripts/lib/hud/render/harness.mjs',
      'scripts/lib/hud/render/dispatch.mjs',
      'scripts/lib/hud/render/watchdog.mjs',
      'scripts/lib/hud/render/quality.mjs',
      'scripts/lib/hud/render/skill-candidate.mjs',
      'scripts/lib/hud/render/messages.mjs',
    ]),
  }),
]);
