import fs from 'node:fs';
import { workspaceMemorySessionId } from '../../../care/workspace-memory.mjs';
import { assertMaxChars, assertSafeMemoText } from '../../core/capacity.mjs';
import { mirrorPinnedMemoToLegacy } from '../../core/legacy.mjs';
import { safePrintText, usageError } from '../../core/shared.mjs';
import { getActiveMemoStorage, loadMemoStorageApi } from '../../core/storage-api.mjs';
import { normalizePinnedContent, renderPinnedBlock } from '../../../storage/govern/pinned.mjs';
import { pinnedPath, readPinned } from '../../core/workspace-state.mjs';

export async function handleMemoPinCommand({
  secondary,
  rest,
  workspaceRoot,
  activeSpace,
  workspacePinnedMaxChars,
  io,
}) {
  const action = String(secondary || '').toLowerCase();
  if (!action) throw usageError('Usage: memo pin <show|set|add|status> ...');

  const space = activeSpace;
  const sessionId = workspaceMemorySessionId(space);

  if (action === 'show') {
    const storageApi = await loadMemoStorageApi();
    const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
    let content = await storageApi.readPinnedMemo(workspaceRoot, { storage, space });
    if (!String(content || '').trim() && fs.existsSync(pinnedPath(workspaceRoot, sessionId))) {
      content = readPinned(workspaceRoot, sessionId);
    }
    if (!String(content || '').trim()) {
      io.log('(none)');
      return true;
    }
    safePrintText(io, content);
    return true;
  }

  if (action === 'status') {
    const storageApi = await loadMemoStorageApi();
    const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
    let content = await storageApi.readPinnedMemo(workspaceRoot, { storage, space });
    if (!String(content || '').trim() && fs.existsSync(pinnedPath(workspaceRoot, sessionId))) {
      content = readPinned(workspaceRoot, sessionId);
    }
    const rendered = renderPinnedBlock(content, { maxChars: workspacePinnedMaxChars });
    io.log(`pinned ${space}: ${rendered.chars}/${rendered.maxChars} chars, remaining ${rendered.remaining}${rendered.truncated ? ', truncated' : ''}`);
    // 中文注释：第一行一直是“服务窗口”的体积，所以 lane 真实长到多少从来看不到——
    // 本工作区窗口报 4,701/5,000，而 lane 实有 103,694 字符 / 299 条。窗口接近满不等于 lane 满，
    // 需要清的 backlog 必须可见，并给出真正能清它的那条命令。
    if (rendered.entriesDropped > 0) {
      io.log(`  lane holds ${normalizePinnedContent(content).length} chars / ${rendered.entriesTotal} entries; ${rendered.entriesDropped} are outside the served window`);
      io.log('  to trim the lane: memo pin set "<curated text>" (replaces the lane) or raise WORKSPACE_MEMORY_PINNED_MAX_CHARS');
    }
    return true;
  }

  const text = rest.join(' ').trim();
  if (!text) throw usageError('pin set/add requires text');
  assertSafeMemoText(text, 'pinned workspace memory');
  const storageApi = await loadMemoStorageApi();
  const storage = await getActiveMemoStorage(workspaceRoot, storageApi);

  if (action === 'set') {
    assertMaxChars(text, workspacePinnedMaxChars, 'pinned workspace memory');
    await storageApi.writePinnedMemo(workspaceRoot, { storage, space, content: text });
    mirrorPinnedMemoToLegacy(workspaceRoot, { space, content: text });
    io.log('Pinned memory updated.');
    return true;
  }
  if (action === 'add') {
    const existing = String(await storageApi.readPinnedMemo(workspaceRoot, { storage, space }) || '').trimEnd();
    const next = existing ? `${existing}\n\n${text}` : text;
    assertMaxChars(next, workspacePinnedMaxChars, 'pinned workspace memory');
    await storageApi.writePinnedMemo(workspaceRoot, { storage, space, content: next });
    mirrorPinnedMemoToLegacy(workspaceRoot, { space, content: next });
    io.log('Pinned memory appended.');
    return true;
  }
  throw usageError(`Unknown pin action: ${secondary}`);
}
