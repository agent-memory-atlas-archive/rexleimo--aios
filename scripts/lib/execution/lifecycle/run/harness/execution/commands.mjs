import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  clearSoloHarnessStop,
  initSoloRunJournal,
  readSoloRunStatus,
  readSoloRunSummary,
  requestSoloHarnessStop,
  writeSoloRunSummary,
} from '../../../../harness/solo/solo-journal.mjs';
import { finalizeSoloWorktree, prepareSoloWorktree } from '../../../../harness/solo/solo-worktree.mjs';
import { checkSoloHarnessProfileReadiness } from '../../../../harness/solo/solo-profiles.mjs';
import { buildLoopPacingConfig, runSoloHarnessLoop } from '../../../../harness/solo/solo-runtime.mjs';
import { normalizeText } from '../support/shared.mjs';
import { ensureSoloHarnessSession } from '../session/session.mjs';
import { runHarnessDryRunChecks } from './dry-run.mjs';
import { renderStatus } from '../session/status.mjs';
import { buildProductionExecuteTurn } from './execute-turn.mjs';
import { buildPiRpcExecuteTurn } from './execute-turn-pi-rpc.mjs';
import { createLifecycleHooks } from '../support/hooks.mjs';
import { resolveResumeWorktree } from '../session/worktree.mjs';
import { writeHarnessDashboard } from '../../../../harness/ops/dashboard.mjs';

/**
 * `--dry-run` 的唯一渲染器：run 与 resume 共用。它只做本地读与检查，不调 provider、不改状态。
 * 只有一个渲染者的理由：两个分支各自排版一遍的话，帮助文本与输出就会分叉。
 */
async function reportHarnessDryRun({ rootDir, options, io, provider, sessionId, objective, worktreeEnabled }) {
  const checks = await runHarnessDryRunChecks({ rootDir, provider, sessionId, objective, worktree: worktreeEnabled });
  const status = await readSoloRunStatus({ rootDir, sessionId });
  const result = {
    verdict: checks.verdict,
    checks: checks.results,
    nextActions: checks.nextActions,
    session: status,
  };
  if (options.json === true) {
    io.log(JSON.stringify(result, null, 2));
  } else {
    const verdictIcon = checks.verdict === 'ready' ? 'OK' : checks.verdict === 'warning' ? 'WARN' : 'BLOCKED';
    io.log(`\nHarness Dry-Run: ${verdictIcon} (${checks.verdict})`);
    io.log(`Objective: ${objective}`);
    io.log(`Session:   ${sessionId}`);
    io.log(`Provider:  ${provider}\n`);
    for (const check of checks.results) {
      io.log(`  ${check.ok ? '✓' : '✗'} ${check.label}`);
      if (check.detail) io.log(`    ${check.detail}`);
    }
    io.log('');
    for (const action of checks.nextActions) {
      io.log(`  → ${action}`);
    }
    io.log('');
  }
  return { exitCode: checks.verdict === 'blocked' ? 1 : 0, result };
}

