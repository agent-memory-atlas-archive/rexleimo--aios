import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PINNED_DEFAULT_MAX_CHARS,
  renderPinnedBlock,
  selectPinnedWindow,
  pinnedServeReceipt,
  normalizePinnedContent,
} from '../../../lib/memory/memo/storage/govern/pinned.mjs';

test('render numbers lines and reports margin metadata', () => {
  const rendered = renderPinnedBlock('first\nsecond\nthird');
  assert.equal(rendered.lines.length, 3);
  assert.deepEqual(rendered.lines.map((line) => line.no), [1, 2, 3]);
  assert.equal(rendered.lines[0].text, 'first');
  assert.equal(rendered.truncated, false);
  assert.equal(rendered.chars + rendered.remaining, rendered.maxChars);
  assert.ok(rendered.chars > 0 && rendered.remaining > 0);
});

test('over-limit content truncates and demands explicit tidy', () => {
  const rendered = renderPinnedBlock('x'.repeat(PINNED_DEFAULT_MAX_CHARS + 100), {
    maxChars: PINNED_DEFAULT_MAX_CHARS,
  });
  assert.equal(rendered.truncated, true);
  assert.equal(rendered.remaining, 0);
  assert.ok(rendered.chars <= PINNED_DEFAULT_MAX_CHARS);
});

test('custom limits clamp to the allowed range', () => {
  const tiny = renderPinnedBlock('hello', { maxChars: 1 });
  assert.equal(tiny.maxChars, 512);
  const huge = renderPinnedBlock('hello', { maxChars: 10 ** 9 });
  assert.equal(huge.maxChars, 20000);
});

test('empty content renders zero lines with full margin', () => {
  const rendered = renderPinnedBlock('');
  assert.deepEqual(rendered.lines, []);
  assert.equal(rendered.chars, 0);
  assert.equal(rendered.remaining, rendered.maxChars);
  assert.equal(rendered.truncated, false);
});

