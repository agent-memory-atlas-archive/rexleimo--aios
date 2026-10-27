/* 中文注释：refs 保留期判定（纯函数，无 I/O）。
 *
 * 修 B5 的"阈值"半段：每条 ref 的 meta 早就写了 `created_at` 与 `ttl_days`，但旧的
 * prune 只看 fs mtime + 一个全局 keepDays，等于让已申报的 TTL 变成死数据；而且 mtime
 * 会被复制/同步/迁移重置，一次复制就能让一条证据"永远年轻"、再也清不掉。
 * 现在业务时间优先：`created_at` 有就用它，没有才退回 mtime 并**如实标 basis**。
 *
 * 判定与 I/O 分离，是为了让"什么时候该删"这个语义决策在任何平台可单测——
 * 真实的删除由 sweep.mjs 执行并留回执。 */

export const DEFAULT_REFS_KEEP_DAYS = 30;
export const DEFAULT_SWEEP_BUDGET_MS = 1500;
export const DEFAULT_SWEEP_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const MS_PER_DAY = 86400_000;

/** 认领时刻/捕获时刻：优先 meta.created_at，其次 mtime。 */
export function refAgeMs({ meta, mtimeMs, nowMs }) {
  // 漏传 nowMs 会让 ageMs 变成 NaN，于是“永不超期”——一个静默的 no-op 回收器。
  // 这里退到真实时间而不是充当下游把缺陷藏成“干净”。
  const clockNow = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const createdRaw = String(meta?.created_at || '').trim();
  const created = createdRaw ? Date.parse(createdRaw) : Number.NaN;
  if (Number.isFinite(created)) {
    return { ageMs: Math.max(0, clockNow - created), clock: 'meta.created_at' };
  }
  const mtime = Number(mtimeMs);
  if (!Number.isFinite(mtime)) return { ageMs: 0, clock: 'unavailable' };
  return { ageMs: Math.max(0, clockNow - mtime), clock: 'fs.mtime' };
}

/** 保留期：优先 meta.ttl_days（每条证据自己申报），否则用全局默认。 */
export function refKeepMs({ meta, defaultKeepDays = DEFAULT_REFS_KEEP_DAYS }) {
  const ttl = Number.parseFloat(String(meta?.ttl_days ?? '').trim());
  if (Number.isFinite(ttl) && ttl > 0) return { keepMs: ttl * MS_PER_DAY, basis: 'meta.ttl_days' };
  const days = Number(defaultKeepDays);
  const safeDays = Number.isFinite(days) && days >= 0 ? days : DEFAULT_REFS_KEEP_DAYS;
  return { keepMs: safeDays * MS_PER_DAY, basis: 'default.keepDays' };
}

/**
 * 单条 ref 的处置。`active` 为真时**一律保留**：可恢复长会话可能持有 30 天前的 ref，
 * 而它正是当前要引用的证据——删掉等于在会话中途斩断召回链。
 */
export function decideRefRetention({ meta, mtimeMs, nowMs, defaultKeepDays, activeSession = false } = {}) {
  if (activeSession) {
    return { action: 'keep', reason: 'active-session', clock: 'n/a', ageMs: 0, keepMs: 0, basis: 'active' };
  }
  const age = refAgeMs({ meta, mtimeMs, nowMs });
  const keep = refKeepMs({ meta, defaultKeepDays });
  if (age.clock === 'unavailable') {
    // 两个时钟都拿不到：不删。证明不了过期，就不该动手。
    return { action: 'keep', reason: 'clock-unavailable', ...age, ...keep };
  }
  if (age.ageMs > keep.keepMs) {
    return { action: 'prune', reason: 'expired', ...age, ...keep };
  }
  return { action: 'keep', reason: 'within-ttl', ...age, ...keep };
}

/**
 * 环境策略。默认**只报告不删**：与仓内先例同形（`AIOS_AUTODREAM_AUTO` 默认关、dream 只出
 * preview、governed apply 才是人工动作）——新增的自动变异不能默认删数据。
 * `AIOS_REFS_SWEEP=enforce|1|on` 才真删；`off|0` 连扫描也不做。
 * 手工 `aios refs prune` 走的是人的明确意图，固定以 enforce 调用。
 */
export function refsSweepPolicy({ env = process.env, nowMs = Date.now() } = {}) {
  const flag = String(env.AIOS_REFS_SWEEP || '').trim().toLowerCase();
  const enabled = flag !== '0' && flag !== 'off' && flag !== 'false';
  const mode = flag === 'enforce' || flag === '1' || flag === 'on' || flag === 'true' ? 'enforce' : 'dry-run';
  const keepDays = positiveNumber(env.AIOS_REFS_SWEEP_KEEP_DAYS, DEFAULT_REFS_KEEP_DAYS);
  const budgetMs = positiveNumber(env.AIOS_REFS_SWEEP_BUDGET_MS, DEFAULT_SWEEP_BUDGET_MS);
  const cooldownMs = positiveNumber(env.AIOS_REFS_SWEEP_COOLDOWN_HOURS, 0)
    * 60 * 60 * 1000 || DEFAULT_SWEEP_COOLDOWN_MS;
  return { enabled, keepDays, budgetMs, cooldownMs, mode };
}

function positiveNumber(raw, fallback) {
  const value = Number.parseFloat(String(raw ?? '').trim());
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** 冷却判定：和 evolution/trigger.mjs 同形——上次真跑完过才计冷却。 */
export function shouldRunRefsSweep({ lastRunAtMs, lastTruncated = false, nowMs, cooldownMs }) {
  // 上一轮被预算截断 = 积压还没清完。这时候冷却只会把问题锁住，所以放行。
  if (lastTruncated) return { run: true, reason: 'previous sweep truncated' };
  const last = Number(lastRunAtMs);
  if (!Number.isFinite(last) || last <= 0) {
    return { run: true, reason: 'never-run' };
  }
  const elapsedMs = Math.max(0, Number(nowMs) - last);
  if (elapsedMs < cooldownMs) {
    return {
      run: false,
      reason: `cooldown ${Math.round(elapsedMs / 60000)}m < ${Math.round(cooldownMs / 60000)}m`,
      nextEligibleAtMs: last + cooldownMs,
    };
  }
  return { run: true, reason: `cooldown elapsed (${Math.round(elapsedMs / 60000)}m)` };
}
