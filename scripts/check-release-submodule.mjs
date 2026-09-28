#!/usr/bin/env node
/**
 * CLI entry for the rex-harness release ordering gate.
 *
 * Usage:
 *   git -C rex-harness ls-remote --tags origin | \
 *     node scripts/check-release-submodule.mjs --commit <gitlink sha>
 *
 * Exit 0: the commit is a published rex-harness release. Exit 1: it is not, and
 * the host release must not be cut. Exit 2: the check itself could not run
 * (missing input), which callers treat as "cannot prove" rather than "passed".
 */
import fs from 'node:fs';
import { evaluateSubmoduleReleaseGate } from './lib/release-submodule-gate.mjs';

function parseArgs(argv) {
  const args = { commit: '', tagsFile: '' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--commit') args.commit = argv[i + 1] ?? '';
    else if (argv[i] === '--tags-file') { args.tagsFile = argv[i + 1] ?? ''; i += 1; }
  }
  return args;
}

function readTagsSync(args) {
  return args.tagsFile ? fs.readFileSync(args.tagsFile, 'utf8') : null;
}

/**
 * stdin 读取用 stream：`fs.readFileSync(0)` 在 pipe 尚未就绪时抛 EAGAIN
 * （小输入能赢，大输入会随机失败），stream 迭代没有这个竞态。
 */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

const args = parseArgs(process.argv.slice(2));
const fromFile = readTagsSync(args);
if (!args.commit) {
  console.error('check-release-submodule: --commit <sha> is required');
  process.exit(2);
}
const lsRemoteTags = fromFile ?? (process.stdin.isTTY ? '' : await readStdin());
if (!lsRemoteTags.trim()) {
  console.error('check-release-submodule: no tag refs on stdin; cannot prove the submodule release');
  process.exit(2);
}

const result = evaluateSubmoduleReleaseGate({ commitSha: args.commit, lsRemoteTags });

if (result.verdict === 'pass') {
  console.log(`rex-harness ${args.commit.slice(0, 12)} is published as ${result.tags.join(', ')}`);
  process.exit(0);
}

console.error(`check-release-submodule: ${result.blockedReasons.join(',')} for ${args.commit.slice(0, 12)}`);
console.error(`evidence: ${JSON.stringify(result.evidence)}`);
console.error('publish the rex-harness release first (tag + push + release workflow), then cut the host release');
process.exit(1);