test('pin status reports the usage triple from the CLI', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cliPath = path.resolve(here, '..', '..', '..', 'aios.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'memo-pin-status-'));
  const runMemo = (args) => spawnSync(process.execPath, [cliPath, 'memo', ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, AIOS_AGENT_ID: '' },
  });
  try {
    const set = runMemo(['pin', 'set', 'status probe']);
    assert.equal(set.status, 0, set.stderr || set.stdout);
    const status = runMemo(['pin', 'status']);
    assert.equal(status.status, 0, status.stderr || status.stdout);
    assert.match(String(status.stdout || ''), /pinned default: 13\/\d+ chars, remaining \d+$/um);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

/* 中文注释（2026-10-27）：pinned 是 append-only 通道，而旧 renderPinnedBlock 在超预算时
 * `slice(0, limit)` —— 保留最旧。后果被实测出来：本工作区 103,694 字符 / 5,000 预算，
 * 297 条 [checkpoint] 全部落在服务窗口之外，只有 9 月的冒烟条目还在注入，而写入侧一直报“成功”。
 * 以下用例钉的是新契约：类内最新优先 + 规则保底 + 丢弃必须可见。 */

const lane = (ruleCount, checkpointCount, entrySize = 180) => {
  const parts = [];
  for (let i = 1; i <= ruleCount; i += 1) parts.push(`rule ${i}: ${'r'.repeat(entrySize)}`);
  for (let i = 1; i <= checkpointCount; i += 1) parts.push(`[checkpoint] milestone ${i} ${'m'.repeat(entrySize)}`);
  return parts.join('\n\n') + '\n';
};

test('over-budget lane serves the newest checkpoints instead of the oldest ones', () => {
  const rendered = renderPinnedBlock(lane(1, 200), { maxChars: 2000 });
  const text = rendered.lines.map((line) => line.text).join('\n');

  assert.equal(rendered.truncated, true);
  assert.ok(rendered.entriesDropped > 100, `expected a large drop, got ${rendered.entriesDropped}`);
  assert.ok(text.includes('milestone 200'), 'the newest milestone must be injected');
  assert.ok(text.includes('milestone 199'), 'recent history stays contiguous, not a single survivor');
  assert.ok(!text.includes('milestone 1 '), 'the oldest milestones are the ones that drop out');
  assert.ok(rendered.chars <= 2000, 'the served block never exceeds the budget');
});

test('a curated rule is never starved by the checkpoint stream', () => {
  const rendered = renderPinnedBlock(lane(1, 300), { maxChars: 1200 });
  const text = rendered.lines.map((line) => line.text).join('\n');
  assert.ok(text.includes('rule 1:'), 'long-lived preferences are the reason this lane exists');
  assert.ok(text.includes('milestone 300'), 'and recency still wins the remaining budget');
});

test('dropped entries are announced, never silently skipped', () => {
  const rendered = renderPinnedBlock(lane(0, 120), { maxChars: 1500 });
  const text = rendered.lines.map((line) => line.text).join('\n');
  const marker = text.match(/pinned window: (\d+) of (\d+) entries served; (\d+) older entries not injected/u);
  assert.ok(marker, 'the served block must state what it left out');
  assert.equal(Number(marker[1]) + Number(marker[3]), Number(marker[2]), 'served + dropped must equal the total');
});

test('a lane inside the budget is served byte-for-byte as before', () => {
  const content = lane(1, 3);
  const rendered = renderPinnedBlock(content, { maxChars: PINNED_DEFAULT_MAX_CHARS });
  assert.equal(rendered.truncated, false);
  assert.equal(rendered.entriesDropped, 0);
  assert.equal(rendered.lines.map((line) => line.text).join('\n'), normalizePinnedContent(content).trimEnd());
});

test('selection keeps the file order so the injected block still reads as a timeline', () => {
  const entries = ['[checkpoint] oldest-0', '[checkpoint] middle-1', '[checkpoint] newest-2'];
  const picked = selectPinnedWindow(entries, 80);
  assert.deepEqual(picked, entries, 'all three fit, so the whole timeline is served in file order');
  const tight = selectPinnedWindow(entries, 40);
  assert.equal(tight.length, 1, 'a budget that fits exactly one entry keeps one, not zero');
  assert.equal(tight[0], entries[2], 'the newest entry is always the one that survives');
});

test('the write-side receipt distinguishes "written" from "served"', () => {
  const healthy = pinnedServeReceipt(lane(1, 2), { maxChars: PINNED_DEFAULT_MAX_CHARS });
  assert.equal(healthy.served, true);
  assert.equal(healthy.entriesDropped, 0);

  // 单条就超预算：服务窗口只能截前缀兜底，此时"落盘了"与"被完整注入"必须区分开报。
  const oversized = pinnedServeReceipt(`[checkpoint] ${'x'.repeat(PINNED_DEFAULT_MAX_CHARS + 50)}`, {
    maxChars: PINNED_DEFAULT_MAX_CHARS,
  });
  assert.equal(oversized.served, false, 'an entry that cannot fit must not be reported as served');
  assert.ok(oversized.chars > 0, 'but the prefix fallback still injects something rather than nothing');
});

test('pin status reports the lane backlog, not only the served window', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cliPath = path.resolve(here, '..', '..', '..', 'aios.mjs');
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'memo-pin-backlog-'));
  const runMemo = (args) => spawnSync(process.execPath, [cliPath, 'memo', ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, AIOS_AGENT_ID: '' },
  });
  try {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(path.join(rootDir, '.aios', 'memo', 'file', 'pinned'), { recursive: true });
    // 造一条"窗口接近满、lane 远超预算"的现实形状：这正是过去没人看得见 backlog 的原因。
    const laneEntries = Array.from({ length: 30 }, (_, i) => `[checkpoint] milestone ${i} ${'m'.repeat(400)}`);
    await writeFile(
      path.join(rootDir, '.aios', 'memo', 'file', 'pinned', 'default.md'),
      `${laneEntries.join('\n\n')}\n`,
      'utf8',
    );

    const status = runMemo(['pin', 'status']);
    assert.equal(status.status, 0, status.stderr || status.stdout);
    const out = String(status.stdout || '');
    assert.match(out, /pinned default: \d+\/\d+ chars, remaining \d+/um, 'the usage triple stays intact');
    assert.match(out, /lane holds \d+ chars \/ 30 entries/u, 'the lane size must be stated, not inferred');
    assert.match(out, /\d+ are outside the served window/u, 'and so must the backlog');
    assert.match(out, /memo pin set/u, 'with the command that can actually trim it');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
