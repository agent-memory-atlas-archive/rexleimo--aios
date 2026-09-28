// Test fixture: hermetic environment for tests that spawn the AIOS agent runtime.
//
// Why this exists: the opt-in judgment stage gate (scripts/lib/judgment/*) reads
// `~/.aios/judgment/config.json` from the *operator's* machine. When a developer
// has enabled it, every spawned ctx-agent run consults a judgment provider and a
// low score holds the stage — so a test that asserts `result.status === 0` fails
// for reasons that have nothing to do with the repository. `AIOS_JUDGMENT_CONFIG`
// is the documented determinism hook; tests must pin it instead of inheriting
// user state.
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DISABLED_CONFIG = Object.freeze({
  schemaVersion: 1,
  vendors: {
    typesafe: Object.freeze({
      enabled: false,
      model: 'jev-latest',
      actFloor: 0.8,
      confirmFloor: 0.5,
      maxCallsPerSession: 20,
      maxInputChars: 20000,
      timeoutMs: 10000,
      onJudgmentError: 'hold',
    }),
  },
});

function writeDisabledConfig() {
  const dir = path.join(os.tmpdir(), 'aios-test-judgment-env');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `disabled-${process.pid}.json`);
  writeFileSync(file, `${JSON.stringify(DISABLED_CONFIG, null, 2)}\n`, 'utf8');
  return file;
}

const JUDGMENT_DISABLED_CONFIG_PATH = writeDisabledConfig();

/**
 * Build a spawn env that is independent of the operator's local AIOS state.
 * @param {Record<string, string>} [extra] additional variables (win over defaults)
 */
export function hermeticAgentEnv(extra = {}) {
  return {
    ...process.env,
    AIOS_JUDGMENT_CONFIG: JUDGMENT_DISABLED_CONFIG_PATH,
    ...extra,
  };
}
