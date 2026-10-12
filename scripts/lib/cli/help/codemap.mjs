// 中文注释：客户端目标来自注册表，避免新增客户端时帮助文本滞后。
import { getClientHelpList } from '../../clients/registry.mjs';

function clientHelpChoices() {
  return ['all', ...getClientHelpList().clientNames].join('|');
}

export function getCodemapHelpText() {
  return `AIOS Codemap - code-review-graph integration

Usage:
  aios internal codemap <action> [options]

Actions:
  install    Install code-review-graph: uvx check, graph build, MCP inject, client docs update
  uninstall  Remove CRG configs, plugin, state (preserves .code-review-graph/)
  doctor     Health check for codemap installation
  build      Full graph rebuild from scratch
  update     Incremental graph update (changed files only, <2s)
  status     Show codemap state and graph statistics

Options:
  --client <${clientHelpChoices()}>
             Target client config(s). Defaults to all.
  --fix      (doctor) auto-fix issues found
  --dry-run  Preview changes without writing

Client config targets:
  codex    ~/.codex/config.toml ([mcp_servers.code-review-graph])
  claude   ~/.claude.json (user scope; falls back to <project>/.mcp.json without a home)
  gemini   ~/.gemini/settings.json (user scope; falls back to <project>/.gemini/settings.json)
  opencode ~/.config/opencode/opencode.json + CRG plugin
  hermes   ~/.hermes/config.yaml (mcp_servers.code-review-graph)
  grok     ~/.grok/config.toml ([mcp_servers.code-review-graph])
  workbuddy ~/.workbuddy/mcp.json
  pi       ~/.pi/agent/mcp.json (mcpServers; entry shape shared with the Pi component, no 'type')
  zcode    ~/.zcode/cli/config.json (mcp.servers, nested JSON + strict server schema)
  qoder    <edition home>/settings.json (mcpServers; CN ~/.qoder-cn, intl ~/.qoder) + <project>/.qoder/settings.json

Notes:
  claude has a second, project-level switch: .claude/settings.local.json's
  disabledMcpjsonServers. --fix writes only the user scope, so a listed
  code-review-graph must be removed from that array by hand.
  A graph older than the last commit is reported as stale and rebuilt on install.

Restart the selected client after install/doctor --fix so it reloads MCP config.

Examples:
  aios internal codemap install
  aios internal codemap install --client codex
  aios internal codemap doctor --fix
  aios internal codemap build
  aios internal codemap update
`;
}
