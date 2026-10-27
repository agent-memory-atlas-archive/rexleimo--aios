import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { COMMAND_SPECS } from '../../../lib/tooling/cli/commander/specs/index.mjs';
import { isPassthroughCommand, mustRejectUnknownOption, PASSTHROUGH_COMMANDS, UNKNOWN_OPTION_STRICTNESS_DEFERRED } from '../../../lib/tooling/cli/commander/passthrough.mjs';

/* 中文注释（2026-10-27，P0）：这条文件守的是**进程边界的诚实性**——一个被拒绝的 flag 绝不能
 * 让调用方读到"成功"。实测基线见 docs/reports/2026-10-27-cli-usage-error-baseline.md：
 * 6 个命令打印 commander 的 unknown-option 错误却退 0，另外 11 个命令连错误都不打印就带着
 * 默认值照常执行，其中 `uninstall` 的默认值是 components=shell,skills / scope=global / client=all。
 *
 * 测试缝刻意选在真实子进程 + 真实退出码：v6.14.3 的 `resume --dry-run` 已经用执行事实证明过，
 * 注入式单测看不见这类缺陷（它绕过了 parser）。
 *
 * 安全条款：矩阵里含破坏性命令，所以**每一条都在沙箱 HOME 下 spawn**，绝不允许碰真实用户目录。 */

const UNKNOWN_FLAG = '--definitely-not-a-real-flag';
// fileURLToPath 是唯一的跨平台换算：`.pathname.replace(/^\//, '')` 在 Windows 上碰巧对
// （`/E:/...` 被当作盘符路径），在 Linux 上把绝对路径剪成相对路径，CI 全量红过一次
// （release #190：spawnargs 拼成了 `repo/home/runner/.../aios.mjs`）。
const here = path.dirname(fileURLToPath(import.meta.url));
// 本文件位于 scripts/tests/execution/<dir> -> 仓库根要上**四**层。这里少算一层曾让本文件
// 拿到一个不存在的 cliPath：node 因为找不到文件而退非零，反而被下面“拒绝未知 flag”的
// 断言当成通过 —— 这就是契约里禁止的假通过形状，靠下面的阳性对照才能报出来。
const repoRoot = path.resolve(here, '../../..', '..');
const cliPath = path.join(repoRoot, 'scripts/aios.mjs');

