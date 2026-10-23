// packages/aios-pi/lib/danger-targets.mjs — what makes a recursive delete dangerous.
//
// Measured over 41,823 recorded bash/powershell calls in ~/.pi/agent/sessions: the previous rule
// blocked 114 of them, and every single block came from matching the *text shape* `rm -rf`. Of
// those 114, two pointed at a real user or system path; 73 pointed at a build directory or scratch
// sandbox (the repository's own hygiene rules tell agents to create temp sandboxes and dispose of
// them), and 27 only *mentioned* the pattern inside code being written or tested. A gate that is
// wrong ~98% of the time does not protect the user; it spends the agent's turns and teaches the
// agent to route around the gate.
//
// So the judgement is about the TARGET, not the word:
//   - a target relative to the working directory names one subdirectory, so it is allowed;
//   - an absolute target is allowed only inside volatile temp space or regenerable build content;
//   - roots, home profiles, system paths, devices, credential trees, and any absolute path outside
//     volatile space are blocked.
// An unresolved `$VARIABLE` is refused: guessing that a variable holds a temp directory is not an
// objective fact. A variable assigned on the same command line is resolved, so the common
// `POISON=/tmp/x; rm -rf $POISON` shape passes on what it actually does.
//
// Quoted runs are kept together during tokenization, which is what stops a `node -e "...rm -rf ~..."`
// probe or a test fixture from being read as a delete command again.

const VOLATILE_ROOTS = Object.freeze([
  '/tmp',
  '/var/tmp',
  '/private/tmp',
  '/dev/shm',
  '/run/user',
  'c:/temp',
  'd:/temp',
]);

// Windows and macOS keep temp inside the user profile, so these subtrees are volatile even though
// the surrounding tree is user data. Without them the gate would block `mktemp -d` output on the
// platform where this extension runs most.
const VOLATILE_PATTERNS = Object.freeze([
  /appdata\/local\/(temp|tmp)(\/|$)/u,
  /[\\/]var[\\/]folders[\\/]/u,
  /[\\/]private[\\/]var[\\/]folders[\\/]/u,
]);

// Regenerable content: deleting it costs a rebuild, not a user's data. Matched per path segment so
// `.../temporary-notes` stays user data while `.../tmp/x` reads as scratch.
const SCRATCH_SEGMENTS = Object.freeze([
  'tmp',
  'temp',
  'node_modules',
  'build',
  'dist',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  'cache',
  'caches',
  'scratch',
  'sandbox',
  '.pytest_cache',
  '.turbo',
  '.parcel-cache',
  '.vite',
  '.venv-cache',
]);

// Markers for trees that hold a person's files or credentials.
const USER_DATA_MARKERS = Object.freeze([
  'appdata',
  'documents',
  'desktop',
  'downloads',
  'pictures',
  'music',
  'videos',
  '.ssh',
  '.aws',
  '.gnupg',
  '.kube',
  '.azure',
  'credentials',
]);

const SYSTEM_DIRS = Object.freeze([
  '/usr', '/etc', '/var', '/bin', '/sbin', '/lib', '/lib64', '/boot', '/sys', '/proc', '/dev',
]);

const HOME_TOKENS = Object.freeze(['~', '$home', '%userprofile%', '$env:userprofile']);

const RM_PREFIX_WORDS = Object.freeze(['sudo', 'env', 'time', 'nohup', 'command', 'exec', 'doas']);

// Verbs that delete recursively when asked: `rm` plus the PowerShell aliases, so `-Recurse -Force`
// cannot be reached by renaming the command.
const DELETE_VERBS = Object.freeze(['rm', 'del', 'erase', 'remove-item', 'ri']);

// A quoted string is data, except when it is handed to a shell interpreter: `bash -c "..."` and
// `powershell -Command "..."` execute their argument, so it is judged as a command line too.
const SHELL_INTERPRETERS = Object.freeze(['bash', 'sh', 'zsh', 'ksh', 'dash', 'powershell', 'pwsh', 'cmd', 'cmd.exe']);
const INLINE_COMMAND_FLAGS = Object.freeze(['-c', '/c', '/command', '-command', '-encodedcommand']);

