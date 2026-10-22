// 中文注释：GitHub 的 releases/latest 端点按"创建时间"返回最新 release，而不是按
// semver。补发旧版本（如 v5.16.2 晚于 v5.17.0 发布）会抢占 latest，导致
// `aios update` 拉到更低版本并降级安装。本模块统一改为：列出 stable releases，
// 按 semver 取最大值，并让调用方按精确 tag 拉取资产。
import { compareSemver, parseSemver } from '../setup/update-notice.mjs';

const DEFAULT_REPO = 'rexleimo/aios';

// 中文注释：这个模块有两个事实源，不是"一个源加一个猜测"：
// 1) API 列表——能区分 draft / prerelease / security advisory；带 token 时配额 5000/h。
// 2) releases.atom 公告页——不吃 API 配额，但不区分 draft 与 prerelease，只能按 tag 形状近似。
// 配额是按出口 IP 计的：本机与别人共用出口时，60/h 的匿名配额会被别人烧光，我这里就表现为
// HTTP 403 'API rate limit exceeded'。所以顺序是：带 token 的 API → 匿名 API → feed；
// 任何一层都只按 semver 取最大值，绝不退回 GitHub 按创建时间排的 latest 指针——那个指针正是
// 本模块当初被写出来对抗的降级缺陷。
// 中文注释：真实 atom 形状是 <link href="https://github.com/OWNER/REPO/releases/tag/v6.10.0"/>，
// 不是 API 的 /repos/... 形状——按 API 形状写的正则在真的公告页上一条也匹配不到。
// 所以这里匹配公开的 tag 链接，并且只取到引号/问号/空白为止（避免把 query 当 tag）。
const FEED_TAG_PATTERN = /\/releases\/tag\/([^"'<>?\s]+)/gu;

/** feed 里没有 draft/prerelease 标记，只能按 tag 形状退回近似口径。 */
export function classifyTag(tag) {
  const clean = String(tag || '').trim();
  const version = clean.replace(/^v/u, '').trim();
  if (!version || !parseSemver(version)) return null;
  return {
    tag: clean,
    version,
    prerelease: version.includes('-'),
    security: false,
    exact: true,
  };
}

export function parseReleasesFeed(text) {
  const releases = [];
  const seen = new Set();
  for (const match of String(text || '').matchAll(FEED_TAG_PATTERN)) {
    const classified = classifyTag(match[1]);
    if (classified && !seen.has(classified.tag)) {
      seen.add(classified.tag);
      releases.push(classified);
    }
  }
  return releases;
}

/**
 * 读取发布查询 token：只看调用方给的环境变量；`gh auth token` 仅在注入 execImpl 时尝试。
 * 中文注释：不写文件、不改配置——凭据是别人的事，这里只是能用就用。
 */
export function resolveReleaseToken({ env = process.env, execImpl = null } = {}) {
  for (const key of ['AIOS_RELEASE_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN']) {
    const value = env[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  if (typeof execImpl !== 'function') return null;
  try {
const value = String(execImpl('gh', ['auth', 'token']) ?? '').trim();
    return value || null;
  } catch {
    return null;
  }
}

/**
 * Fetch non-draft, non-prerelease releases for a repo.
 *
 * @param {Object} [options]
 * @param {string} [options.repo] - GitHub "owner/repo"
 * @param {Function} [options.fetchImpl] - injectable fetch
 * @param {number} [options.perPage]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<Array<{tag: string, version: string, security: boolean}>>}
 */
export async function fetchStableReleases({
  repo = DEFAULT_REPO,
  fetchImpl = globalThis.fetch,
  perPage = 30,
  timeoutMs = 8000,
  token = null,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('release lookup requires fetch');
  }
  const response = await fetchImpl(
    `https://api.github.com/repos/${repo}/releases?per_page=${perPage}`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'aios-release-lookup',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  if (!response.ok) {
    // 中文注释："配额被同出口的人烧光"和"这仓库不存在/没权限"处置动作完全不同：前者换 token 或走 feed，
    // 后者重试也不会有结果。把它们混成一句 HTTP 403，调用方就只能瞎猜。
    const remaining = response.headers?.get?.('x-ratelimit-remaining');
    const rateLimited = (response.status === 403 || response.status === 429)
      && String(remaining ?? 'unset').trim() === '0'; // Number(null) 是 0：缺配额头就不能当配额证据
    throw Object.assign(
      new Error(`GitHub release lookup returned HTTP ${response.status}${rateLimited ? (' (rate limited)') : ''}`),
      {
        code: rateLimited ? 'release-lookup-rate-limited' : 'release-lookup-http',
        status: response.status,
        retryAfter: response.headers?.get?.('retry-after') ?? null,
        resetAt: response.headers?.get?.('x-ratelimit-reset') ?? null,
      },
    );
  }
  const payload = await response.json();
  if (!Array.isArray(payload)) return [];
  return payload
    .filter((release) => release && !release.draft && !release.prerelease)
    .map((release) => ({
      tag: String(release.tag_name || '').trim(),
      version: String(release.tag_name || '').replace(/^v/u, '').trim(),
      security: Boolean(release.security_advisory || release.security),
    }))
    .filter((release) => release.tag && parseSemver(release.version));
}

/**
 * Pick the highest-semver release from a release list (NOT GitHub's
 * creation-ordered "latest" pointer).
 *
 * @param {Array<{tag: string, version: string, security: boolean}>} releases
 * @returns {{tag: string, version: string, security: boolean}|null}
 */
export function pickNewestStableRelease(releases) {
  let newest = null;
  for (const release of Array.isArray(releases) ? releases : []) {
    if (!newest) {
      newest = release;
      continue;
    }
    // compareSemver(current, latest): 'major' | 'minor' | 'patch' mean latest > current.
    const cmp = compareSemver(newest.version, release.version);
    if (cmp === 'major' || cmp === 'minor' || cmp === 'patch') newest = release;
  }
  return newest;
}

/**
 * 第二事实源：atom 公告页。不区分 draft/prerelease（返回项都标 exact:false）。
 */
export async function fetchReleasesFromFeed({
  repo = DEFAULT_REPO,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('release feed lookup requires fetch');
  const response = await fetchImpl(`https://github.com/${repo}/releases.atom`, {
    headers: { 'user-agent': 'aios-release-lookup', accept: 'application/atom+xml' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw Object.assign(new Error(`GitHub release feed returned HTTP ${response.status}`),
      { code: 'release-feed-http', status: response.status });
  }
  return parseReleasesFeed(await response.text()).filter((release) => !release.prerelease);
}

/**
 * 分层解析最新发布版：API（有 token 先带 token）→ API（匿名）→ feed。
 * 三层都失败才抛结构化错误，且**永不返回猜测**：调用方拿不到 newest 时必须停下来，
 * 而不是退回按创建时间排的 latest 指针去装一个没验过版本的包。
 * @returns {Promise<{tag:string,version:string,security:boolean,source:string,exact:boolean}>}
 */
export async function resolveNewestStableRelease(options = {}) {
  const { env = process.env, execImpl = null, token = undefined, feedImpl, ...apiOptions } = options;
  const attempts = [];
  const resolvedToken = token === undefined ? resolveReleaseToken({ env, execImpl }) : token;
  const passes = resolvedToken ? [resolvedToken, null] : [null];
  for (const bearer of passes) {
    try {
      const releases = await fetchStableReleases({ ...apiOptions, token: bearer });
      const newest = pickNewestStableRelease(releases);
      if (newest) {
        return { ...newest, source: bearer ? 'api-authenticated' : 'api-anonymous', exact: true };
      }
      attempts.push('api: no stable releases listed');
    } catch (error) {
      attempts.push(`${error.code ?? 'api'}: ${error.message}`);
    }
  }
  try {
    const releases = await fetchReleasesFromFeed({ ...apiOptions, fetchImpl: feedImpl ?? apiOptions.fetchImpl });
    const newest = pickNewestStableRelease(releases);
    if (newest) {
      return { ...newest, source: 'feed', exact: false };
    }
    attempts.push('feed: no semver tags parsed');
  } catch (error) {
    attempts.push(`${error.code ?? 'feed'}: ${error.message}`);
  }
  throw Object.assign(
    new Error('release resolution failed for ' + (options.repo ?? DEFAULT_REPO) + ': ' + attempts.join(' | ')),
    { code: 'release-source-unreachable', attempts },
  );
}
