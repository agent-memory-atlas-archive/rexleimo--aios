import fs from 'node:fs';
import path from 'node:path';

// 纯函数：把文件内容转成稳定摘要；调用方只比较相等性，不依赖具体算法。
// 中文注释：行尾归一只影响摘要输入，不改文件本身。仓库里所有「生成物 vs 提交物」的字节比对
// 守卫都必须忽略 CRLF/LF 差异，否则它只在 Linux 检出成立：core.autocrlf=true 的 Windows 会把
// 未钉 eol 的资产刷成 CRLF。实测 skill-sources/typesafe-ai/LICENSE blob 1068B/LF、检出 1089B/CRLF，
// 快照恒不等于是收养被挡、检查器把行尾问题伪装成所有权问题（2026-10-26）。
// latin1 是字节保真编码，所以二进制内容除 CRLF 序列外仍逐项可区分；调用方不反解摘要。
export function hashFileBuffer(buffer) {
  const normalized = buffer.toString('latin1').replace(/\r\n/g, '\n');
  return Buffer.from(normalized, 'latin1').toString('base64');
}

// 中文注释：把「快照为什么不相等」说成客观事实供门禁输出使用，判定仍由 snapshotsEqual 负责。
// 没有这一步，调用方只能看到路径而必须自己重新发现是哪个文件——一个 21 字节的行尾差异
// 曾经让人做了 5 次探针才知道它叫 LICENSE。
function formatDiffNames(names) {
  const shown = names.slice(0, 4).join(', ');
  return names.length > 4 ? `${shown} +${names.length - 4} more` : shown;
}

export function describeSnapshotDiff(current, expected) {
  const missing = [];
  const content = [];
  const extra = [];

  for (const [relPath, value] of expected.entries()) {
    if (!current.has(relPath)) {
      missing.push(relPath);
      continue;
    }
    const other = current.get(relPath);
    const differs = other.type !== value.type
      || (value.type === 'file' && other.hash !== value.hash);
    if (differs) {
      content.push(relPath);
    }
  }

  for (const relPath of current.keys()) {
    if (!expected.has(relPath)) {
      extra.push(relPath);
    }
  }

  const parts = [];
  if (missing.length > 0) {
    parts.push(`missing: ${formatDiffNames(missing)}`);
  }
  if (extra.length > 0) {
    parts.push(`extra in target: ${formatDiffNames(extra)}`);
  }
  if (content.length > 0) {
    parts.push(`content: ${formatDiffNames(content)}`);
  }

  return parts.length > 0 ? ` (${parts.join('; ')})` : '';
}

export function snapshotDirectory(absDir, baseDir = absDir, output = new Map(), ignoreNames = new Set()) {
  if (!fs.existsSync(absDir)) {
    return output;
  }

  const entries = fs.readdirSync(absDir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (ignoreNames.has(entry.name)) {
      continue;
    }

    const absPath = path.join(absDir, entry.name);
    const relPath = path.relative(baseDir, absPath) || '.';
    if (entry.isDirectory()) {
      output.set(relPath, { type: 'dir' });
      snapshotDirectory(absPath, baseDir, output, ignoreNames);
      continue;
    }

    output.set(relPath, { type: 'file', hash: hashFileBuffer(fs.readFileSync(absPath)) });
  }

  return output;
}

// 纯函数：逐项比较目录快照，避免调用方关心 Map 的内部结构。
export function snapshotsEqual(left, right) {
  if (left.size !== right.size) {
    return false;
  }

  for (const [relPath, value] of left.entries()) {
    const other = right.get(relPath);
    if (!other) {
      return false;
    }
    if (value.type !== other.type) {
      return false;
    }
    if (value.hash !== other.hash) {
      return false;
    }
  }

  return true;
}
