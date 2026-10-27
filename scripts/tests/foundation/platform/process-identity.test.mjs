import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import { verifyOwnerLease } from '../../../lib/execution/harness/solo/solo-journal/content/owner.mjs';

import {
  isProcessAlive,
  probeProcessLiveness,
  readProcessStartTimeMs,
  parseLinuxProcStat,
  parseDarwinLstart,
  parseWindowsStartTime,
} from '../../../lib/foundation/platform/process/identity.mjs';

/* 中文注释：B2 的第一条缺陷不在 PID 复用，而在语义分叉——owner.mjs 把 EPERM 判成「已死」，
   spawn.mjs 与 watchdog/signals.mjs 判成「活着」。EPERM 意味着进程存在只是无权发信号，
   判死会让崩溃对账给一个活着的会话写出假崩溃记录。 */

test('liveness keeps EPERM alive and only ESRCH dead', () => {
  const thrower = (code) => () => { const error = new Error(code); error.code = code; throw error; };

  assert.deepEqual(probeProcessLiveness(4242, { killProbe: thrower('EPERM') }), { alive: true, code: 'eperm' });
  assert.deepEqual(probeProcessLiveness(4242, { killProbe: thrower('ESRCH') }), { alive: false, code: 'esrch' });
  assert.equal(isProcessAlive(4242, { killProbe: thrower('EPERM') }), true);
  assert.equal(isProcessAlive(4242, { killProbe: thrower('ESRCH') }), false);
});

test('an unknown signalling error is not sold as a proven death', () => {
  /* 中文注释：未知错误保守按「活着」。把未知当死亡，是让降级伪装成结论的那条老路。 */
  const probe = probeProcessLiveness(4242, { killProbe: () => { const error = new Error('weird'); error.code = 'EACCES'; throw error; } });
  assert.equal(probe.alive, true);
  assert.match(probe.code, /^other:/);
});

test('invalid pids are rejected before any syscall', () => {
  let calls = 0;
  for (const value of [0, -1, 'abc', null, undefined, 1.5]) {
    const probe = probeProcessLiveness(value, { killProbe: () => { calls += 1; } });
    assert.deepEqual(probe, { alive: false, code: 'invalid' }, `value ${String(value)}`);
  }
  assert.equal(calls, 0, 'invalid pid must not reach the probe');
});

/* ---------------- 平台解析器：喂真实形状的文本，不依赖运行平台 ---------------- */

test('linux starttime is computed from btime plus ticks after the last ")" of comm', () => {
  /* 中文注释：comm 可以带空格和括号，所以字段必须从最后一个 ')' 之后切；从第一个空格切会整体错位。 */
  const statText = '4242 (weird ) (comm) S 1 4242 4242 0 -1 4194304 100 0 0 0 5 6 0 0 20 0 3 0 5000 123 0';
  const parsed = parseLinuxProcStat({ statText, btimeText: 'cpu 1 2\nbtime 1000\n', clkTck: 100 });
  assert.equal(parsed.startMs, 1000 * 1000 + 50 * 1000);
  assert.match(parsed.detail, /clkTck=100/);
});

test('linux parser refuses to guess when the shape is wrong', () => {
  assert.equal(parseLinuxProcStat({ statText: 'no-parens-here', btimeText: 'btime 1000\n' }), null);
  assert.equal(parseLinuxProcStat({ statText: '1 (a) S 2 3', btimeText: 'btime 1000\n' }), null);
  assert.equal(parseLinuxProcStat({ statText: '1 (a) S 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20', btimeText: 'no btime line\n' }), null);
});

test('darwin lstart and windows UTC start time parse their real formats', () => {
  const darwin = parseDarwinLstart('Mon Oct 26 12:00:00 2026');
  assert.ok(darwin && Number.isFinite(darwin.startMs));
  const asLocal = new Date(darwin.startMs);
  assert.deepEqual(
    [asLocal.getFullYear(), asLocal.getMonth(), asLocal.getDate(), asLocal.getHours(), asLocal.getMinutes()],
    [2026, 9, 26, 12, 0],
    'ps lstart has no zone suffix, so it must be read as local time',
  );

  const windows = parseWindowsStartTime('2026-10-26T12:00:00.000Z\r\n');
  assert.equal(windows.startMs, Date.parse('2026-10-26T12:00:00.000Z'));
  assert.equal(parseWindowsStartTime('Cannot process because of error'), null);
  assert.equal(parseDarwinLstart('   '), null);
});

/* ---------------- 真回执：本平台上量一次，不靠 mock ---------------- */

