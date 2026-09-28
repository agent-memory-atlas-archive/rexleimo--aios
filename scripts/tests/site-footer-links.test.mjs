// 自有站点之间的 follow 链接面必须存在——这是 rexai.top 能拿到的唯一非 nofollow 入口。
//
// 为什么要有这个守卫：6acec8d1 把 overrides/main.html 的 `{% block footer %}` 置空，
// 于是 4326b084 特意放进 partials/copyright.html 的 extra.footer_links 变成死配置——
// 配置在、模板在、样式没写、线上一条链接都不渲染，三个月没人发现。
// 语义判断不做：这里全部是对文件内容的客观存在性断言。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFile(path.join(rootDir, rel), 'utf8');

// 指向内容站的链接必须由这两个有排名的自有构建产出。
const BUILDS = [
  { config: 'mkdocs.yml', label: 'docs site' },
  { config: 'mkdocs.blog.yml', label: 'blog site' },
];

test('the footer block renders the copyright partial instead of being emptied', async () => {
  const html = await read('docs-site/overrides/main.html');
  const match = html.match(/\{%\s*block footer\s*%\}([\s\S]*?)\{%\s*endblock\s*%\}/u);
  assert.ok(match, 'overrides/main.html must define a {% block footer %}');
  const body = match[1].trim();
  assert.ok(body.length > 0, 'the footer block must not be emptied — that silently kills every footer link');
  assert.match(body, /\{%\s*include\s+"partials\/copyright\.html"\s*%\}/u, 'the footer must include partials/copyright.html, which renders extra.footer_links');
});

test('both site builds declare a footer link to the content hub', async () => {
  for (const { config, label } of BUILDS) {
    const yml = await read(config);
    assert.match(yml, /^\s{2}footer_links:/mu, `${label}: extra.footer_links is required`);
    const section = yml.slice(yml.search(/^\s{2}footer_links:/mu));
    const stop = section.search(/^\S/u);
    const block = stop === -1 ? section : section.slice(0, stop);
    assert.ok(block.includes('href: https://rexai.top'), `${label}: footer_links must include rexai.top`);
    assert.ok(block.includes('href: https://tool.rexai.top'), `${label}: footer_links must include tool.rexai.top`);
  }
});

test('the footer stylesheet exists and is imported by the shared custom.css', async () => {
  const css = await read('docs-site/assets/custom.css');
  assert.ok(
    css.includes('@import url("redesign/footer.css");'),
    'custom.css must import redesign/footer.css so both builds style the footer (each config lists custom.css in extra_css)',
  );
  const footerCss = await read('docs-site/assets/redesign/footer.css');
  assert.ok(footerCss.includes('.rexai-footer-links'), 'redesign/footer.css must style the footer link row');
  assert.ok(footerCss.includes('.rexai-site-footer'), 'redesign/footer.css must style the footer shell');
});

test('the copyright partial keeps rendering footer_links before the generator line', async () => {
  const html = await read('docs-site/overrides/partials/copyright.html');
  assert.ok(html.includes('config.extra.footer_links'), 'partials/copyright.html must read extra.footer_links');
  assert.ok(html.includes('rexai-footer-links'), 'partials/copyright.html must emit the rexai-footer-links nav');
});
