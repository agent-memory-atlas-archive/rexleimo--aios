import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  installExternalSkills,
  isGitSource,
  resolveExternalSkillSource,
  resolveSkillName,
} from '../../../../lib/tooling/components/skills/external/index.mjs';
import { INSTALLED_SKILL_META_FILE } from '../../../../lib/tooling/skills/install/install-metadata.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function makeIo() {
  const lines = [];
  return {
    lines,
    log: (line) => lines.push(String(line)),
  };
}

async function writeSkill(skillDir, { name = '', body = 'does things' } = {}) {
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, 'SKILL.md'),
    `---\n${name ? `name: ${name}\n` : ''}description: test skill\n---\n\n# Test\n\n${body}\n`,
  );
}

function fakeEnv(root) {
  return { AIOS_HOME: path.join(root, 'aios-home') };
}

// 每个客户端的家目录都重定向进临时根，registry 走 AIOS_HOME。
function fakeHomeMap(root) {
  return {
    codex: path.join(root, 'codex-home'),
    claude: path.join(root, 'claude-home'),
    pi: path.join(root, 'pi-home'),
  };
}

const TEST_CLIENTS = 'codex,claude,pi';

function clientSkillRoot(root, client) {
  return path.join(root, `${client}-home`, 'skills');
}

// ---------------------------------------------------------------------------
// source classification
// ---------------------------------------------------------------------------

test('isGitSource accepts URLs, .git suffix, and owner/repo shorthand', () => {
  assert.equal(isGitSource('https://github.com/a/b'), true);
  assert.equal(isGitSource('git@host:x/y.git'.replace('git@host:', 'https://host/')), true);
  assert.equal(isGitSource('a/b.git'), true);
  assert.equal(isGitSource('a/b'), true);
  assert.equal(isGitSource('/local/path'), false);
  assert.equal(isGitSource(''), false);
});

test('resolveExternalSkillSource classifies single-skill and multi-skill roots', async () => {
  const root = await makeTemp('aios-ext-src-');
  const singleDir = path.join(root, 'lonely');
  await writeSkill(singleDir, { name: 'lonely-skill' });

  const single = resolveExternalSkillSource(singleDir, { env: {} });
  assert.equal(single.kind, 'single');
  assert.deepEqual(single.skills.map((s) => s.name), ['lonely-skill']);

  const multiDir = path.join(root, 'pack');
  await writeSkill(path.join(multiDir, 'beta'), { name: 'beta-skill' });
  await writeSkill(path.join(multiDir, 'alpha'), { name: 'alpha-skill' });

  const multi = resolveExternalSkillSource(multiDir, { env: {} });
  assert.equal(multi.kind, 'multi');
  assert.deepEqual(multi.skills.map((s) => s.name), ['alpha-skill', 'beta-skill']);

  const emptyDir = path.join(root, 'empty');
  await mkdir(emptyDir, { recursive: true });
  assert.throws(() => resolveExternalSkillSource(emptyDir, { env: {} }), /no SKILL\.md/);
  assert.throws(() => resolveExternalSkillSource(path.join(root, 'missing-dir'), { env: {} }), /not found/);
});

test('resolveSkillName rejects traversal and unsafe names', async () => {
  const root = await makeTemp('aios-ext-name-');
  const evil = path.join(root, 'evil');
  await writeSkill(evil, { name: '../../etc' });
  assert.throws(() => resolveSkillName(evil), /unsafe name/);
});

// ---------------------------------------------------------------------------
// installExternalSkills
// ---------------------------------------------------------------------------

test('single local skill installs into registry and every client global root, idempotently', async () => {
  const root = await makeTemp('aios-ext-install-');
  const source = path.join(root, 'src', 'clone-website');
  await writeSkill(source, { name: 'clone-website' });
  const io = makeIo();

  const first = await installExternalSkills({
    source,
    client: TEST_CLIENTS,
    homeMap: fakeHomeMap(root),
    env: fakeEnv(root),
    io,
  });

  assert.equal(first.exitCode, 0);
  assert.equal(first.installed, 4); // 1 注册处 + 3 客户端
  for (const client of TEST_CLIENTS.split(',')) {
    const target = path.join(clientSkillRoot(root, client), 'clone-website');
    assert.ok(fs.existsSync(path.join(target, 'SKILL.md')), `${client} should get SKILL.md`);
    const meta = JSON.parse(await readFile(path.join(target, INSTALLED_SKILL_META_FILE), 'utf8'));
    assert.equal(meta.managedBy, 'aios');
    assert.equal(meta.kind, 'installed-skill');
    assert.equal(meta.client, client);
    assert.equal(meta.scope, 'global');
    assert.equal(meta.catalogSource, first.registryRoot && path.join(first.registryRoot, 'clone-website'));
  }
  const registryMeta = JSON.parse(await readFile(
    path.join(first.registryRoot, 'clone-website', INSTALLED_SKILL_META_FILE),
    'utf8',
  ));
  assert.equal(registryMeta.client, 'registry');
  assert.equal(registryMeta.scope, 'external');

  const second = await installExternalSkills({
    source,
    client: TEST_CLIENTS,
    homeMap: fakeHomeMap(root),
    env: fakeEnv(root),
    io,
  });
  assert.equal(second.installed, 0);
  assert.equal(second.reused, 4);
  assert.equal(second.replaced, 0);
});

