// 中文注释：Windows 上的 aios update 失败面（实测 2026-10-21）：
// self-update 用 PowerShell Invoke-WebRequest 单发下载 GitHub release 资产，本机对
// objects.githubusercontent.com 的 TLS 连接会被中途重置（.NET 抛「从传输流中收到意外
// 的 EOF 或 0 个字节」，git-bash schannel curl 抛 `curl: (56) server closed abruptly`），
// 而同一 URL 走 Node 自带 TLS 栈稳定成功。旧写法还有一处更坏的：下载截断既不校验也不
// 删残文件，残 zip 会一路走到 Expand-Archive 才以「找不到中央目录结尾记录」暴死。
// 因此这里把「下载 + 客观完整性校验 + 退避重试 + 残文件清理」收成一个可注入的模块，
// 让 win32 self-update 先用 Node 把资产落到暂存目录，再让安装器读本地文件。
import fs from 'node:fs';
import path from 'node:path';

const ZIP_EOCD_SIGNATURE = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const ZIP_EOCD_SCAN_WINDOW = 64 * 1024 + ZIP_EOCD_SIGNATURE.length;
// 中文注释：这些状态是“资产根本不在”而不是网络差，重试只浪费时间；
// 408/425/429 仍是时序问题，保留重试。
const PERMANENT_HTTP_STATUS = new Set([400, 401, 403, 404, 405, 410]);

function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function assetIsZip(assetPath) {
  return /\.zip$/iu.test(String(assetPath || ''));
}

function assetIsGzip(assetPath) {
  return /(\.tar\.gz|\.tgz|\.gz)$/iu.test(String(assetPath || ''));
}

/**
 * Objective integrity check on the bytes actually on disk. Not a heuristic:
 * a truncated zip has no end-of-central-directory record, and a truncated gzip
 * has no magic header, so both are provable from the file itself.
 *
 * @param {string} filePath
 * @returns {Promise<{ok: boolean, bytes: number, reason: string}>}
 */
export async function verifyDownloadedArchive(filePath) {
  let bytes = 0;
  try {
    bytes = (await fs.promises.stat(filePath)).size;
  } catch (error) {
    return { ok: false, bytes: 0, reason: `missing downloaded file: ${describeError(error)}` };
  }
  if (bytes <= 0) return { ok: false, bytes, reason: 'downloaded file is empty' };

  const handle = await fs.promises.open(filePath, 'r');
  try {
    if (assetIsZip(filePath)) {
      const tailLength = Math.min(bytes, ZIP_EOCD_SCAN_WINDOW);
      const tail = Buffer.alloc(tailLength);
      await handle.read(tail, 0, tailLength, bytes - tailLength);
      if (tail.indexOf(ZIP_EOCD_SIGNATURE) === -1) {
        return { ok: false, bytes, reason: `truncated zip: end-of-central-directory record not found (${bytes} bytes)` };
      }
      return { ok: true, bytes, reason: '' };
    }
    if (assetIsGzip(filePath)) {
      const head = Buffer.alloc(2);
      await handle.read(head, 0, 2, 0);
      if (head[0] !== 0x1f || head[1] !== 0x8b) {
        return { ok: false, bytes, reason: `not a gzip stream: bad magic ${head.toString('hex')} (${bytes} bytes)` };
      }
      return { ok: true, bytes, reason: '' };
    }
  } finally {
    await handle.close();
  }
  return { ok: true, bytes, reason: '' };
}

async function removeQuiet(filePath) {
  try {
    await fs.promises.rm(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Download one release asset with retry + backoff, and never leave a partial
 * file behind: a size mismatch, a corrupt archive, or a transport error all
 * delete the candidate and re-attempt, so a truncated payload can no longer
 * reach the extractor.
 *
 * @param {Object} options
 * @param {string} options.url - absolute asset URL
 * @param {string} options.destPath - file path to write
 * @param {Function} [options.fetchImpl]
 * @param {number} [options.retries] - total attempts
 * @param {number} [options.timeoutMs] - per-attempt abort timeout
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {{ log?: Function, error?: Function }} [options.io]
 * @returns {Promise<{destPath: string, bytes: number, attempts: number}>}
 */
export async function downloadReleaseAsset({
  url,
  destPath,
  fetchImpl = globalThis.fetch,
  retries = 4,
  timeoutMs = 120000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  io = console,
} = {}) {
  if (typeof url !== 'string' || !/^https?:\/\//iu.test(url)) {
    throw new Error(`downloadReleaseAsset requires an http(s) asset url, got: ${String(url)}`);
  }
  if (typeof fetchImpl !== 'function') throw new Error('downloadReleaseAsset requires fetch');
  const attempts = Math.max(1, Number(retries) || 1);
  let lastReason = 'unknown download failure';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(Math.max(1000, Number(timeoutMs) || 120000)),
      });
      if (!response?.ok) {
        lastReason = `HTTP ${response?.status ?? 'no-response'}`;
        const failure = new Error(lastReason);
        if (PERMANENT_HTTP_STATUS.has(Number(response?.status))) failure.permanent = true;
        throw failure;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const declared = Number(response?.headers?.get?.('content-length') || 0);
      if (declared > 0 && declared !== buffer.length) {
        lastReason = `content-length mismatch: declared ${declared}, received ${buffer.length}`;
        throw new Error(lastReason);
      }
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      await fs.promises.writeFile(destPath, buffer);
      const check = await verifyDownloadedArchive(destPath);
      if (!check.ok) {
        lastReason = check.reason;
        throw new Error(check.reason);
      }
      return { destPath, bytes: check.bytes, attempts: attempt };
    } catch (error) {
      await removeQuiet(destPath);
      lastReason = describeError(error) || lastReason;
      if (error?.permanent) {
        throw new Error(`asset download aborted (not retryable): ${lastReason} (${url})`);
      }
      const logLine = io.error ?? io.log;
      if (attempt < attempts && logLine) {
        logLine(`[warn] asset download attempt ${attempt}/${attempts} failed: ${lastReason}; retrying`);
      }
      if (attempt < attempts) {
        await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)));
      }
    }
  }

  throw new Error(`asset download failed after ${attempts} attempt(s): ${lastReason} (${url})`);
}
