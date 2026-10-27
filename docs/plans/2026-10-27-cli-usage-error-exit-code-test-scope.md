# CLI 用法错误退出码 · 测试范围契约（P0）

日期：2026-10-27 · Capability：`software.testing.design` · Stage：`design-tests`
Provider：`rex-test-design` · 基线测量见 `docs/reports/2026-10-27-cli-usage-error-baseline.md`

## 1. 用户目标

1. **一个被拒绝的 flag 绝不可能看起来像成功**：任何在公共 CLI 入口被判定为用法错误的输入，
   进程退出码必须非零（脚本与 CI 只读退出码，不读文案）。
2. **破坏性命令不能在被吞的未知输入下执行**：`aios uninstall` 收到未识别 flag 时必须拒绝，
   不得带着 `components=shell,skills / scope=global / client=all` 的默认值真删。
3. **删除动作需要显式意图**：`uninstall` 默认只出预览，真实移除需 `--yes`（沿用仓库既有 token，
   `specs/core/lifecycle.mjs` 中 `setup` 已声明 `--yes`；不另造新词）。

## 2. 明确非目标

- **不**为 `uninstall` 引入交互式 TTY 提问（本 CLI 大量运行在非交互与 CI 环境）。
- **不**重构 `commander/specs/**`（声明式）与 `parse-args/top-level.mjs`（命令式）之间的**双写者**
  问题；本项只要求不得加重它，另立工作项处理。
- **不**改 `perception` 的挂起问题（它是另一类：无界等待，基线里以 exit=124 单列，不混进本契约）。
- **不**把全部 25 处 catch 重写成一个新框架后再逐个接线：先由行为矩阵决定必须改哪些点。
- **不**放宽 v6.14.3 已确立的 `--dry-run` 语义；本契约复用同一条教义的更强形式。

## 3. 范围内行为 → 可观察断言（验收映射）

断言一律发生在**真实子进程 + 真实退出码**上；禁止用内部调用次数代替用户行为。

| # | 验收行为 | 可观察断言（唯一判据） |
|---|---|---|
| A1 | 被声明过的命令收到未知 option | `spawn(node aios.mjs <cmd> --definitely-not-a-real-flag).status !== 0` |
| A2 | 矩阵来源不靠人记 | A1 的命令集合**取自 `COMMAND_SPECS` 运行时导出**，且断言 `set.length >= 30`（防空矩阵假通过） |
| A3 | 未知 flag 下没有开始执行 | `uninstall` 的 stdout **不含** `Uninstall components:`（该行只在真跑删除时打印） |
| A4 | 沙箱里确实没删东西 | 沙箱 HOME 预置 shim/rc/skill 桩文件，跑 `uninstall --<未知flag>` 后三者**仍然存在** |
| A5 | 删除需要显式意图 | 沙箱 `uninstall --components shell` 无 `--yes` → 预览：不删；`--yes` → 真删（正路不被收紧误伤） |
| A6 | 用法错误不刷堆栈 | 未知 option 的 stderr **不含** `^\s+at ` 行（修掉 `aios.mjs` `isUsageError` 大小写不匹配带来的堆栈泄漏） |
| A7 | 正常调用不受影响 | 既有合法调用仍 exit 0：`refs prune --dry-run`、`plan show`、`memo pin status`、`canvas` |

## 4. 允许修改 / 使用的测试缝

- **首选缝（唯一主缝）**：真实 CLI 子进程 + 退出码 + stdout/stderr 文本。
  理由：缺陷本身就是“进程边界告诉调用方的结论是假的”，任何注入式单测都看不见它
  ——v6.14.3 的 `resume --dry-run` 已经用执行事实证明过这一点。
- **辅助窄缝**（仅当主缝无法隔离风险时使用）：
  - `COMMAND_SPECS` 派生的矩阵形状（纯函数层，用于 A2 的防真空断言）；
  - 解析层共享的“解析失败是否算用法错误”判定（若最终抽出单一 owner，则给它一条直接单测）。
- 沙箱约定：`HOME`/`USERPROFILE` 指向 `mktemp -d -p "$TMPDIR"` 的临时目录，预置桩文件后运行，
  断言“存在/消失”，`trap` 或 finally 清理；**禁止**在真实 `~/.rexcil` 或真实客户端 skills 目录上做删除断言。

## 5. 最小纵向切片及其代表性

切片 = **A1 + A2 + A3 + A4**（真实 CLI 未知 flag → 非零退出，且 `uninstall` 未开始删除）。

它足以代表本次目标，因为：这四条合起来正是基线里两类假成功的交叉点——
M1（打印 commander 错误却 exit 0：`agents dream hud init plan workflow`）与
M2（连错误都不打印、直接执行：`uninstall canvas doctor refs rex …`）。
修掉这个交叉点，A5/A6/A7 只是同一缝上的邻接断言，不需要新机制。

## 6. 完成判据

- [ ] A1–A7 各有一条真实断言，且在**修复前**至少 A1 与 A3 能独立失败（RED 有 receipt）。
- [ ] 守卫矩阵的命令集合来自 `COMMAND_SPECS`，并含 A2 的防真空断言（非空洞）。
- [ ] 新测试文件登记进 `scripts/test-suites.json` 显式清单（CI 可达）。
- [ ] 变异证明：把任一 swallow 形状重新引入（或删掉 `--yes` 门），守卫必须失败。
- [ ] `npm run test:regression` 0 fail；`syntax:check` 0；`fileLines` 基线 `blocking` 不上抬（shrink-only）。

## 7. 禁止假通过条款

- 禁止删除/放宽断言、`skip` 用例、把断言换成 mock 的内部调用计数来获得绿。
- 禁止用“只测注入 options 的解析结果”代替真实子进程退出码断言（该缝已被证明看不见本缺陷）。
- 禁止把 A2 的命令列表写死成一个人工短名单而不同时断言其规模下限。
- 禁止在真实用户 HOME 上验证 A4/A5。
- 沙箱删除类断言若无法证明失败原因（例如仅靠“没找到文件”通过），必须补桩文件的正向存在断言。

## 8. Sediment（已有事实，勿重复测量）

- 基线表：`docs/reports/2026-10-27-cli-usage-error-baseline.md`（本轮 37 命令实测）。
- 形状分布：parse-args 共 25 处 catch → `conditional-rethrow` 16 / `bare-swallow` 8 / `mixed-rethrow` 1；
  **没有任何一处无条件传播非 help 解析失败**（更正本会话早先“17 处已正确重抛”的错误结论）。
- 使能点：`commander/root-program.mjs:18` 与 `commander/runtime.mjs:28` 的 `allowUnknownOption(true)`。
- help 已被 parse 之前处理：6 个 bare-swallow 文件全部 `helpOption(false)` + 预检 `-h`
  → 尾随 catch 不承担 help 兜底，属纯吞错（这降低了修复的回归风险）。
- `uninstall` 的 spec 目前**没有** `--yes`；`setup` 有。
- v6.14.3 已确立的同型教义：含义为“别花钱/别改状态”的 flag 不得被接受后被静默忽略。
