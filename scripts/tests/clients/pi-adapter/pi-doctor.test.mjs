import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { doctorPiBridge } from '../../../lib/tooling/components/integrations/pi/doctor.mjs';
import { buildAiosPiMcpServers, resolvePiMcpJsonPath } from '../../../lib/tooling/components/integrations/pi/mcp-adapter.mjs';

async function withPiHome(prefix, fn) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await fn(home);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}

function doctorEnv(piHome) {
  return { ...process.env, PI_CODING_AGENT_DIR: piHome };
}

const piOnPath = { commandExistsImpl: () => true };
const noPi = { commandExistsImpl: () => false };

// captureImpl dispatches on the pi subcommand: `--version` picks the carrier
// mode, `list` reports the installed adapter package.
function piCapture({ version = '0.98.5', list = '' } = {}) {
  return {
    captureImpl: (_cmd, args) => (args?.[0] === '--version' ? { stdout: version } : { stdout: list }),
  };
}
const adapterInstalledLegacy = piCapture({ version: '0.98.5', list: 'pi-mcp-adapter 2.33.0' });
const adapterMissingLegacy = piCapture({ version: '0.98.5', list: 'something-else 1.0.0' });
const adapterInstalledBuiltin = piCapture({ version: '0.99.2', list: 'pi-mcp-adapter 2.33.0' });
const adapterMissingBuiltin = piCapture({ version: '0.99.2', list: '' });

test('pi bridge doctor skips when neither pi CLI nor mcp.json exists', async () => {
  await withPiHome('aios-pi-doctor-skip-', async (piHome) => {
    const logs = [];
    const result = await doctorPiBridge({
      aiosRoot: '/aios',
      env: doctorEnv(piHome),
      io: { log: (line) => logs.push(line) },
      ...noPi,
    });
    assert.equal(result.skipped, true);
    assert.equal(result.effectiveWarnings, 0);
    assert.equal(result.errors, 0);
  });
});

test('pi bridge doctor reports a healthy bridge with zero warnings', async () => {
  await withPiHome('aios-pi-doctor-ok-', async (piHome) => {
    const mcpJsonPath = resolvePiMcpJsonPath(piHome);
    await fs.mkdir(path.dirname(mcpJsonPath), { recursive: true });
    await fs.writeFile(mcpJsonPath, JSON.stringify({
      mcpServers: buildAiosPiMcpServers({ aiosRoot: '/aios' }),
    }, null, 2), 'utf8');
    const logs = [];
    const result = await doctorPiBridge({
      aiosRoot: '/aios',
      env: doctorEnv(piHome),
      io: { log: (line) => logs.push(line) },
      ...piOnPath,
      ...adapterInstalledLegacy,
    });
    assert.equal(result.skipped, false);
    assert.equal(result.errors, 0);
    assert.equal(result.effectiveWarnings, 0);
    assert.equal(result.adapter, 'installed');
    assert.deepEqual(result.managedMissing, []);
  });
});

test('pi bridge doctor flags missing managed servers with a global-CLI repair hint', async () => {
  await withPiHome('aios-pi-doctor-missing-', async (piHome) => {
    const mcpJsonPath = resolvePiMcpJsonPath(piHome);
    await fs.mkdir(path.dirname(mcpJsonPath), { recursive: true });
    await fs.writeFile(mcpJsonPath, JSON.stringify({
      mcpServers: { 'code-review-graph': { command: 'uvx', args: ['code-review-graph', 'serve'], lifecycle: 'lazy' } },
    }, null, 2), 'utf8');
    const logs = [];
    const result = await doctorPiBridge({
      aiosRoot: '/aios',
      env: doctorEnv(piHome),
      io: { log: (line) => logs.push(line) },
      ...piOnPath,
      ...adapterInstalledLegacy,
    });
    assert.deepEqual(result.managedMissing.sort(), ['aios-bridge', 'aios-memory']);
    assert.equal(result.effectiveWarnings, 2);
    const hint = logs.join('\n');
    assert.match(hint, /Run: aios init --agent pi/u);
    assert.doesNotMatch(hint, /node scripts/u);
  });
});

