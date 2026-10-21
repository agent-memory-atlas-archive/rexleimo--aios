import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/* 中文注释：CLI 入口守卫的形状契约。
 *
 * 起因（本机实测）：`import.meta.url === \`file://${process.argv[1]}\`` 这种写法在 POSIX 上成立，
 * 在 Windows 上**永不成立**——那边 import.meta.url 是 `file:///C:/…`（三斜杠 + 盘符），
 * argv[1] 换了反斜杠也补不上那个前导斜杠。后果不是报错，而是脚本静默不执行并以 0 退出：
 * `aios-tmp-gc --mode purge` 看起来"成功"，实际一个目录也没删。这类失败比崩溃危险，
 * 因为调用方（人和 CI）拿到的是成功退出码。
 *
 * 允许两种形态：用 realpath 版 helper（首选），或保留 `endsWith('<本文件名>')` 兜底
 * （现存 mcp server 入口就是这么在 Windows 上活着的）。契约只禁止「裸 file:// 模板相等」。
 * 这是客观的源码形状检查，不做语义猜测。
 */

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const SCRIPTS = path.join(ROOT, 'scripts');
const FRAGILE = /import\.meta\.url === `file:\/\/[^`]*`/g;

function collectModuleFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectModuleFiles(full, acc);
    else if (entry.name.endsWith('.mjs')) acc.push(full);
  }
  return acc;
}

/** 取该判定所在的语句窗口：从匹配处到块起始 `{`（跳过模板里的 `${`），没找到就 300 字符。 */
function statementWindow(source, index) {
  for (let i = index; i < index + 300 && i < source.length; i += 1) {
    /* 中文注释：必须跳过 `${` 里的花括号——它就是模板插值，不是语句体开头。
     * 不跳的话窗口在 `file://${process.argv[1]` 处就被截断，同一行尾部的
     * `endsWith(...)` 兑底会被误判成“裸模板”，契约测试自己就先假阳性了。 */
    if (source[i] === '{' && source[i - 1] !== '$') {
      return source.slice(index, i);
    }
  }
  return source.slice(index, index + 300);
}

function fragileGuards(source) {
  const offenders = [];
  for (const match of source.matchAll(FRAGILE)) {
    if (/endsWith\(/.test(statementWindow(source, match.index))) continue;
    offenders.push(source.slice(0, match.index).split('\n').length);
  }
  return offenders;
}

test('no script entry guard relies on a bare file:// template equality', () => {
  const found = [];
  for (const file of collectModuleFiles(SCRIPTS)) {
    const lines = fragileGuards(fs.readFileSync(file, 'utf8'));
    if (lines.length) found.push(`${path.relative(ROOT, file)}:${lines.join(',')}`);
  }
  assert.deepEqual(found, [], `Windows 上这些脚本会静默 no-op 并以 0 退出：\n${found.join('\n')}`);
});

test('the swept-back tools use the realpath entry helper', () => {
  /* 中文注释：正向锚点。tmp:gc 是 npm script 的门面，scorecard 是报告漂移检查；
   * 两者都曾被同一个模板判定挡住（一个静默空转，一个静默跳过检查）。 */
  for (const rel of ['scripts/aios-tmp-gc.mjs', 'scripts/client-capability-scorecard.mjs']) {
    assert.match(
      fs.readFileSync(path.join(ROOT, rel), 'utf8'),
      /isDirectModuleInvocation/,
      `${rel} 必须用 realpath 版入口判定`
    );
  }
});

test('the CLI really executes through every path form used to invoke it', () => {
  /* 中文注释：直接在子进程里验——相对、Windows 绝对、正斜杠绝对三种 argv 形态都必须真的
   * 跑进 main()。"入口通不通"的客观事实是有没有 usage 输出，读源码判断不了 realpath 差异。 */
  const script = path.join(SCRIPTS, 'aios-tmp-gc.mjs');
  const forms = [
    path.relative(ROOT, script),
    script,
    script.replace(/\\/g, '/'),
    process.platform === 'win32' ? script.replace(/\\/g, '/') : script,
  ];
  for (const form of [...new Set(forms)]) {
    const out = execFileSync(process.execPath, [form, '--help'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.match(out, /^usage: node scripts\/aios-tmp-gc\.mjs/, `argv 形态「${form}」没有触发入口`);
  }
});
