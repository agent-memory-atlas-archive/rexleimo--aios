/**
 * Test scope contract — work-7 · solo turn 后果的唯一 owner（interaction contract 决策编译器，父侧范围）
 *
 * User goal:
 *   `outcome → 后果` 的语义映射在 solo 运行时里只允许存在一份，且材料性必须由
 *   声明通道（S 通道 selfReport）确认，而不是从 outcome 字符串推出来。
 *
 * Explicit non-goals:
 *   - 不建立 rex `TURN_OUTCOMES` ↔ `SOLO_OUTCOMES` 的跨词表映射（无 call site 即死代码，
 *     ADR 0002；留待 D2 的接线项）；
 *   - 不改子模块公开面、不改 wire schema、不动 attended 默认（`pacing=null` 仍全关）；
 *   - 不处理 deriveEvidence 的文本回退链（已另记，属独立范围）。
 *
 * In-scope behavior (observed at the public seams):
 *   T1 表与词表一一对应，且每个固定值都落在自己的词表里。
 *   T2 守卫非空转：往合成集合里加一个未登记 outcome，必须报出缺口。
 *   T3 严格查表 fail closed：未登记名字抛错，不静默兜底。
 *   T4 D3 材料性：裸 `outcome: 'success'` 无 S 通道声明 → 无 material 资格；声明了才有。
 *   T5 迁移前后语义保持（runStatus 的 infra-retry 优先级、失败类门、缺席投影）。
 *   T6 节奏/退避的推进类后果同样要 S 通道确认。
 *   T7 结构性保证：solo 运行时里不再出现第二处 outcome 字符串比较——这是"单一 owner"的可执行形式。
 *
 * Out-of-scope behavior:
 *   quota 计费算法、cadence 延迟算术（既有测试覆盖）。
 *
 * Allowed test seams:
 *   turn-consequences.mjs 的导出 + normalizeSoloIterationOutcome + 源码扫描。
 *
 * Completion criteria:
 *   T1-T7 各自能独立失败；变异（恢复某个 infer* 副本）会让 T7 失败。
 *
 * Forbidden fake passes:
 *   不断言"表非空"这种永真式；T2/T7 必须自己证明守卫会抓东西。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { SOLO_CADENCE_CLASSES, SOLO_OUTCOMES } from '../../../../lib/execution/harness/solo/solo-runtime/support/constants.mjs';
import { normalizeSoloIterationOutcome } from '../../../../lib/execution/harness/solo/solo-runtime/support/normalizers.mjs';
import {
  TURN_CONSEQUENCES,
  deriveCadenceClass,
  deriveRunStatus,
  derivesBackoffReset,
  findTurnTableGaps,
  isMaterialTurn,
  turnConsequencesFor,
} from '../../../../lib/execution/harness/solo/solo-runtime/support/turn-consequences.mjs';

const SOLO_RUNTIME_ROOT = path.join(
  process.cwd(),
  'scripts', 'lib', 'execution', 'harness', 'solo', 'solo-runtime',
);
const OWNER_FILE = path.join('support', 'turn-consequences.mjs');

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\/[^\n']*/g, '');
}

function listRuntimeSources(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listRuntimeSources(full, acc);
    else if (entry.name.endsWith('.mjs')) acc.push(full);
  }
  return acc;
}

test('T1: the turn table covers SOLO_OUTCOMES exactly and every value is in its vocabulary', () => {
  assert.deepEqual(findTurnTableGaps(), []);
  assert.equal(Object.keys(TURN_CONSEQUENCES).length, SOLO_OUTCOMES.size);
  assert.ok(Object.isFrozen(TURN_CONSEQUENCES));
  assert.ok(Object.isFrozen(TURN_CONSEQUENCES.success));
});

test('T2: the coverage guard is not vacuous - an unregistered outcome is reported', () => {
  const gaps = findTurnTableGaps([...SOLO_OUTCOMES, 'invented-outcome']);
  assert.equal(gaps.length, 1, JSON.stringify(gaps));
  assert.match(gaps[0], /invented-outcome.*no TURN_CONSEQUENCES row/);
});

test('T3: lookups fail closed instead of guessing', () => {
  assert.throws(() => turnConsequencesFor('not-an-outcome'), /register it in TURN_CONSEQUENCES first/);
  assert.throws(() => turnConsequencesFor(''), /unknown solo outcome/);
});

