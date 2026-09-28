// llms.txt 是 AI 答案引擎抓的机读索引；它一旦跟仓库实况脱节，对外就在报旧版本、
// 漏发布帖。这里守四条客观事实，全部由生成器与文件内容比对得出，不做语义猜测。
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { generateLlmsTxt } from '../generate-llms-txt.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function readLlms() {
  return readFile(path.join(rootDir, 'docs-site', 'llms.txt'), 'utf8');
}

async function canonicalPostSlugs() {
  const entries = await readdir(path.join(rootDir, 'blog-site'), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md')
    .map((entry) => entry.name.slice(0, -3));
}

test('the committed llms.txt matches what the generator produces', async () => {
  const result = await generateLlmsTxt({ rootDir, write: false });
  assert.equal(result.stale, false, 'docs-site/llms.txt is stale; run: node scripts/generate-llms-txt.mjs');
});

test('llms.txt announces the version that VERSION actually holds', async () => {
  const [version, llms] = await Promise.all([
    readFile(path.join(rootDir, 'VERSION'), 'utf8'),
    readLlms(),
  ]);
  const current = version.trim();
  assert.match(llms, new RegExp(`Version: v${current.replace(/\./g, '\\.')} ·`), `llms.txt must carry v${current}`);
  assert.doesNotMatch(llms, /Version: v\d+\.\d+\.\d+ · Updated: \d{4}-\d{2}-\d{2}\.\s*Version:/u, 'no duplicated version marker');
});

test('every published post is listed, and no listed post is missing', async () => {
  const [llms, slugs] = await Promise.all([readLlms(), canonicalPostSlugs()]);
  const listed = new Set([...llms.matchAll(/\/blog\/([^\s/]+)\//gu)].map((match) => match[1]));
  for (const slug of slugs) {
    assert.ok(listed.has(slug), `llms.txt is missing published post: ${slug}`);
  }
  for (const slug of listed) {
    assert.ok(slugs.includes(slug), `llms.txt lists a post that does not exist: ${slug}`);
  }
});

test('the current release is the first entry in the Blog index', async () => {
  const [version, llms] = await Promise.all([
    readFile(path.join(rootDir, 'VERSION'), 'utf8'),
    readLlms(),
  ]);
  const blogSection = llms.split('## Blog\n')[1].split('\n## ')[0];
  const firstEntry = blogSection.split('\n').find((line) => line.startsWith('- ')) || '';
  assert.ok(firstEntry.includes(`v${version.trim()}:`), `expected the v${version.trim()} release post first, got: ${firstEntry}`);
});

test('llms.txt cross-links the sibling properties so discovery flows both ways', async () => {
  const llms = await readLlms();
  for (const url of ['https://rexai.top/', 'https://tool.rexai.top/', 'https://github.com/rexleimo/aios']) {
    assert.ok(llms.includes(url), `llms.txt must reference ${url}`);
  }
  assert.ok(llms.includes('https://cli.rexai.top/changelog/'), 'docs changelog must stay indexed');
});
