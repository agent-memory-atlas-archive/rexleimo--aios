import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchStableReleases,
  pickNewestStableRelease,
  resolveNewestStableRelease,
} from '../../../lib/execution/lifecycle/release/release-lookup.mjs';

function fakeFetch(payload, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fn = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok,
      status,
      json: async () => payload,
    };
  };
  fn.calls = calls;
  return fn;
}

const RELEASE = (tag, extra = {}) => ({ tag_name: tag, draft: false, prerelease: false, ...extra });

test('pickNewestStableRelease: picks max semver, not creation order', () => {
  // GitHub 返回顺序按创建时间：v5.16.2 晚建排在前，但 v5.17.0 才是最新稳定版。
  const releases = [
    { tag: 'v5.16.2', version: '5.16.2', security: false },
    { tag: 'v5.17.0', version: '5.17.0', security: false },
    { tag: 'v5.15.0', version: '5.15.0', security: false },
  ];
  assert.equal(pickNewestStableRelease(releases).tag, 'v5.17.0');
});

test('pickNewestStableRelease: handles major/minor and empty lists', () => {
  const releases = [
    { tag: 'v5.17.0', version: '5.17.0' },
    { tag: 'v10.0.0', version: '10.0.0' },
    { tag: 'v5.9.0', version: '5.9.0' },
  ];
  assert.equal(pickNewestStableRelease(releases).tag, 'v10.0.0');
  assert.equal(pickNewestStableRelease([]), null);
  assert.equal(pickNewestStableRelease(undefined), null);
});

test('fetchStableReleases: filters drafts, prereleases, and non-semver tags', async () => {
  const fetchImpl = fakeFetch([
    RELEASE('v5.16.2'),
    RELEASE('v5.17.0'),
    { tag_name: 'v5.18.0-beta.1', draft: false, prerelease: true },
    { tag_name: 'v5.19.0', draft: true, prerelease: false },
    RELEASE('not-a-version'),
  ]);
  const releases = await fetchStableReleases({ repo: 'rexleimo/aios', fetchImpl });
  assert.deepEqual(releases.map((r) => r.tag), ['v5.16.2', 'v5.17.0']);
  assert.equal(fetchImpl.calls[0].url.includes('/releases?per_page=30'), true);
});

test('fetchStableReleases: propagates HTTP failures', async () => {
  const fetchImpl = fakeFetch([], { ok: false, status: 403 });
  await assert.rejects(
    () => fetchStableReleases({ fetchImpl }),
    /GitHub release lookup returned HTTP 403/u,
  );
});

test('resolveNewestStableRelease: end-to-end selection from API payload', async () => {
  const fetchImpl = fakeFetch([
    RELEASE('v5.16.2', { created_at: '2026-09-18T01:38:47Z' }),
    RELEASE('v5.17.0', { created_at: '2026-09-18T00:26:06Z' }),
    RELEASE('v5.15.0'),
  ]);
  const newest = await resolveNewestStableRelease({ fetchImpl });
  assert.equal(newest.tag, 'v5.17.0');
  assert.equal(newest.version, '5.17.0');
});

// 中文注释：本机实测踩到的是"匿名配额被同出口的人烧光"（x-ratelimit-remaining: 0 → HTTP 403）。
// 这一组测的就是那条形途：能带 token 就带，带不了也不能退回按创建时间排的 latest 指针。
function fakeResponses(byHost, { headersFor = () => null } = {}) {
  const calls = [];
  const fn = async (url, options = {}) => {
    calls.push({ url, options });
    const spec = Object.entries(byHost).find(([needle]) => url.includes(needle))?.[1];
    if (!spec) throw new Error(`unstubbed url: ${url}`);
    return {
      ok: spec.ok ?? true,
      status: spec.status ?? 200,
      headers: { get: (name) => headersFor(name) },
      json: async () => spec.json ?? [],
      text: async () => spec.text ?? '',
    };
  };
  fn.calls = calls;
  return fn;
}

const ATOM_SAMPLE = [
  '<feed><entry>',
  '<id>tag:github.com,2008:Repository/1169747154/v6.10.0</id>',
  '<link rel="alternate" type="text/html" href="https://github.com/rexleimo/aios/releases/tag/v6.10.0"/>',
  '<title>v6.10.0</title></entry><entry>',
  '<link href="https://github.com/rexleimo/aios/releases/tag/v6.9.0"/>',
  '<title>v6.9.0</title></entry><entry>',
  '<link href="https://github.com/rexleimo/aios/releases/tag/v7.0.0-beta.1"/>',
  '<title>v7.0.0-beta.1</title></entry></feed>',
].join('');

