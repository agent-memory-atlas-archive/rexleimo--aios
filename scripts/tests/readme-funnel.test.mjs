// README 是两个站点在 GitHub 上唯一的引流面，所以它的结构必须可核验，而不是靠人记得。
//
// 事实前提（实测 github.com/rexleimo/aios 的渲染 HTML）：
//   - README 里所有站外链接都带 rel="nofollow" → 传不了 PageRank；
//   - 徽章是图片链接，Google 看到的锚文本就是 alt → alt 写 "Docs" 等于放弃锚文本；
//   - GitHub 仓库只有 1 个 homepage 槽位，已被 cli.rexai.top 占用 → rexai.top 只能靠
//     README 正文承重。
// 所以这里守的是**文本锚定**：品牌锚文本 + 域名同现 + 首屏位置，全是客观字符串检查。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const README_FILES = ['README.md', 'README-zh.md'];
const SITES = ['cli.rexai.top', 'rexai.top'];

async function readReadme(name) {
  return readFile(path.join(rootDir, name), 'utf8');
}

test('both sites are named in the first screen of every README', async () => {
  for (const name of README_FILES) {
    const lines = (await readReadme(name)).split('\n').slice(0, 20).join('\n');
    for (const site of SITES) {
      assert.ok(lines.includes(`https://${site}`), `${name}: https://${site} must be linked above the fold`);
    }
  }
});

test('every badge alt text names the domain it points to', async () => {
  for (const name of README_FILES) {
    const badges = (await readReadme(name)).match(/^\[!\[([^\]]*)\]\([^)]*\)\]\((https:\/\/(?:cli\.)?rexai\.top[^)\s]*)\)/gmu) || [];
    assert.ok(badges.length >= 2, `${name}: expected site badges in the badge row`);
    for (const badge of badges) {
      const alt = badge.match(/^\[!\[([^\]]*)\]/u)?.[1] || '';
      const target = badge.match(/\((https:\/\/[^)\s]+)\)$/u)?.[1] || '';
      const domain = target.replace('https://', '').split('/')[0];
      assert.ok(alt.includes(domain), `${name}: badge alt "${alt}" must carry the domain ${domain} (alt is the anchor text Google reads for image links)`);
    }
  }
});

test('both READMEs declare the sites as the project official properties', async () => {
  const declarations = {
    'README.md': 'Official properties of this project',
    'README-zh.md': '本项目的官方站点',
  };
  for (const [name, marker] of Object.entries(declarations)) {
    const text = await readReadme(name);
    assert.ok(text.includes(marker), `${name}: missing the official-properties declaration line`);
    const declaration = text.slice(text.indexOf(marker), text.indexOf(marker) + 900);
    for (const site of SITES) {
      assert.ok(declaration.includes(site), `${name}: the declaration must name ${site}`);
    }
  }
});

test('the post-install funnel links both sites with brand anchor text', async () => {
  const brandAnchor = {
    'README.md': ['AIOS Docs', 'AIOS Release Blog', 'RexAI Content Hub'],
    'README-zh.md': ['AIOS 文档站', 'AIOS 发布博客', 'RexAI 内容站'],
  };
  for (const [name, anchors] of Object.entries(brandAnchor)) {
    const text = await readReadme(name);
    const section = name === 'README.md' ? '## Where to go next' : '## 下一步去哪儿';
    assert.ok(text.includes(section), `${name}: missing ${section}`);
    const body = text.slice(text.indexOf(section), text.indexOf('\n## ', text.indexOf(section) + 1));
    for (const anchor of anchors) {
      assert.ok(body.includes(anchor), `${name}: funnel must use the brand anchor "${anchor}", not a bare domain`);
    }
  }
});
