// AIOS Pi extension entry. Loaded by Pi via jiti (TypeScript without a
// build step). All decisions live in ./lib (plain .mjs, unit-tested); this
// file only wires Pi events to them. Written in strippable TypeScript (type
// imports only) so plain node can import it in tests.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AIOS_SYSTEM_PROMPT_ADDITION, buildBeforeAgentStartMessage, decideToolCall } from '../lib/gates.mjs';
import { resolveAiosRoot, runAios, runAiosJson } from '../lib/aios-cli.mjs';
import { buildToolDefs } from '../lib/tools.mjs';
import { offloadMessages, resolveOffloadArchiveDir, resolveOffloadConfig } from '../lib/offload.mjs';

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

async function defaultLoadTypeBox() {
  return import('typebox');
}

export default async function aiosExtension(pi: ExtensionAPI, deps = {}) {
  const loadTypeBox = deps.loadTypeBox || defaultLoadTypeBox;
  const aiosRoot = deps.aiosRoot !== undefined
    ? deps.aiosRoot
    : resolveAiosRoot({
      env: deps.env || process.env,
      startDir: path.dirname(fileURLToPath(import.meta.url)),
      existsSync: deps.existsSync || (await import('node:fs')).existsSync,
    });
  const runImpl = deps.runAios || (async ({ argv, json }) => {
    const text = json
      ? JSON.stringify(await runAiosJson({ aiosRoot, argv }))
      : await runAios({ aiosRoot, argv });
    return { text };
  });

  const { Type } = await loadTypeBox();
  for (const tool of buildToolDefs({ Type, run: runImpl })) {
    pi.registerTool(tool);
  }

  pi.on('tool_call', async (event) => {
    return decideToolCall({ toolName: event?.toolName, input: event?.input });
  });

  // ObservationPack-lite: before each LLM call, archive oversized text
  // observations and keep only a handle + excerpt in context. Best-effort:
  // any failure returns undefined so the turn proceeds unmodified.
  const offloadEnv = deps.env || process.env;
  const fsPromises = await import('node:fs/promises');
  pi.on('context', async (event) => {
    const config = resolveOffloadConfig(offloadEnv);
    if (!config.enabled) return undefined;
    try {
      await offloadMessages({
        messages: event?.messages,
        thresholdChars: config.thresholdChars,
        archiveDir: resolveOffloadArchiveDir(offloadEnv),
        readFileImpl: deps.readFileImpl || fsPromises.readFile,
        writeFileImpl: deps.writeFileImpl || (async (filePath, data, encoding) => {
          await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
          await fsPromises.writeFile(filePath, data, encoding);
        }),
      });
      return { messages: event?.messages };
    } catch {
      return undefined;
    }
  });

  pi.on('before_agent_start', async () => {
    let memoryDigest = '';
    try {
      const { text } = await runImpl({ argv: ['memo', 'search', 'session continuity', '--limit', '3'] });
      memoryDigest = String(text || '').slice(0, 2000);
    } catch {
      memoryDigest = '';
    }
    return {
      message: buildBeforeAgentStartMessage({ memoryDigest }),
    };
  });

  pi.on('session_start', async (_event, ctx) => {
    if (ctx?.ui?.setStatus) {
      try {
        ctx.ui.setStatus('aios', aiosRoot ? `AIOS: ${aiosRoot}` : 'AIOS: root unresolved');
      } catch {
        // status line is best-effort; never break session startup.
      }
    }
  });

  pi.registerCommand('aios-root', {
    description: 'Show the AIOS install root this extension drives',
    handler: async (_args, ctx) => {
      ctx?.ui?.notify?.(aiosRoot ? `AIOS root: ${aiosRoot}` : 'AIOS root unresolved (export AIOS_ROOT_DIR)', 'info');
    },
  });

  pi.registerCommand('aios-policy', {
    description: 'Show the AIOS workflow policy injected into this session',
    handler: async (_args, ctx) => {
      ctx?.ui?.notify?.(AIOS_SYSTEM_PROMPT_ADDITION, 'info');
    },
  });

  return { aiosRoot };
}