test('the feed parser reads the real atom shape, not the API url shape', async () => {
  const { parseReleasesFeed } = await import('../../../lib/execution/lifecycle/release/release-lookup.mjs');
  const releases = parseReleasesFeed(ATOM_SAMPLE);
  assert.deepEqual(releases.map((r) => r.tag), ['v6.10.0', 'v6.9.0', 'v7.0.0-beta.1'],
    '公告页里 prerelease 也在列；是否算稳定版由 classifyTag 判断，不在解析阶段丢信息');
  assert.equal(releases.find((r) => r.tag === 'v7.0.0-beta.1').prerelease, true);
  assert.deepEqual(parseReleasesFeed('<link href="https://x/releases/tag/not-a-version"/>'), [],
    '非 semver 的 tag 不进结果：宁缺勿猜');
});

test('a rate-limited API answer is classified as rate-limited, not flattened into a generic HTTP failure', async () => {
  const fetchImpl = fakeResponses({ 'api.github.com': { ok: false, status: 403 } },
    { headersFor: (name) => (name === 'x-ratelimit-remaining' ? '0' : null) });
  await assert.rejects(fetchStableReleases({ fetchImpl }), (error) => error.code === 'release-lookup-rate-limited'
    && error.status === 403);

  const forbidden = fakeResponses({ 'api.github.com': { ok: false, status: 403 } });
  await assert.rejects(fetchStableReleases({ fetchImpl: forbidden }), (error) => error.code === 'release-lookup-http',
    '没有配额头就是"权限/不存在"这一类，重试或换 feed 都不会有结果');
});

test('a token from the environment is sent as a bearer header', async () => {
  const fetchImpl = fakeResponses({ 'api.github.com': { json: [RELEASE('v6.10.0')] } });
  const newest = await resolveNewestStableRelease({ fetchImpl, env: { GH_TOKEN: 'tok-123' } });
  assert.equal(newest.source, 'api-authenticated');
  assert.equal(newest.exact, true);
  assert.equal(fetchImpl.calls[0].options.headers.authorization, 'Bearer tok-123');
});

test('resolveReleaseToken prefers an explicit env token and treats a missing gh CLI as no token', async () => {
  const { resolveReleaseToken } = await import('../../../lib/execution/lifecycle/release/release-lookup.mjs');
  assert.equal(resolveReleaseToken({ env: { AIOS_RELEASE_TOKEN: 'a', GITHUB_TOKEN: 'b' } }), 'a',
    'AIOS 自己的变量优先：全局 GITHUB_TOKEN 可能是别的仓库的权限');
  assert.equal(resolveReleaseToken({ env: {} }), null, '没有 gh CLI 注入时不猜测凭据');
  assert.equal(resolveReleaseToken({ env: {}, execImpl: () => { throw new Error('gh not installed'); } }), null);
  assert.equal(resolveReleaseToken({ env: {}, execImpl: () => 'gh-token\n' }), 'gh-token');
});

test('when the API is rate limited, resolution still picks semver max from the feed', async () => {
  const fetchImpl = fakeResponses({
    'api.github.com': { ok: false, status: 403 },
    'releases.atom': { text: ATOM_SAMPLE },
  }, { headersFor: (name) => (name === 'x-ratelimit-remaining' ? '0' : null) });
  const newest = await resolveNewestStableRelease({ fetchImpl, env: {} });
  assert.equal(newest.source, 'feed');
  assert.equal(newest.tag, 'v6.10.0', 'feed 顺序不可信：这里必须是 semver 最大值');
  assert.equal(newest.exact, false,
    '公告页分不清 draft/prerelease，必须把近似性带出去，不能让下游当精确事实用');
  assert.equal(fetchImpl.calls[0].url.includes('api.github.com'), true, '先试 API，feed 是第二源');
});

test('a back-dated older release cannot win on the feed path either', async () => {
  // 中文注释：本模块存在的理由就是"补发旧版本抢占 latest"。退回 feed 时同样不能被创建顺序骗了。
  const fetchImpl = fakeResponses({
    'api.github.com': { ok: false, status: 403 },
    'releases.atom': { text: '<link href="https://x/releases/tag/v6.9.0"/><link href="https://x/releases/tag/v6.10.0"/>' },
  }, { headersFor: (name) => (name === 'x-ratelimit-remaining' ? '0' : null) });
  const newest = await resolveNewestStableRelease({ fetchImpl, env: {} });
  assert.equal(newest.tag, 'v6.10.0');
});

test('when both sources fail, resolution refuses instead of handing back a guess', async () => {
  const fetchImpl = fakeResponses({
    'api.github.com': { ok: false, status: 403 },
    'releases.atom': { ok: false, status: 500 },
  }, { headersFor: (name) => (name === 'x-ratelimit-remaining' ? '0' : null) });
  await assert.rejects(resolveNewestStableRelease({ fetchImpl, env: {} }), (error) => {
    assert.equal(error.code, 'release-source-unreachable');
    assert.ok(error.attempts.length >= 2, `两个源都失败就必须把两次尝试都交出去：${JSON.stringify(error.attempts)}`);
    return true;
  });
});
