// scripts/lib/tooling/components/integrations/pi/compat-self-heal.mjs — Pi models.json compat judgement.
// Pi sends the system prompt in the `developer` role for a reasoning model served over
// `openai-completions` whenever the model does not declare `compat.supportsDeveloperRole`:
// pi-ai defaults the capability to true for any baseUrl it does not recognise as a known
// non-standard surface (openai-completions.js:1272), applies the declaration at :1324, and picks
// the role at :905. Relays that reject the role answer HTTP 400, pi classifies a 400 as
// non-retryable, and the run stops. `models.json` is the only place the declaration can live —
// settings.json carries no per-provider compat key — so this module reads it, reports the gaps,
// and can add the missing declaration without touching anything else.
import fs from 'node:fs';
import path from 'node:path';

// Hostnames that legitimately accept the `developer` role, so a missing declaration there is not
// a defect and must never be "fixed" by writing false.
const DEVELOPER_ROLE_NATIVE_HOST_SUFFIXES = [
  '.openai.com',
  '.azure.com',
  '.anthropic.com',
];

// Mirrors pi-ai's own detectCompat non-standard list: on these surfaces the capability already
// defaults to false, so an undeclared compat is harmless and reporting it would be noise.
const NON_STANDARD_HOST_HINTS = [
  'integrate.api.nvidia.com',
  'cerebras.ai',
  'api.x.ai',
  'api.together.ai',
  'api.together.xyz',
  'chutes.ai',
  'deepseek.com',
  'api.z.ai',
  'open.bigmodel.cn',
  'api.moonshot.',
  'opencode.ai',
  'api.cloudflare.com',
  'gateway.ai.cloudflare.com',
  'api.ant-ling.com',
];

export function resolvePiModelsJsonPath(piHome) {
  return path.join(piHome || '', 'models.json');
}

