import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  OFFLOAD_MARKER,
  buildHandleText,
  countLines,
  excerptOf,
  offloadMessages,
  resolveOffloadArchiveDir,
  resolveOffloadConfig,
  sha256Of,
  shouldOffloadText,
  sliceLines,
} from '../../packages/aios-pi/lib/offload.mjs';

async function makeArchiveDir(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aios-offload-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('resolveOffloadConfig defaults off (opt-in) and honors the on toggle', () => {
  assert.deepEqual(resolveOffloadConfig({}), { enabled: false, thresholdChars: 20000 });
  assert.equal(resolveOffloadConfig({ AIOS_PI_OFFLOAD: 'on' }).enabled, true);
  assert.equal(resolveOffloadConfig({ AIOS_PI_OFFLOAD: 'OFF' }).enabled, false);
  assert.equal(resolveOffloadConfig({ AIOS_PI_OFFLOAD_THRESHOLD: '5000' }).thresholdChars, 5000);
  assert.equal(resolveOffloadConfig({ AIOS_PI_OFFLOAD_THRESHOLD: 'bogus' }).thresholdChars, 20000);
});

test('resolveOffloadArchiveDir defaults under .aios/tmp and honors override', () => {
  assert.equal(resolveOffloadArchiveDir({}), path.join(process.cwd(), '.aios', 'tmp', 'pi-offload'));
  assert.equal(resolveOffloadArchiveDir({ AIOS_PI_OFFLOAD_DIR: '/tmp/x' }), '/tmp/x');
});

test('shouldOffloadText uses char threshold', () => {
  assert.equal(shouldOffloadText('a'.repeat(19999), 20000), false);
  assert.equal(shouldOffloadText('a'.repeat(20000), 20000), true);
  assert.equal(shouldOffloadText(undefined, 20000), false);
});

test('excerptOf keeps head and tail with an elision marker', () => {
  const text = 'a'.repeat(5000) + 'MARK' + 'b'.repeat(5000);
  const excerpt = excerptOf(text, { headChars: 100, tailChars: 100 });
  assert.ok(excerpt.length < 400);
  assert.match(excerpt, /offloaded \d+ chars/);
  assert.equal(excerptOf('short', {}), 'short');
});

test('offloadMessages archives oversized texts and replaces them with handles', async (t) => {
  const archiveDir = await makeArchiveDir(t);
  const big = ('x'.repeat(90) + '\n').repeat(300);
  const messages = [
    { role: 'toolResult', content: [{ type: 'text', text: big }] },
    { role: 'toolResult', content: [{ type: 'text', text: 'small result' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'answer' }] },
  ];
  const writes = [];
  const stats = await offloadMessages({
    messages,
    thresholdChars: 20000,
    archiveDir,
    readFileImpl: () => Promise.reject(new Error('ENOENT')),
    writeFileImpl: async (filePath, data) => {
      writes.push(filePath);
      await writeFile(filePath, data, 'utf8');
    },
  });
  assert.equal(stats.offloaded, 1);
  assert.ok(stats.bytes_before > 20000);
  assert.ok(stats.bytes_after < 5000);
  const handle = messages[0].content[0].text;
  assert.match(handle, new RegExp(`${OFFLOAD_MARKER} [a-f0-9]{16}`));
  assert.ok(handle.length < 5000, `handle must be compact, got ${handle.length}`);
  assert.match(handle, /offloaded \d+ chars; page exact content/);
  assert.ok(stats.bytes_after * 5 < stats.bytes_before, 'context share must shrink by >80%');
  assert.equal(writes.length, 1);
  const archived = await readFile(writes[0], 'utf8');
  assert.equal(archived, big);
});

test('offloadMessages is idempotent: handles are skipped, archives not rewritten', async (t) => {
  const archiveDir = await makeArchiveDir(t);
  const big = ('y'.repeat(80) + '\n').repeat(300);
  const messages = [{ role: 'toolResult', content: [{ type: 'text', text: big }] }];
  let writeCount = 0;
  const writeImpl = async (filePath, data) => {
    writeCount += 1;
    await writeFile(filePath, data, 'utf8');
  };
  const first = await offloadMessages({ messages, thresholdChars: 20000, archiveDir, readFileImpl: () => Promise.reject(new Error('ENOENT')), writeFileImpl: writeImpl });
  const handleText = messages[0].content[0].text;
  const second = await offloadMessages({ messages, thresholdChars: 20000, archiveDir, readFileImpl: () => Promise.resolve(handleText), writeFileImpl: writeImpl });
  assert.equal(first.offloaded, 1);
  assert.equal(second.offloaded, 0);
  assert.equal(second.scanned, 1, 'handle text is scanned once and skipped by marker');
  assert.equal(writeCount, 1);
});

test('offloadMessages reuses an existing identical archive without rewriting', async (t) => {
  const archiveDir = await makeArchiveDir(t);
  const big = ('z'.repeat(80) + '\n').repeat(300);
  const ref = sha256Of(big).slice(0, 16);
  await writeFile(path.join(archiveDir, `${ref}.txt`), big, 'utf8');
  const messages = [{ role: 'toolResult', content: [{ type: 'text', text: big }] }];
  let writeCount = 0;
  const stats = await offloadMessages({
    messages,
    thresholdChars: 20000,
    archiveDir,
    readFileImpl: (filePath) => readFile(filePath, 'utf8'),
    writeFileImpl: async () => {
      writeCount += 1;
    },
  });
  assert.equal(stats.offloaded, 1);
  assert.equal(writeCount, 0, 'identical archive must not be rewritten');
  const handle = messages[0].content[0].text;
  assert.ok(handle.includes(OFFLOAD_MARKER), 'handle carries the offload marker');
});

test('buildHandleText, countLines and sliceLines behave', () => {
  const handle = buildHandleText({ ref: 'abc', bytes: 10, lines: 2, excerpt: 'e' });
  assert.match(handle, /\[aios:offloaded abc\]/);
  assert.equal(countLines('a\nb\nc'), 3);
  const page = sliceLines('l1\nl2\nl3\nl4', { offset: 2, limit: 2 });
  assert.deepEqual({ total: page.total, from: page.from, to: page.to, text: page.text }, { total: 4, from: 2, to: 3, text: 'l2\nl3' });
  assert.equal(sliceLines('a', { offset: 99 }).text, '');
});
