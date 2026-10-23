// Pure judgement tests for the Pi models.json compat audit (work-1 of
// docs/plans/2026-10-23-pi-compat-self-heal-dependency-graph.md). The writer tests (A1-1..A1-6)
// land in this file too once the write path exists; nothing here touches a real user file.
// Writer tests load the entry dynamically: the entry does not exist yet at RED, and a static
// import would fail the whole file at link time instead of failing each writer test on its own
// behavior. REFACTOR switches this to a static import once the entry exists.
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

// --- Additive writer (work-2, contract A1-1..A1-6). ---

async function loadWriterEntry() {
  const mod = await import('../../../lib/tooling/components/integrations/pi/compat-self-heal.mjs');
  return mod.ensureDeveloperRoleCompat;
}

async function withModelsFile(prefix, configObject, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    const modelsPath = resolvePiModelsJsonPath(dir);
    if (configObject !== null) {
      await fs.writeFile(modelsPath, `${JSON.stringify(configObject, null, 2)}\n`, 'utf8');
    }
    await fn(modelsPath, dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function meqwenShaped() {
  return {
    providers: {
      testrelay: {
        name: 'Test Relay',
        baseUrl: 'https://relay.example.test:8443/v1',
        api: 'openai-completions',
        apiKey: 'xxxxccc123',
        models: [
          { id: 'r-flash', reasoning: true, contextWindow: 128000 },
          { id: 'r-plain', reasoning: false, contextWindow: 32000 },
        ],
      },
      untouched: {
        name: 'Untouched',
        baseUrl: 'https://other.example.test/v1',
        api: 'openai-completions',
        models: [{ id: 'u-one', reasoning: true, compat: { supportsDeveloperRole: false } }],
      },
    },
  };
}

test('writer adds the missing declaration and leaves every other key untouched (A1-1)', async () => {
  const ensure = await loadWriterEntry();
  assert.equal(typeof ensure, 'function', 'writer entry must exist');
  await withModelsFile('aios-pi-writer-add-', meqwenShaped(), async (modelsPath) => {
    const result = await ensure({ modelsPath });
    assert.equal(result.action, 'added');
    assert.deepEqual(result.gaps, ['testrelay/r-flash']);
    const after = JSON.parse(await fs.readFile(modelsPath, 'utf8'));
    assert.equal(after.providers.testrelay.models[0].compat.supportsDeveloperRole, false);
    assert.equal('compat' in after.providers.testrelay.models[1], false);
    assert.equal(after.providers.testrelay.apiKey, 'xxxxccc123');
    assert.deepEqual(after.providers.untouched, meqwenShaped().providers.untouched);
  });
});

test('writer keeps an explicit user true and writes nothing (A1-2)', async () => {
  const ensure = await loadWriterEntry();
  assert.equal(typeof ensure, 'function', 'writer entry must exist');
  const config = meqwenShaped();
  config.providers.testrelay.models[0].compat = { supportsDeveloperRole: true };
  await withModelsFile('aios-pi-writer-kept-', config, async (modelsPath) => {
    const before = await fs.readFile(modelsPath, 'utf8');
    const result = await ensure({ modelsPath });
    assert.equal(result.action, 'kept-user-value');
    assert.deepEqual(result.gaps, []);
    assert.equal(await fs.readFile(modelsPath, 'utf8'), before);
  });
});

test('writer dry run previews and writes nothing (A1-3)', async () => {
  const ensure = await loadWriterEntry();
  assert.equal(typeof ensure, 'function', 'writer entry must exist');
  await withModelsFile('aios-pi-writer-dry-', meqwenShaped(), async (modelsPath) => {
    const before = await fs.readFile(modelsPath, 'utf8');
    const logs = [];
    const result = await ensure({ modelsPath, dryRun: true, io: { log: (line) => logs.push(line) } });
    assert.equal(result.action, 'would-add');
    assert.deepEqual(result.gaps, ['testrelay/r-flash']);
    assert.equal(await fs.readFile(modelsPath, 'utf8'), before);
    assert.equal(logs.some((line) => /would declare/u.test(line) && /testrelay\/r-flash/u.test(line)), true);
  });
});

test('writer fails closed on malformed models.json and rewrites nothing (A1-4)', async () => {
  const ensure = await loadWriterEntry();
  assert.equal(typeof ensure, 'function', 'writer entry must exist');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-pi-writer-bad-'));
  try {
    const modelsPath = resolvePiModelsJsonPath(dir);
    await fs.writeFile(modelsPath, '{not json', 'utf8');
    await assert.rejects(() => ensure({ modelsPath }), /refusing to clobber/u);
    assert.equal(await fs.readFile(modelsPath, 'utf8'), '{not json');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('writer is idempotent when the declaration already exists (A1-5)', async () => {
  const ensure = await loadWriterEntry();
  assert.equal(typeof ensure, 'function', 'writer entry must exist');
  await withModelsFile('aios-pi-writer-idem-', meqwenShaped(), async (modelsPath) => {
    assert.equal((await ensure({ modelsPath })).action, 'added');
    const settled = await fs.readFile(modelsPath, 'utf8');
    const second = await ensure({ modelsPath });
    assert.equal(second.action, 'present');
    assert.deepEqual(second.gaps, []);
    assert.equal(await fs.readFile(modelsPath, 'utf8'), settled);
  });
});

test('writer skips files where the rule applies to nothing (A1-6)', async () => {
  const ensure = await loadWriterEntry();
  assert.equal(typeof ensure, 'function', 'writer entry must exist');
  const config = {
    providers: {
      official: {
        baseUrl: 'https://api.openai.com/v1',
        api: 'openai-completions',
        models: [{ id: 'gpt-4o', reasoning: true }],
      },
      native: {
        baseUrl: 'https://relay.example.test:8443/v1',
        api: 'anthropic-messages',
        models: [{ id: 'c-opus', reasoning: true }],
      },
    },
  };
  await withModelsFile('aios-pi-writer-skip-', config, async (modelsPath) => {
    const before = await fs.readFile(modelsPath, 'utf8');
    const result = await ensure({ modelsPath });
    assert.equal(result.action, 'skipped');
    assert.deepEqual(result.gaps, []);
    assert.equal(await fs.readFile(modelsPath, 'utf8'), before);
  });
});

test('writer never rewrites an explicit true while fixing an undeclared sibling', async () => {
  const ensure = await loadWriterEntry();
  assert.equal(typeof ensure, 'function', 'writer entry must exist');
  const config = meqwenShaped();
  config.providers.testrelay.models.push({ id: 'r-user', reasoning: true, compat: { supportsDeveloperRole: true } });
  await withModelsFile('aios-pi-writer-mixed-', config, async (modelsPath) => {
    const result = await ensure({ modelsPath });
    assert.equal(result.action, 'added');
    assert.deepEqual(result.gaps, ['testrelay/r-flash']);
    const after = JSON.parse(await fs.readFile(modelsPath, 'utf8'));
    assert.deepEqual(after.providers.testrelay.models[2].compat, { supportsDeveloperRole: true });
    assert.equal(after.providers.testrelay.models[0].compat.supportsDeveloperRole, false);
  });
});

test('writer skips a missing models.json instead of creating one', async () => {
  const ensure = await loadWriterEntry();
  assert.equal(typeof ensure, 'function', 'writer entry must exist');
  await withModelsFile('aios-pi-writer-missing-', null, async (modelsPath) => {
    const result = await ensure({ modelsPath });
    assert.equal(result.action, 'skipped');
    assert.deepEqual(result.gaps, []);
    assert.equal(await fs.stat(modelsPath).then(() => true, () => false), false);
  });
});
