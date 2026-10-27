/* 中文注释：进程平台层统一跨系统启动细节，为 shell interception 提供稳定输入。 */
export { getEnvCaseInsensitive, splitWindowsPathEntries, splitWindowsPathExt } from './process/env.mjs';
export {
  getWindowsDirectCli,
  getWindowsNodeCli,
  resolveNodeScriptFromWindowsLauncher,
  resolveWindowsLauncherTarget,
  resolveWindowsCommandExt,
  resolveWindowsCommandPath,
  shouldUseWindowsShellCommand,
} from './process/windows-command.mjs';
export {
  getCommandSpawnSpec,
  commandExists,
  captureCommand,
  spawnCommand,
  spawnCommandWithInput,
  runCommand,
  splitExecutionOptions,
  terminateChildTree,
  TASKKILL_TIMEOUT_MS,
} from './process/spawn.mjs';
/* 中文注释：进程身份层——“这个 pid 有人用”和“还是原来那个进程”是两个不同的事实。
   只暴露判定入口，平台解析器留给测试直接引用，不进公开面。 */
export {
  isProcessAlive,
  probeProcessLiveness,
  readProcessStartTimeMs,
} from './process/identity.mjs';
