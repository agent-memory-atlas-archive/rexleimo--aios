// packages/aios-pi/lib/offload.mjs — ObservationPack-lite (M4 minimal).
// Before each LLM call, text observations above the threshold are archived
// once (content-addressed) and replaced in context by a handle + excerpt;
// the aios_offload_retrieve tool pages the original back by ref + line range.
// Read-only by construction: it only rewrites what enters context, never tool
// execution, so it cannot interact with the safety gate. Default OFF: on a
// 3-pair A/B repeat the token saving averaged -4% (one pair inverted -64%)
// driven by model-side retrieve-turn variance, so per the two-gate rule the
// mechanism ships opt-in. Enable explicitly with AIOS_PI_OFFLOAD=on;
// threshold: AIOS_PI_OFFLOAD_THRESHOLD (chars).
// Contracts verified against installed pi 0.87.1 types.d.ts: the `context`
// event fires before each LLM call and its handler may return { messages }.
import { createHash } from 'node:crypto';
import path from 'node:path';

export const OFFLOAD_MARKER = '[aios:offloaded';

export function resolveOffloadConfig(env = process.env) {
  const enabled = String(env.AIOS_PI_OFFLOAD ?? '').trim().toLowerCase() === 'on';
  const threshold = Number(env.AIOS_PI_OFFLOAD_THRESHOLD);
  return {
    enabled,
    thresholdChars: Number.isFinite(threshold) && threshold > 0 ? threshold : 20000,
  };
}

export function resolveOffloadArchiveDir(env = process.env) {
  return String(env.AIOS_PI_OFFLOAD_DIR || '').trim() || path.join(process.cwd(), '.aios', 'tmp', 'pi-offload');
}

export function shouldOffloadText(text, thresholdChars) {
  return typeof text === 'string' && text.length >= thresholdChars;
}

export function sha256Of(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function excerptOf(text, { headChars = 2000, tailChars = 800 } = {}) {
  if (text.length <= headChars + tailChars) return text;
  return `${text.slice(0, headChars)}\n[... offloaded ${text.length - headChars - tailChars} chars; page exact content with aios_offload_retrieve ...]\n${text.slice(-tailChars)}`;
}

export function countLines(text) {
  return String(text ?? '').split('\n').length;
}

export function buildHandleText({ ref, bytes, lines, excerpt }) {
  return [
    `${OFFLOAD_MARKER} ${ref}] original ${bytes} bytes / ${lines} lines archived; call aios_offload_retrieve { ref, offset, limit } for exact content.`,
    '',
    excerpt,
  ].join('\n');
}

// Walks every message's text content items; oversized originals are archived
// once per content hash and replaced in place. Idempotent: handles carry the
// offload marker and are skipped on later LLM calls.
export async function offloadMessages({
  messages,
  thresholdChars,
  archiveDir,
  readFileImpl,
  writeFileImpl,
} = {}) {
  const stats = { scanned: 0, offloaded: 0, bytes_before: 0, bytes_after: 0 };
  for (const message of messages ?? []) {
    if (!message || !Array.isArray(message.content)) continue;
    for (let index = 0; index < message.content.length; index += 1) {
      const item = message.content[index];
      if (!item || item.type !== 'text' || typeof item.text !== 'string') continue;
      stats.scanned += 1;
      if (item.text.includes(OFFLOAD_MARKER)) continue;
      if (!shouldOffloadText(item.text, thresholdChars)) continue;
      const original = item.text;
      const ref = sha256Of(original).slice(0, 16);
      const filePath = path.join(archiveDir, `${ref}.txt`);
      let existing = '';
      try {
        existing = String((await readFileImpl(filePath, 'utf8')) ?? '');
      } catch {
        existing = '';
      }
      if (existing !== original) {
        await writeFileImpl(filePath, original, 'utf8');
      }
      const handle = buildHandleText({
        ref,
        bytes: Buffer.byteLength(original, 'utf8'),
        lines: countLines(original),
        excerpt: excerptOf(original),
      });
      message.content[index] = { ...item, text: handle };
      stats.offloaded += 1;
      stats.bytes_before += Buffer.byteLength(original, 'utf8');
      stats.bytes_after += Buffer.byteLength(handle, 'utf8');
    }
  }
  return stats;
}

export function sliceLines(text, { offset = 1, limit = 200 } = {}) {
  const lines = String(text ?? '').split('\n');
  const start = Math.max(0, offset - 1);
  const slice = lines.slice(start, start + limit);
  return { total: lines.length, from: start + 1, to: start + slice.length, text: slice.join('\n') };
}
