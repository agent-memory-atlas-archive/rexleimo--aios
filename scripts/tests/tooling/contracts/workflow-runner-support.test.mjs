import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import YAML from 'yaml';

// 中文注释：这组守卫的存在理由是一次真实发版失败——release run 39561039120 卡在
// `Verify local browser MCP install path`，日志是
// `ERROR: Playwright does not support chromium on ubuntu26.04-x64`：GitHub 把
// `ubuntu-latest` 抬到了 26.04，而 Playwright 1.58.2 的 chromium 支持表只到
// ubuntu24.04-x64。所以「谁来跑」是契约而不是风格：浮动镜像标签会让发版
// 无论重试多少次都不绿。纯检查函数留在本文件里——它没有运行期消费者。

const PLAYWRIGHT_SUPPORTED_UBUNTU = Object.freeze(['ubuntu-20.04', 'ubuntu-22.04', 'ubuntu-24.04']);
const WORKFLOWS = ['release.yml', 'ci-main.yml', 'contextdb-quality.yml'];

function runnerImages(job) {
  const runsOn = typeof job?.['runs-on'] === 'string' ? job['runs-on'] : '';
  const matrixRef = /^\$\{\{\s*matrix\.(\w+)\s*\}\}$/u.exec(runsOn);
  if (matrixRef) {
    const values = job?.strategy?.matrix?.[matrixRef[1]];
    return Array.isArray(values) ? values.map(String) : [];
  }
  return runsOn ? [runsOn] : [];
}

function installsChromium(job) {
  const steps = Array.isArray(job?.steps) ? job.steps : [];
  return steps.some((step) => typeof step?.run === 'string' && /playwright\s+install/u.test(step.run));
}

/**
 * Report CI jobs that install Chromium on an Ubuntu runner Playwright cannot serve.
 *
 * @param {Object} doc parsed workflow document
 * @param {string[]} [supported] pinned ubuntu images inside Playwright's support table
 * @returns {Array<{job: string, image: string, reason: string}>}
 */
export function chromiumRunnerIssues(doc, { supported = PLAYWRIGHT_SUPPORTED_UBUNTU } = {}) {
  const issues = [];
  for (const [jobId, job] of Object.entries(doc?.jobs || {})) {
    if (!installsChromium(job)) continue;
    for (const image of runnerImages(job)) {
      if (!image.startsWith('ubuntu')) continue;
      if (/latest/u.test(image)) {
        issues.push({ job: jobId, image, reason: 'floating ubuntu tag: Playwright support is versioned, pin the image' });
        continue;
      }
      if (!supported.includes(image)) {
        issues.push({ job: jobId, image, reason: 'outside the Playwright chromium support list' });
      }
    }
  }
  return issues;
}

test('every chromium-installing CI job pins an Ubuntu image Playwright supports', async () => {
  for (const file of WORKFLOWS) {
    const raw = await readFile(path.join('.github', 'workflows', file), 'utf8');
    assert.deepEqual(
      chromiumRunnerIssues(YAML.parse(raw)),
      [],
      `${file} schedules a playwright install on an unsupported ubuntu runner`,
    );
  }
});

test('the support set is pinned versions, never a floating tag', () => {
  assert.equal(PLAYWRIGHT_SUPPORTED_UBUNTU.includes('ubuntu-24.04'), true);
  assert.equal(PLAYWRIGHT_SUPPORTED_UBUNTU.some((image) => /latest/u.test(image)), false);
});

test('a floating ubuntu-latest that installs chromium is flagged', () => {
  const doc = {
    jobs: {
      quality: {
        'runs-on': 'ubuntu-latest',
        steps: [{ run: 'npx playwright install --with-deps chromium' }],
      },
    },
  };
  const issues = chromiumRunnerIssues(doc);
  assert.equal(issues.length, 1);
  assert.match(issues[0].reason, /floating/u);
});

test('matrix os values are followed, and non-Ubuntu runners are left alone', () => {
  const doc = {
    jobs: {
      quality: {
        'runs-on': '${{ matrix.os }}',
        strategy: { matrix: { os: ['ubuntu-latest', 'macos-latest', 'windows-latest'] } },
        steps: [{ run: 'playwright install chromium' }],
      },
    },
  };
  assert.deepEqual(chromiumRunnerIssues(doc).map((issue) => issue.image), ['ubuntu-latest']);
});

test('a pinned image outside the support list is flagged', () => {
  const doc = {
    jobs: {
      quality: {
        'runs-on': 'ubuntu-26.04',
        steps: [{ run: 'npx playwright install chromium' }],
      },
    },
  };
  assert.deepEqual(chromiumRunnerIssues(doc).map((i) => i.reason), ['outside the Playwright chromium support list']);
});

test('jobs that never touch chromium may stay on the floating tag', () => {
  const doc = {
    jobs: {
      tests: {
        'runs-on': 'ubuntu-latest',
        steps: [{ run: 'npm run test:scripts' }],
      },
    },
  };
  assert.deepEqual(chromiumRunnerIssues(doc), []);
});
