#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAiosProgram } from './lib/tooling/cli/commander/commander-app.mjs';
import { createAiosDispatch } from './lib/tooling/cli/dispatch/dispatch.mjs';
import { getRuntimeVersion } from './lib/tooling/cli/dispatch/runtime.mjs';
import { getRootHelpText } from './lib/tooling/cli/help/help.mjs';
import { resolveProjectRoot } from './lib/tooling/cli/project-root.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** cwd 只是兜底：AIOS_PROJECT_ROOT 让 wrapper / CI 能显式声明目标项目。 */
const projectRoot = resolveProjectRoot({ env: process.env });

function isUsageError(message) {
  // 中文注释（2026-10-27 P0）：旧正则要求大写 `Unknown option`，而 Commander 发的是小写
  // `unknown option`——于是被拒绝的 flag 会落进“意外错误”分支刷整叠堆栈。
  // 退出码已经是 1，但调用面读到的文本仍是内部故障的的形状。
  return /^(?:error: )?(unknown command|unknown option|missing value|missing argument|missing option|too many arguments|--.+ must|.+. must|requires |invalid usage)/iu.test(message);
}

async function main(argv = process.argv) {
  const program = createAiosProgram({
    version: await getRuntimeVersion(rootDir),
    dispatch: createAiosDispatch({ rootDir, projectRoot }),
  });
  await program.parseAsync(argv);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  if (error?.refusal === true) {
    // 守卫拒绝自带可操作的一行结论，不再刷堆栈。
  } else if (error?.usage === true || isUsageError(message)) {
    // 用法错误只补一句帮助，绝不漏堆栈——那是给调用方的假“内部故障”。
    process.stderr.write(getRootHelpText());
  } else if (error instanceof Error && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  }
  process.exitCode = 1;
});