test('pi bridge doctor errors on invalid JSON and warns on missing adapter', async () => {
  await withPiHome('aios-pi-doctor-bad-', async (piHome) => {
    const mcpJsonPath = resolvePiMcpJsonPath(piHome);
    await fs.mkdir(path.dirname(mcpJsonPath), { recursive: true });
    await fs.writeFile(mcpJsonPath, '{not json', 'utf8');
    const logs = [];
    const result = await doctorPiBridge({
      aiosRoot: '/aios',
      env: doctorEnv(piHome),
      io: { log: (line) => logs.push(line) },
      ...piOnPath,
      ...adapterInstalledLegacy,
    });
    assert.equal(result.errors, 1);
    // All managed servers count as missing on top of the parse error.
    assert.equal(result.effectiveWarnings, 3);
  });
});

test('pi bridge doctor warns when the adapter package is absent', async () => {
  await withPiHome('aios-pi-doctor-adapter-', async (piHome) => {
    const mcpJsonPath = resolvePiMcpJsonPath(piHome);
    await fs.mkdir(path.dirname(mcpJsonPath), { recursive: true });
    await fs.writeFile(mcpJsonPath, JSON.stringify({
      mcpServers: buildAiosPiMcpServers({ aiosRoot: '/aios' }),
    }, null, 2), 'utf8');
    const result = await doctorPiBridge({
      aiosRoot: '/aios',
      env: doctorEnv(piHome),
      io: { log: () => {} },
      ...piOnPath,
      ...adapterMissingLegacy,
    });
    assert.equal(result.adapter, 'missing');
    assert.equal(result.mode, 'adapter');
    assert.equal(result.effectiveWarnings, 1);
    assert.equal(result.errors, 0);
  });
});

test('pi bridge doctor treats an adapter on pi >= 0.99.0 as informational, not a warning', async () => {
  await withPiHome('aios-pi-doctor-conflict-', async (piHome) => {
    const mcpJsonPath = resolvePiMcpJsonPath(piHome);
    await fs.mkdir(path.dirname(mcpJsonPath), { recursive: true });
    await fs.writeFile(mcpJsonPath, JSON.stringify({
      mcpServers: buildAiosPiMcpServers({ aiosRoot: '/aios' }),
    }, null, 2), 'utf8');
    const logs = [];
    const result = await doctorPiBridge({
      aiosRoot: '/aios',
      env: doctorEnv(piHome),
      io: { log: (line) => logs.push(line) },
      ...piOnPath,
      ...adapterInstalledBuiltin,
    });
    assert.equal(result.mode, 'builtin');
    assert.equal(result.adapter, 'installed-conflicts');
    assert.equal(result.effectiveWarnings, 0);
    assert.equal(result.errors, 0);
    assert.equal(result.notes.length, 1);
    const hint = logs.join('\n');
    assert.match(hint, /\[info\] pi 0\.99\.2 ships built-in MCP/u);
    assert.match(hint, /pi remove npm:pi-mcp-adapter/u);
    assert.doesNotMatch(hint, /Run: aios init --agent pi/u, 'advisory alone must not trigger the repair hint');
  });
});

test('pi bridge doctor stops warning about a missing adapter once built-in MCP serves mcp.json', async () => {
  await withPiHome('aios-pi-doctor-builtin-', async (piHome) => {
    const mcpJsonPath = resolvePiMcpJsonPath(piHome);
    await fs.mkdir(path.dirname(mcpJsonPath), { recursive: true });
    await fs.writeFile(mcpJsonPath, JSON.stringify({
      mcpServers: buildAiosPiMcpServers({ aiosRoot: '/aios' }),
    }, null, 2), 'utf8');
    const logs = [];
    const result = await doctorPiBridge({
      aiosRoot: '/aios',
      env: doctorEnv(piHome),
      io: { log: (line) => logs.push(line) },
      ...piOnPath,
      ...adapterMissingBuiltin,
    });
    assert.equal(result.mode, 'builtin');
    assert.equal(result.adapter, 'builtin');
    assert.equal(result.effectiveWarnings, 0);
    assert.equal(result.errors, 0);
    assert.match(logs.join('\n'), /\[ok\] pi built-in MCP serves mcp\.json/u);
  });
});