async function withSandboxHome(run) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'aios-cli-usage-'));
  await mkdir(path.join(home, '.aios', 'bin'), { recursive: true });
  await writeFile(path.join(home, '.aios', 'bin', 'aios'), 'shim-stub\n', 'utf8');
  try {
    await run({
      home,
      spawn: (args) => spawnSync(process.execPath, [cliPath, ...args], {
        encoding: 'utf8',
        cwd: repoRoot,
        timeout: 60_000,
        env: {
          ...process.env,
          AIOS_AGENT_ID: '',
          HOME: home,
          USERPROFILE: home,
          AIOS_PROJECT_ROOT: home,
        },
      }),
    });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

const specCommandNames = () => [...new Set(COMMAND_SPECS.map((spec) => spec.name).filter(Boolean))];

/**
 * Positive control: prove the test seam itself works before trusting any
 * "the CLI rejected it" assertion. Without this, a broken path or a failed spawn
 * exits non-zero and every rejection assertion goes green for the wrong reason.
 */
test('the CLI seam is alive: a known-good invocation runs and reports the version', async () => {
  await withSandboxHome(({ spawn }) => {
    const result = spawn(['version']);
    assert.equal(result.error, undefined, `the CLI must be spawnable at ${cliPath}: ${result.error && result.error.message}`);
    assert.equal(result.status, 0, `aios version must exit 0: ${String(result.stderr || '').slice(0, 160)}`);
    assert.match(String(result.stdout || ''), /AIOS \d+/u, 'and the CLI itself must be what answered');
  });
});

test('the guard matrix comes from COMMAND_SPECS and refuses to be hollow', () => {
  const names = specCommandNames();
  assert.ok(names.length >= 30, `COMMAND_SPECS must feed this matrix, got ${names.length} commands`);
  // 豁免必须是**生产侧声明**，不是测试里的手写名单；且规模受限，防止用豁免把门掏空。
  assert.ok(PASSTHROUGH_COMMANDS.size <= 4, `passthrough allowlist is growing past its purpose: ${[...PASSTHROUGH_COMMANDS].join(' ')}`);
  // The ledger was 12 when this contract was written (2026-10-27): the ceiling is the ratchet.
  assert.ok(UNKNOWN_OPTION_STRICTNESS_DEFERRED.size <= 12, `deferred ledger must shrink, not grow: ${UNKNOWN_OPTION_STRICTNESS_DEFERRED.size}`);
  for (const name of PASSTHROUGH_COMMANDS) {
    assert.ok(!UNKNOWN_OPTION_STRICTNESS_DEFERRED.has(name), `${name} cannot appear in both the passthrough and the deferred list`);
  }
});

test('every command outside the declared ledger rejects an unknown option with a non-zero exit', async () => {
  await withSandboxHome(({ spawn }) => {
    const offenders = [];
    const staleLedgerEntries = [];
    for (const name of specCommandNames()) {
      if (isPassthroughCommand(name)) continue;
      const result = spawn([name, UNKNOWN_FLAG]);
      assert.equal(result.error, undefined, `spawn of "${name}" failed; a dead seam is not a rejection`);
      const rejected = result.status !== 0;
      if (!rejected && mustRejectUnknownOption(name)) {
        offenders.push(`${name} (stdout: ${String(result.stdout || '').split('\n')[0].slice(0, 40)})`);
      }
      // 棘轮：记账名单只允许缩小。某个命令已经会拒绝了还留在名单里，
      // 就等于把“已修”伪装成“待办”——那跟删断言一样是假通过。
      if (rejected && !mustRejectUnknownOption(name)) staleLedgerEntries.push(name);
    }
    assert.deepEqual(offenders, [], `these commands accepted an unknown flag and still reported success:\n${offenders.join('\n')}`);
    assert.deepEqual(staleLedgerEntries, [], `the deferred ledger is shrink-only; these already reject unknown options, remove them: ${staleLedgerEntries.join(' ')}`);
  });
});

test('an unknown flag stops uninstall before it begins removing anything', async () => {
  await withSandboxHome(({ spawn }) => {
    const result = spawn(['uninstall', UNKNOWN_FLAG]);
    assert.equal(result.error, undefined, 'the seam must be alive for this to mean anything');
    assert.notEqual(result.status, 0, 'uninstall must not report success while rejecting input it cannot parse');
    assert.doesNotMatch(String(result.stdout || ''), /Uninstall components:/u,
      'that line is only printed once the destructive pass has started');
  });
});

test('uninstall without an explicit --yes only previews and leaves files alone', async () => {
  await withSandboxHome(({ home, spawn }) => {
    const result = spawn(['uninstall', '--components', 'shell']);
    assert.equal(result.status, 0, 'a valid but unconfirmed invocation is not a usage error');
    assert.match(String(result.stdout || '') + String(result.stderr || ''), /--yes/u,
      'the refusal must name the flag that would actually confirm it');
    const shim = path.join(home, '.aios', 'bin', 'aios');
    assert.ok(existsSync(shim), 'the shim stub must survive an unconfirmed uninstall');
    assert.match(readFileSync(shim, 'utf8'), /shim-stub/u);
  });
});

// 单元级钉住：确认位的安全默认值来自选项Defaults，而不是依赖上游解析器带上它。
// 放在本文件里而不是开新目录——“坏输入不执行”和“未确认不动手”是同一条契约。
test('the destructive default is "no" at the options layer, not at the parser', async () => {
  const { planUninstall } = await import('../../../lib/execution/lifecycle/setup/uninstall.mjs');
  const plan = planUninstall();
  assert.equal(plan.options.yes, false, 'uninstall must not default to a destructive run');
  assert.doesNotMatch(plan.preview, /--yes/u, 'and the preview line must not sneak the confirmation in');

  const confirmed = planUninstall({ yes: true });
  assert.equal(confirmed.options.yes, true, 'an explicit --yes is carried through');
  assert.match(confirmed.preview, /--yes/u, 'and shows up in the command a human can copy');
});

test('runUninstall reports a preview instead of starting the destructive pass', async () => {
  const { runUninstall } = await import('../../../lib/execution/lifecycle/setup/uninstall.mjs');
  const logs = [];
  const outcome = await runUninstall({}, { io: { log: (line) => logs.push(line) }, rootDir: repoRoot, projectRoot: repoRoot });
  assert.equal(outcome.preview, true);
  const text = logs.join('\n');
  assert.match(text, /did not run/u, 'it must say in words that nothing was removed');
  assert.match(text, /--yes/u, 'and name the flag that would confirm it');
  assert.doesNotMatch(text, /Uninstall components:/u, 'the destructive pass must not have started');
});

test('a valid invocation still exits zero, so strictness has a floor', async () => {
  await withSandboxHome(({ spawn }) => {
    for (const args of [['refs', 'prune', '--dry-run'], ['memo', 'pin', 'status'], ['version']]) {
      const result = spawn(args);
      assert.equal(result.status, 0, `${args.join(' ')} must stay usable: ${String(result.stderr || '').slice(0, 120)}`);
    }
  });
});

test('a rejected flag is reported as usage, never as a stack dump', async () => {
  await withSandboxHome(({ spawn }) => {
    const result = spawn(['dream', UNKNOWN_FLAG]);
    assert.equal(result.error, undefined, 'the seam must be alive for this to mean anything');
    assert.notEqual(result.status, 0);
    const combined = `${result.stdout || ''}${result.stderr || ''}`;
    assert.match(combined, /unknown option/iu, 'the caller still needs to see which flag was rejected');
    assert.doesNotMatch(combined, /^\s+at \S+ \(/mu, 'a rejected flag is not an internal fault; no stack may leak');
  });
});
