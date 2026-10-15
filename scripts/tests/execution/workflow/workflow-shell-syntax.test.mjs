import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import YAML from 'yaml';

/**
 * Workflow shell integrity.
 *
 * Why this exists (2026-09-21, A6): `release-health-watch.yml` failed every scheduled
 * run for days with "Process completed with exit code 2" while every later step in the
 * same job succeeded. The cause was indentation, not logic: the `Run release strict
 * health gate` step's `node - <<'NODE'` heredoc was indented 12 spaces while the YAML
 * block's base indentation was 10. YAML strips the base indentation, so the terminator
 * survived as `"  NODE"` — and bash only accepts a heredoc terminator at column 0 (only
 * `<<-` strips *tabs*). The heredoc never closed, bash consumed the rest of the script,
 * and the whole step died before running a single command with `syntax error: unexpected
 * end of file from \`if' command` — exit 2. Job logs need admin rights, so the failure
 * was invisible from the public API; this guard makes it a local, deterministic failure.
 *
 * Two assertions per workflow `run:` block:
 *   S1 No heredoc terminator line may carry leading whitespace after YAML processing
 *      (bash cannot accept it), which is also what makes the failure obvious by name.
 *   S2 `bash -n` accepts the block, which catches this and any other shell syntax error.
 *
 * Non-bash steps were originally out of scope, which is what A15 recorded: PowerShell has
 * its own here-string rules, so the A6 class is not bash-specific. S3/S4/S5 now cover the
 * `shell: pwsh` blocks in `windows-shell-smoke.yml`.
 *
 * Version caveat for S4: `shell: pwsh` on a runner is PowerShell 7, where an indented
 * here-string terminator is legal (relaxed in 6.0). The local proxy is Windows PowerShell
 * 5.1, which is *stricter*, so a 5.1 complaint about an indented terminator is a portability
 * warning, not a CI failure — move the terminator to column 0 and it parses everywhere.
 * The parser only reads text: nothing here executes a workflow script.
 */

const WORKFLOWS_DIR = path.join(process.cwd(), '.github', 'workflows');

function workflowFiles() {
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort();
}

/**
 * Heredoc terminators that bash cannot accept: for `<<WORD` the terminator must be at
 * column 0, and for `<<-WORD` it may be indented with tabs only.
 */
export function heredocTerminatorProblems(script) {
  const lines = script.split('\n');
  const problems = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /<<(-?)\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/u.exec(lines[index]);
    if (!match) continue;
    const [, stripMode, word] = match;
    const terminator = lines.findIndex((line, at) => at > index && line.trim() === word);
    if (terminator < 0) {
      problems.push(`here-document <<${stripMode}${word} at line ${index + 1} is never closed after YAML processing`);
      continue;
    }
    const terminatorLine = lines[terminator];
    if (terminatorLine === word) continue;
    const leading = terminatorLine.slice(0, terminatorLine.length - terminatorLine.trimStart().length);
    const tabsOnly = leading.length > 0 && leading.split('').every((ch) => ch === '\t');
    if (stripMode === '-' && tabsOnly) continue;
    problems.push(
      `here-document <<${stripMode}${word} terminator at line ${terminator + 1} is indented (${JSON.stringify(terminatorLine)}); `
      + 'bash only accepts column 0 for <<WORD',
    );
  }
  return problems;
}

/** Every `run:` block that GitHub would execute with bash. */
export function bashRunBlocks() {
  const blocks = [];
  for (const file of workflowFiles()) {
    const doc = YAML.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8'));
    for (const [jobName, job] of Object.entries(doc.jobs || {})) {
      for (const step of job.steps || []) {
        if (typeof step.run !== 'string') continue;
        const shell = String(step.shell || '');
        // Default runner shell on ubuntu is bash; an explicit non-bash shell opts out.
        if (shell && !/bash/u.test(shell)) continue;
        blocks.push({ file, job: jobName, step: String(step.name || '(unnamed)'), script: step.run });
      }
    }
  }
  return blocks;
}

