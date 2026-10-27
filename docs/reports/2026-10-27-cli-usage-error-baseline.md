# CLI 未知 flag 行为基线（37 个顶层命令全量实测）

日期：2026-10-27 · 探针：`node scripts/aios.mjs <cmd> --definitely-not-a-real-flag`
退出码单独捕获（本仓库 shell 纪律：不用 `cmd | tail; echo $?`）。
命令集合取自 `node scripts/aios.mjs --help` 的命令表（37 条）。

## 1. 结果分类

| 类别 | 命令 | 含义 |
|---|---|---|
| **假成功 · 打印了 commander 错误** (6) | `agents` `dream` `hud` `init` `plan` `workflow` | 子解析器有自己的 `Command`（`allowUnknownOption(false)`）→ commander 抛错 → 被解析层 catch 降级成 help，**exit 0** |
| **假成功 · 连错误都没有** (11) | `uninstall` `canvas` `doctor` `harness` `integration` `interception` `judgment` `learn-eval` `refs` `rex` `skill` | 由 root/passthrough 那个 `allowUnknownOption(true)` 的共享 Command 解析 → 未知 flag 被直接丢弃 → **命令照常执行** |
| 极性正确 (19) | `entropy-gc` `evolution` `import` `memo` `memory` `orchestrate` `quality-gate` `release-status` `search` `session` `setup` `snapshot-rollback` `status` `team` `update` `version` `work` `aios` … | exit 1 |
| 挂起 (1) | `perception` | exit=124（45s 超时），属无界等待类，另立工作项 |

危险样本（原始输出）：

```
uninstall          exit=0 | out=[Uninstall components: shell,skills]
canvas             exit=0 | out=[graph LR]
refs               exit=0 | out=[mcp-tools_list-20261012091719-96f8a1e348ef  in]
dream              exit=0 | cmdr_err=[error: unknown option '--defin]
```

## 2. 破坏性执行确认（沙箱 HOME 复现）

`HOME`/`USERPROFILE` 指向 `mktemp -d -p /e/Temp aios-probe-uninstall-*`，预置 `~/.aios/bin/aios` 桩与
`~/.claude/skills/demo` 桩后运行：

```
EXIT=0
Uninstall components: shell,skills
No shell config found at <sandbox>/Documents/PowerShell/Microsoft.PowerShell_profile.ps1
[skip] codex skill not managed by this repo: aios-codemap-ops
```

结论：**未知 flag 不会拦住 `uninstall`**，它以 `components=shell,skills / scope=global / client=all`
的默认值进入真删路径。沙箱内未发生实际移除，是因为**另一层**（“非本仓库管理”跳过 + 找不到 profile），
不是这条命令自己拒绝的。真实 HOME 事后核查无损（shim 仍为 9/18 时间戳，各客户端全局 skills 目录俱在）。

## 3. 解析层形状分布（本轮量化）

`scripts/lib/tooling/cli/parse-args/**` 共 **25** 处 `catch`：

| 形状 | 数量 | 说明 |
|---|---|---|
| `conditional-rethrow` | 16 | 只对消息白名单重抛，其余降级。例：`platform/hud.mjs:106` 只放行 `must be one of` / `must be a positive integer` 等，commander 的 `unknown option` 不在名单内 → 被降级 |
| `bare-swallow` | 8 | `catch {` 直接返回 `{mode:'help', options:…defaults}`。文件：`govern/model-router.mjs` `govern/plan.mjs` `knowledge/dream.mjs` `knowledge/memo.mjs` `knowledge/offload.mjs`(×2) `knowledge/perception.mjs` `shared.mjs` |
| `mixed-rethrow` | 1 | `top-level.mjs`（`uninstall`/`setup`/`update` 走的就是它） |
| `unconditional-rethrow` | **0** | —— 没有任何一处做到“非 help 解析失败一律传播” |

同时确认：6 个 bare-swallow 文件**都**在 parse 之前用 `helpOption(false)` + `rest.includes('-h')` 处理了帮助，
因此尾随 catch **不是** help 兜底所必需 —— 它是纯吞错，去掉它不会丢 help 行为。

## 4. 使能点（单一事实的位置）

- `scripts/lib/tooling/cli/commander/root-program.mjs:18` — root `program.allowUnknownOption(true)`
- `scripts/lib/tooling/cli/commander/runtime.mjs:28` — passthrough 子命令继承同一姿态
- `scripts/aios.mjs:15` `isUsageError()` 正则要求大写 `Unknown option`，而 commander 发的是
  小写 `unknown option` → 若只修传播不回退出码文案，用法错误会走堆栈分支（见契约 A6）。

## 5. 守卫矩阵的机器来源

`COMMAND_SPECS`（`scripts/lib/tooling/cli/commander/specs/index.mjs`）实测：

```
specs 条目: 32 | 带 options 声明的: 30
uninstall spec options: ["--components <list>","--client <client>","--scope <scope>","--project-root <path>","--skills <list>"]
setup   spec options 含: ["--yes", "Skip interactive confirmations"]
```

`uninstall` 的 spec **没有** `--yes`，`setup` 有 → 本工作项沿用既有 token `--yes`，不新造词。
守卫矩阵从 `COMMAND_SPECS` 派生，因此新增命令自动进入覆盖面（配规模下限断言防空洞）。

## 6. 与既有结论的关系

同一类缺陷在 v6.14.3 已被证实过一次：`resume --dry-run` 被 CLI 接受后被静默忽略，
真实调用了一次 provider 并改写了 stop 状态。当时立下的规则是——
**含义为“不要花钱/不要改状态”的 flag，要么被遵守，要么报错**；本轮把这条规则从
单个 flag 提升为进程边界的退出码契约。