function normalizedTarget(value) {
  return String(value || '').trim().replace(/^["']+|["']+$/gu, '').replace(/\\/gu, '/').toLowerCase();
}

export function volatileRoots(env = process.env) {
  const raw = String(env.AIOS_VOLATILE_ROOTS || '').trim();
  const extra = raw.split(/[:;]/u).map((item) => normalizedTarget(item)).filter(Boolean);
  return [...VOLATILE_ROOTS, ...extra];
}

function isRootish(target) {
  if (target === '/' || target === '.' || target === './' || target === '..' || target === '../') return true;
  if (target === '*' || target === './*' || target === './**' || target === '**') return true;
  return /^[a-z]:\/?$/u.test(target);
}

// A relative target that climbs out of the working directory is not "one subdirectory of the
// current tree" any more; it points at a sibling the gate cannot see or bound.
function escapesWorkingDir(target) {
  return target === '..' || target.startsWith('../') || /^[a-z]:\/\.\./u.test(target);
}

function isHomeish(target) {
  return HOME_TOKENS.some((token) => target === token || target === `${token}/`);
}

function looksAbsolute(target) {
  return target.startsWith('/') || /^[a-z]:\//u.test(target);
}

function hasUserDataMarker(target) {
  // Segment match, not substring: `live-desktop.css` is a stylesheet, `Documents` is a folder.
  const segments = target.split('/');
  return USER_DATA_MARKERS.some((marker) => segments.includes(marker) || marker.includes('/') && target.includes(marker));
}

function hasSystemDir(target) {
  if (/^[a-z]:\/windows/u.test(target)) return true;
  if (!target.startsWith('/')) return false;
  return SYSTEM_DIRS.some((dir) => target === dir || target.startsWith(`${dir}/`));
}

function isVolatile(target, roots) {
  return roots.some((root) => target === root || target.startsWith(`${root}/`))
    || VOLATILE_PATTERNS.some((pattern) => pattern.test(target));
}

// Objective "this path came from the temp allocator" facts. mktemp and $TMPDIR are the shapes the
// repository's own hygiene rules tell agents to use, so refusing them would fight that contract.
function isTempProduced(target) {
  return /mktemp/u.test(target)
    || /^\$\{?(temp|tmpdir|tmp)\}?/u.test(target)
    || /^%temp%/u.test(target)
    || /^\$env:(temp|tmpdir)\b/u.test(target);
}

function hasScratchSegment(target) {
  return target.split('/').some((segment) => SCRATCH_SEGMENTS.includes(segment));
}

// Split a command line into shell words, keeping quoted runs intact. This is what stops the gate
// from reading the string inside `node -e "..."` or a heredoc as a delete command: a quoted blob is
// one word and never lands in a command position.
export function shellWords(command) {
  const words = [];
  const text = String(command || '');
  let current = '';
  let quoted = false;
  let quote = null;
  const flush = () => {
    if (current) words.push({ word: current, quoted });
    current = '';
    quoted = false;
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      // Inside double quotes a backslash only escapes $ ` " \ ; inside single quotes it is literal.
      // Getting this wrong closes a quote early and drops the rest of the string into bare command
      // positions, which is how a probe about the gate got blocked by the gate.
      if (char === '\\' && quote === '"' && index + 1 < text.length && /[`$"\\]/u.test(text[index + 1])) {
        current += text[index + 1];
        index += 1;
        continue;
      }
      if (char === quote) { quote = null; continue; }
      current += char;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; quoted = true; continue; }
    // A backslash only escapes a shell metacharacter. Swallowing `\` before an ordinary letter
    // would rewrite `C:\Windows\System32` into `C:WindowsSystem32`, which then looks like a
    // relative path and slips through the target rule.
    if (char === '\\' && index + 1 < text.length && /[\\'"`$;&|<>()\s]/u.test(text[index + 1])) {
      current += text[index + 1];
      index += 1;
      continue;
    }
    if (/\s/u.test(char) || char === ';' || char === '\n') {
      flush();
      if (char === ';' || char === '\n') words.push({ word: ';', quoted: false });
      continue;
    }
    if (char === '&' || char === '|') {
      flush();
      if (text[index + 1] === char) { words.push({ word: char + char, quoted: false }); index += 1; }
      else words.push({ word: char, quoted: false });
      continue;
    }
    current += char;
  }
  flush();
  return words;
}

function isAssignment(word) {
  return /^[a-z_][a-z0-9_]*=/iu.test(word) && !word.startsWith('=');
}

function basenameOf(word) {
  return String(word).replace(/\\/gu, '/').split('/').pop() || '';
}

function assignmentsIn(words) {
  const map = new Map();
  for (const { word } of words) {
    // A quoted value is still an assignment: `DST="D:/Temp/probe"` must resolve $DST.
    if (!isAssignment(word)) continue;
    const separator = word.indexOf('=');
    map.set(word.slice(0, separator).toLowerCase(), word.slice(separator + 1));
  }
  return map;
}

// A heredoc body is data, not commands: `cat > x <<'EOF' ... EOF` used to feed the gate the very
// `rm -rf` strings a test was writing about. Everything from the first heredoc marker on is dropped.
// Exported so the text-shape rules in gates.mjs share one data/command boundary instead of inventing
// a second, stricter-but-blinder scan.
export function withoutHeredocs(command) {
  const lines = String(command || '').split('\n');
  const kept = [];
  for (let index = 0; index < lines.length; index += 1) {
    const marker = lines[index].match(/<<-?\s*(['"]?)([a-z_][a-z0-9_]*)\1/iu);
    if (!marker) { kept.push(lines[index]); continue; }
    kept.push(lines[index].slice(0, marker.index));
    const delimiter = marker[2];
    let cursor = index + 1;
    while (cursor < lines.length && String(lines[cursor]).trim() !== delimiter) cursor += 1;
    if (cursor >= lines.length) break; // unterminated heredoc: the remainder is data, not commands
    const trailing = String(lines[cursor]).replace(/^\s*/u, '').slice(delimiter.length);
    if (trailing.trim()) kept.push(trailing);
    index = cursor;
  }
  return kept.join('\n');
}

// Quoted strings and `#` comments are data to the shell, not executed words. Shape rules scan
// this blanked view, so `node -e "...--no-preserve-root..."` reads as a JS string, not a
// filesystem operation. A text scan never stopped a deliberate bypass anyway — string
// concatenation defeats it — so losing that non-protection costs nothing: the threat here is
// accidents, and accidents happen in executed positions.
export function blankQuoted(command) {
  const text = String(command || '');
  let out = '';
  let quote = null;
  let wordStart = true;
  const isWordChar = (ch) => !/[\s;&|()\n]/u.test(ch);
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (quote) {
      if (ch === '\\' && quote === '"' && index + 1 < text.length && /[`$"\\]/u.test(text[index + 1])) {
        out += '  ';
        index += 1;
        wordStart = false;
        continue;
      }
      if (ch === quote) { quote = null; out += ch; wordStart = false; continue; }
      if (ch === '\n') { out += '\n'; wordStart = true; continue; }
      out += ' ';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; out += ch; wordStart = false; continue; }
    if (ch === '\\' && index + 1 < text.length) { out += ch + text[index + 1]; index += 1; wordStart = false; continue; }
    if (ch === '#' && wordStart) {
      while (index < text.length && text[index] !== '\n') { out += ' '; index += 1; }
      if (index < text.length) out += '\n';
      wordStart = true;
      continue;
    }
    out += ch;
    wordStart = isWordChar(ch);
  }
  return out;
}

function resolveTarget(word, assignments) {
  return word.replace(/\$\{([a-z0-9_]+)\}|\$([a-z0-9_]+)/giu, (_all, brace, bare) => {
    const key = String(brace || bare).toLowerCase();
    return assignments.has(key) ? assignments.get(key) : `$${key}`;
  });
}

// `find <paths> -delete` and `find <paths> -exec rm -rf {} +` destroy everything under the start
// paths; the paths are the arguments before the first predicate, so those are what gets judged.
function findGeneratorTargets(words, verbIndex, end, assignments) {
  const args = words.slice(verbIndex + 1, end);
  const starts = [];
  for (const token of args) {
    const word = String(token.word);
    if (word === '-' || word.startsWith('-') || word === '(' || word === '!') break;
    starts.push(word);
  }
  const lowered = args.map((token) => String(token.word).toLowerCase());
  let deletes = false;
  for (let index = 0; index < lowered.length; index += 1) {
    if (lowered[index] === '-delete') { deletes = true; break; }
    if (lowered[index] !== '-exec' && lowered[index] !== '-execdir') continue;
    const inner = basenameOf(String(args[index + 1]?.word || '')).toLowerCase();
    const flags = args.slice(index + 2).map((token) => String(token.word));
    const recursive = flags.some((word) => /^-.*r/iu.test(word) || /^\/s$/iu.test(word));
    const forced = flags.some((word) => /^-.*f/iu.test(word) || /^\/q$/iu.test(word));
    if (DELETE_VERBS.includes(inner) && recursive && forced) { deletes = true; break; }
  }
  if (!deletes) return [];
  return starts.map((word) => resolveTarget(word, assignments));
}

// One walk over command positions, shared by the delete-target scan and the interpreter-body
// scan so the two cannot disagree about what a "command" is. visit receives every simple command
// whose verb sits in a command position: { verb, verbIndex, end, words, assignments }.
function walkCommands(command, visit) {
  const words = shellWords(withoutHeredocs(command));
  const assignments = assignmentsIn(words);
  const isOperator = (token) => token && !token.quoted
    && [';', '&&', '||', '|', '&'].includes(token.word);
  // `2>/dev/null` is not a delete target: a redirect operator makes the following word a stream
  // destination, so it is skipped for both verb and target positions.
  const isRedirect = (token) => token && !token.quoted && /^[0-9&]*[<>]/u.test(token.word);
  let index = 0;
  while (index < words.length) {
    if (isOperator(words[index]) || isRedirect(words[index])) {
      index += isRedirect(words[index]) ? 2 : 1;
      continue;
    }
    // Walk past `VAR=value` assignments and `sudo`/`env`-style prefixes to reach the verb.
    let cursor = index;
    while (cursor < words.length && !words[cursor].quoted) {
      const word = words[cursor].word;
      if (isAssignment(word) || RM_PREFIX_WORDS.includes(basenameOf(word).toLowerCase())) { cursor += 1; continue; }
      break;
    }
    const verbToken = words[cursor];
    let end = cursor + 1;
    while (end < words.length && !isOperator(words[end])) end += 1;
    // A simple command's arguments are not commands: after `echo rm -rf /etc` the whole segment is
    // data for `echo`, so evaluation resumes at the next operator.
    if (!verbToken || verbToken.quoted || isOperator(verbToken) || isRedirect(verbToken)) {
      // `VAR=value; rm -rf "$D"` — the prefix walk stopped on the operator, so resume after it
      // instead of skipping the command that follows.
      index = verbToken && (isOperator(verbToken) || isRedirect(verbToken)) ? cursor + 1 : end;
      continue;
    }
    visit({ verb: basenameOf(verbToken.word).toLowerCase(), verbIndex: cursor, end, words, assignments, isRedirect });
    index = end;
  }
}

// The inline scripts a shell interpreter is about to run (`bash -c "..."`,
// `powershell -Command "..."`). gates.mjs judges them with the same rules as the outer line,
// so a shape rule hidden inside quotes is still caught where it will actually execute.
export function findInterpreterBodies(command) {
  const bodies = [];
  walkCommands(command, ({ verb, verbIndex, end, words }) => {
    if (!SHELL_INTERPRETERS.includes(verb)) return;
    for (let cursor2 = verbIndex + 1; cursor2 < end; cursor2 += 1) {
      const flag = String(words[cursor2].word).toLowerCase();
      if (!INLINE_COMMAND_FLAGS.includes(flag)) continue;
      const body = words[cursor2 + 1];
      if (body) bodies.push(body.word);
      break;
    }
  });
  return bodies;
}

// Every recursive-and-forced delete target on the line, taken from command positions only.
export function findDeleteTargets(command, { depth = 0 } = {}) {
  const targets = [];
  walkCommands(command, ({ verb, verbIndex, end, words, assignments, isRedirect }) => {
    if (DELETE_VERBS.includes(verb)) {
      let recursive = false;
      let forced = false;
      for (let cursor2 = verbIndex + 1; cursor2 < end; cursor2 += 1) {
        const word = words[cursor2].word;
        if (word === '--' || isRedirect(words[cursor2])) continue;
        if (/^-/u.test(word) || /^\/[a-z]$/iu.test(word)) {
          // GNU `-r`/`-f`, PowerShell `-Recurse`/`-Force`, cmd.exe `/s`/`/q`.
          if (/r/iu.test(word) || /^\/s$/iu.test(word)) recursive = true;
          if (/f/iu.test(word) || /^\/q$/iu.test(word)) forced = true;
          continue;
        }
        if (recursive && forced) targets.push(resolveTarget(word, assignments));
      }
      return;
    }
    // Shell interpreter: the inline script it is about to run is judged as a command line too.
    // The body is taken directly from the walked words, not re-parsed from a joined string, so a
    // quoted script stays one body instead of being split back into shell words.
    if (depth < 2 && SHELL_INTERPRETERS.includes(verb)) {
      for (let cursor2 = verbIndex + 1; cursor2 < end; cursor2 += 1) {
        const flag = String(words[cursor2].word).toLowerCase();
        if (!INLINE_COMMAND_FLAGS.includes(flag)) continue;
        const body = words[cursor2 + 1];
        if (body) targets.push(...findDeleteTargets(body.word, { depth: depth + 1 }));
        break;
      }
      return;
    }
    // Generators delete their start paths, and the paths are named before the predicate.
    if (verb === 'find') {
      targets.push(...findGeneratorTargets(words, verbIndex, end, assignments));
      return;
    }
    if (verb === 'xargs') {
      // `find /home | xargs rm -rf` has no visible target: what gets deleted arrives over a pipe, so
      // the honest answer is "unverifiable", which classifyDeleteTarget refuses.
      const body = words.slice(verbIndex + 1, end).map((token) => token.word).join(' ');
      if (findDeleteTargets(body, { depth: depth + 1 }).length) targets.push('$xargs-piped-input');
    }
  });
  return targets.filter(Boolean);
}

// Objective classification of one delete target: { allowed, why }. `why` is written for a model to
// act on, not for a log line.
export function classifyDeleteTarget({ target, env = process.env, volatile = null } = {}) {
  const normalized = normalizedTarget(target);
  if (!normalized) return { allowed: false, why: 'empty target' };
  const roots = volatile || volatileRoots(env);

  // Anything that climbs out of the working directory is unboundable, so it answers before the
  // allowed-by-content rules: `../node_modules` is outside this tree whatever its segment is called.
  if (escapesWorkingDir(normalized)) {
    return { allowed: false, why: 'climbs out of the working directory, so it targets something outside this tree' };
  }

  // Volatile and regenerable content answer first: on Windows the volatile root lives inside the
  // user profile, so a user-data check ahead of this one would misfire on every mktemp path.
  if (isVolatile(normalized, roots)) return { allowed: true, why: 'inside volatile temp space, disposable by contract' };
  if (isTempProduced(normalized)) return { allowed: true, why: 'names a path produced by the temp allocator' };
  if (hasScratchSegment(normalized)) return { allowed: true, why: 'regenerable build or dependency content' };
  if (normalized.includes('$') || normalized.includes('%')) {
    return { allowed: false, why: 'resolves to a variable that this command line does not assign, so the target is unverifiable' };
  }
  if (hasUserDataMarker(normalized)) return { allowed: false, why: 'points into a user data or credential tree' };
  if (isHomeish(normalized)) return { allowed: false, why: 'is the user home directory' };
  if (isRootish(normalized)) return { allowed: false, why: 'is a directory or volume root, not one subdirectory' };
  if (hasSystemDir(normalized)) return { allowed: false, why: 'is a system path' };
  if (normalized.startsWith('/dev/')) return { allowed: false, why: 'is a device path' };
  if (!looksAbsolute(normalized)) {
    // Relative to the working directory: one subdirectory of the current tree. The tree root only
    // arrives as `.` or `*`, which isRootish already blocks, and escapes answered above.
    return { allowed: true, why: 'relative subdirectory of the working directory' };
  }
  return { allowed: false, why: 'absolute path outside volatile temp space' };
}