export async function runHarnessCommand(options = {}, {
  rootDir,
  aiosRootDir = '',
  io = console,
  executeTurn = null,
  sleepImpl,
} = {}) {
  const subcommand = normalizeText(options.subcommand, 'run');
  const runtimeAiosRootDir = path.resolve(normalizeText(aiosRootDir, rootDir));

  if (subcommand === 'status') {
    const status = await readSoloRunStatus({ rootDir, sessionId: options.sessionId });
    if (!status) {
      return { exitCode: 1 };
    }
    await renderStatus(io, status, options.json === true);
    return { exitCode: 0, status };
  }

  if (subcommand === 'stop') {
    const existing = await readSoloRunSummary({ rootDir, sessionId: options.sessionId });
    if (!existing) {
      return { exitCode: 1 };
    }
    await requestSoloHarnessStop({
      rootDir,
      sessionId: options.sessionId,
      reason: normalizeText(options.reason, 'operator-request'),
    });
    const summary = await writeSoloRunSummary({
      rootDir,
      ...existing,
      stopRequested: true,
      updatedAt: new Date().toISOString(),
    });
    const status = await readSoloRunStatus({ rootDir, sessionId: summary.sessionId });
    await renderStatus(io, status, options.json === true);
    return { exitCode: 0, status };
  }

  if (subcommand === 'run') {
    const provider = normalizeText(options.provider, 'codex');
    if (options.transport === 'rpc' && provider !== 'pi') {
      throw new Error('--transport rpc is only supported with --provider pi');
    }
    const objective = normalizeText(options.objective);
    if (!objective) {
      throw new Error('harness run requires --objective');
    }
    const hooksEnabled = options.lifecycleHooks !== false;
    const session = ensureSoloHarnessSession({
      rootDir,
      sessionId: options.sessionId,
      provider,
      objective,
    });

    const journal = await initSoloRunJournal({
      rootDir,
      sessionId: session.sessionId,
      objective,
      provider: session.profile.provider,
      clientId: session.profile.clientId,
      profile: normalizeText(options.profile, 'standard'),
      worktree: {
        enabled: options.worktree === true,
        baseRef: normalizeText(options.baseRef, 'HEAD'),
        path: '',
        preserved: false,
        cleanupReason: '',
      },
      aiosRootDir: runtimeAiosRootDir,
      workspaceRoot: path.resolve(rootDir),
    });

    if (options.dryRun === true) {
      return await reportHarnessDryRun({
        rootDir,
        options,
        io,
        provider,
        sessionId: session.sessionId,
        objective,
        worktreeEnabled: options.worktree === true,
      });
    }

    const readiness = await checkSoloHarnessProfileReadiness({
      provider,
    });
    if (!readiness.ok) {
      if (options.json === true) {
        io.log(JSON.stringify(readiness, null, 2));
      } else {
        io.log(`AIOS Harness: readiness blocked\nReason: ${readiness.reason}\n- ${readiness.nextActions.join('\n- ')}\n`);
      }
      return { exitCode: 1 };
    }

    let prepared = null;
    let preservedWorktree = journal.summary.worktree;
    if (options.worktree === true) {
      prepared = await prepareSoloWorktree({
        rootDir,
        sessionId: session.sessionId,
        objective,
        enabled: true,
        baseRef: normalizeText(options.baseRef, 'HEAD'),
      });
      preservedWorktree = {
        enabled: true,
        baseRef: prepared.baseRef,
        path: prepared.path,
        preserved: false,
        cleanupReason: '',
        workspacePath: prepared.workspacePath,
        initialHead: prepared.initialHead,
      };
      await writeSoloRunSummary({
        rootDir,
        ...journal.summary,
        worktree: preservedWorktree,
        updatedAt: new Date().toISOString(),
      });
    }

    if (preservedWorktree?.enabled && preservedWorktree.path) {
      const codemapStatePath = path.join(rootDir, '.aios', 'codemap.json');
      if (existsSync(codemapStatePath)) {
        try {
          const { buildCodemap } = await import('../../../../../tooling/components/codemap/codemap.mjs');
          await buildCodemap({ projectRoot: preservedWorktree.workspacePath || preservedWorktree.path, io: { log: (msg) => {} } });
        } catch (buildErr) {
          io.log(`[warn] codemap build in worktree failed: ${buildErr instanceof Error ? buildErr.message : String(buildErr)}`);
        }
      }
    }

    const rpcExecutor = options.transport === 'rpc'
      ? buildPiRpcExecuteTurn({
        rootDir,
        sessionId: session.sessionId,
        objective,
        turnTimeoutMs: options.turnTimeoutMs,
      })
      : null;
    try {
      const result = await runSoloHarnessLoop({
        rootDir,
        sessionId: session.sessionId,
        objective,
        provider: session.profile.provider,
        clientId: session.profile.clientId,
        profile: normalizeText(options.profile, 'standard'),
        worktree: preservedWorktree,
        executeTurn: executeTurn || rpcExecutor?.executeTurn || buildProductionExecuteTurn({
          rootDir,
          sessionId: session.sessionId,
          objective,
          provider,
          aiosRootDir: runtimeAiosRootDir,
          turnTimeoutMs: options.turnTimeoutMs,
        }),
        maxIterations: options.maxIterations,
        lifecycleHooks: createLifecycleHooks({ enabled: hooksEnabled }),
        sleepImpl,
        pacing: buildLoopPacingConfig({
          unattended: options.unattended === true,
          computeQuota: options.quota,
          cadenceBaseMs: options.cadenceBaseMs,
          cadenceMaxMs: options.cadenceMaxMs,
          quietThreshold: options.quietThreshold,
          safeBypass: options.safeBypass !== false,
        }),
      });
      let summary = result.summary;
      if (prepared) {
        const finalized = await finalizeSoloWorktree({
          rootDir,
          worktree: {
            ...prepared,
            path: prepared.path,
            workspacePath: prepared.workspacePath,
            initialHead: prepared.initialHead,
          },
          finalStatus: summary.status,
        });
        summary = await writeSoloRunSummary({
          rootDir,
          ...summary,
          worktree: {
            enabled: finalized.enabled,
            baseRef: finalized.baseRef,
            path: finalized.path,
            preserved: finalized.preserved,
            cleanupReason: finalized.cleanupReason,
          },
          updatedAt: new Date().toISOString(),
        });
      }
      const status = await readSoloRunStatus({ rootDir, sessionId: summary.sessionId });
      await renderStatus(io, status, options.json === true);
      return { exitCode: 0, status };
    } catch (error) {
      if (prepared) {
        await finalizeSoloWorktree({
          rootDir,
          worktree: prepared,
          finalStatus: 'failed',
        });
      }
      throw error;
    } finally {
      await rpcExecutor?.dispose?.();
    }
  }

  if (subcommand === 'resume') {
    const hooksEnabled = options.lifecycleHooks !== false;
    const existing = await readSoloRunSummary({ rootDir, sessionId: options.sessionId });
    if (!existing) {
      return { exitCode: 1 };
    }
    // 中文注释：这里以前不读 dryRun —— `resume --dry-run` 会**静默调起真 provider**，
    // 而 dry-run 这个词的全部含义就是“不要调模型”。一个表示不花钱的开关被忽略，
    // 是成本侧的意外，不是选项排版问题。现在与 run 共用同一个渲染器，并且只读不写：
    // 不清 stop 标志、不动 worktree，所以 dry-run 之后这条会话仍停在它本来的位置。
    if (options.dryRun === true) {
      return await reportHarnessDryRun({
        rootDir,
        options,
        io,
        provider: existing.provider,
        sessionId: existing.sessionId,
        objective: existing.objective,
        worktreeEnabled: existing.worktree?.enabled === true,
      });
    }
    await clearSoloHarnessStop({ rootDir, sessionId: existing.sessionId });
    const restoredWorktree = await resolveResumeWorktree({ rootDir, summary: existing });
    const summary = await writeSoloRunSummary({
      rootDir,
      ...existing,
      stopRequested: false,
      worktree: restoredWorktree,
      updatedAt: new Date().toISOString(),
    });
    if (options.transport === 'rpc' && summary.provider !== 'pi') {
      throw new Error('--transport rpc is only supported with --provider pi');
    }
    const rpcExecutor = options.transport === 'rpc'
      ? buildPiRpcExecuteTurn({
        rootDir,
        sessionId: summary.sessionId,
        objective: summary.objective,
        turnTimeoutMs: options.turnTimeoutMs,
      })
      : null;
    let result;
    try {
      result = await runSoloHarnessLoop({
        rootDir,
        sessionId: summary.sessionId,
        objective: summary.objective,
        provider: summary.provider,
        clientId: summary.clientId,
        profile: summary.profile,
        worktree: restoredWorktree,
        executeTurn: executeTurn || rpcExecutor?.executeTurn || buildProductionExecuteTurn({
          rootDir,
          aiosRootDir: existing.aiosRootDir || runtimeAiosRootDir,
          sessionId: summary.sessionId,
          objective: summary.objective,
          provider: summary.provider,
          turnTimeoutMs: options.turnTimeoutMs,
        }),
      maxIterations: options.maxIterations,
      lifecycleHooks: createLifecycleHooks({ enabled: hooksEnabled }),
      sleepImpl,
      pacing: buildLoopPacingConfig({
        unattended: options.unattended === true,
        computeQuota: options.quota,
        cadenceBaseMs: options.cadenceBaseMs,
        cadenceMaxMs: options.cadenceMaxMs,
        quietThreshold: options.quietThreshold,
        safeBypass: options.safeBypass !== false,
      }),
      });
    } finally {
      await rpcExecutor?.dispose?.();
    }
    if (restoredWorktree?.enabled && restoredWorktree?.path) {
      const finalized = await finalizeSoloWorktree({
        rootDir,
        worktree: restoredWorktree,
        finalStatus: result.summary.status,
      });
      const finalSummary = await writeSoloRunSummary({
        rootDir,
        ...result.summary,
        worktree: {
          enabled: finalized.enabled,
          baseRef: finalized.baseRef,
          path: finalized.path,
          workspacePath: finalized.workspacePath,
          initialHead: finalized.initialHead,
          preserved: finalized.preserved,
          cleanupReason: finalized.cleanupReason,
        },
        updatedAt: new Date().toISOString(),
      });
      result = {
        ...result,
        summary: finalSummary,
      };
    }
    const status = await readSoloRunStatus({ rootDir, sessionId: result.summary.sessionId });
    await renderStatus(io, status, options.json === true);
    return { exitCode: 0, status };
  }

  if (subcommand === 'dashboard') {
    // 只读投影：唯一的写动作是 dashboard.html 本身。
    const { target, data } = await writeHarnessDashboard({ rootDir, env: process.env });
    if (options.json === true) {
      io.log(JSON.stringify({ target, sessions: data.sessions.length, settlements: data.rex.settlements.length }, null, 2));
    } else {
      io.log(`AIOS Harness Dashboard (read-only): ${target}`);
      io.log(`Sessions: ${data.sessions.length} · Settlements: ${data.rex.settlements.length} · Dream proposals: ${data.dream.proposalCount}`);
    }
    return { exitCode: 0, target };
  }

  return { exitCode: 1 };
}
