// Pure judgement tests for the Pi models.json compat audit (work-1 of
// docs/plans/2026-10-23-pi-compat-self-heal-dependency-graph.md). The writer tests (A1-1..A1-6)
// land in this file too once the write path exists; nothing here touches a real user file.
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  auditPiCompat,
  findDeveloperRoleCompatGaps,
  readPiModelsConfig,
  resolvePiModelsJsonPath,
} from '../../../lib/tooling/components/integrations/pi/compat-self-heal.mjs';

function relay(models, extra = {}) {
  return { providers: { testrelay: { baseUrl: 'https://relay.example.test:8443/v1', api: 'openai-completions', models, ...extra } } };
}

test('compat audit names reasoning models whose relay never declared the developer role', () => {
  const gaps = findDeveloperRoleCompatGaps({
    modelsConfig: relay([
      { id: 'r-flash', reasoning: true },
      { id: 'r-max', reasoning: true },
      { id: 'r-plain', reasoning: false },
    ]),
  });
  assert.deepEqual(gaps, ['testrelay/r-flash', 'testrelay/r-max']);
});

test('compat audit accepts a declaration at model level or provider level', () => {
  assert.deepEqual(findDeveloperRoleCompatGaps({
    modelsConfig: relay([{ id: 'a', reasoning: true, compat: { supportsDeveloperRole: false } }]),
  }), []);
  assert.deepEqual(findDeveloperRoleCompatGaps({
    modelsConfig: relay([{ id: 'a', reasoning: true }], { compat: { supportsDeveloperRole: false } }),
  }), []);
  // A declaration of true is still a declaration: the user chose it, nothing is missing.
  assert.deepEqual(findDeveloperRoleCompatGaps({
    modelsConfig: relay([{ id: 'a', reasoning: true, compat: { supportsDeveloperRole: true } }]),
  }), []);
});

test('compat audit leaves hosts alone that support the role or already default to false', () => {
  const cases = {
    openai: { baseUrl: 'https://api.openai.com/v1', api: 'openai-completions', models: [{ id: 'gpt', reasoning: true }] },
    azure: { baseUrl: 'https://thing.openai.azure.com/v1', api: 'openai-completions', models: [{ id: 'gpt', reasoning: true }] },
    deepseek: { baseUrl: 'https://api.deepseek.com/v1', api: 'openai-completions', models: [{ id: 'd', reasoning: true }] },
    opencode: { baseUrl: 'https://opencode.ai/v1', api: 'openai-completions', models: [{ id: 'o', reasoning: true }] },
    moonshot: { baseUrl: 'https://api.moonshot.cn/v1', api: 'openai-completions', models: [{ id: 'm', reasoning: true }] },
    // Only the openai-completions role rule is in scope here.
    anthropicApi: { baseUrl: 'https://relay.example.test:8443/v1', api: 'anthropic-messages', models: [{ id: 'c', reasoning: true }] },
    noBaseUrl: { api: 'openai-completions', models: [{ id: 'x', reasoning: true }] },
  };
  for (const [id, provider] of Object.entries(cases)) {
    assert.deepEqual(findDeveloperRoleCompatGaps({ modelsConfig: { providers: { [id]: provider } } }), [], id);
  }
});

test('compat audit ignores a config without providers or with a provider list', () => {
  assert.deepEqual(findDeveloperRoleCompatGaps({ modelsConfig: {} }), []);
  assert.deepEqual(findDeveloperRoleCompatGaps({ modelsConfig: { providers: [] } }), []);
  assert.deepEqual(findDeveloperRoleCompatGaps({ modelsConfig: { providers: null } }), []);
  assert.deepEqual(findDeveloperRoleCompatGaps({}), []);
});

test('compat audit resolves models.json inside the pi home and reads it without writing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-pi-compat-read-'));
  try {
    assert.equal(resolvePiModelsJsonPath(dir), path.join(dir, 'models.json'));
    const missing = await auditPiCompat({ modelsJsonPath: resolvePiModelsJsonPath(dir) });
    assert.deepEqual(missing, { gaps: [], warnings: 0, errors: 0 });

    await fs.writeFile(
      resolvePiModelsJsonPath(dir),
      JSON.stringify(relay([{ id: 'r-flash', reasoning: true }]), null, 2),
      'utf8',
    );
    const before = await fs.readFile(resolvePiModelsJsonPath(dir), 'utf8');
    const logs = [];
    const found = await auditPiCompat({ modelsJsonPath: resolvePiModelsJsonPath(dir), io: { log: (line) => logs.push(line) } });
    assert.deepEqual(found.gaps, ['testrelay/r-flash']);
    assert.equal(found.warnings, 1);
    assert.equal(found.errors, 0);
    assert.equal(logs.some((line) => /--pi-compat-self-heal/u.test(line)), true);
    assert.equal(await fs.readFile(resolvePiModelsJsonPath(dir), 'utf8'), before, 'the audit must not write');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('compat audit fails closed on malformed models.json and rewrites nothing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-pi-compat-bad-'));
  try {
    const modelsJsonPath = resolvePiModelsJsonPath(dir);
    await fs.writeFile(modelsJsonPath, '{not json', 'utf8');
    const logs = [];
    const result = await auditPiCompat({ modelsJsonPath, io: { log: (line) => logs.push(line) } });
    assert.deepEqual(result.gaps, []);
    assert.equal(result.errors, 1);
    assert.match(logs.join('\n'), /never rewrites it automatically/u);
    assert.equal(await fs.readFile(modelsJsonPath, 'utf8'), '{not json');
    assert.throws(() => readPiModelsConfig(modelsJsonPath), /refusing to clobber/u);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
