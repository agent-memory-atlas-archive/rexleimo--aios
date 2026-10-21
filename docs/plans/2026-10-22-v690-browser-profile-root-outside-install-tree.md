# v6.9.0 — browser profile 根移出安装树（profile-root relocation）

日期：2026-10-22 ｜ 路由：**planned** ｜ 版本影响：**minor**（新增 env 契约 + 默认位置变更 + 一次性迁移；不改任何既有 JSON key、不改 CLI 参数）

## 问题（已实测，非推测）

安装目录 `~/.rexcil/aios` 内部住着浏览器 profile 根 `.browser-profiles/`。于是"升级换入"和"浏览器会话"争同一个目录：

- 换入靠 `[System.IO.Directory]::Move($InstallDir, $retired)`（目录改名，不碰里面的文件）。**有 Chrome 以 `--user-data-dir=<安装树内路径>` 活着时，这个改名被 Windows 拒绝**，`aios update` 失败退出。
- 实测三次同因：21:58 一次（孤儿 browser MCP + 9 chrome，自行退出后升级成功）、00:09 一次（活会话，profile `grill`/`headless-check`，19 个 chrome，仍在写）、以及本工作项要防的以后每一次。
- 对照组证明锁源不是 node bridge：13 个 `contextdb-shell-bridge`/`ctx-agent` 持有安装树内脚本文件时，换入照样成功（它们只 open 文件、不占目录名）。
- 另一半代价：profile 在 `$preservePaths` 里，靠"改名让位 + 搬回"续命；一旦搬回失败（`Move-Item` 逐文件搬，遇独占锁会搬一半报错），登录态就留在 `.retired-*` 里，而退役目录会被随后的清理删掉。

## 目标与非目标

**目标**
1. profile 根默认落到安装树**外**：`~/.rexcil/browser-profiles`（与 `~/.rexcil/aios` 同卷，迁移用一次 rename 完成）。
2. 一个跨语言契约：`AIOS_BROWSER_PROFILE_ROOT`（绝对路径）。AIOS 侧计算并注入浏览器 MCP 子进程；mcp-server 侧只读它 + 家目录默认。
3. 一次性安全迁移：旧根存在、新根不存在、且**没有 Chrome 锁**时改名搬走；任一条件不满足就原样保留并给出可读状态（绝不搬活 profile）。
4. 配置零改动：`config/browser-profiles.json` 里 `.browser-profiles/<name>` 这些相对串**保持不变**，由 resolver 把它们映射到新根。相对值本来就是"名字"而不是"位置"，位置由根决定。

**非目标**
- 不改 `$preservePaths`（过渡期仍需它兜住尚未迁移的安装）。
- 不动 CDP profile 的端口命名规则（`default-cdp` / `default-cdp-<port>`）。
- 不引入 profile 根的多级搜索/软链接（一处定义，别处只读）。

## 现状（改动点已核实）

| 位置 | 现在的行为 |
|---|---|
| `scripts/lib/tooling/components/browser/runtime/cdp-service.mjs:59` | `userDataDir = path.join(rootDir, '.browser-profiles', …)` |
| `scripts/lib/tooling/components/browser/mcp/mcp-server-builders.mjs` | 构造浏览器 MCP 子进程 env（现在只 `delete AIOS_BROWSER_USE_REPO`） |
| `mcp-server/src/browser/session/profiles.ts:26-28,71,76-79` | `WORKSPACE_ROOT` 探测 + `PROFILES_DIR = WORKSPACE_ROOT/.browser-profiles` + `resolveWorkspacePath()` |
| `mcp-server/src/browser/session/launcher.ts:293,335` | 消费 `resolveWorkspacePath(profile.userDataDir)`；335 有硬编码兜底串 `.browser-profiles/local` |
| `scripts/aios-install.ps1:251-252` / `aios-install.sh:124-125` | `preservePaths` 含 `.browser-profiles`、`mcp-server/.browser-profiles` |

目录预算：`scripts/lib/tooling/components/browser` 现有 7 项 → 新增 1 个文件正好 8（`mcp/` 已满 8，只改文件不加文件）。

## 实施步骤（按依赖顺序）

1. **`components/browser/profile-root.mjs`（新增，纯函数）**
   - `browserProfileRoot({ env, homeDir })`：`AIOS_BROWSER_PROFILE_ROOT` 为绝对路径则用之，否则 `AIOS_HOME`（默认 `~/.rexcil`）下的 `browser-profiles`。
   - `resolveProfilePath(relOrAbs, { profileRoot, workspaceRoot })`：绝对 → 原样；`.browser-profiles/…` 前缀 → 折进 profileRoot；其余相对 → workspaceRoot（保持既有语义，不吞别的路径）。
   - `chromeProfileLockPresent(dir)`：只认 Chrome 自己的 `SingletonLock`（lstat 存在即视为活会话）。
   - `migrateLegacyProfileRoot({ legacyRoot, targetRoot, … })` → 状态枚举 `migrated | no-legacy | target-exists | locked | error`，只有 `migrated` 会动文件系统。
2. **接线**：`cdp-service.mjs` 用 profileRoot；`mcp-server-builders.mjs` 两处都注入 `AIOS_BROWSER_PROFILE_ROOT`。
3. **mcp-server 侧**：`profiles.ts` 读同一 env（家目录默认），`PROFILES_DIR`/`resolveWorkspacePath` 走新映射；`launcher.ts:335` 兜底串改用 `getProfileDir('local')`，不再拼字面量。
4. **迁移调用点**：浏览器组件安装/就绪路径里调用一次 `migrateLegacyProfileRoot`，状态进 `aios doctor` 输出（不静默）。迁移只在"新根不存在"时发生，天然幂等。
5. **测试**：
   - AIOS：`profile-root` 的映射/锁判定/五种迁移状态；`mcp-server-builders` 注入 env 的契约；`cdp-service` 生成的 `userDataDir` **不得**位于安装树内（这条是本次问题的直接回归钉）。
   - mcp-server：`npm run typecheck && npm run test`。
   - 现场：等活会话结束后跑 `aios update`，验证 (a) 换入不再被 Chrome 挡、(b) 迁移状态可见、(c) 旧 profile（含 `default` 4756 个文件的登录态）出现在新根。
6. **文档**：CHANGELOG + `VERSION` 6.9.0 + **发布帖**（feature release 必须有帖，`public-content-contract` 会按严格 YAML 解析 front matter——上版本就是被 `\`` 非法转义弄红 docs-pages 的）+ AGENTS.md 浏览器小节一行。

## 风险与门禁

- **门（单向）**：搬活 profile 会损坏登录态 → 用 `SingletonLock` 客观判定拒绝；`target-exists` 时绝不合并（宁可留旧根并报告）。
- **爆破半径**：profile 路径解析。任何硬编码 `.browser-profiles` 字面量的消费者都必须改（上表 5 处已列全，grep 复核）。
- **回滚**：新根是旧根的 rename；把 `AIOS_BROWSER_PROFILE_ROOT` 指回旧路径即恢复原行为（迁移本身幂等、不改内容）。
- `failureClass`: 路径解析回归（由"userDataDir 不在安装树内"+ mcp-server 类型检查 + 现场升级三重担保）。
