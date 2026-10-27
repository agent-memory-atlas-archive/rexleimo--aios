import path from 'node:path';
import { getActiveMemoStorage } from '../base/config.mjs';
import {
  PINNED_DEFAULT_MAX_CHARS,
  PINNED_HARD_MAX_CHARS,
  PINNED_MIN_MAX_CHARS,
} from '../base/constants.mjs';
import {
  collectRecursiveFiles,
  readTextIfExists,
  sha256Hex,
  writeText,
} from '../base/fs-io.mjs';
import { withMemoStorageLock } from '../base/lock.mjs';
import {
  normalizeMemoStorageName,
  sanitizeSpace,
} from '../base/normalizers.mjs';
import {
  filePinnedPath,
  memoRoot,
  splitPinnedPath,
} from '../base/paths.mjs';

export { PINNED_DEFAULT_MAX_CHARS, PINNED_HARD_MAX_CHARS, PINNED_MIN_MAX_CHARS };

function pinnedFilePath(workspaceRoot, storage, space, { env = process.env } = {}) {
  const resolvedStorage = normalizeMemoStorageName(storage);
  const safeSpace = sanitizeSpace(space);
  return resolvedStorage === 'file'
    ? filePinnedPath(workspaceRoot, safeSpace, { env })
    : splitPinnedPath(workspaceRoot, safeSpace, { env });
}

/* B3 stale-write guard: pinned edits are read-modify-write. Callers that
 * read first pass `expectedHash` (from `pinnedContentHash` of what they
 * read); a concurrent landing in between is rejected with
 * AIOS_MEMO_PINNED_STALE carrying the fresh hash, so the writer re-reads
 * instead of silently clobbering. Without `expectedHash` the legacy
 * blind-overwrite behavior is preserved. Pure helpers stay outside the
 * lock; the check-and-write pair runs inside the memo storage lock. */
export function normalizePinnedContent(content = '') {
  const normalized = String(content ?? '').trimEnd();
  return normalized ? `${normalized}\n` : '';
}

export function pinnedContentHash(content = '') {
  return sha256Hex(normalizePinnedContent(content));
}

export function clampPinnedMaxChars(maxChars = PINNED_DEFAULT_MAX_CHARS) {
  const value = Math.floor(Number(maxChars));
  if (!Number.isFinite(value)) return PINNED_DEFAULT_MAX_CHARS;
  return Math.min(PINNED_HARD_MAX_CHARS, Math.max(PINNED_MIN_MAX_CHARS, value));
}

/* C3 limit projection for a pinned memory block. Pure: reads nothing, writes
 * nothing. `chars`/`remaining` account the rendered portion (the part that
 * fits the budget), so over-limit content reports truncated=true,
 * remaining=0 and the reader can still see the prefix instead of failing.
 *
 * 中文注释（2026-10-27 方向修正）：旧实现在超预算时 `slice(0, limit)` —— **保留最旧**。
 * 对 append-only 的通道而言，这恰好是最坏的方向：最新写进去的里程碑排在尾部，一旦通道过预算就
 * 永远不被注入，而写入侧仍然报“已 pin”。实测：本工作区 pinned 103,694 字符 / 预算 5,000，
 * 297 条 checkpoint 全部落在服务窗口外，只有9 月的冒烟条目被服务。
 *
 * 新规则按**类别保底 + 类内最新优先**：
 *   1) 非 `[checkpoint]` 条目是人工常驻规则，量少且短，先全额争取服务（不会被里程碑挤掉）；
 *   2) 剩下预算由 `[checkpoint]` 从新到旧填入；
 *   3) 发生丢弃时在块内留一行 marker，说清“服务了几条 / 还有几条未注入”，不允许静默。 */
const CHECKPOINT_PREFIX = '[checkpoint]';
// marker 文本由实际计数生成，预留一个宽松固定额度，保证最终长度不越预算。
const PINNED_MARKER_RESERVE = 96;

