/* 中文注释：hook event 追加独立处理生命周期钩子证据，不修改 run summary。 */
import { appendFile, mkdir } from 'node:fs/promises';

import { normalizeText } from '../content/normalizers.mjs';
import { getSoloHarnessPaths } from './paths.mjs';

export async function appendSoloHookEvent({ rootDir, sessionId, event = {} } = {}) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) {
    throw new Error('solo hook event requires sessionId');
  }
  const payload = {
    ts: normalizeText(event.ts, new Date().toISOString()),
    kind: normalizeText(event.kind, 'hook'),
    // 中文注释：白名单里没有的字段会被无声丢掉。停滞归因（verdict / budgetMs / elapsedMs / component）
    // 必须在这里显式收下，否则磁盘上的事件会比内存里的结论少字段——恰好丢掉要留给别人复核的那部分。
    component: normalizeText(event.component),
    hook: normalizeText(event.hook),
    phase: normalizeText(event.phase),
    iteration: Number.isFinite(event.iteration) ? Math.max(0, Math.floor(event.iteration)) : 0,
    status: normalizeText(event.status, 'ok'),
    verdict: normalizeText(event.verdict, event.status, 'ok'),
    budgetMs: Number.isFinite(Number(event.budgetMs)) ? Math.floor(Number(event.budgetMs)) : null,
    elapsedMs: Number.isFinite(Number(event.elapsedMs)) ? Math.floor(Number(event.elapsedMs)) : null,
    detail: normalizeText(event.detail),
  };
  const paths = getSoloHarnessPaths({ rootDir, sessionId: normalizedSessionId });
  await mkdir(paths.dir, { recursive: true });
  await appendFile(paths.hookEventsPath, `${JSON.stringify(payload)}\n`, 'utf8');
  return {
    ...payload,
    hookEventsPath: paths.hookEventsPath,
  };
}