// A4-3 (docs/plans/2026-10-23-pi-stall-self-heal-test-scope.md): a reasoning model served over
// `openai-completions` from a relay baseUrl gets its system prompt sent in the `developer` role
// unless the model declares `compat.supportsDeveloperRole: false` - pi-ai
// openai-completions.js:905 + :1272 + :1324. Relays that reject that role answer 400, pi treats a
// 400 as non-retryable, and the run stops: 10 recorded bailian stops on this machine. `models.json`
// is the only place the declaration can live, because settings.json has no per-provider compat key.
test('pi bridge doctor flags reasoning providers that never declared the developer-role compat', async () => {
  await withPiHome('aios-pi-doctor-compat-risk-', async (piHome) => {
    const mcpJsonPath = resolvePiMcpJsonPath(piHome);
    await fs.mkdir(path.dirname(mcpJsonPath), { recursive: true });
    await fs.writeFile(mcpJsonPath, JSON.stringify({
      mcpServers: buildAiosPiMcpServers({ aiosRoot: '/aios' }),
    }, null, 2), 'utf8');
    await fs.writeFile(path.join(piHome, 'models.json'), JSON.stringify({
      providers: {
        testrelay: {
          name: 'Test Relay',
          baseUrl: 'https://relay.example.test:8443/v1',
          api: 'openai-completions',
          models: [
            { id: 'r-flash', reasoning: true, contextWindow: 128000 },
            { id: 'r-plain', reasoning: false, contextWindow: 32000 },
          ],
        },
      },
    }, null, 2), 'utf8');
    const logs = [];
    const result = await doctorPiBridge({
      aiosRoot: '/aios',
      env: doctorEnv(piHome),
      io: { log: (line) => logs.push(line) },
      ...noPi,
      ...adapterMissingLegacy,
    });
    assert.deepEqual(result.compatAtRisk, ['testrelay/r-flash']);
    const hint = logs.join('\n');
    assert.match(hint, /testrelay\/r-flash.*supportsDeveloperRole/su);
    assert.match(hint, /aios init --agent pi --pi-compat-self-heal/u);
    assert.equal(result.effectiveWarnings, 2);
  });
});

test('pi bridge doctor reports no compat risk when the declaration exists or the surface is native', async () => {
  await withPiHome('aios-pi-doctor-compat-ok-', async (piHome) => {
    const mcpJsonPath = resolvePiMcpJsonPath(piHome);
    await fs.mkdir(path.dirname(mcpJsonPath), { recursive: true });
    await fs.writeFile(mcpJsonPath, JSON.stringify({
      mcpServers: buildAiosPiMcpServers({ aiosRoot: '/aios' }),
    }, null, 2), 'utf8');
    await fs.writeFile(path.join(piHome, 'models.json'), JSON.stringify({
      providers: {
        declared: {
          baseUrl: 'https://relay.example.test:8443/v1',
          api: 'openai-completions',
          compat: { supportsDeveloperRole: false },
          models: [{ id: 'm-one', reasoning: true }],
        },
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
    }, null, 2), 'utf8');
    const logs = [];
    const result = await doctorPiBridge({
      aiosRoot: '/aios',
      env: doctorEnv(piHome),
      io: { log: (line) => logs.push(line) },
      ...noPi,
      ...adapterMissingLegacy,
    });
    assert.deepEqual(result.compatAtRisk, []);
    assert.equal(result.effectiveWarnings, 1);
    assert.equal(logs.some((line) => /supportsDeveloperRole/u.test(line)), false);
  });
});

test('pi bridge doctor falls back to legacy adapter checks when the version cannot be captured', async () => {
  await withPiHome('aios-pi-doctor-noversion-', async (piHome) => {
    const mcpJsonPath = resolvePiMcpJsonPath(piHome);
    await fs.mkdir(path.dirname(mcpJsonPath), { recursive: true });
    await fs.writeFile(mcpJsonPath, JSON.stringify({
      mcpServers: buildAiosPiMcpServers({ aiosRoot: '/aios' }),
    }, null, 2), 'utf8');
    const result = await doctorPiBridge({
      aiosRoot: '/aios',
      env: doctorEnv(piHome),
      io: { log: () => {} },
      ...piOnPath,
      ...piCapture({ version: '', list: '' }),
    });
    assert.equal(result.mode, 'adapter');
    assert.equal(result.adapter, 'missing');
    assert.equal(result.effectiveWarnings, 1);
  });
});