test('execution receipt: this platform reports a start time for the running process', (t) => {
  /* 中文注释：本仓的规矩——关于环境的断言要么实测，要么别说。这条就是用真 PowerShell
     探一次自己，它同时把“参数写错”“格式串被破坏”这类实现错误直接暴露出来。 */
  const started = Date.now();
  const probe = readProcessStartTimeMs(process.pid, { useCache: false });
  const elapsed = Date.now() - started;
  if (probe.startMs === null) {
    t.skip(`no start-time on ${process.platform}: ${probe.source} / ${probe.detail}`);
    return;
  }
  assert.ok(Number.isFinite(probe.startMs));
  /* 中文注释：本 Node 没有 process.timeOrigin，可用参照是 performance.timeOrigin。
     内核启动时间不得晚于自己的启动参照（留秒级精度误差），且不得是未来时间。 */
  const origin = performance.timeOrigin;
  assert.ok(Number.isFinite(origin), 'test needs performance.timeOrigin as the process-start reference');
  assert.ok(probe.startMs <= origin + 2000, `start ${probe.startMs} must not be later than node origin ${origin} (${t.name})`);
  assert.ok(probe.startMs >= origin - 60_000, `start ${probe.startMs} is implausibly early vs node origin ${origin}`);
  assert.ok(probe.startMs <= Date.now(), `start ${probe.startMs} is in the future`);
  // 探测成本写进诊断：Windows 要起一次 PowerShell，热轮询路径呌不能走这条路。
  assert.ok(elapsed < 5_000, `probe took ${elapsed}ms`);
});

test('end-to-end receipt: a real foreign process outranks a lease that claims to predate it', async (t) => {
  /* 中文注释：这是本改动的要害反例，所以不用桩。起一个真实子进程，然后造两份租约：
     一份癲称自己在它启动**之前**就拥有了这个 pid（就是 PID 复用的形状），
     一份在它的启动时刻之后才认领。真探测必须把前者判成 recycled、后者判成 ours。
     只靠注入双桩的测试只能证明“我写的逻辑自圆其说”，证不了操作系统配合。 */
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 8000)'], { stdio: 'ignore' });
  const pid = child.pid;
  assert.ok(Number.isInteger(pid) && pid > 0, 'child must have a pid');
  child.unref();
  try {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const probed = readProcessStartTimeMs(pid, { useCache: false });
    if (probed.startMs === null) {
      t.skip(`no start-time on ${process.platform}: ${probed.source} / ${probed.detail}`);
      return;
    }
    assert.equal(isProcessAlive(pid), true, 'the real child must be alive for this receipt to mean anything');

    const staleLease = {
      pid,
      processStartedAt: new Date(probed.startMs - 60_000).toISOString(),
    };
    const honestLease = {
      pid,
      processStartedAt: new Date(probed.startMs + 60_000).toISOString(),
    };
    const options = { selfPid: process.pid, startTimeProbe: (value) => readProcessStartTimeMs(value, { useCache: false }) };

    const recycled = verifyOwnerLease(staleLease, options);
    assert.equal(recycled.verdict, 'recycled', JSON.stringify(recycled));
    assert.equal(recycled.pid, pid);

    const ours = verifyOwnerLease(honestLease, options);
    assert.equal(ours.verdict, 'ours', JSON.stringify(ours));

    /* 中文注释：旧的 kill(pid,0) 对这两份租约会给出一模一样的答案——“活着”。 */
    assert.equal(isProcessAlive(staleLease.pid), isProcessAlive(honestLease.pid));
  } finally {
    child.kill();
  }
});

test('unsupported platforms and unparsable output stay unprovable instead of asserting a verdict', () => {
  const unsupported = readProcessStartTimeMs(process.pid, { platform: 'plan9', useCache: false });
  assert.equal(unsupported.startMs, null);
  assert.equal(unsupported.source, 'unsupported-platform');

  /* 中文注释：探测命令超时/失败也不能编出时间——这是「不可证明」，调用方据此继续尊重租约。 */
  const failing = readProcessStartTimeMs(4242, {
    platform: 'win32',
    captureImpl: () => ({ status: 1, stdout: '', stderr: 'Get-Process: Cannot find a process', error: null }),
    useCache: false,
  });
  assert.equal(failing.startMs, null);
  assert.equal(failing.source, 'powershell');

  const garbage = readProcessStartTimeMs(4242, {
    platform: 'win32',
    captureImpl: () => ({ status: 0, stdout: 'not-a-timestamp', stderr: '', error: null }),
    useCache: false,
  });
  assert.equal(garbage.startMs, null);
});
