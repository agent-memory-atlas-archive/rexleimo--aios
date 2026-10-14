/* 中文注释：iteration 模块只负责单轮账本（iteration 记录 + 日志）写入。
   run-summary 投影的唯一写者是 `persistIterationState`（solo-runtime/support/state.mjs）——
   本模块不得回写 summary，否则一轮内出现两个 summary 写者（work-6 S1 已消除，勿再引入）。 */
import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { writeFileAtomic } from '../../../../../environment/fs/atomic-write.mjs';
import { normalizeIterationOutcome, normalizeOptionalStage, normalizeText } from '../content/normalizers.mjs';
import { getSoloHarnessPaths, iterationFileName, iterationLogFileName } from '../plumbing/paths.mjs';

export async function appendSoloIteration({ rootDir, sessionId, iteration, outcome, logEntries = [] } = {}) {
  const normalizedOutcome = normalizeIterationOutcome({ ...outcome, sessionId, iteration });
  const paths = getSoloHarnessPaths({ rootDir, sessionId });
  await mkdir(paths.iterationDir, { recursive: true });

  const iterationPath = path.join(paths.iterationDir, iterationFileName(normalizedOutcome.iteration));
  const logPath = path.join(paths.iterationDir, iterationLogFileName(normalizedOutcome.iteration));
  await writeFileAtomic(iterationPath, `${JSON.stringify(normalizedOutcome, null, 2)}\n`);

  if (Array.isArray(logEntries) && logEntries.length > 0) {
    await appendFile(
      logPath,
      `${logEntries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
      'utf8'
    );
  } else {
    await writeFile(logPath, '', { encoding: 'utf8' });
  }

  // S1（work-6）：此处曾重读并回写 summary，与 persistIterationState 形成一轮双写，
  // 两次内容还不一致（后者含 status/backoff）。账本与投影各只有一个写者。
  return {
    outcome: normalizedOutcome,
    iterationPath,
    logPath,
  };
}

const ITERATION_RECORD_PATTERN = /^iteration-(\d+)\.json$/u;

/**
 * 已完成轮次的权威账本读取器：iteration 记录只在 turn 收尾时写入（appendSoloIteration），
 * 因此“目录里存在 iteration-NNNN.json”等价于“第 N 轮已完成”。
 *
 * `summary.lastIteration` 是投影，由 persistIterationState 在账本写入之后另一次落盘，
 * 崩溃落在两次写之间时投影会滞后于账本，恢复与一致性校验不得把它当作证据
 * （见 docs/plans/2026-10-14-submodule-boundary-and-loop-closure.md §work-6 G3）。
 *
 * @returns 最新一轮的 `{ iteration, outcome, failureClass, stage, recordUnreadable }`；无记录时返回 null。
 */
export async function readLatestIterationRecord({ rootDir, sessionId } = {}) {
  const { iterationDir } = getSoloHarnessPaths({ rootDir, sessionId });
  let entries;
  try {
    entries = await readdir(iterationDir);
  } catch (error) {
    // 无 journal 目录 = 尚未完成任何轮次，不是错误。
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return null;
    throw error;
  }

  let latestIteration = 0;
  let latestFile = '';
  for (const entry of entries) {
    const matched = ITERATION_RECORD_PATTERN.exec(entry);
    if (!matched) continue;
    const iteration = Number(matched[1]);
    if (Number.isFinite(iteration) && iteration > latestIteration) {
      latestIteration = iteration;
      latestFile = entry;
    }
  }
  if (!latestFile) return null;

  try {
    const record = JSON.parse(await readFile(path.join(iterationDir, latestFile), 'utf8'));
    return Object.freeze({
      iteration: latestIteration,
      outcome: normalizeText(record?.outcome),
      failureClass: normalizeText(record?.failureClass, 'none'),
      stage: normalizeOptionalStage(record?.stage),
      recordUnreadable: false,
    });
  } catch {
    // 损坏记录不得静默降级为“无轮次”或空字段：轮号仍然可信，字段标记为不可读，
    // 让一致性校验把它当作漂移报出来，而不是少算一轮。
    return Object.freeze({
      iteration: latestIteration,
      outcome: '',
      failureClass: 'none',
      stage: '',
      recordUnreadable: true,
    });
  }
}
