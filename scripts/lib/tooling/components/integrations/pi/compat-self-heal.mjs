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