function bashAvailable() {
  const probe = spawnSync('bash', ['--version'], { encoding: 'utf8' });
  return probe.status === 0;
}

/** Every `run:` block that GitHub would execute with PowerShell (`pwsh` or `powershell`). */
export function powershellRunBlocks() {
  const blocks = [];
  for (const file of workflowFiles()) {
    const doc = YAML.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8'));
    for (const [jobName, job] of Object.entries(doc.jobs || {})) {
      for (const step of job.steps || []) {
        if (typeof step.run !== 'string') continue;
        if (!/^(pwsh|powershell)(\s|$|[-:])/u.test(String(step.shell || ''))) continue;
        blocks.push({ file, job: jobName, step: String(step.name || '(unnamed)'), script: step.run });
      }
    }
  }
  return blocks;
}

/**
 * P1 (interpreter-free): a here-string that never closes. `@'` / `@"` open on their own line and
 * swallow the rest of the script when unterminated, which is the same failure shape as A6: the step
 * dies before running a single command. Unclosed is an error in every PowerShell version, so this
 * half does not depend on which interpreter the machine happens to have.
 */
export function hereStringProblems(script) {
  const lines = script.split('\n');
  const problems = [];
  for (let index = 0; index < lines.length; index += 1) {
    const open = /^\s*(@'|@")\s*$/u.exec(lines[index]);
    if (!open) continue;
    const closer = open[1] === "@'" ? "'@" : '"@';
    const terminator = lines.findIndex((line, at) => at > index && line.trimStart().startsWith(closer));
    if (terminator < 0) {
      problems.push(`here-string ${open[1]} opened at line ${index + 1} is never closed after YAML processing`
        + ` (no line begins with ${JSON.stringify(closer)})`);
    }
  }
  return problems;
}

/** pwsh 7 is the runner shell; Windows PowerShell 5.1 parses the same grammar for our purposes. */
function powershellInterpreter() {
  for (const candidate of ['pwsh', 'powershell.exe', 'powershell']) {
    const probe = spawnSync(candidate, ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (probe.status === 0) return { command: candidate, version: String(probe.stdout || '').trim() };
  }
  return null;
}

/**
 * Parse a script with the PowerShell AST parser and return its syntax errors. `ParseFile` reads and
 * tokenizes only — the workflow script is never executed.
 */
function powershellSyntaxErrors(interpreter, scriptPath) {
  const result = spawnSync(interpreter.command, [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '$t=$null;$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile($env:AIOS_PS_TARGET,[ref]$t,[ref]$e);'
    + 'foreach($x in $e){ "{0}:{1} {2}" -f $x.Extent.StartScriptPosition.Line,$x.Extent.StartScriptPosition.ColumnNumber,$x.Message }',
  ], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, AIOS_PS_TARGET: scriptPath },
  });
  if (result.status !== 0 && !String(result.stdout || '').trim()) {
    return [`the PowerShell parser itself failed (exit ${result.status}): ${String(result.stderr || '').trim().split('\n')[0]}`];
  }
  return String(result.stdout || '').split('\n').map((line) => line.trim()).filter(Boolean);
}

test('S1: every heredoc in a workflow run block closes at a bash-legal indentation', () => {
  const offenders = [];
  for (const block of bashRunBlocks()) {
    for (const problem of heredocTerminatorProblems(block.script)) {
      offenders.push(`${block.file} :: ${block.job} :: ${block.step} -> ${problem}`);
    }
  }
  assert.deepEqual(offenders, [], `bash cannot close these here-documents: ${offenders.join('; ')}`);
});

