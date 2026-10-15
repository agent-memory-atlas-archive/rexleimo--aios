export const SOLO_OUTCOMES = new Set(['success', 'noop', 'blocked', 'infra-retry', 'human-gate', 'stopped', 'failed']);
export const SOLO_STAGES = new Set(['research', 'requirements', 'planning', 'development', 'validation', 'handoff']);
// rate-limited / provider-overloaded 可退避重试；host-unsupported / budget-exhausted
// 是 fail-closed 类（换宿主 / 等额度窗口），不允许盲目重试烧钱。
export const SOLO_FAILURE_CLASSES = new Set([
  'none',
  'no-progress',
  'tool-error',
  'runtime-error',
  'rate-limited',
  'provider-overloaded',
  'host-unsupported',
  'budget-exhausted',
  'workspace-mutation',
  'ownership-gate',
  'safety-gate',
  'stop-requested',
]);

// work-7：节奏归类词表从 loop/cadence.mjs 搬进词汇表 owner，
// 这样 TURN_CONSEQUENCES 的一致性校验不必反向依赖 loop 层（依赖方向：support ← loop）。
export const SOLO_CADENCE_CLASSES = new Set(['active_work', 'monitor_wait', 'human_gate']);

// run summary 的状态词表（state.mjs 写入、dashboard/status 读取）。
export const SOLO_RUN_STATUSES = new Set(['running', 'done', 'blocked', 'backoff', 'human-gate', 'stopped', 'failed']);

// work-7：退避动作文词表（原本只以字符串形式散落在三个 infer* 里）。
export const SOLO_BACKOFF_ACTIONS = new Set(['none', 'retry-with-backoff', 'human-gate', 'shrink-scope']);

// work-7：checkpoint 状态词表。
export const SOLO_CHECKPOINT_STATUSES = new Set(['running', 'done', 'blocked']);
