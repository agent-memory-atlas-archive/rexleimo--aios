// Target-based safety gate tests. The previous rule matched the text shape `rm -rf` and blocked
// 114 of 41,823 recorded tool calls of which only 2 were pointed at a real user or system path —
// so these cases pin what the gate must still stop, what it must now allow, and the fact that a
// quoted string is not a command.
import assert from 'node:assert/strict';
import test from 'node:test';

import { checkBashCommand, decideToolCall } from '../../../../packages/aios-pi/lib/gates.mjs';
import {
  classifyDeleteTarget,
  findDeleteTargets,
  shellWords,
  volatileRoots,
} from '../../../../packages/aios-pi/lib/danger-targets.mjs';

const blocked = (cmd) => checkBashCommand(cmd).blocked === true;
const allowed = (cmd) => assert.deepEqual(checkBashCommand(cmd), { blocked: false });

test('gate still stops deletes that would actually destroy something', () => {
  for (const cmd of [
    'rm -rf ~',
    'rm -rf $HOME',
    'rm -rf /',
    'rm -rf .',
    'rm -rf *',
    'rm -rf /home',
    'rm -rf /usr/local',
    'rm -rf /etc',
    'rm -rf C:/Windows',
    'rm -rf "C:/Users/Public/HermesDemo"',
    'rm -rf ~/Documents',
    'rm -rf /c/Users/Administrator/AppData/Local/Microsoft',
    'sudo rm -rf /var',
    'cd /e/coding/x && rm -rf ../../secrets',
  ]) {
    assert.equal(blocked(cmd), true, `expected blocked: ${cmd}`);
  }
});

test('gate allows the deletes the old rule got wrong (measured false positives)', () => {
  for (const cmd of [
    // Scratch and sandbox hygiene the repository's own rules require.
    'rm -rf /tmp/x',
    'cd /tmp && rm -rf cuad && mkdir cuad',
    'rm -rf "$DST" && echo ok'.replace('$DST', 'D:/Temp/run-1'),
    'rm -rf /D/Temp/wp-base',
    'rm -rf D:/Temp/pi-agent-probe',
    'rm -rf /tmp/poisoned-home',
    'POISON=/tmp/poisoned-home; rm -rf $POISON',
    'rm -rf C:/Users/Administrator/AppData/Local/Temp/aios-XXXX',
    // Regenerable project content.
    'rm -rf .dev-workspace',
    'rm -rf frontend/build',
    'rm -rf tmp-plugin-backup',
    'rm -rf node_modules',
    'rm -rf dist coverage',
    // Not a filesystem delete at all.
    'git rm -q --ignore-unmatch src/a.ts',
    'rm -f apps/site/scripts/_tmp-shot.mjs',
    'rm apps/site/scripts/a.mjs',
    'ls -la; echo "the rule rm -rf never fires here"',
  ]) {
    assert.equal(blocked(cmd), false, `expected allowed: ${cmd}`);
  }
});

test('a quoted blob is one word, so text about rm -rf is not a delete command', () => {
  const probe = 'node --input-type=module -e "const t = \'rm -rf ~\'; console.log(t)"';
  allowed(probe);
  allowed('bash -c \'echo rm -rf /etc\'');
  // The same string executed for real is still stopped.
  assert.equal(blocked('node -e "x" ; rm -rf ~'), true);
});

test('block reason names the target and states the way out', () => {
  const verdict = checkBashCommand('rm -rf ~');
  assert.match(verdict.reason, /recursive delete of ~ is blocked/u);
  assert.match(verdict.reason, /user home directory/u);
  assert.match(verdict.reason, /Allowed: a relative subdirectory/u);
  assert.match(verdict.reason, /npm run tmp:gc/u);
});

test('an unassigned variable target is refused as unverifiable, an assigned one is judged', () => {
  // The gate will not guess what $DST holds.
  const verdict = checkBashCommand('rm -rf "$DST"');
  assert.equal(verdict.blocked, true);
  assert.match(verdict.reason, /unverifiable/u);
  // Same line, but the assignment makes the target an objective fact.
  assert.deepEqual(checkBashCommand('DST=/tmp/run-9; rm -rf "$DST"'), { blocked: false });
});

test('a relative target that climbs out of the tree is not bounded by the working directory', () => {
  for (const cmd of ['rm -rf ../../secrets', 'rm -rf ../sibling-repo', 'rm -rf ../node_modules', 'rm -rf ..']) {
    assert.equal(blocked(cmd), true, cmd);
  }
});

test('other text-shape rules keep firing regardless of argument', () => {
  assert.equal(blocked('mkfs.ext4 /dev/sda1'), true);
  assert.equal(blocked('rm -rf / --no-preserve-root'), true);
  assert.equal(blocked('dd if=/dev/zero of=/dev/sda'), true);
  assert.equal(blocked(':(){ :|:& };:'), true);
});

test('findDeleteTargets reads command positions, not substrings', () => {
  assert.deepEqual(findDeleteTargets('cd /tmp && rm -rf a b; sudo rm -rf -fR c'), ['a', 'b', 'c']);
  assert.deepEqual(findDeleteTargets('rm -r dir'), []); // no -f: not a forced recursive delete
  assert.deepEqual(findDeleteTargets('echo "rm -rf ~"'), []); // quoted blob, not a command
  assert.deepEqual(findDeleteTargets('grep -rn "rm -rf /" scripts'), []);
});