test('S2: every bash run block passes `bash -n`', (t) => {
  if (!bashAvailable()) {
    t.skip('bash is not available on PATH; this guard runs in CI (ubuntu) and locally with Git Bash');
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-workflow-syntax-'));
  try {
    const failures = [];
    for (const block of bashRunBlocks()) {
      const scriptPath = path.join(dir, `${block.file}-${block.step.replace(/[^\w.-]+/gu, '_')}.sh`);
      fs.writeFileSync(scriptPath, block.script, 'utf8');
      const result = spawnSync('bash', ['-n', scriptPath], { encoding: 'utf8' });
      if (result.status === 0) continue;
      const firstLine = String(result.stderr || '').trim().split('\n').slice(0, 2).join(' | ');
      failures.push(`${block.file} :: ${block.job} :: ${block.step} -> ${firstLine}`);
    }
    assert.deepEqual(failures, [], `bash rejected these workflow scripts: ${failures.join('; ')}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('S3: every PowerShell here-string in a run block is closed', () => {
  const offenders = [];
  for (const block of powershellRunBlocks()) {
    for (const problem of hereStringProblems(block.script)) {
      offenders.push(`${block.file} :: ${block.job} :: ${block.step} -> ${problem}`);
    }
  }
  assert.deepEqual(offenders, [], `PowerShell cannot close these here-strings: ${offenders.join('; ')}`);
});

test('S4: every PowerShell run block parses (A15)', (t) => {
  const interpreter = powershellInterpreter();
  if (!interpreter) {
    t.skip('neither pwsh nor Windows PowerShell is on PATH; S4 runs on Windows jobs, S3 covers every platform');
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-workflow-pwsh-'));
  try {
    const failures = [];
    for (const block of powershellRunBlocks()) {
      const scriptPath = path.join(dir, `${block.file}-${block.step.replace(/[^\w.-]+/gu, '_')}.ps1`);
      fs.writeFileSync(scriptPath, block.script, 'utf8');
      for (const error of powershellSyntaxErrors(interpreter, scriptPath)) {
        failures.push(`${block.file} :: ${block.job} :: ${block.step} -> ${error}`);
      }
    }
    assert.deepEqual(failures, [], `PowerShell rejected these workflow scripts: ${failures.join('; ')}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('S5: the PowerShell coverage is real, not an empty loop', () => {
  // A guard whose selector silently matches nothing is the vacuous-pass failure mode this file
  // exists to prevent. Count the opt-in steps straight from the YAML text and require the selector
  // to have found exactly that many.
  const declared = workflowFiles().reduce((total, file) => {
    const text = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
    return total + (text.match(/^\s*shell:\s*(pwsh|powershell)/gmu) || []).length;
  }, 0);
  const found = powershellRunBlocks().length;
  assert.ok(declared > 0, 'no PowerShell steps to cover — re-check the premise before trusting S4');
  assert.equal(found, declared, `the selector covered ${found} of ${declared} PowerShell steps`);

  // And both halves must be able to fail: a synthetic unterminated here-string and unbalanced braces.
  assert.deepEqual(
    hereStringProblems("Write-Host 'a'\n@'\nbody\n  '@\n"),
    [],
    'an indented terminator is legal in pwsh 6+ and must not fail here',
  );
  assert.match(
    hereStringProblems("@'\nbody\nnot closed").join('\n'),
    /never closed/u,
    'the here-string detector cannot see an unterminated block',
  );
  const interpreter = powershellInterpreter();
  if (!interpreter) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-workflow-pwsh-selftest-'));
  try {
    const broken = path.join(dir, 'broken.ps1');
    fs.writeFileSync(broken, '$values = @(1, 2\nWrite-Host $values\n', 'utf8');
    assert.ok(
      powershellSyntaxErrors(interpreter, broken).length > 0,
      'the PowerShell parse harness reported no error for unbalanced parentheses — the guard is vacuous',
    );
    fs.writeFileSync(broken, 'Write-Host "ok"\n', 'utf8');
    assert.deepEqual(powershellSyntaxErrors(interpreter, broken), [], 'a valid script was reported as broken');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
