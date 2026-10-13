/* 中文注释：Memo barrel，集中导出 persona/workspace-memory/storage 子路径中跨域消费的能力。 */
export { buildPersonaOverlay } from './care/persona.mjs';

export {
  ensureWorkspaceMemorySession,
  normalizeWorkspaceMemorySpace,
  workspaceMemoryEventsPath,
  workspaceMemoryMetaPath,
  workspaceMemoryPinnedPath,
  workspaceMemorySessionDir,
  workspaceMemorySessionId,
} from './care/workspace-memory.mjs';

export {
  appendMemoEvent,
} from './storage/events/events-write.mjs';
export { readJsonlEvents, collectEvents } from './storage/events/events-read.mjs';
export { listMemoEvents, searchMemoEvents } from './storage/views/query.mjs';
export { getActiveMemoStorage } from './storage/base/config.mjs';
export { normalizeMemoStorageName, normalizeMemoScope } from './storage/base/normalizers.mjs';
export { atomicWriteText } from './storage/base/fs-io.mjs';
export { fileEventsPath } from './storage/base/paths.mjs';
export { readPinnedMemo } from './storage/govern/pinned.mjs';
