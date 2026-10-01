import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { doctorPiBridge } from '../lib/components/pi/doctor.mjs';
import { buildAiosPiMcpServers, resolvePiMcpJsonPath } from '../lib/components/pi/mcp-adapter.mjs';

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
