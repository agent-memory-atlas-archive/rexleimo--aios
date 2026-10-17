/* OpenCode CLI 代际探测：v1 顶层命令接受 --agent/--pure，v2 顶层只接受
 * --standalone/--server/--auto/--continue/--session/--prompt，--agent 仅存在于
 * `opencode run`。AIOS 注入参数前必须按代际分流，否则 v2 直接启动失败。 */
import { captureCommand } from '../../foundation/platform/process.mjs';

export const OPENCODE_CLI_GENERATION_ENV = 'AIOS_OPENCODE_CLI_GENERATION';

const VERSION_CAPTURE_OPTIONS = { timeout: 5_000 };

// 纯函数：把 env 覆盖值或探测结果归一为 1 / 2；无法判定时返回 null，由调用方
// 决定回退策略（本模块不回测猜测）。
export function normalizeOpenCodeCliGeneration(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (['1', 'v1', '1.x'].includes(raw)) return 1;
  if (['2', 'v2', '2.x'].includes(raw)) return 2;
  return null;
}

// 纯函数：从 `opencode --version` 输出提取主版本。接受 "v2.0.32"、"1.4.7"、
// 前后带说明文字的输出版式。
export function parseOpenCodeVersionMajor(output) {
  const match = String(output ?? '').match(/v?(\d+)\.\d+/);
  if (!match) return null;
  return Number.parseInt(match[1], 10) || null;
}

// 缓存键包含 commandName 与覆盖值：同一进程内多次启动不再重复 spawn。
const detectionCache = new Map();

export function detectOpenCodeCliGeneration(commandName = 'opencode', env = process.env, options = {}) {
  const override = normalizeOpenCodeCliGeneration(env[OPENCODE_CLI_GENERATION_ENV]);
  if (override) return override;

  const cacheKey = `${commandName}`;
  if (detectionCache.has(cacheKey)) return detectionCache.get(cacheKey);

  const capture = options.capture || captureCommand;
  let generation = null;
  try {
    const result = capture(commandName, ['--version'], VERSION_CAPTURE_OPTIONS);
    generation = parseOpenCodeVersionMajor(`${result.stdout || ''}\n${result.stderr || ''}`);
  } catch {
    generation = null;
  }

  detectionCache.set(cacheKey, generation);
  return generation;
}

// 测试专用：清掉进程内缓存，避免假二进制探测结果串用例。
export function resetOpenCodeCliGenerationCache() {
  detectionCache.clear();
}