test('classifyDeleteTarget answers on objective path facts', () => {
  const cases = [
    ['/tmp/x', true],
    ['/tmp', true],
    ['C:/Users/A/AppData/Local/Temp/x', true],
    ['build/out', true],
    ['node_modules', true],
    ['relative/thing', true],
    ['/tmp2/x', false], // not the volatile root, just a prefix of it
    ['/var/lib/postgresql', false],
    ['~', false],
    ['/', false],
    ['.', false],
    ['*', false],
    ['c:/', false],
    ['$UNKNOWN', false],
    ['~/Documents', false],
  ];
  for (const [target, expectAllowed] of cases) {
    const verdict = classifyDeleteTarget({ target, volatile: volatileRoots({}) });
    assert.equal(verdict.allowed, expectAllowed, `${target} -> ${JSON.stringify(verdict)}`);
  }
});

test('AIOS_VOLATILE_ROOTS extends the allowed set on machines with temp elsewhere', () => {
  const env = { AIOS_VOLATILE_ROOTS: 'E:/scratch:/mnt/fast' };
  assert.equal(classifyDeleteTarget({ target: 'E:/scratch/run-1', volatile: volatileRoots(env) }).allowed, true);
  assert.equal(classifyDeleteTarget({ target: 'E:/other/run-1', volatile: volatileRoots(env) }).allowed, false);
});

test('a blocked bash call is reported to the model without ending the run', () => {
  const verdict = decideToolCall({ toolName: 'bash', input: { command: 'rm -rf /' } });
  assert.equal(verdict.block, true);
  assert.equal(verdict.terminate, false);
  assert.match(verdict.reason, /directory or volume root/u);
});

// Both of these were live defects found while measuring the corpus, so they are pinned here rather
// than left to chance: a Windows path must survive tokenization, and data must not read as a command.
test('windows paths keep their separators, so an absolute system target still reads as absolute', () => {
  assert.deepEqual(findDeleteTargets('rm -rf C:\\Windows\\System32'), ['C:\\Windows\\System32']);
  assert.equal(blocked('rm -rf C:\\Windows\\System32'), true);
  assert.equal(blocked('rm -rf C:\\Users\\Administrator\\Documents'), true);
  assert.deepEqual(checkBashCommand('rm -rf D:\\Temp\\probe-a'), { blocked: false });
});

test('a shell interpreter body is executed, so it is judged as a command line', () => {
  assert.equal(blocked('powershell -Command "Remove-Item -Recurse -Force C:\\Windows"'), true);
  assert.equal(blocked('bash -c \'rm -rf /home\''), true);
  assert.equal(blocked('cmd /c "del /s /q C:\\Users"'), true);
  // Non-shell interpreters and innocent bodies stay allowed: this is the 27-case false-positive class.
  allowed('node --input-type=module -e "const s = \'rm -rf /home\'; console.log(s)"');
  allowed('bash -c \'echo rm -rf /etc && ls\'');
});

test('heredoc bodies and redirect targets are data, not delete targets', () => {
  allowed('cat > /tmp/x.mjs <<\'EOF\'\nconst bad = "rm -rf ~";\nEOF\necho done');
  allowed('rm -rf ./build 2>/dev/null; echo cleaned');
  assert.equal(blocked('rm -rf ~ 2>/dev/null'), true);
});

test('the temp allocator shapes required by repo hygiene are allowed', () => {
  allowed('cd /e/coding/aios-pro && PROBE=$TEMP/probe-a && rm -r -f "$PROBE" 2>/dev/null; mkdir -p "$PROBE"');
  allowed('T=$(mktemp -d) && node scripts/x.mjs --workspace "$T"; rm -rf "$T"');
  allowed('set -e; DST="D:/Temp/pi-agent-probe"; rm -rf "$DST"; mkdir -p "$DST"');
});

// A heredoc that writes a test fixture must not trip a shape rule either: the data/command boundary
// is one boundary, not one scan per rule family (that blind second scan was 4 of the last 8 blocks).
test('shape rules read executed text, so fixture content inside a heredoc is not a violation', () => {
  allowed("cat > gate-fixture.sh <<'EOF'\nrm -rf / --no-preserve-root\ndd if=/dev/zero of=/dev/sda\nEOF\necho written");
  assert.equal(blocked('dd if=/dev/zero of=/dev/sda'), true);
  assert.equal(blocked('rm -rf / --no-preserve-root'), true);
});

// Quoted strings are data to the shell, so a shape-rule word inside them is not a violation — but
// the same word handed to a shell interpreter IS executed and stays blocked.
test('shape rules scan executed words, so quoted text is data and interpreter bodies are commands', () => {
  allowed('node --input-type=module -e "check(\'--no-preserve-root\')"');
  allowed('echo "would dd if=x of=/dev/sda here"');
  allowed('# cleanup: mkfs.ext4 /dev/sda1 is never run by hand');
  assert.equal(blocked('bash -c "mkfs.ext4 /dev/sda1"'), true);
  assert.equal(blocked('bash -c "dd if=/dev/zero of=/dev/sda"'), true);
  assert.equal(blocked('bash -c "rm -rf / --no-preserve-root"'), true);
});
