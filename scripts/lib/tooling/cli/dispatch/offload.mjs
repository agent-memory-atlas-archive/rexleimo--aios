/* 中文注释：CLI 分发层把 refs、doctor、proof 等确定性入口接到统一命令面。 */
import { loadWorkspaceConfig, resolveRuntimeWorkspace } from './runtime.mjs';

/* 中文注释：refs 命令先查 interception refs，再查旧 offload refs；这样新旧召回体系可以平滑共存。 */
function writeLine(stream, text) {
  stream.write(`${text}\n`);
}

export async function runRefsCommand(parsed, { stdout = process.stdout, stderr = process.stderr, ...context } = {}) {
  const { resolveStorage } = await import('../../../memory/offload/tool-offload.mjs');
  const { readRef, grepRefs, listRefs, pruneRefs } = await import('../../../memory/offload/refs-store.mjs');
  const { readInterceptionRef, grepInterceptionRefs, listInterceptionRefs, pruneInterceptionRefs } = await import('../../../foundation/interception/observability/refs/index.mjs');
  const ws = resolveRuntimeWorkspace(parsed.command, parsed.options, context);
  const config = await loadWorkspaceConfig(ws);
  const storage = resolveStorage(parsed.options, process.env, config);
  const sub = parsed.options.subcommand || 'list';
  const limit = Number(parsed.options.limit) || 20;

  if (sub === 'grep') {
    /* 中文注释：grep 只展示命中的 ref 元信息，不直接输出原文，避免一次搜索又把大文本灌回上下文。 */
    const pattern = parsed.options.pattern;
    if (!pattern) {
      stderr.write('Usage: aios refs grep <pattern> [--session S]\n');
      process.exitCode = 1;
      return;
    }
    const interceptionResults = await grepInterceptionRefs({
      workspaceRoot: ws,
      pattern,
      sessionId: parsed.options.session,
      limit,
    });
    for (const item of interceptionResults) writeLine(stdout, `${item.ref_id}  interception/${item.source || ''}  ${item.host || ''}  ${item.path}`);
    const remaining = limit - interceptionResults.length;
    if (remaining <= 0) return;
    const results = await grepRefs(ws, pattern, { sessionId: parsed.options.session, storage, limit: remaining });
    for (const item of results) writeLine(stdout, `${item.node_id}  ${item.tool || ''}  ${item.ts || ''}  ${item.path}`);
    return;
  }

  if (sub === 'read') {
    /* 中文注释：read 是显式召回动作；只有用户/Agent 指定 refId 时才把 raw 打印出来。 */
    const nodeId = parsed.options.nodeId;
    if (!nodeId) {
      stderr.write('Usage: aios refs read <node_id>\n');
      process.exitCode = 1;
      return;
    }
    const interception = await readInterceptionRef({ workspaceRoot: ws, nodeId: parsed.options.nodeId, refId: parsed.options.nodeId, sessionId: parsed.options.session });
    if (interception) {
      stdout.write(interception.raw);
      return;
    }
    const content = await readRef(ws, nodeId, storage);
    if (content) {
      stdout.write(typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    } else {
      stderr.write(`[offload] node ${nodeId} not found\n`);
      process.exitCode = 1;
    }
    return;
  }

  if (sub === 'list') {
    /* 中文注释：list 把 interception refs 放前面，保证 proof/doctor 生成的证据最容易被发现。 */
    const interceptionResults = await listInterceptionRefs({ workspaceRoot: ws, sessionId: parsed.options.session, limit });
    for (const item of interceptionResults) writeLine(stdout, `${item.ref_id}  interception/${item.source || ''}  ${item.session}  ${item.path || ''}`);
    const remaining = limit - interceptionResults.length;
    if (remaining <= 0) return;
    const results = await listRefs(ws, { sessionId: parsed.options.session, storage, limit: remaining });
    for (const item of results) writeLine(stdout, `${item.node_id}  ${item.session}  ${item.path || ''}`);
    return;
  }

  if (sub === 'prune') {
    /* 中文注释：prune 同时清理新旧 refs。保留期判定单一 owner 在 refs/retention.mjs：
     * 先读每条 ref 自己申明的 `ttl_days` / `created_at`，没有才退回 mtime；当前会话整体保护，
     * 否则长任务恢复时召回链会被斩断。 */
    const keepDays = Number(parsed.options.keepDays) || 30;
    const dryRun = parsed.options.dryRun === true;
    const interception = await pruneInterceptionRefs({
      workspaceRoot: ws,
      keepDays,
      activeSessionId: parsed.options.session || '',
      mode: dryRun ? 'dry-run' : 'enforce',
    });
    const result = await pruneRefs(ws, { storage, keepDays });
    const basis = Object.entries(interception.clockBasis || {})
      .map(([key, count]) => `${key}=${count}`)
      .join(', ');
    writeLine(stdout, `${dryRun ? 'Would prune' : 'Pruned'} ${result.pruned + interception.pruned} refs, `
      + `freed ${((result.bytesFreed + interception.bytesFreed) / 1024).toFixed(1)}KB `
      + `(scanned ${interception.scanned}, ${interception.elapsedMs}ms${basis ? `, basis: ${basis}` : ''}`
      + `${interception.truncated ? ', truncated by budget' : ''})`);
    return;
  }

  stderr.write(`Unknown refs subcommand: ${sub}. Use: grep, read, list, prune\n`);
  process.exitCode = 1;
}

/* 中文注释：canvas 仍服务旧 offload 可视化；interception refs 不强塞进 canvas，避免概念混杂。 */
export async function runCanvasCommand(parsed, { stdout = process.stdout, stderr = process.stderr, ...context } = {}) {
  const { resolveStorage } = await import('../../../memory/offload/tool-offload.mjs');
  const { loadCanvas, canvasToMermaid, getCanvasPaths } = await import('../../../memory/offload/mermaid-canvas.mjs');
  const ws = resolveRuntimeWorkspace(parsed.command, parsed.options, context);
  const config = await loadWorkspaceConfig(ws);
  const storage = resolveStorage(parsed.options, process.env, config);
  const sub = parsed.options.subcommand || 'show';
  const session = parsed.options.session || 'default';

  if (sub === 'show') {
    const fmt = parsed.options.format || 'mmd';
    const canvas = await loadCanvas(ws, session, storage);
    if (fmt === 'json') {
      stdout.write(`${JSON.stringify(canvas, null, 2)}\n`);
    } else {
      stdout.write(canvasToMermaid(canvas));
    }
    return;
  }

  if (sub === 'path') {
    const paths = getCanvasPaths(ws, session, storage);
    stdout.write(`${JSON.stringify(paths, null, 2)}\n`);
    return;
  }

  if (sub === 'backfill') {
    const inputPath = String(parsed.options.inputPath || '').trim();
    if (!inputPath) {
      stderr.write('Usage: aios canvas backfill --input <events.jsonl> --client <client> [--session S]\n');
      process.exitCode = 1;
      return;
    }
    const { backfillFromJsonl } = await import('../../../memory/offload/backfill.mjs');
    const result = await backfillFromJsonl({
      workspaceRoot: ws,
      sessionId: session,
      client: parsed.options.client || '',
      inputPath,
      storage,
      config,
    });
    writeLine(stdout, `Backfilled scanned=${result.scanned} offloaded=${result.offloaded} skipped=${result.skipped} errors=${result.errors}`);
    return;
  }

  stderr.write(`Unknown canvas subcommand: ${sub}. Use: show, path, backfill\n`);
  process.exitCode = 1;
}
