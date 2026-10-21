import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import YAML from 'yaml';

// 中文注释：Windows 下 URL.pathname 会产生 /E:/ 前缀，path.resolve 会拼成 E:\E:\...；用 fileURLToPath 保持跨平台。
const rootDir = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

const read = (relPath) => fs.readFileSync(path.join(rootDir, relPath), 'utf8');
const exists = (relPath) => fs.existsSync(path.join(rootDir, relPath));

const p0Docs = [
  'index.md',
  'getting-started.md',
  'windows-guide.md',
  'contextdb.md',
  'architecture.md',
  'workflow-policy.md',
  'token-compression.md',
  'team-ops.md',
  'hud-guide.md',
  'solo-harness.md',
  'use-cases.md',
  'troubleshooting.md',
  'case-library.md',
];

const locales = ['', 'zh', 'ja', 'ko'];
const promotedBlogPosts = ['2026-07-v400-adaptive-workflow-policy.md'];

function frontMatterHas(markdown, key) {
  // 中文注释：Windows autocrlf 检出为 CRLF，先归一化再匹配 frontmatter。
  const normalized = markdown.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  return Boolean(match && new RegExp(`^${key}:\\s*.+$`, 'm').test(match[1]));
}

test('every P0 documentation page has title and description metadata in every locale', () => {
  for (const locale of locales) {
    for (const fileName of p0Docs) {
      const relPath = path.posix.join('docs-site', locale, fileName);
      assert.equal(exists(relPath), true, `missing P0 page: ${relPath}`);
      const markdown = read(relPath);
      assert.equal(frontMatterHas(markdown, 'title'), true, `missing title: ${relPath}`);
      assert.equal(frontMatterHas(markdown, 'description'), true, `missing description: ${relPath}`);
    }
  }
});

test('Workflow Policy is available in every documentation locale', () => {
  for (const locale of locales) {
    const relPath = path.posix.join('docs-site', locale, 'workflow-policy.md');
    assert.equal(exists(relPath), true, `missing Workflow Policy page: ${relPath}`);
  }
});

test('promoted blog posts exist before localized indexes link to them', () => {
  for (const fileName of promotedBlogPosts) {
    for (const locale of locales) {
      const relPath = path.posix.join('blog-site', locale, fileName);
      assert.equal(exists(relPath), true, `missing promoted blog post: ${relPath}`);
    }
  }
});

test('the home page does not make an unsupported speed claim', () => {
  assert.doesNotMatch(read('docs-site/index.md'), /10x faster|10× faster/i);
});

test('public onboarding uses the current init, doctor, and token-intelligence boundaries', () => {
  for (const relPath of ['README.md', 'README-zh.md']) {
    const markdown = read(relPath);
    assert.doesNotMatch(markdown, /Native Token Compression|原生 Token 压缩|self-contained input\/output token reduction|自研输入\/输出 token 压缩/i);
    assert.match(markdown, /RTK/);
    assert.match(markdown, /Caveman/);
    assert.match(markdown, /Headroom/);
    assert.match(markdown, /ContextDB/);
  }

  for (const locale of locales) {
    const prefix = path.posix.join('docs-site', locale);
    const home = read(path.posix.join(prefix, 'index.md'));
    const quickStart = read(path.posix.join(prefix, 'getting-started.md'));
    const windows = read(path.posix.join(prefix, 'windows-guide.md'));
    assert.match(home, /getting-started/);
    assert.match(home, /use-cases/);
    assert.match(home, /workflow-policy/);
    assert.match(quickStart, /aios init/);
    assert.match(quickStart, /aios doctor/);
    assert.match(windows, /aios doctor/);
  }
});

test('docs shells read the current VERSION through the shared MkDocs hook', () => {
  const version = read('VERSION').trim();
  assert.match(version, /^\d+\.\d+\.\d+$/);

  const shellDir = 'docs-site/overrides/partials/rex';
  const shells = fs.readdirSync(path.join(rootDir, shellDir)).filter((name) => name.endsWith('.html'));
  // 中文注释：docs 外壳不得写死版本号（sidebar 已拆到 partials/rex/*），统一由 mkdocs hook 注入 config.extra.aios_version。
  for (const name of shells) {
    assert.doesNotMatch(
      read(path.posix.join(shellDir, name)),
      /aios v\d+\.\d+\.\d+/,
      `hardcoded version in ${name}`,
    );
  }
  assert.match(read(path.posix.join(shellDir, 'docs-page.html')), /config\.extra\.aios_version/);

  assert.match(read('mkdocs.yml'), /hooks:\s*\n\s+- scripts\/mkdocs_version\.py/);
  assert.match(read('mkdocs.blog.yml'), /scripts\/mkdocs_version\.py/);
});

test('localized docs changelogs expose the current 4.0 release records', () => {
  const rootChangelog = read('CHANGELOG.md');
  assert.ok(rootChangelog.indexOf('## [4.0.1]') < rootChangelog.indexOf('## [3.6.0]'));

  for (const locale of locales) {
    const relPath = path.posix.join('docs-site', locale, 'changelog.md');
    const changelog = read(relPath);
    assert.match(changelog, /v4\.0\.1/);
    assert.match(changelog, /v4\.0\.0/);
  }
});

/* 中文注释：本文件的既有 front matter 检查都是正则匹配“键在不在”，而 mkdocs 吃的是真正的
 * YAML 解析——v6.8.0 的发布帖就是被这个缝隙放过去的：description 里写了双引号标量 + `\``
 * （YAML 双引号里的非法转义），正则看着完全正常，CI 的 `mkdocs build --strict` 直接红。
 * 所以这里补上同一道严格解析，把本地绿灯和 Pages 构建对齐。 */
test('every blog post front matter parses as strict YAML (the mkdocs --strict gate)', () => {
  const failures = [];
  const posts = fs.readdirSync(path.join(rootDir, 'blog-site'))
    .filter((name) => name.endsWith('.md') && name !== 'index.md')
    .sort();

  /* 中文注释：先自证解析器是严的——若哪天换成宽松实现，这条守卫必须立刻失效可见。
   * 反斜杠用 String.fromCharCode(92) 拼：Write-Through 工具会把字面里的 `\` 当转义序列吃掉，
   * 拼出来的才是真正会弄坏 mkdocs 的那个字节。 */
  const invalidEscape = 'description: "backslash-then-backtick: x' + String.fromCharCode(92) + '`y"';
  assert.throws(
    () => YAML.parse(invalidEscape),
    undefined,
    'strict YAML parser must reject an invalid double-quoted escape'
  );

  for (const name of posts) {
    const markdown = read(path.posix.join('blog-site', name)).replace(/\r\n/g, '\n');
    const match = markdown.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
    if (!match) { failures.push(`${name}: no front matter block`); continue; }
    let data;
    try {
      data = YAML.parse(match[1]);
    } catch (error) {
      failures.push(`${name}: ${String(error.message).split('\n')[0]}`);
      continue;
    }
    if (!data || typeof data !== 'object') { failures.push(`${name}: front matter is not a mapping`); continue; }
    if (!data.title) failures.push(`${name}: missing title`);
    if (!data.description) failures.push(`${name}: missing description`);
    if (!data.date && !data.publish_date) failures.push(`${name}: missing date/publish_date`);
  }

  assert.deepEqual(failures, [], `blog-site front matter must survive `+"`mkdocs build --strict`:\n" + failures.join('\n'));
});