function splitPinnedEntries(normalized = '') {
  return normalized.split(/\n{2,}/u).map((entry) => entry.trim()).filter(Boolean);
}

/**
 * Select the entries that fit the injection budget.
 * Returns the included entries in **chronological order** (the file's own order),
 * so the injected block still reads as a timeline rather than a shuffled set.
 *
 * 中文注释：按**索引**选，不按文本值选。文本值方案在重复条目上会错：预算只算一次，
 * 输出却把两条一模一样的都放回去 —— 那就是我们要修的“静默越预算”本身，不能拿它当实现。
 */
export function selectPinnedWindow(entries = [], limit = PINNED_DEFAULT_MAX_CHARS) {
  const indexes = entries.map((_, index) => index);
  const isCheckpoint = (index) => entries[index].startsWith(CHECKPOINT_PREFIX);
  const picked = new Set();
  let used = 0;

  const tryPush = (index, reserve) => {
    const cost = (picked.size > 0 ? 2 : 0) + entries[index].length + 1;
    if (used + cost + reserve > limit) return false;
    picked.add(index);
    used += cost;
    return true;
  };

  const overflow = entries.reduce((total, entry) => total + entry.length + 2, 0) > limit;
  // 中文注释：marker 预留随预算缩放。固定 96 字符在小预算上会把选择压成空（而生产入口有 512 下限，
  // 碰不到这段 —— 但一个导出纯函数不该自带悬崖）。取四分之一上限，既留得下提示也不吃掉整个窗口。
  const reserve = overflow ? Math.min(PINNED_MARKER_RESERVE, Math.floor(limit / 4)) : 0;

  // 1) 人工规则先保底：它们代表长期偏好，不该被里程碑挤出去。
  for (const index of indexes.filter((entry) => !isCheckpoint(entry))) {
    tryPush(index, reserve);
  }
  // 2) 余下预算由 checkpoint 从新到旧填；装不下就停，保证服务的是时间上连续的后缀。
  for (const index of [...indexes.filter((entry) => isCheckpoint(entry))].reverse()) {
    if (!tryPush(index, reserve)) break;
  }

  // 3) 输出维持文件自身顺序（时间线），而不是选择顺序。
  return indexes.filter((index) => picked.has(index)).map((index) => entries[index]);
}

export function renderPinnedBlock(content = '', { maxChars = PINNED_DEFAULT_MAX_CHARS } = {}) {
  const limit = clampPinnedMaxChars(maxChars);
  const normalized = normalizePinnedContent(content);
  const entries = splitPinnedEntries(normalized);
  const includedEntries = selectPinnedWindow(entries, limit);
  const dropped = entries.length - includedEntries.length;

  let included = includedEntries.length ? `${includedEntries.join('\n\n')}\n` : '';
  if (entries.length > 0 && includedEntries.length === 0) {
    // 中文注释：没有任何单条能装下时的回退 —— 保留旧行为“截前缀”。条目粒度不能让“一条超预算”
    // 变成“什么都不注入”：那比截断更糟。既有的 remaining=0 契约就是钉这个性质的，不能放宽它。
    let prefix = normalized.slice(0, limit);
    const lastNewline = prefix.lastIndexOf('\n');
    if (lastNewline >= 0) prefix = prefix.slice(0, lastNewline + 1);
    included = prefix;
  } else if (dropped > 0) {
    const marker = `[pinned window: ${includedEntries.length} of ${entries.length} entries served; ${dropped} older entries not injected]\n`;
    if (included.length + marker.length <= limit) {
      included += marker;
    }
  }

  const rows = included.split('\n');
  if (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
  const chars = included.length;
  return {
    maxChars: limit,
    lines: rows.map((text, index) => ({ no: index + 1, text })),
    truncated: normalized.length > limit,
    chars,
    remaining: limit - chars,
    entriesTotal: entries.length,
    entriesIncluded: includedEntries.length,
    entriesDropped: dropped,
    includedEntries,
  };
}

/**
 * The write-side receipt: answers the only question the append path ever needed to
 * answer but didn't - **did the entry I just wrote land inside the served window**.
 * Derived from `renderPinnedBlock`, so there is exactly one owner of that judgement.
 */
export function pinnedServeReceipt(content = '', { maxChars = PINNED_DEFAULT_MAX_CHARS } = {}) {
  const rendered = renderPinnedBlock(content, { maxChars });
  const entries = splitPinnedEntries(normalizePinnedContent(content));
  const newest = entries.length > 0 ? entries[entries.length - 1] : '';
  return {
    served: Boolean(newest) && rendered.includedEntries.includes(newest),
    chars: rendered.chars,
    maxChars: rendered.maxChars,
    entriesTotal: rendered.entriesTotal,
    entriesIncluded: rendered.entriesIncluded,
    entriesDropped: rendered.entriesDropped,
  };
}

function staleWriteError(currentContent) {
  const error = new Error('pinned content changed since read; re-read and retry');
  error.code = 'AIOS_MEMO_PINNED_STALE';
  error.currentHash = pinnedContentHash(currentContent);
  return error;
}

async function guardedPinnedWrite(filePath, next, expectedHash) {
  if (expectedHash === undefined) {
    await writeText(filePath, next);
    return next;
  }
  const current = await readTextIfExists(filePath);
  if (pinnedContentHash(current) !== String(expectedHash)) throw staleWriteError(current);
  await writeText(filePath, next);
  return next;
}

export async function readPinnedMemo(workspaceRoot, { storage, space = 'default', env = process.env } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot, { env });
  return await readTextIfExists(pinnedFilePath(workspaceRoot, resolvedStorage, space, { env }));
}

