/**
 * Reconcile sessions that stopped without reaching the normal session-end hook.
 *
 * The run summary persists `updatedAt` but carries no owner field, so staleness alone
 * cannot prove a session is dead. Reconciliation is therefore conservative and combines
 * two signals: the session-owner liveness record (when present) and a stale-threshold
 * backstop for a running/backoff session. The last checkpoint remains immutable;
 * reconciliation adds an auditable interruption record and a reviewable memory candidate.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveContextDbRoot } from '../../../../environment/aios/state-root.mjs';
import { atomicWriteText } from '../../../../memory/memo/storage/base/fs-io.mjs';
import { getSoloHarnessPaths } from '../../../harness/solo/solo-journal/plumbing/paths.mjs';
import { checkRunSummaryConsistency } from '../../../harness/solo/solo-journal/content/consistency.mjs';
import { readSoloRunSummary } from '../../../harness/solo/solo-journal/content/summary.mjs';
import { isProcessAlive, readSessionOwner } from '../../../harness/solo/solo-journal/content/owner.mjs';
import { autoMemoSessionClose, readSessionCloseCandidate } from './close.mjs';

const INTERRUPTION_FILE = 'session-interruption.json';
const ACTIVE_STATUSES = new Set(['running', 'backoff']);
const TERMINAL_STATUSES = new Set(['done', 'stopped', 'failed', 'blocked', 'human-gate', 'interrupted']);
export const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000;

function sessionsRoot(rootDir, env = process.env) {
  return path.join(resolveContextDbRoot(rootDir, { preferLegacyExisting: true, env }), 'sessions');
}

function interruptionPath(rootDir, sessionId, env = process.env) {
  return path.join(getSoloHarnessPaths({ rootDir, sessionId }).dir, INTERRUPTION_FILE);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function latestStartedWithoutCompletion(rootDir, sessionId) {
  const hookPath = getSoloHarnessPaths({ rootDir, sessionId }).hookEventsPath;
  try {
    const lines = (await fs.readFile(hookPath, 'utf8')).split(/\r?\n/u).filter(Boolean);
    const states = new Map();
    for (const line of lines) {
      const event = JSON.parse(line);
      if (event?.kind !== 'iteration-lifecycle') continue;
      states.set(Number(event.iteration), event.status);
    }
    const incomplete = [...states.entries()]
      .filter(([, status]) => status === 'started')
      .map(([iteration]) => iteration)
      .sort((a, b) => b - a)[0];
    return Number.isFinite(incomplete) ? incomplete : null;
  } catch {
    return null;
  }
}

async function listSessionIds(rootDir, env = process.env) {
  try {
    const entries = await fs.readdir(sessionsRoot(rootDir, env), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function isStale(summary, nowMs, staleAfterMs) {
  const updatedMs = Date.parse(summary?.updatedAt || '');
  return Number.isFinite(updatedMs) && nowMs - updatedMs >= staleAfterMs;
}

/**
 * Reconcile stale non-terminal solo sessions.
 *
 * @returns {{ inspected: number, reconciled: Array, skipped: Array }}
 */
export async function reconcileUnclosedSessions({
  rootDir,
  activeSessionId = '',
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
  now = new Date(),
  env = process.env,
  logger = console,
} = {}) {
  if (!rootDir) return { inspected: 0, reconciled: [], skipped: [] };
  const result = { inspected: 0, reconciled: [], skipped: [] };
  const nowMs = now.getTime();

  for (const sessionId of await listSessionIds(rootDir, env)) {
    result.inspected += 1;
    if (sessionId === activeSessionId) {
      result.skipped.push({ sessionId, reason: 'active-session' });
      continue;
    }

    const summary = await readSoloRunSummary({ rootDir, sessionId });
    if (!summary) {
      result.skipped.push({ sessionId, reason: 'missing-summary' });
      continue;
    }
    const status = String(summary.status || '').trim().toLowerCase();
    if (TERMINAL_STATUSES.has(status)) {
      result.skipped.push({ sessionId, reason: `terminal:${status}` });
      continue;
    }
    const owner = await readSessionOwner(rootDir, sessionId);
    if (owner && isProcessAlive(owner.pid)) {
      result.skipped.push({ sessionId, reason: 'owner-alive' });
      continue;
    }
    if (!ACTIVE_STATUSES.has(status) || !isStale(summary, nowMs, staleAfterMs)) {
      result.skipped.push({ sessionId, reason: 'not-stale' });
      continue;
    }

    const existing = await readJson(interruptionPath(rootDir, sessionId, env));
    if (existing) {
      result.skipped.push({ sessionId, reason: 'already-reconciled' });
      continue;
    }

    const incompleteIteration = await latestStartedWithoutCompletion(rootDir, sessionId);
    // 完成数与漂移判定同源：完成数取账本（iteration 记录），不取 summary 投影。投影在崩溃窗口内
    // 可能滞后，若拿它当证据，恢复记录本身会报出账本不支持的轮数。
    const consistency = await checkRunSummaryConsistency({ rootDir, sessionId, summary });
    const lastCompletedIteration = consistency.ledger.lastIteration;
    const ownerDead = Boolean(owner && !isProcessAlive(owner.pid));
    const interruptionReason = ownerDead
      ? 'process-crashed-during-iteration'
      : (incompleteIteration !== null ? 'stale-running-with-incomplete-iteration' : 'process-exited-before-session-finalizer');
    const interruption = {
      schemaVersion: 1,
      kind: 'session-interruption',
      sessionId,
      status: 'interrupted',
      previousStatus: status,
      reason: interruptionReason,
      detectedAt: now.toISOString(),
      lastCheckpointAt: summary.updatedAt || null,
      lastCompletedIteration,
      incompleteIteration,
      resumeAvailable: true,
      evidenceRefs: [
        `checkpoint:session/${sessionId}/iteration-${String(lastCompletedIteration).padStart(4, '0')}`,
        `journal:session/${sessionId}/run-summary.json`,
      ],
    };
    if (!consistency.consistent) {
      // 只记录，不修复：恢复记录必须能解释“为什么完成数与投影不一致”，
      // 而静默改写会把被观测的漂移事实消掉。修复属独立决定（work-6 S3）。
      interruption.summaryDrift = {
        fields: consistency.driftFields,
        projected: consistency.projected,
        ledger: consistency.ledger,
      };
    }
    await atomicWriteText(interruptionPath(rootDir, sessionId, env), `${JSON.stringify(interruption, null, 2)}\n`);

    // Candidate generation remains proposal-only. The immutable interruption
    // record is the evidence that explains why this candidate was produced.
    const candidate = await autoMemoSessionClose({ rootDir, sessionId, env });
    result.reconciled.push({ sessionId, interruption, candidateId: candidate?.candidateId || null });
    if (logger?.log) logger.log(`[session-reconcile] interrupted session recorded: ${sessionId}`);
  }

  return result;
}

export { INTERRUPTION_FILE, interruptionPath };