function hostOf(baseUrl) {
  const value = String(baseUrl || '').toLowerCase();
  const withoutScheme = value.replace(/^[a-z][a-z0-9+.-]*:\/\//u, '');
  return withoutScheme.split('/')[0];
}

function hasNativeDeveloperRole(baseUrl) {
  const host = hostOf(baseUrl);
  return DEVELOPER_ROLE_NATIVE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function isKnownNonStandardHost(baseUrl) {
  const value = String(baseUrl || '').toLowerCase();
  return NON_STANDARD_HOST_HINTS.some((hint) => value.includes(hint));
}

function declaresDeveloperRole(...compatObjects) {
  return compatObjects.some(
    (compat) => compat && typeof compat === 'object' && 'supportsDeveloperRole' in compat,
  );
}

function modelsOf(provider) {
  return Array.isArray(provider?.models) ? provider.models : [];
}

// Pure judgement: which configured models will get the `developer` role from a relay that has not
// declared the capability. Returns `providerId/modelId` ids in configuration order.
export function findDeveloperRoleCompatGaps({ modelsConfig } = {}) {
  const providers = modelsConfig?.providers;
  if (!providers || typeof providers !== 'object' || Array.isArray(providers)) return [];
  const gaps = [];
  for (const [providerId, provider] of Object.entries(providers)) {
    if (String(provider?.api || '') !== 'openai-completions') continue;
    if (!provider?.baseUrl || hasNativeDeveloperRole(provider.baseUrl)) continue;
    // pi already defaults these surfaces to false; nothing to declare.
    if (isKnownNonStandardHost(provider.baseUrl)) continue;
    for (const model of modelsOf(provider)) {
      if (model?.reasoning !== true) continue;
      if (declaresDeveloperRole(model.compat, provider.compat)) continue;
      gaps.push(`${providerId}/${model?.id}`);
    }
  }
  return gaps;
}

function declaresTrue(...compatObjects) {
  return compatObjects.some(
    (compat) => compat && typeof compat === 'object' && compat.supportsDeveloperRole === true,
  );
}

// Models the write rule applies to: reasoning models served over openai-completions from a host
// that is not natively a developer-role surface. Known non-standard hosts are evaluated too —
// they are safe by pi default, which is why they report `present` rather than `skipped`.
function evaluatedRelayModels(modelsConfig) {
  const providers = modelsConfig?.providers;
  if (!providers || typeof providers !== 'object' || Array.isArray(providers)) return [];
  const evaluated = [];
  for (const [providerId, provider] of Object.entries(providers)) {
    if (String(provider?.api || '') !== 'openai-completions') continue;
    if (!provider?.baseUrl || hasNativeDeveloperRole(provider.baseUrl)) continue;
    for (const model of modelsOf(provider)) {
      if (model?.reasoning === true) evaluated.push({ providerId, provider, model });
    }
  }
  return evaluated;
}

// Additive self-heal for the developer-role compat (contract A1-1..A1-6). Reads models.json,
// declares `compat.supportsDeveloperRole: false` on exactly the gap models, and touches nothing
// else. Never rewrites a user-chosen value: an explicit `true` is kept wherever it stands.
// Returns `{ modelsPath, action, gaps, kept }` with action in
// `added | would-add | kept-user-value | present | skipped`.
export async function ensureDeveloperRoleCompat({ modelsPath, dryRun = false, io = null } = {}) {
  if (!modelsPath) throw new Error('ensureDeveloperRoleCompat requires modelsPath');
  const { exists, config } = readPiModelsConfig(modelsPath);
  if (!exists) return { modelsPath, action: 'skipped', gaps: [], kept: [] };
  const evaluated = evaluatedRelayModels(config);
  const gaps = findDeveloperRoleCompatGaps({ modelsConfig: config });
  const kept = evaluated
    .filter(({ provider, model }) => declaresTrue(model.compat, provider.compat))
    .map(({ providerId, model }) => `${providerId}/${model?.id}`);
  if (!gaps.length) {
    if (kept.length) {
      for (const id of kept) io?.log?.(`[ok] ${id}: keeps user-declared compat.supportsDeveloperRole=true`);
      return { modelsPath, action: 'kept-user-value', gaps, kept };
    }
    if (evaluated.length) {
      io?.log?.('[ok] Pi models.json developer-role compat already present');
      return { modelsPath, action: 'present', gaps, kept };
    }
    io?.log?.('[skip] no reasoning openai-completions relay models; nothing to declare');
    return { modelsPath, action: 'skipped', gaps, kept };
  }
  if (dryRun) {
    for (const gap of gaps) io?.log?.(`[plan] would declare compat.supportsDeveloperRole=false for ${gap}`);
    return { modelsPath, action: 'would-add', gaps, kept };
  }
  for (const gap of gaps) {
    const [providerId, modelId] = gap.split('/');
    const model = config.providers[providerId]?.models?.find((candidate) => candidate?.id === modelId);
    model.compat = { ...(model.compat || {}), supportsDeveloperRole: false };
    io?.log?.(`[ok] ${gap}: declared compat.supportsDeveloperRole=false`);
  }
  fs.mkdirSync(path.dirname(modelsPath), { recursive: true });
  fs.writeFileSync(modelsPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return { modelsPath, action: 'added', gaps, kept };
}

export function readPiModelsConfig(modelsPath) {
  let raw;
  try {
    raw = fs.readFileSync(modelsPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, config: null };
    throw error;
  }
  try {
    return { exists: true, config: JSON.parse(raw) };
  } catch {
    throw new Error(`invalid Pi models JSON (refusing to clobber): ${modelsPath}`);
  }
}

// Read-only audit for the doctor: name every model that will get the `developer` role from a relay
// that never declared the capability, and say how to repair it. The write itself is a separate,
// explicitly authorised act (`aios init --agent pi --pi-compat-self-heal`) on a user-global file.
export function auditPiCompat({ modelsJsonPath, io = null } = {}) {
  const outcome = { gaps: [], warnings: 0, errors: 0 };
  let models;
  try {
    models = readPiModelsConfig(modelsJsonPath);
  } catch (error) {
    io?.log?.(`[error] Pi models.json is not valid JSON; AIOS never rewrites it automatically (${error?.message || error})`);
    outcome.errors += 1;
    return outcome;
  }
  if (!models.exists) return outcome;
  outcome.gaps = findDeveloperRoleCompatGaps({ modelsConfig: models.config });
  for (const gap of outcome.gaps) {
    io?.log?.(`[warn] ${gap}: reasoning model over openai-completions does not declare compat.supportsDeveloperRole`);
    io?.log?.('[warn]   pi sends the system prompt in the `developer` role, relays that reject it answer 400, and pi does not retry a 400');
    io?.log?.('[warn]   repair: aios init --agent pi --pi-compat-self-heal');
    outcome.warnings += 1;
  }
  if (!outcome.gaps.length) {
    io?.log?.('[ok] Pi models.json developer-role compat is declared for every reasoning relay');
  }
  return outcome;
}
