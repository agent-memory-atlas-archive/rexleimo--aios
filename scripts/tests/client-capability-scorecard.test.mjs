import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildScorecard, renderReport, scoreEntry } from '../client-capability-scorecard.mjs';

const configPath = new URL('../../config/host-capabilities.json', import.meta.url);
const reportPath = new URL('../../docs/reports/2026-10-19-client-capability-scorecard.md', import.meta.url);
const config = JSON.parse(readFileSync(configPath, 'utf8'));

test('scoreEntry prices the full L3 control surface at the declared maximum', () => {
  const score = scoreEntry({
    targetLevel: 'L3',
    capabilities: [
      'sessionStartInjection',
      'preToolRewrite',
      'controlledShellRunner',
      'mcpProxy',
      'compactPacket',
      'advisorySkills',
      'metrics',
    ],
    requiredEntrypoint: 'aios-managed-runner',
    directHostBypassAllowed: false,
    turnCompression: {
      preSendRequired: true,
      postReceiveRequired: true,
      mode: 'tight',
      uncontrolledHostOutput: 'policy-violation',
    },
  });
  assert.equal(score.total, 12);
});

test('scoreEntry fails closed on an unknown level', () => {
  assert.throws(() => scoreEntry({ targetLevel: 'L9', capabilities: [] }), /unknown targetLevel: L9/u);
});

test('WorkBuddy row is recomputed from config, not hand-written', () => {
  const scorecard = buildScorecard(config);
  const workbuddy = scorecard.workbuddy;
  assert.ok(workbuddy, 'config must declare workbuddy');
  assert.equal(workbuddy.targetLevel, config.clients.workbuddy.targetLevel);
  assert.equal(workbuddy.levelPoints, 2);
  assert.deepEqual(workbuddy.capabilities, [0, 0, 0, 1, 1, 0, 0]);
  assert.equal(workbuddy.entrypoint, 1);
  assert.equal(workbuddy.compression, 1);
  assert.equal(workbuddy.total, 6);
});

test('committed report is byte-identical to the recomputed rendering', () => {
  const rendered = renderReport(config, buildScorecard(config));
  const committed = readFileSync(reportPath, 'utf8');
  assert.equal(committed, rendered, 'run: node scripts/client-capability-scorecard.mjs --write');
});

test('every client keeps its declared limits visible with its score', () => {
  const rendered = renderReport(config, buildScorecard(config));
  for (const [name, entry] of Object.entries(config.clients)) {
    for (const limit of entry.limits || []) {
      assert.ok(rendered.includes(limit), `${name} limit missing from report: ${limit}`);
    }
  }
});
