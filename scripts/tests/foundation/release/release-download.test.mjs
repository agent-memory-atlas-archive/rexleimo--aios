import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { downloadReleaseAsset, verifyDownloadedArchive } from '../../../lib/execution/lifecycle/release/release-download.mjs';

const TMP_BASE = await fs.realpath(os.tmpdir());

function fakeResponse({ bytes, ok = true, status = 200, contentLength = bytes.length }) {
  return {
    ok,
    status,
    headers: { get: (name) => (name === 'content-length' ? String(contentLength) : null) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function zipBytes() {
  // 一个只带 end-of-central-directory 记录的最小 zip 尾部：校验只看这个签名。
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    Buffer.alloc(18),
  ]);
  return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(12), eocd]);
}

async function newDir(prefix) {
  return mkdtemp(path.join(TMP_BASE, prefix));
}

test('downloadReleaseAsset writes the asset and reports one attempt on success', async () => {
  const dir = await newDir('aios-dl-');
  const dest = path.join(dir, 'aios.zip');
  const bytes = zipBytes();
  const calls = [];

  const result = await downloadReleaseAsset({
    url: 'https://github.com/rexleimo/aios/releases/download/v6.7.0/aios.zip',
    destPath: dest,
    fetchImpl: async (url) => {
      calls.push(url);
      return fakeResponse({ bytes });
    },
    sleep: async () => {},
    io: { log: () => {} },
  });

  assert.equal(result.attempts, 1);
  assert.equal(result.bytes, bytes.length);
  assert.deepEqual(calls, ['https://github.com/rexleimo/aios/releases/download/v6.7.0/aios.zip']);
  assert.deepEqual(await fs.readFile(dest), bytes);
});

test('downloadReleaseAsset retries a transport reset and cleans the partial file', async () => {
  const dir = await newDir('aios-dl-');
  const dest = path.join(dir, 'aios.zip');
  let attempt = 0;
  const logs = [];

  const result = await downloadReleaseAsset({
    url: 'https://example.invalid/aios.zip',
    destPath: dest,
    fetchImpl: async () => {
      attempt += 1;
      if (attempt === 1) {
        // 模拟中途重置：写了半截再抛，残文件必须被清掉。
        await fs.writeFile(dest, Buffer.from('half'));
        throw new Error('schannel: server closed abruptly (missing close_notify)');
      }
      return fakeResponse({ bytes: zipBytes() });
    },
    sleep: async () => {},
    io: { log: (line) => logs.push(line) },
  });

  assert.equal(result.attempts, 2);
  assert.equal(logs.some((line) => line.includes('attempt 1/4 failed') && line.includes('missing close_notify')), true);
  assert.equal((await fs.readFile(dest)).includes(Buffer.from('half')), false);
});

test('downloadReleaseAsset rejects a truncated payload and never leaves it on disk', async () => {
  const dir = await newDir('aios-dl-');
  const dest = path.join(dir, 'aios.zip');
  const truncated = zipBytes().subarray(0, 8); // 有内容、无 EOCD

  await assert.rejects(
    downloadReleaseAsset({
      url: 'https://example.invalid/aios.zip',
      destPath: dest,
      fetchImpl: async () => fakeResponse({ bytes: truncated, contentLength: 999999 }),
      retries: 2,
      sleep: async () => {},
      io: { log: () => {} },
    }),
    /failed after 2 attempt\(s\).*content-length mismatch/u,
  );

  await assert.rejects(fs.stat(dest), { code: 'ENOENT' });
});

test('downloadReleaseAsset retries retryable statuses (503) and reports the last one', async () => {
  const dir = await newDir('aios-dl-');
  const dest = path.join(dir, 'missing.zip');

  await assert.rejects(
    downloadReleaseAsset({
      url: 'https://example.invalid/missing.zip',
      destPath: dest,
      fetchImpl: async () => ({ ...fakeResponse({ bytes: Buffer.alloc(0) }), ok: false, status: 503 }),
      retries: 3,
      sleep: async () => {},
      io: { log: () => {} },
    }),
    /HTTP 503/u,
  );
});

test('downloadReleaseAsset does not waste retries on a missing asset (404)', async () => {
  const dir = await newDir('aios-dl-');
  const dest = path.join(dir, 'missing.zip');
  let calls = 0;

  await assert.rejects(
    downloadReleaseAsset({
      url: 'https://example.invalid/nope.zip',
      destPath: dest,
      fetchImpl: async () => {
        calls += 1;
        return { ...fakeResponse({ bytes: Buffer.alloc(0) }), ok: false, status: 404 };
      },
      retries: 4,
      sleep: async () => {},
      io: { log: () => {} },
    }),
    /aborted \(not retryable\): HTTP 404/u,
  );
  assert.equal(calls, 1);
});

test('downloadReleaseAsset refuses a zip without an end-of-central-directory record', async () => {
  const dir = await newDir('aios-dl-');
  const dest = path.join(dir, 'aios.zip');
  const noEocd = Buffer.from('PK\x03\x04garbage-without-eocd', 'latin1');

  await assert.rejects(
    downloadReleaseAsset({
      url: 'https://example.invalid/aios.zip',
      destPath: dest,
      fetchImpl: async () => fakeResponse({ bytes: noEocd }),
      retries: 1,
      sleep: async () => {},
      io: { log: () => {} },
    }),
    /end-of-central-directory record not found/u,
  );
  await assert.rejects(fs.stat(dest), { code: 'ENOENT' });
});

test('verifyDownloadedArchive accepts gzip payload and rejects a non-gzip body', async () => {
  const dir = await newDir('aios-dl-');
  const gz = path.join(dir, 'aios.tar.gz');
  await fs.writeFile(gz, Buffer.concat([Buffer.from([0x1f, 0x8b]), Buffer.alloc(32)]));
  assert.equal((await verifyDownloadedArchive(gz)).ok, true);

  const broken = path.join(dir, 'broken.tar.gz');
  await fs.writeFile(broken, Buffer.from('not gzip at all'));
  const check = await verifyDownloadedArchive(broken);
  assert.equal(check.ok, false);
  assert.match(check.reason, /bad magic/u);
});
