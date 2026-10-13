/* 中文注释：ZCode MCP 配置写入模块。字段白名单与规范化是中立共享知识，见
   `clients/mcp/zcode-schema.mjs`（browser 与 codemap 都从那里取，单一事实来源）。
   本模块只保留 browser 组件需要的“把 AIOS 托管的 server 写进 zcode 配置文件”这一步。 */
import { normalizeZcodeServerEntry } from '../../../../clients/integration/mcp/zcode-schema.mjs';

import { migrateOneMcpJsonFile } from '../mcp-migration.mjs';

export { ZCODE_SERVER_FIELDS_ALLOWLIST, normalizeZcodeServerEntry } from '../../../../clients/integration/mcp/zcode-schema.mjs';

export function migrateOneZcodeJsonFile(filePath, rootDir, { mode = undefined } = {}) {
  return migrateOneMcpJsonFile(filePath, rootDir, {
    serversKey: 'mcp.servers',
    mapManagedServerEntry: normalizeZcodeServerEntry,
    mode,
  });
}
