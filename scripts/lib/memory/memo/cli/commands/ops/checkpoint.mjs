import {
  appendPinnedMemo,
  PINNED_DEFAULT_MAX_CHARS,
  pinnedServeReceipt,
  readPinnedMemo,
} from '../../../storage/govern/pinned.mjs';
import { usageError } from '../../core/shared.mjs';

// Mirrors the memory_checkpoint MCP tool: one locked read-modify-write
// append carrying the [checkpoint] prefix, so CLI callers and MCP callers
// land identical bytes in the pinned workspace-memory recall surface.
export async function handleMemoCheckpointCommand({
  secondary = '',
  rest = [],
  workspaceRoot,
  io,
  maxChars = PINNED_DEFAULT_MAX_CHARS,
} = {}) {
  const text = [secondary, ...rest].filter((part) => part !== undefined).join(' ').trim();
  if (!text) throw usageError('Usage: memo checkpoint "<durable takeaway>"');
  const entry = `[checkpoint] ${text}`;
  await appendPinnedMemo(workspaceRoot, { content: entry });
  // 中文注释：“已 pin”不等于“会被注入”。写入后必须把服务窗口的真实结论报出来：旧版本无条件
  // 回“pinned”，而当时本工作区已有 103,694 字符 / 5,000 预算，所有新里程碑都落在窗口外——
  // 这就是这个缺陷能长期存在的机制。上限用调用方解析好的同一个值，不在此处重新默认。
  const receipt = pinnedServeReceipt(await readPinnedMemo(workspaceRoot), { maxChars });
  io.log(`Checkpoint ${receipt.served ? 'pinned and served' : 'written but NOT served'}: ${entry.slice(0, 60)}`);
  io.log(`  pinned window ${receipt.chars}/${receipt.maxChars} chars | ${receipt.entriesIncluded}/${receipt.entriesTotal} entries served${receipt.entriesDropped > 0 ? ` | ${receipt.entriesDropped} older entries not injected` : ''}`);
  if (!receipt.served) {
    io.log('  WARN: this checkpoint does not fit the served window, so it will not be injected. Shorten it, raise WORKSPACE_MEMORY_PINNED_MAX_CHARS, or trim the lane.');
  }
  return true;
}
