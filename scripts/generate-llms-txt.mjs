#!/usr/bin/env node
// Render docs-site/llms.txt from site-sources/llms.src.md.
//
// Why this exists: llms.txt is the machine-readable index that AI answer
// engines (ChatGPT, Perplexity, Claude, Copilot Studio, etc.) fetch to decide what
// AIOS is and which pages to cite. It is also the file most likely to rot, because
// it restates facts that already live elsewhere in the repository — the current
// version, the release history, the set of blog posts. Before this script existed
// it was hand-maintained and drifted exactly the way you would expect: the live
// copy still said "Version: v5.20.0" while the repo was shipping v6.2.0, and it
// listed 24 of the 68 published posts.
//
// So every fact in the output is derived rather than typed:
//   - the version marker comes from VERSION
//   - the release index comes from blog-site/*.md, newest first, titled by the
//     post's own front matter
//   - a release is only announced as current if its post is actually published
// The hand-written prose (Search Intents, Core Docs, Problem-First Guides) stays
// in llms.src.md, because that is editorial judgement and nothing else in the repo
// owns it.
//
// Usage:
//   node scripts/generate-llms-txt.mjs            # write docs-site/llms.txt
//   node scripts/generate-llms-txt.mjs --check    # fail if the committed file is stale
//   node scripts/generate-llms-txt.mjs --json     # report counts for tests

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_BASE = 'https://cli.rexai.top';
const MARKERS = Object.freeze({
  version: '<!-- llms:version -->',
  releases: '<!-- llms:release-index -->',
});

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

async function readText(filePath) {
  return readFile(filePath, 'utf8');
}

/** Read the current release version from VERSION. */
async function readVersion(rootDir) {
  const raw = (await readText(path.join(rootDir, 'VERSION'))).trim();
  if (!/^\d+\.\d+\.\d+$/u.test(raw)) {
    throw new Error(`VERSION is not a plain x.y.z string: ${JSON.stringify(raw)}`);
  }
  return raw;
}

/** Most recent CHANGELOG heading date, used as the "Updated" stamp. */
async function readLatestReleaseDate(rootDir) {
  const changelog = await readText(path.join(rootDir, 'CHANGELOG.md'));
  const match = changelog.match(/^## \[\d+\.\d+\.\d+\] - (\d{4}-\d{2}-\d{2})$/mu);
  if (!match) throw new Error('CHANGELOG.md has no released section with a date');
  return match[1];
}

function extractFrontMatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/u);
  return match ? match[1] : '';
}

function frontValue(frontMatter, key) {
  const match = frontMatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'mu'));
  if (!match) return '';
  return match[1].trim().replace(/^["']|["']$/gu, '');
}

/** Version referenced by a post title, as a comparable tuple; -1 when there is none. */
function versionKey(title) {
  const match = String(title || '').match(/v(\d+)\.(\d+)(?:\.(\d+))?/u);
  if (!match) return [-1, -1, -1];
  return [Number(match[1]), Number(match[2]), Number(match[3] || 0)];
}

function comparePosts(a, b) {
  // 先按日期前缀（新的在前），同期再按版本号：纯字典序会把 v6.0.1 排在 v6.2.0 之前，
  // 因为 "601" < "6..." 反了——当前版本必须排在索引最前面。
  if (a.dated !== b.dated) return a.dated ? -1 : 1;
  const aDate = a.slug.slice(0, 7);
  const bDate = b.slug.slice(0, 7);
  if (aDate !== bDate) return aDate < bDate ? 1 : -1;
  const av = versionKey(a.title);
  const bv = versionKey(b.title);
  for (let i = 0; i < 3; i += 1) {
    if (av[i] !== bv[i]) return av[i] < bv[i] ? 1 : -1;
  }
  return a.slug < b.slug ? 1 : a.slug > b.slug ? -1 : 0;
}

/**
 * Enumerate canonical (English) blog posts as {slug, title, description}, newest
 * first. Posts are dated by the YYYY-MM prefix in the file name; undated evergreen
 * posts keep the order they appear in so the listing stays deterministic.
 */
async function readBlogPosts(rootDir) {
  const blogDir = path.join(rootDir, 'blog-site');
  const entries = await readdir(blogDir, { withFileTypes: true });
  const posts = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (entry.name === 'index.md') continue;
    const slug = entry.name.slice(0, -'.md'.length);
    const markdown = await readText(path.join(blogDir, entry.name));
    const frontMatter = extractFrontMatter(markdown);
    const title = frontValue(frontMatter, 'title');
    if (!title) throw new Error(`blog-site/${entry.name} has no front-matter title`);
    posts.push({
      slug,
      title,
      dated: /^\d{4}-\d{2}-/u.test(slug),
      description: frontValue(frontMatter, 'description'),
    });
  }
  posts.sort(comparePosts);
  return posts;
}

/** A release is "current" only when its own release post exists; never claim one. */
function findReleasePost(posts, version) {
  const dotted = version.replace(/\./g, '');
  return posts.find((post) => post.slug.includes(`-v${dotted}-`) || post.title.includes(`v${version}:`));
}

function renderReleaseIndex(posts, version) {
  const lines = posts.map((post) => `- ${SITE_BASE}/blog/${post.slug}/ — ${post.title}`);
  const current = findReleasePost(posts, version);
  if (!current) {
    lines.unshift(`- v${version} release post not yet published — see ${SITE_BASE}/changelog/`);
  }
  return lines.join('\n');
}

function renderTemplate(template, { version, updated, releaseIndex }) {
  if (!template.includes(MARKERS.version) || !template.includes(MARKERS.releases)) {
    throw new Error(`site-sources/llms.src.md must contain both markers: ${MARKERS.version} and ${MARKERS.releases}`);
  }
  return template
    .replaceAll(MARKERS.version, `Version: v${version} · Updated: ${updated}.`)
    .replaceAll(MARKERS.releases, releaseIndex);
}

export async function generateLlmsTxt({ rootDir = repoRoot(), write = true } = {}) {
  const [version, updated, template, posts] = await Promise.all([
    readVersion(rootDir),
    readLatestReleaseDate(rootDir),
    readText(path.join(rootDir, 'site-sources', 'llms.src.md')),
    readBlogPosts(rootDir),
  ]);
  const releaseIndex = renderReleaseIndex(posts, version);
  const output = renderTemplate(template, { version, updated, releaseIndex });
  const target = path.join(rootDir, 'docs-site', 'llms.txt');

  let current = null;
  if (existsSync(target)) current = await readText(target);
  const stale = current !== output;
  if (write && stale) await writeFile(target, output, 'utf8');

  return {
    schemaVersion: 1,
    kind: 'aios.llms-txt-generation.v1',
    status: stale ? 'written' : 'unchanged',
    version,
    updated,
    postCount: posts.length,
    listingCount: (output.match(/\n- https:\/\/cli\.rexai\.top\/blog\//gu) || []).length,
    currentReleaseHasPost: Boolean(findReleasePost(posts, version)),
    stale,
    target: path.relative(rootDir, target),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const json = argv.includes('--json');
  const result = await generateLlmsTxt({ write: !check });
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (check) {
    process.stdout.write(result.stale
      ? `[llms-txt] STALE: docs-site/llms.txt does not match generated output; run: node scripts/generate-llms-txt.mjs\n`
      : '[llms-txt] OK (committed file matches generated output)\n');
  } else {
    process.stdout.write(`[llms-txt] ${result.status}: ${result.target} (version v${result.version}, ${result.listingCount} posts listed)\n`);
  }
  if (check && result.stale) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
