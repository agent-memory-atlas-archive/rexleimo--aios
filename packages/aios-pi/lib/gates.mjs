// Pure safety-gate logic for the AIOS Pi extension. No pi imports here:
// every function is a pure function so node --test can verify it directly.

// Text-shape rules are only for what is dangerous whatever its argument is. Recursive delete is
// judged by TARGET instead (danger-targets.mjs): over 41,823 recorded tool calls the word alone
// blocked 114 commands and only 2 of them pointed at a real user or system path.
import { blankQuoted, classifyDeleteTarget, findDeleteTargets, findInterpreterBodies, withoutHeredocs, volatileRoots } from './danger-targets.mjs';

const DANGEROUS_BASH_PATTERNS = Object.freeze([
  { pattern: /--no-preserve-root/iu, reason: '--no-preserve-root is blocked by the AIOS safety gate: it deletes an entire mounted filesystem' },
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/u, reason: 'fork bomb is blocked by the AIOS safety gate' },
  { pattern: /\bmkfs\b/iu, reason: 'mkfs is blocked by the AIOS safety gate: it reformats a device' },
  { pattern: /\bdd\b[^|;&]*\bof=\/dev\//iu, reason: 'dd writing to /dev/ is blocked by the AIOS safety gate: it overwrites a device' },
]);

// Basenames that must never be overwritten through Pi file tools, plus
// path segments that are never writable (VCS state, dependencies).
const PROTECTED_BASENAMES = Object.freeze(['.env']);
const PROTECTED_SEGMENTS = Object.freeze(['node_modules', '.git']);

function normalizedPathSegments(targetPath) {
  return String(targetPath || '').split(/[\\/]/u).filter(Boolean);
}

// Blocked with a way out: a reason that only states the prohibition gets retried in another shape,
// which is how a safety gate turns back into a stall.
function deleteBlockReason(target, why) {
  return [
    `recursive delete of ${target} is blocked by the AIOS safety gate: ${why}.`,
    'Allowed: a relative subdirectory of the working directory, or an absolute path inside volatile temp space.',
    'For sandbox leftovers use the repo temp GC (npm run tmp:gc) or name the specific directory.',
  ].join(' ');
}

export function checkBashCommand(command, { env = process.env, depth = 0 } = {}) {
  // One boundary for "is this text something the shell will execute", applied per rule family:
  // shape rules scan the quote-blanked view (a quoted string is data), while the delete-target scan
  // reads the unblanked text because shellWords already knows which words are quoted — blanking
  // first would wash out quoted values like "$DST" into empty targets.
  const executable = withoutHeredocs(command);
  const shapeText = blankQuoted(executable);
  for (const { pattern, reason } of DANGEROUS_BASH_PATTERNS) {
    if (pattern.test(shapeText)) return { blocked: true, reason };
  }
  const volatile = volatileRoots(env);
  for (const target of findDeleteTargets(executable)) {
    const verdict = classifyDeleteTarget({ target, volatile });
    if (!verdict.allowed) return { blocked: true, reason: deleteBlockReason(target, verdict.why) };
  }
  // What a shell interpreter is about to run is executed text too: `bash -c "mkfs ..."` hides a
  // shape-rule hit inside quotes, so the body is judged with the same rules as the outer line.
  if (depth < 2) {
    for (const body of findInterpreterBodies(command)) {
      const inner = checkBashCommand(body, { env, depth: depth + 1 });
      if (inner.blocked) return inner;
    }
  }
  return { blocked: false };
}

export function checkWritePath(targetPath) {
  const segments = normalizedPathSegments(targetPath);
  const basename = segments[segments.length - 1] || '';
  if (PROTECTED_BASENAMES.some((name) => basename === name || basename.startsWith(`${name}.`))) {
    return { blocked: true, reason: `writes to ${basename} are blocked by the AIOS safety gate` };
  }
  const hit = segments.find((segment) => PROTECTED_SEGMENTS.includes(segment));
  if (hit) {
    return { blocked: true, reason: `writes under ${hit}/ are blocked by the AIOS safety gate` };
  }
  return { blocked: false };
}

// Decide a Pi tool_call event. Returns undefined to allow, or a Pi
// blocking verdict { block: true, reason, terminate }.
//
// One blocking shape for both families, with `terminate` always declared false: pi skips the
// automatic follow-up when a finalized tool result sets `terminate` (pi docs/extensions.md:253),
// and the bash branch used to set it — measured as 99 of 135 blocked turns ending the run and
// waiting for a human re-prompt. A block is a report back to the model, not a stop sign.
export function decideToolCall({ toolName, input } = {}) {
  if (toolName === 'bash' || toolName === 'powershell') {
    const verdict = checkBashCommand(input?.command);
    return verdict.blocked ? blockedVerdict(verdict.reason) : undefined;
  }
  if (toolName === 'write' || toolName === 'edit') {
    const verdict = checkWritePath(input?.path);
    return verdict.blocked ? blockedVerdict(verdict.reason) : undefined;
  }
  return undefined;
}

function blockedVerdict(reason) {
  return { block: true, reason, terminate: false };
}

export const AIOS_SYSTEM_PROMPT_ADDITION = [
  'AIOS control plane is active in this session.',
  'Workflow: classify each turn as direct (read-only answer), guarded (one reversible local change behind pre-edit-safety-gate), or planned (explicit work item first).',
  'Memory: call aios_memory_recall before continuing prior work; call aios_memory_write for verified conclusions; call aios_memory_checkpoint at milestones.',
  'Safety: destructive commands are blocked by the extension gate; ask before irreversible operations.',
].join('\n');

// Message injected via before_agent_start so the model sees AIOS context
// for this turn even when AGENTS.md concatenation is disabled.
export function buildBeforeAgentStartMessage({ memoryDigest = '' } = {}) {
  const digest = String(memoryDigest || '').trim();
  return {
    customType: 'aios-context',
    content: digest ? `${AIOS_SYSTEM_PROMPT_ADDITION}\n\nMemory digest:\n${digest}` : AIOS_SYSTEM_PROMPT_ADDITION,
    display: false,
  };
}