test('multi-skill source requires explicit selection outside a TTY and honors --skill picking', async () => {
  const root = await makeTemp('aios-ext-multi-');
  const source = path.join(root, 'pack');
  await writeSkill(path.join(source, 'alpha'), { name: 'alpha-skill' });
  await writeSkill(path.join(source, 'beta'), { name: 'beta-skill' });
  const homeMap = fakeHomeMap(root);
  const env = fakeEnv(root);

  await assert.rejects(
    installExternalSkills({ source, client: TEST_CLIENTS, homeMap, env, io: makeIo() }),
    /pass --skill <names>/,
  );

  const picked = await installExternalSkills({
    source,
    client: TEST_CLIENTS,
    selectedSkills: ['alpha-skill'],
    homeMap,
    env,
    io: makeIo(),
  });
  assert.equal(picked.installed, 4);
  assert.ok(fs.existsSync(path.join(clientSkillRoot(root, 'codex'), 'alpha-skill', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(clientSkillRoot(root, 'codex'), 'beta-skill')), 'unpicked skill must not install');

  const all = await installExternalSkills({ source, client: TEST_CLIENTS, yes: true, homeMap, env, io: makeIo() });
  assert.equal(all.reused, 4);
  assert.equal(all.installed, 4);
});

test('unmanaged client targets are skipped unless --force, managed ones refresh on content change', async () => {
  const root = await makeTemp('aios-ext-force-');
  const source = path.join(root, 'src', 'skill-a');
  await writeSkill(source, { name: 'skill-a', body: 'v1' });
  const homeMap = fakeHomeMap(root);
  const env = fakeEnv(root);

  // 客户端目录先放一个"别人家的"同名技能 → 默认不碰。
  const unmanaged = path.join(clientSkillRoot(root, 'codex'), 'skill-a');
  await mkdir(unmanaged, { recursive: true });
  await writeFile(path.join(unmanaged, 'SKILL.md'), 'user made this\n');

  const blocked = await installExternalSkills({ source, client: TEST_CLIENTS, homeMap, env, io: makeIo() });
  assert.equal(blocked.skipped, 1);
  assert.equal(blocked.installed, 3);
  assert.equal(await readFile(path.join(unmanaged, 'SKILL.md'), 'utf8'), 'user made this\n');

  const forced = await installExternalSkills({ source, client: TEST_CLIENTS, force: true, homeMap, env, io: makeIo() });
  // --force 只强制接管 unmanaged 目录（codex）；注册处与已管理的 claude/pi 内容相同 → reuse。
  assert.equal(forced.replaced, 1);
  assert.equal(forced.reused, 3);
  assert.match(await readFile(path.join(unmanaged, 'SKILL.md'), 'utf8'), /v1/);

  // 来源更新 → 注册处刷新 → 已管理的客户端副本跟着 replaced。
  await writeSkill(source, { name: 'skill-a', body: 'v2' });
  const refreshed = await installExternalSkills({ source, client: TEST_CLIENTS, homeMap, env, io: makeIo() });
  assert.equal(refreshed.replaced, 4);
  const distributed = await readFile(path.join(clientSkillRoot(root, 'pi'), 'skill-a', 'SKILL.md'), 'utf8');
  assert.match(distributed, /v2/);
});

test('json output reports per-client statuses', async () => {
  const root = await makeTemp('aios-ext-json-');
  const source = path.join(root, 'src', 'json-skill');
  await writeSkill(source, { name: 'json-skill' });

  let jsonText = '';
  await installExternalSkills({
    source,
    client: 'codex,pi',
    homeMap: fakeHomeMap(root),
    env: fakeEnv(root),
    json: true,
    io: makeIo(),
    stdout: { write: (s) => { jsonText += String(s); } },
  });

  const payload = JSON.parse(jsonText);
  assert.equal(payload.ok, true);
  assert.equal(payload.installed, 3); // 1 注册处 + 2 客户端
  assert.equal(payload.skills[0].name, 'json-skill');
  assert.equal(payload.skills[0].clients.codex, 'installed');
  assert.equal(payload.skills[0].clients.pi, 'installed');
});