export async function writePinnedMemo(workspaceRoot, { storage, space = 'default', content = '', expectedHash, env = process.env } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot, { env });
  const next = normalizePinnedContent(content);
  const filePath = pinnedFilePath(workspaceRoot, resolvedStorage, space, { env });
  return await withMemoStorageLock({ workspaceRoot, env }, async () => guardedPinnedWrite(filePath, next, expectedHash));
}

export async function appendPinnedMemo(workspaceRoot, { storage, space = 'default', content = '', expectedHash, env = process.env } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot, { env });
  const addition = String(content ?? '').trim();
  if (!addition) return await readPinnedMemo(workspaceRoot, { storage: resolvedStorage, space, env });
  const filePath = pinnedFilePath(workspaceRoot, resolvedStorage, space, { env });
  return await withMemoStorageLock({ workspaceRoot, env }, async () => {
    const existing = await readTextIfExists(filePath);
    if (expectedHash !== undefined && pinnedContentHash(existing) !== String(expectedHash)) {
      throw staleWriteError(existing);
    }
    const next = existing.trimEnd() ? `${existing.trimEnd()}\n\n${addition}\n` : `${addition}\n`;
    await writeText(filePath, next);
    return next;
  });
}

export async function readPinnedByStorage(workspaceRoot, storage, { env = process.env } = {}) {
  const resolvedStorage = normalizeMemoStorageName(storage);
  const pinnedRoot = path.join(memoRoot(workspaceRoot, { env }), resolvedStorage, 'pinned');
  const files = await collectRecursiveFiles(pinnedRoot, (filePath) => filePath.endsWith('.md'));
  const output = [];
  for (const filePath of files) {
    const safeSpace = path.basename(filePath, '.md');
    const content = await readTextIfExists(filePath);
    if (content) output.push({ safeSpace, content });
  }
  return output;
}

export async function writePinnedByStorage(workspaceRoot, storage, pinned, { env = process.env } = {}) {
  const resolvedStorage = normalizeMemoStorageName(storage);
  for (const entry of pinned) {
    const targetPath = resolvedStorage === 'file'
      ? filePinnedPath(workspaceRoot, entry.safeSpace, { env })
      : splitPinnedPath(workspaceRoot, entry.safeSpace, { env });
    await writeText(targetPath, entry.content || '');
  }
}