test('T4: material requires the self-report channel, never a bare outcome string', () => {
  assert.equal(isMaterialTurn({ outcome: 'success' }), false);
  assert.equal(isMaterialTurn({ outcome: 'success', selfReport: { progressMade: false } }), false);
  assert.equal(isMaterialTurn({ outcome: 'success', selfReport: { progressMade: true } }), true);
  // 只有 success 行有 material 资格；noop/blocked 等永远不算进展。
  for (const outcome of ['noop', 'blocked', 'infra-retry', 'human-gate', 'stopped', 'failed']) {
    assert.equal(isMaterialTurn({ outcome, selfReport: { progressMade: true } }), false, outcome);
  }

  const undeclared = normalizeSoloIterationOutcome({ sessionId: 's1', iteration: 1, outcome: 'success' });
  assert.equal(undeclared.material, false);
  assert.equal(undeclared.selfReport.declared, false);
  // 缺席不连累其它投影：失败类/状态仍按声明的 outcome 归类（迁移前语义）。
  assert.equal(undeclared.failureClass, 'none');
  assert.equal(undeclared.checkpointStatus, 'running');

  const declared = normalizeSoloIterationOutcome({
    sessionId: 's1',
    iteration: 1,
    outcome: 'success',
    selfReport: { progressMade: true, summary: 'shipped the gate' },
  });
  assert.equal(declared.material, true);
  assert.equal(declared.selfReport.progressMade, true);

  // 未登记的字符串不可能声称进展（保守降级为 failed）。
  assert.equal(normalizeSoloIterationOutcome({ sessionId: 's1', outcome: 'success-ish' }).material, false);
});

test('T5: run status projection keeps the pre-migration precedence', () => {
  // infra-retry 的退避状态先于失败类门（原 state.mjs 分支顺序）。
  assert.equal(deriveRunStatus({ outcome: 'infra-retry', failureClass: 'safety-gate' }), 'backoff');
  // 所有权门 / 安全门把任何其它 outcome 提升为 human-gate。
  assert.equal(deriveRunStatus({ outcome: 'blocked', failureClass: 'ownership-gate' }), 'human-gate');
  assert.equal(deriveRunStatus({ outcome: 'blocked', failureClass: 'safety-gate' }), 'human-gate');
  assert.equal(deriveRunStatus({ outcome: 'blocked' }), 'running');
  assert.equal(deriveRunStatus({ outcome: 'blocked', shouldStop: true }), 'blocked');
  assert.equal(deriveRunStatus({ outcome: 'human-gate' }), 'human-gate');
  assert.equal(deriveRunStatus({ outcome: 'stopped' }), 'stopped');
  assert.equal(deriveRunStatus({ outcome: 'failed' }), 'failed');
  assert.equal(deriveRunStatus({ outcome: 'noop', shouldStop: true }), 'done');
  // 缺席投影：不认识的就不是"成功"。
  assert.equal(deriveRunStatus({ outcome: 'mystery' }), 'running');
  assert.equal(deriveRunStatus({ outcome: 'mystery', shouldStop: true }), 'done');
});

test('T6: cadence and backoff promotion also require the declared channel', () => {
  assert.equal(deriveCadenceClass({ outcome: 'success' }), 'monitor_wait');
  assert.equal(deriveCadenceClass({ outcome: 'success', material: true }), 'active_work');
  assert.equal(deriveCadenceClass({ outcome: 'human-gate' }), 'human_gate');
  assert.equal(deriveCadenceClass({ outcome: 'noop' }), 'monitor_wait');
  assert.ok([...SOLO_CADENCE_CLASSES].includes(deriveCadenceClass({ outcome: 'blocked' })));

  assert.equal(derivesBackoffReset({ outcome: 'success' }), false);
  assert.equal(derivesBackoffReset({ outcome: 'success', material: true }), true);
  assert.equal(derivesBackoffReset({ outcome: 'noop' }), true);
  assert.equal(derivesBackoffReset({ outcome: 'blocked' }), false);
});

test('T7: no second owner of the outcome vocabulary survives in the solo runtime', () => {
  // 只抓“拿 outcome 字符串做推理性比较”：主语必须是 *outcome*（含 effectiveOutcome.outcome 这种投影），
  // 不抓别的词表里碰巧同名的值（readiness.level === 'blocked'、lastStatus === 'human-gate' 等）。
  const pattern = /[\w$]*[oO]utcome[\w$]*(?:\.[\w$]+)?\s*===?\s*'(success|noop|blocked|infra-retry|human-gate|stopped|failed)'/g;
  const offenders = [];
  for (const file of listRuntimeSources(SOLO_RUNTIME_ROOT)) {
    const relative = path.relative(SOLO_RUNTIME_ROOT, file);
    if (relative === OWNER_FILE) continue;
    const code = stripComments(fs.readFileSync(file, 'utf8'));
    for (const match of code.matchAll(pattern)) {
      offenders.push(`${relative}: ${match[0].trim()}`);
    }
  }
  assert.deepEqual(offenders, [], `outcome strings inferred outside the owner:\n${offenders.join('\n')}`);
});
