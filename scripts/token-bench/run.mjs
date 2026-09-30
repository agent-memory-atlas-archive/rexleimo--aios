#!/usr/bin/env node
// scripts/token-bench/run.mjs — frozen held-out token benchmark runner (M2).
// Executes scripts/fixtures/token-bench/tasks/*.json against the managed pi
// RPC transport; per-turn usage flows into the unified ledger (layer
// 'pi_usage', task_id attributed) via the same tap the harness uses.
//   --dry          validate the task set and print the plan; spawn nothing
//   --session <id> ledger session id (default: token-bench)
//   --limit <n>    run only the first n tasks
//   --json         machine-readable output
// Live runs cost real tokens; the A/B treatment toggle lands with the first
// absorbed mechanism (architecture doc: docs/plans/2026-09-30-token-intelligence-v2).
import { mkdirSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { createPiRpcSession } from '../lib/pi/rpc-client.mjs';
import { createLedgerUsageTap } from '../lib/pi/usage-tap.mjs';

const DEFAULT_TASKS_DIR = path.resolve(import.meta.dirname, '..', 'fixtures', 'token-bench', 'tasks');

export function validateTask(task, fileName) {
  const errors = [];
  if (!task || typeof task !== 'object') {
    return [`${fileName}: task must be a JSON object`];
  }
  if (!/^bench-[a-z0-9-]+$/u.test(String(task.id || ''))) {
    errors.push(`${fileName}: id must match bench-<kebab-id>`);
  }
  if (!String(task.objective || '').trim()) {
    errors.push(`${fileName}: objective must be a non-empty prompt`);
  }
  if (task.checks !== undefined && !Array.isArray(task.checks)) {
    errors.push(`${fileName}: checks must be an array when present`);
  }
  for (const check of Array.isArray(task.checks) ? task.checks : []) {
    if (!check || check.type !== 'reply_contains' || !String(check.value || '')) {
      errors.push(`${fileName}: unsupported check (only { type: 'reply_contains', value })`);
    }
  }
  return errors;
}

export async function loadTaskSet(tasksDir = DEFAULT_TASKS_DIR) {
  const fileNames = (await readdir(tasksDir)).filter((name) => name.endsWith('.json')).sort();
  const tasks = [];
  const errors = [];
  for (const fileName of fileNames) {
    const raw = await readFile(path.join(tasksDir, fileName), 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      errors.push(`${fileName}: invalid JSON (${error.message})`);
      continue;
    }
    const taskErrors = validateTask(parsed, fileName);
    errors.push(...taskErrors);
    if (taskErrors.length === 0) tasks.push(parsed);
  }
  return { tasks, errors };
}

export function buildExecutionPlan(tasks, { sessionId = 'token-bench' } = {}) {
  return {
    session: sessionId,
    tasks: tasks.map((task) => ({ id: task.id, checks: (task.checks || []).length })),
    ledger_layer: 'pi_usage',
  };
}

function checkReply(task, reply) {
  const failed = (task.checks || []).filter((check) => !String(reply || '').includes(check.value));
  return { passed: failed.length === 0, failed: failed.map((check) => check.value) };
}

export async function runTask(task, { workspaceRoot, sessionId, promptTimeoutMs = 120000, model = null }) {
  const session = createPiRpcSession({
    onEvent: createLedgerUsageTap({ workspaceRoot, sessionId, taskId: task.id }),
  });
  session.start();
  try {
    if (model) {
      const separator = model.indexOf('/');
      if (separator <= 0) throw new Error(`model must be provider/modelId, got: ${model}`);
      await session.setModel({ provider: model.slice(0, separator), modelId: model.slice(separator + 1) });
    }
    const flow = await session.runPromptFlow(task.objective, { timeoutMs: promptTimeoutMs });
    const reply = String(flow?.text || '');
    return { id: task.id, accepted: Boolean(flow?.accepted), reply, ...checkReply(task, reply) };
  } finally {
    await session.close().catch(() => {});
  }
}

function parseArgv(argv) {
  const options = { tasksDir: DEFAULT_TASKS_DIR, sessionId: 'token-bench', limit: 0, dry: false, json: false, promptTimeoutMs: 120000, model: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--tasks') options.tasksDir = path.resolve(argv[++index]);
    else if (flag === '--session') options.sessionId = String(argv[++index]);
    else if (flag === '--limit') options.limit = Number(argv[++index]) || 0;
    else if (flag === '--prompt-timeout-ms') options.promptTimeoutMs = Number(argv[++index]) || options.promptTimeoutMs;
    else if (flag === '--model') options.model = String(argv[++index] || '');
    else if (flag === '--dry') options.dry = true;
    else if (flag === '--json') options.json = true;
    else throw new Error(`unknown flag: ${flag}`);
  }
  return options;
}

export async function main(argv = process.argv.slice(2), { stdout = process.stdout } = {}) {
  const options = parseArgv(argv);
  const { tasks, errors } = await loadTaskSet(options.tasksDir);
  if (errors.length > 0) {
    for (const error of errors) stdout.write(`[invalid] ${error}\n`);
    process.exitCode = 1;
    return { ok: false, errors };
  }
  const selected = options.limit > 0 ? tasks.slice(0, options.limit) : tasks;
  if (!options.dry) {
    // Tasks may write scratch files under .aios/tmp (gitignored state root).
    mkdirSync(path.join('.aios', 'tmp', 'token-bench'), { recursive: true });
  }
  if (options.dry) {
    const plan = buildExecutionPlan(selected, { sessionId: options.sessionId });
    stdout.write(`${options.json ? JSON.stringify(plan, null, 2) : `dry plan: ${plan.tasks.length} tasks -> ledger layer pi_usage, session ${plan.session}`}\n`);
    return { ok: true, plan };
  }
  const results = [];
  for (const task of selected) {
    stdout.write(`[run] ${task.id}\n`);
    let result;
    try {
      result = await runTask(task, { workspaceRoot: process.cwd(), sessionId: options.sessionId, promptTimeoutMs: options.promptTimeoutMs, model: options.model || null });
    } catch (error) {
      results.push({ id: task.id, accepted: false, passed: false, failedChecks: [], error: String(error?.message || error) });
      stdout.write(`[error] ${task.id}: ${String(error?.message || error)}\n`);
      continue;
    }
    results.push({ id: result.id, accepted: result.accepted, passed: result.passed, failedChecks: result.failed });
    stdout.write(`[done] ${result.id} accepted=${result.accepted} passed=${result.passed}\n`);
  }
  const summary = { session: options.sessionId, tasks: results.length, passed: results.filter((r) => r.passed).length, results };
  stdout.write(`${options.json ? JSON.stringify(summary, null, 2) : `summary: ${summary.passed}/${summary.tasks} passed`}\n`);
  return { ok: true, summary };
}

/* 中文注释：直接执行时进入 CLI 模式；被测试 import 时只暴露可组合函数。 */
if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  await main();
}
