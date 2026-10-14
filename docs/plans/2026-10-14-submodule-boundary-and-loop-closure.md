# 子模块边界与 loop 闭环修复计划

日期：2026-10-14（第二轮重排：work-3 裁决 + work-6 排序）
Decision Ticket：`docs/architecture/adr/0001-submodule-landing-boundary.md`（边界与发布流）、
`docs/architecture/adr/0002-turn-outcome-reachability.md`（outcome 可达性契约）
来源：本次会话的 LoopX 对比 → 三项借鉴分析 → 架构评审 → 落点裁决

## 目标

把 2026-10-14 评审确认的缺口收敛成可验证结果：**先让子模块边界变成机器可检查的**，
再补唯一的正确性缺口，然后按 operator 指定顺序处理结构项。不重写现有 loop。

## 非目标

- 不重写 harness loop；attended 默认行为不变（`pacing=null` 全关）。
- 不实现 interaction contract（operator 已排序：单一真相源先做）。
- 不内嵌 LoopX 代码。

## 依赖图

```text
work-1 边界可执行化 ──┬──► work-4 P0 独立完成谓词 + 结算门 ──► 子模块发布 ──► 父指针独立 commit
work-2 self_repair ───┤
work-3 outcome 可达性 ─┤        （G1 并行组）
work-5 投影卫生 ──────┘

work-6 单一真相源              [ready，operator 排序在前]
work-7 interaction contract    [deferred，operator 排序在后]
```

**关键路径**：`work-1 → work-4 → 子模块 CHANGELOG+semver+tag → 父仓库指针独立 commit`

---

## work items

### work-1 — 子模块边界可执行化

- **dependsOn**: []
- **observable outcome**：父仓库对 `rex-harness/` 的静态 import 只出现 `src/index.mjs`；现存唯一越界消失
- **输入**：ADR 0001 的「公开面」定义；`rex-harness/src/index.mjs:69-78` 已导出 `deriveEffectRef` / `normalizeTurnResult`（**无需改子模块**）
- **改动**：`scripts/lib/execution/harness/solo/turn-settlement.mjs:4` 改走公开入口；新增父侧边界测试
- **completion criteria**：(a) 越界修复；(b) 测试含**反例**（故意注入 deep import 必须失败）
- **verification**：`node --test scripts/tests/<新>.test.mjs`、`npm run test:rex-integration`、`npm run test:affected`
- **evidence refs**：`rex-harness/src/index.mjs:69-78`；`rex-harness/tests/architecture/import-boundaries.test.mjs`（仅向内，缺向外）
- **回退点**：两个文件独立 revert；零子模块改动

### work-2 — `self_repair` 死枚举处置

- **dependsOn**: []
- **observable outcome**：`SHOULD_RUN_ACTIONS` 每个成员都有真实 call site
- **决定**：删除（ADR 0002；将来实现 self-repair lane 时随 call site 一并加回）
- **completion criteria**：枚举成员与 `resolveShouldRun` 返回值一一对应，且有测试断言
- **verification**：`node --test scripts/tests/execution/harness/`（solo-runtime 用例）
- **evidence refs**：`scripts/lib/execution/harness/solo/solo-runtime/gate/should-run.mjs:16`；ADR 0002
- **回退点**：单文件 revert

### work-3 — outcome 可达性契约钉死

- **dependsOn**: []
- **决定**：**不做映射**（ADR 0002）——`repair_required` / `replan_required` 声明为外部宿主产出，AIOS 桥继续只产 3 个
- **observable outcome**：枚举完整性与桥产出集合两侧都有测试钉死；结算/额度语义不变
- **改动**：子模块加断言（枚举 5 个成员仍在）；父侧加断言（`mapIterationToTurnContract` 产出集合恰为 3 个）
- **completion criteria**：任一方向被破坏（多产/少产）测试即失败
- **verification**：`npm --prefix rex-harness test`、父桥回归
- **evidence refs**：`rex-harness/src/domain/turn-contract.mjs:14-26`；`scripts/lib/execution/harness/solo/turn-settlement.mjs:29-40`；ADR 0002
- **发布**：**仅测试改动**（`tests/` 不在 package `files` 面）→ 不需 tag/npm，只需子模块 commit + 父指针独立 commit
- **回退点**：子模块 commit revert + 父指针回移

### work-5 — 投影残留卫生 + 刷新纪律

- **dependsOn**: []
- **observable outcome**：`.rex-projection-recovery` 残留清理归零；「改 `skill-sources/*/SKILL.md` 未跑 `refresh-projection-history.mjs`」会被检查拦下
- **回退点**：残留目录为 gitignored，删除不可逆但**不影响仓库**；执行前需 human 确认

#### 调查结果（2026-10-14）

**第二半（刷新纪律）已经存在，无需新做：**

| 已有门禁 | 位置 |
|---|---|
| 运行时 fail-closed：history 缺当前 digest 就拒绝安装 | `rex-harness/src/clients/install.mjs:167` |
| 测试门禁：每个 canonical Skill 的当前 digest 必须被 history 登记 | `rex-harness/tests/contract/client-install.test.mjs:71` |
| 成功安装后不得残留 `.rex-*` | `rex-harness/tests/contract/client-install.test.mjs:216` |

**残留性质：纯历史碎屑，零功能影响**

- 语义：`install.mjs:298-310 preserveRecovery()` **仅在回滚失败时**触发；备份是失败安装的副本。
- 冗余性验证：**93/93 备份均有活体投影，0 孤儿** → 删掉不会丢任何当前可用内容。
- 增长已停止：最新备份 2026-08-17（近 2 个月前）；当前成功路径已有清理断言（上方第三条）。
- 体量：7 个根目录，约 1.16 MB，全部 gitignored。
- 分布（2026-10-14 复核）：`.agents` 11 / `.claude` 16 / `.codex` 5 / `.gemini` 15 / `.opencode` 15 / `.grok` 16 / `.hermes` 15 = **93**。
  首次盘点报 80 是口径遗漏：`.opencode` 的 `_purged-20260826_204215` 历史桶（13 个备份）未被计入。

**删除被安全门阻，交由 operator：** 门是文本模式硬拦
（`packages/aios-pi/lib/gates.mjs:6`，连命令文本里出现该字符串都会拦），
且门的测试（`scripts/tests/clients/pi-agent/pi-extension.test.mjs:28-35`）只断言“必须拦”，
**未定义任何授权放行入口**。因此这一条不由 agent 执行，也不绕道其它工具执行。

**删除方式（operator 在其终端执行，agent 不代执也不绕行）**：

```bash
# Git Bash / zsh，项目根目录
d="rm -rf .agents/.rex-projection-recovery .claude/.rex-projection-recovery \
  .codex/.rex-projection-recovery .gemini/.rex-projection-recovery \
  .opencode/.rex-projection-recovery .grok/.rex-projection-recovery \
  .hermes/.rex-projection-recovery"
eval "$d"
```

或先改名后删（可反悔）：把 `rm -rf` 换成 `mv <dir> /tmp/recovery-trash-$(date +%s)/`，确认一周无事再清。

**根因（新发现，属子模块产品面）：** 没有任何机制回收 recovery 目录——
`install.mjs` 只在成功路径清自己的 `.rex-install-*` 临时目录，从不修剪 `.rex-projection-recovery/**`。
按 ADR 0001 这条修复应落子模块（可选：成功安装后只保留最近 N 个恢复点）。

→ 新增 **work-8**（proposed，未入图）。

### work-4 — P0 独立完成谓词 + 结算门

- **dependsOn**: [work-1]
- **observable outcome**：`validated_completion` 在存在未清缺口（monitor 到期 / gate 未解 / ready successor / acceptance gap）时被拒绝或降级
- **分界**（ADR 0001 落点判据）：**谓词与结算门在子模块**（公开契约，任何宿主可复用）；**facts 采集在父仓库**（solo summary / plan / gates）
- **completion criteria**：反例测试——`open=0 但 acceptance_gap=1 → 拒`；缺失计数（null/undefined）→ `invalid` 而非 0
- **verification**：`npm --prefix rex-harness test`、`npm --prefix rex-harness run doctor`、父桥回归
- **evidence refs**：`research/upstream/loopx/loopx/control_plane/goals/goal_frontier/terminal.py`（`_strict_zero` + source completeness + `terminal_no_followup`）；`scripts/lib/execution/harness/solo/turn-settlement.mjs:35`
- **发布**：子模块公开面变化 → CHANGELOG + semver + tag；父指针**独立 commit**（ADR 0001）
- **回退点**：子模块 revert + 父指针回移，两个独立 commit

#### ⚠ 侦察发现（2026-10-14）：结算门从未在 live 路径上运行

原定完成条件预设“结算门已生效”，**侦察推翻了这个前提**：

| 事实 | 证据 |
|---|---|
| `turn-settlement.mjs` 零生产 importer | `grep -rn "turn-settlement" scripts` → 只有 `harness-runtime.test.mjs` 与它自己的测试 |
| `settleTurnEnvelope` / `buildTurnEnvelope` 从未被接线 | `git log -S "settleTurnEnvelope" --all` 只返回引入提交 `513df243`（`-S` 会抳捉任何调用点增减） |
| solo harness 的 live 执行回调不含任何 rex 调用 | `scripts/lib/execution/lifecycle/run/harness/execution/execute-turn.mjs`（225 行）grep `rex\|settle\|envelope` → 零命中 |
| `settleStandaloneTurn` / `startStandaloneWorkflow` 同样无生产调用者 | `grep -rn` 在 `scripts/`（排除测试）为空 |
| 唯一的达达方式 | 人类手动 `aios rex settle ...`（`repo `scripts/lib/tooling/cli/dispatch/dispatch.mjs:50-55` 是透传代理） |
| 真正 live 的是另一条路 | rex capability workflow（`startActivation`/`advanceActivation`/`validateCommandEvidence`）被 `ctx-agent-core`、`planning/cli`、`judgment/stage-gate`、`phase-rex` 使用 |

**含义**：v5.13/v5.14 发布说明里“每一轮 provider 执行现在都结算为类型化 envelope /
执行者不能自验”的说法，**仅由测试验证，未在 live 循环生效**。因此
“给结算门加 terminal 谓词”会直接产出死代码，违反 rex-engineering-standards §2（浅模块警惕）。

**结构原因（为何当年接不上）**：`buildTurnEnvelope` 需要 `activationId` + `executionToken`，
即 solo harness 必须持有并推进一个 rex standalone workflow；而 solo harness 目前根本没有
rex 工作流状态。接线 = 给 solo harness 引入 session ↔ activation 绑定与 token 轮换，
不是一行改动。

#### 待裁决的设计分叉

| 方案 | 内容 | 成本 | 代价/风险 |
|---|---|---|---|
| **A 接通结算** | solo harness 持有 rex standalone workflow：`startStandaloneWorkflow` → 每轮 envelope → `verify` → `settle` | 高（会话绑定 + token 轮换 + 崩溃恢复；每轮多 2 个子进程） | attended 默认路径 perf 受影响，需默认关或灰度 |
| **B 父侧完成门** | 不改 rex 结算，在 loop.mjs 加“完成必须过独立校验进程” | 中 | 不产生 effectRef 幂等/回滚检测；完成事实采集在父侧（但谓词仍在子模块可接受） |
| **C 删死代码** | 删 `turn-settlement.mjs`（及确认无消费者的 verify/settle CLI），修正 v5.14 表述为“已定义待接线” | 极低 | 放弃已投入的实现；但消除假安全感 |
| **D 先上明账** | 把“结算未接线”写进开放问题台账，防下次再误判 | 极低 | 不解决正确性缺口 |

**建议**：先 **D**（零风险、防继续误判），再按你的目标选 **A**（真兑现）或 **C**（不再声称）。
不推荐 **B**：收益低于 A 且仍在父侧持有“什么算完成”的最终解释权。

#### 裁决与交付记录（2026-10-14，operator：“D+C”）

**D（明账）**：`docs/reference/outstanding-work.md` A17 已建档（侦察时即写入），本次标 **CLOSED** 并记录裁决；
CHANGELOG [Unreleased] 新增 fix(harness) 条目更正 v5.13/v5.14 表述（历史条目不改写）。

**C（删死代码）**：

| 动作 | 对象 |
|---|---|
| 删除 | `scripts/lib/execution/harness/solo/turn-settlement.mjs`（零生产 importer 的桥） |
| 删除 | `scripts/tests/execution/harness/infra/core/turn-settlement.mjs`（桥的 6 个子用例随桥消失） |
| 同步 | `harness-runtime.test.mjs` 去掉其 import；`rex-import-boundaries.test.mjs` B2 反例 fixture 改用现存适配层路径 `workflows/adapters/rex-capability-runtime.mjs`（头注释保留历史缘由） |
| 文档锚点 | ADR 0002 追加更新段（桥钉随桥消失，子模块枚举钉仍绑定；重接须恢复双向钉定）；CONTEXT.md 公开面词条标历史实例已删 |
| **保留** | 子模块 `settle`/`verify`/`start` CLI —— 有确认消费者（人工 `aios rex settle` 经 dispatch 透传），不属“无消费者 CLI”，子模块公开面无变化，**无需发布流** |

**验证**：`rex-import-boundaries` 3/3；`harness-runtime` 47/47（-6 为被删用例）；全仓 `grep turn-settlement scripts/**/*.mjs` 仅剩边界测试头注释；`npm run test:affected`（bail 全量）2113 项 / 2098 通过 / 6 失败 / 9 跳过。6 项失败均与本改动集因果独立：2× llms-txt（存量，HEAD 原样 CHANGELOG 对照实验同样失败：生成物 2026-10-02 后未再生 + Windows CRLF split）、2× 存量（G1 已记录的 case-selection / cli-project-root）、2× spawn-timeout（新登记 A18：本宿主 shell 内 taskkill RPC 自限时 ~60s，同 HEAD 昨日异客户端终端通过；probe 链见 A18）。

**遗留**：选项 A（接通 live 结算）作为未来新工作项保留；若重提，必须先有调用点再建桥（ADR 0002 更新段）。

### work-6 — 单一真相源收敛

- **dependsOn**: []
- **operator 排序**：P2 两项中**先做这一项**
- **observable outcome**：一次 turn 的结算只有一个 append-only 真相源，其余（run summary / continuity / plan 投影）可从它重放并检测漂移
- **现状**：（原假设已修正，见下方侦察发现）
- **completion criteria**：崩溃注入（写中断）后重放得到一致投影；投影漂移可被检测并报警
- **verification**：崩溃注入测试 + 现有 harness 套件
- **evidence refs**：`scripts/lib/execution/harness/solo/solo-runtime/support/state.mjs`、`scripts/lib/execution/harness/solo/solo-journal.mjs`
- **回退点**：写入路径改动，需按子步骤 commit；保持现有读路径兼容

#### 侦察发现（2026-10-14）：前提被修正——事件日志与 reconciler 已存在

原表述“四处写入、无单一真相源”**不准确**。已存在的基础设施：

| 已有 | 位置 |
|---|---|
| 单文件原子写（temp+rename） | `scripts/lib/environment/fs/atomic-write.mjs::writeFileAtomic` → 不存在“文件写一半” |
| 每轮事实记录 | `iterations/iteration-NNNN.json`（按轮号，事实上的 append-only 账本） |
| 写前意图日志 | `hook-events.jsonl` 的 `iteration-lifecycle`（`started`/`completed`/`pacing-wait`/`safe-bypass-granted`） |
| 崩溃恢复 + owner 存活判定 | `scripts/lib/execution/lifecycle/run/session-hooks/reconcile.mjs`（产出含 `incompleteIteration`/`resumeAvailable` 的 `session-interruption.json`） |

真正剩下的是**三条窄缺口**：

| # | 缺口 | 证据 |
|---|---|---|
| G1 | **summary 一轮内被两个写者写两次** | `appendSoloIteration` 内部重读并写 summary（`lifecycle/iteration.mjs:36-52`），`persistIterationState` 随后又写（`support/state.mjs:110`）；两次内容不同（后者含 status/backoff） |
| G2 | **无漂移检测** | `readSoloRunSummary` 直接信任文件；无处用 iteration 记录/hook 日志重算比对 |
| G3 | **恢复记录信任投影** | `reconcile.mjs:132` 的 `lastCompletedIteration: summary.lastIteration` 取自 summary——summary 滞后时**恢复记录会报错的完成数** |

附带：`reconcile.mjs` 头注释称“journal 不持久化 process owner/heartbeat”，但代码实际查询 owner liveness 并据其区分 `process-crashed-during-iteration`——注释已过时。

**无实测漂移证据**：本工作区唯一带 journal 的真实会话（`pi-coding-agent-20260911T095846Z-solo`）**0 轮**，从未执行 turn。因此这是预防性结构问题，不是已观测故障。

#### 子设计方案（按代价排序）

| 方案 | 内容 | 代价 | 处理缺口 |
|---|---|---|---|
| **S1 单写者** | ✅ **已实现 2026-10-14**（operator “继续”视为签字）：`appendSoloIteration` 回归纯账本写入；summary 只由 `persistIterationState` 写；旧断言迁入正确 owner 并新增单写者钉定 | 小，但**变更已测契约**（`harness-journal.test.mjs` 断言 append 的副作用），需把断言迁到正确 owner | G1 |
| **S2 漂移检测** | ✅ **已实现 2026-10-14**：新增 `checkRunSummaryConsistency`（只读比对，不改写）；reconcile 复用它并把漂移记入 `summaryDrift` | 中 | G2 |
| **S3 replay/修复** | `replaySummary(journal) -> summary`，使投影可从账本**重建**（不只检测） | 中大 | G2 升级 |
| **S4 恢复改源** | ✅ **已实现 2026-10-14**：`reconcile.mjs` 的 `lastCompletedIteration` 改从 iteration 账本推导（新增 `readLastCompletedIteration`），不再取 summary 投影 | 小 | G3 |

**建议**：S4 → S1 → S2。**S3 暂不做**：无实测漂移证据时不值得造 replay 框架（rex-engineering-standards §2）。
**范围决定**：convergenceGate 第 6 条“崩溃注入后重放一致”按 S1–S4 范围解释为：单写者消除双写 + 漂移可检测可报警（S2）+ 恢复信任账本（S4）；S3 重放框架明确不纳入。
**scope 边界**：只限 solo harness 自身状态；continuity 与结构化 plan 属其它子系统，保持“尽力而为外部副作用”，不纳入本项。

#### S4 + S2 交付记录（2026-10-14）

**更正**：早先声称“S4 不动契约”是错的——测试 `seedSession` 只写 summary 就断言 `lastCompletedIteration === 4`，所以它同样是契约变更。本次按“断言迁到正确 owner + 加反例”处理，属**加强**而非弱化。

| 文件 | 改动 |
|---|---|
| `solo-journal/lifecycle/iteration.mjs` | 新增 `readLatestIterationRecord({rootDir, sessionId})`：扫描 `iteration-NNNN.json` 取最大轮号并读出该记录；无记录 → `null`；记录损坏 → 标记 `recordUnreadable: true`（不静默少算一轮） |
| `solo-journal/content/consistency.mjs` | **新增模块**：`checkRunSummaryConsistency({rootDir, sessionId, summary})` 只读比对投影与账本，返回 `{consistent, driftFields, ledger, projected}` |
| `solo-journal.mjs` | 桶导出两个新符号 |
| `session-hooks/reconcile.mjs` | 完成数与漂移判定同源（`consistency.ledger.lastIteration`）；漂移时把 `summaryDrift{fields,projected,ledger}` 写进中断记录；`evidenceRefs` 同步改用派生值 |
| `session-reconciliation.test.mjs` | fixture 默认投影与账本一致；漂移显式模拟；断言 `summaryDrift` 字段与“一致时不带漂移报告” |

**为何“存在 iteration-NNNN.json”等价于“该轮已完成”**：`appendSoloIteration` 只在 turn 收尾（`persistIterationState`）时写入；轮次开始时只写 `hook-events.jsonl` 的 `started`。

**设计约束（写进模块注释）**：检测到漂移**只记录、不修复**——静默改写会把被观测的漂移事实消掉；修复属独立决定（S3）。

**顺带修正**：`reconcile.mjs` 头注释称“journal 不持久化 process owner/heartbeat，因此只能靠 stale 阈值”，与代码事实矛盾（代码查询 `readSessionOwner` + `isProcessAlive` 并据此区分 `process-crashed-during-iteration`）——已改为准确表述。

**验证**：

| 命令 | 结果 |
|---|---|
| `node --test .../session-reconciliation.test.mjs .../-owner.test.mjs` | 8/8 通过 |
| `node --test scripts/tests/execution/harness/harness-journal.test.mjs` | 3/3 通过 |
| 反例 M1：强制 `consistent: true`（检测失效） | 漂移测试失败（已拦） |
| 反例 M2：账本换成空（投影自比） | 正常路径测试失败（已拦） |
| `npm run test:affected` | subset 38/214 文件，699 项 / 698 通过 / 0 失败 / 1 跳过 |

**剩余**：无。G1/G2/G3 三条缺口已全部闭合（见下方 S1 交付记录）。

#### S1 交付记录（2026-10-14，消 summary 双写）

签字形式：operator 对含“work-6 S1 待你签字”的台账回复“继续这些工作量开发”，视为对该契约变更的批准。

| 文件 | 改动 |
|---|---|
| `solo-journal/lifecycle/iteration.mjs` | 删除 `appendSoloIteration` 内部的 `readSoloRunSummary`+`writeSoloRunSummary` 回写块及其 import；模块头注释改为“唯一 summary 写者是 `persistIterationState`，勿再引入双写” |
| `solo-journal/content/consistency.mjs` | 漂移成因注释同步：从“一轮双写”改为“账本先写/投影后写，崩溃落在两次写之间时投影滞后”（S2 检测仍然必要） |
| `scripts/tests/execution/harness/harness-journal.test.mjs` | 投影断言（iterationCount/lastOutcome/latestEvidence…）从 append 后迁到 `persistIterationState` 后；新增钉定：append 后 summary 必须保持初始值（单写者契约）+ 正常写入路径下 `checkRunSummaryConsistency` 报一致 |

**验证**：

| 命令 | 结果 |
|---|---|
| `node --test scripts/tests/execution/harness/harness-journal.test.mjs` | 3/3 通过 |
| `node --test scripts/tests/execution/session/session-reconciliation*.test.mjs` | 8/8 通过 |
| `node --test scripts/tests/execution/harness/harness-runtime.test.mjs` | 53/53 通过 |
| 反例：把双写临时加回 append | 契约测试失败（已拦），还原后 3/3 绿 |
| `npm run test:affected` | 699 项 / 698 通过 / 0 失败 / 1 跳过（与 S2/S4 交付时基线一致） |

### work-7 — interaction contract 决策编译器 [deferred]

- **dependsOn**: [work-6]
- **operator 排序**：排在 work-6 之后
- **deferred reason**：非阻塞，仅排序；范围与验收见本次会话的分析（typed 三通道 + scheduler hint 拆分）
- 入图时需重新确认范围。

---

## frontier

| 状态 | work |
|---|---|
| ready | — |
| design-ready | — |
| awaiting-decision | —（work-4 已于 2026-10-14 裁决 D+C 并交付） |
| operator-gated | work-5（删除 93 个备份需 operator 在终端执行；命令已入档；第二半已由现有门禁满足） |
| proposed | work-8（子模块修剪 recovery 目录，根因修复；待批准） |
| blocked | — |
| deferred | work-7（已随 work-6 完成而解锁；入图时需重新确认范围） |
| in_progress | — |
| done | work-1, work-2, work-3, work-4（D+C，2026-10-14）, work-6（S1 2026-10-14 交付，G1/G2/G3 全闭合；S3 按范围决定不做） |

## parallelGroups

- **G1** = [work-1, work-2, work-3, work-5] —— ✅ 已执行（work-5 外，见交付记录）；work-1/2 纯父仓库，work-3 含一次子模块测试改动
- **G2** = [work-4] —— ✅ 已执行（2026-10-14 裁决 D+C；子模块公开面无变化，无需 tag/npm 发布流）
- **G3** = [work-6] —— ✅ 已完成（2026-10-14，S1/S2/S4）；work-7 因此解锁

## convergenceGate

汇合条件（全部满足才算完成）：

1. 子模块：`npm --prefix rex-harness test` + `doctor` 绿
2. 父仓库：`npm run test:affected` 绿（rex-harness 变更会 bail 到全量，符合 `scripts/lib/tooling/test-impact.mjs:26` 的既有行为）
3. 边界：父侧边界测试存在且**反例生效**；全仓无 `rex-harness/src/**` deep import
4. 枚举：无可达性破坏（子模块 5 个、父桥 3 个，双向断言）
5. P0：反例测试绿（含缺失计数场景）
6. 单一源：崩溃注入后重放一致
7. 发布：子模块 CHANGELOG + tag 落地（仅 work-4 需要）；父指针为独立 commit

required evidence refs：上面每条 verification 命令的真实输出。

## completionClaim

**soft**。hard completion 需要 `rex.runtime-artifact-contract.v1`（consumer + artifact ref + verification + evidence refs），本计划未产出。

## 假设清单

1. attended 默认行为不变（沿用 v5.14 立场）。
2. work-1 无需动子模块——**已核实** `rex-harness/src/index.mjs:69-78` 已导出所需两个符号。
3. work-4 的 facts 采集在父仓库（子模块只提供谓词与结算门）。
4. work-5 的残留删除不可逆但无仓库影响，执行前需 human 确认。
5. **「单一源先做」的解读**：指 P2 两项中 work-6 排在 work-7 之前，**不是**指 work-6 优先于 G1/G2。
   若原意是"先于一切"，请更正——那会改变关键路径。

## 未决

- 无阻塞项。work-6 的范围细节需在其子设计中确认。

## 交付记录（G1，2026-10-14）

### work-1 子模块边界可执行化 ✅

- `scripts/lib/execution/harness/solo/turn-settlement.mjs` 改走 `rex-harness/src/index.mjs`（公开面）；
  `rex-harness/src/index.mjs:69-78` 已导出 `deriveEffectRef` / `normalizeTurnResult`，**无需改子模块公开面**。
- 新增 `scripts/tests/execution/rex/runtime/rex-import-boundaries.test.mjs`（B2 反例 / B3 生产自检 / B4 测试树基线只许收缩），
  接入 `test:rex-integration`；接线守卫 W2/W5 确认其可达且 CI 执行。
- 复用 `scripts/lib/tooling/test-impact.mjs::collectReferences`（新增 export），避免两处引用抽取正则漂移。
- **范围发现**：除已知 1 处生产越界，测试树另有 6 处内部耦合（`rex-harness/tests/fixtures/requirements-decision.mjs` ×4、
  `src/cli/start.mjs`、`src/clients/projection-manifest.mjs`）。修它们需子模块补公开面并走发布流 → **不纳入 G1**，
  以只许收缩的 TEST_BASELINE 冻结，留待独立工作项。

### work-2 `self_repair` 死枚举处置 ✅

- `SHOULD_RUN_ACTIONS` 改为 `['run','wait','ask','quiet']`，docstring 同步（ADR 0002）。
- `scripts/tests/execution/harness/infra/pacing/pacing.mjs` 新增可达性断言：声明的动作集合必须等于
  决策函数在真实输入下能产出的集合。

### work-3 outcome 可达性契约钉死 ✅

- 父侧 `infra/core/turn-settlement.mjs`：桥的产出集合断言恰为 `blocked / validated_completion / validated_progress`。
- 子模块 `tests/domain/turn-contract.test.mjs`：枚举含 `repair_required` / `replan_required`，
  且 `repair_required` 为 material、`replan_required` 不是。
- 仅测试改动（`tests/` 不在 package `files` 面）→ 不走 tag/npm 发布流；
  但父仓库子模块指针因此变脏（`m rex-harness`），提交时需**独立 commit** 移指针。

### 验证证据

| 命令 | 结果 |
|---|---|
| `node --test scripts/tests/execution/rex/runtime/rex-import-boundaries.test.mjs` | 3/3 通过 |
| `node --test scripts/tests/execution/harness/harness-runtime.test.mjs` | 53/53 通过 |
| `npm --prefix rex-harness test` | 216/216 通过 |
| `npm run test:rex-integration` | 57/57 通过 |
| `node --test scripts/tests/tooling/suites/test-suite-wiring.test.mjs` | 6/6 通过（W1/W2/W3/W5/W6/漂移） |
| `npm run test:affected`（bail 全量） | **2118 项 2105 通过 / 4 失败** |

**反例验证（突变注入 + `finally` 还原，4/4 被拦）**：

| 突变 | 拦截者 |
|---|---|
| 生产源码追加 deep import | B3 失败 |
| 把 `self_repair` 加回枚举 | 可达性断言失败 |
| 让桥映射 `repair_required` | 桥产集断言失败 |
| 子模块移除 `repair_required` 的 material 资格 | 合约断言失败 |

### 存量失败（非本次引入，已证因果独立）

`npm run test:affected` 的 4 项失败位于 3 个文件，均与本次改动集**在影响图上不可达**
（用仓库自己的 `buildImpactIndex` 对三个测试求可达集，与改动集交集为空）：

| 测试 | 症状 | 定性 |
|---|---|---|
| `rex-v2-case-selection.test.mjs` | 训练认证 gate 报 `blocked`（hash 已匹配，失败在确定性重跑比对） | 存量；`docs/reference/outstanding-work.md` A3 同形 |
| `llms-txt.test.mjs` ×2 | `docs-site/llms.txt` 与生成器不一致 | 存量；生成物自 2026-10-02 未再生 |
| `cli-project-root.test.mjs` | guard 拒绝消息断言 0 !== 1 | 存量；与 Rex/harness 无关 |

因此 **convergenceGate 第 2 项"父仓库 test:affected 绿"未满足**，但失败均非本次改动引入。

## ledger

```
is_complete: false
in_progress: []
facts:
  - work-1/2/3 完成（2026-10-14），证据见交付记录
  - 生产源码越界数 1 → 0；测试树内部耦合 6 处已冻结为只许收缩的基线
  - work-1 无需子模块公开面改动（rex-harness/src/index.mjs:69-78 已导出所需符号）
  - 存量失败 4 项 / 3 文件，与本改动集影响图不可达
  - work-5 第二半（刷新纪律）已由 install.mjs:167 + client-install.test.mjs:71/216 覆盖，不新做
  - work-5 删除对象：80 个备份根 / 7 客户端 / 1.1MB，80/80 冗余、0 孤儿，增长停止于 2026-08-17
  - work-5 删除被安全门（packages/aios-pi/lib/gates.mjs:6）硬阻且无授权入口 → 仅能由 operator 在自己终端执行
  - 根因：install.mjs 从不修剪 .rex-projection-recovery → work-8（子模块）
  - **work-4 侦察推翻前提：turn-settlement 零生产 importer、settleTurnEnvelope 自引入以来从未接线（git log -S 只命中 513df243）、execute-turn.mjs 无 rex 调用、settleStandaloneTurn 无生产调用者**
  - 结论：v5.13/v5.14 的 turn 结算在 live 路径未生效；给结算门加谓词会产出死代码 → work-4 转 awaiting-decision
  - **work-6 前提也被修正：原子写/每轮记录/hook 事件日志/崩溃 reconciler 均已存在**；真正缺口仅 G1 summary 双写、G2 无漂移检测、G3 恢复记录信任投影
  - 无实测漂移证据（唯一带 journal 的真实会话 0 轮）→ work-6 是预防性结构改进，非故障修复
  - work-6 S4 已交付：新增 readLastCompletedIteration（账本权威），reconcile.mjs 不再信任 summary 投影；8/8 + 3/3 绿，反例已拦，affected 699/698/0
  - work-6 S2 已交付：新增 content/consistency.mjs（checkRunSummaryConsistency，只读比对不改写）；reconcile 记入 summaryDrift；读取器重整为 readLatestIterationRecord；M1/M2 反例均被拦；affected subset 38/214、699/698/0
  - 处理 G1 只差 S1（消 summary 双写，需签字）
  - work-6 S1 已交付（operator “继续”视为签字）：appendSoloIteration 回归纯账本写入，summary 唯一写者 persistIterationState；投影断言迁入正确 owner + 新增单写者钉定；反例（双写加回）被拦；journal 3/3、reconcile 8/8、runtime 53/53、affected 699/698/0 → G1/G2/G3 全闭合，work-6 done，work-7 解锁
  - work-5 复核：备份 93 个（首次盘点 80 漏计 opencode `_purged-20260826_204215` 历史桶 13 个），93/93 有活体投影、0 孤儿、最新仍为 2026-08-17；删除命令已入档 work-5 节，仍由 operator 终端执行
  - work-4 裁决 D+C 已执行：删父侧桥 turn-settlement.mjs + 子套件；harness-runtime 47/47（-6 为被删用例）；边界测试 B2 fixture 换现存路径 3/3；rex-integration 绿；ADR 0002/CONTEXT/A17/CHANGELOG 同步；子模块 settle/verify/start CLI 保留（人工透传是确认消费者）→ 无子模块公开面变化，无需发布流
  - 全量 affected 2113/2098/6fail/9skip：6 失败均因果独立（2×llms-txt 存量 HEAD 对照实验证实；2×G1 存量；2×spawn-timeout 新登 A18=本宿主 taskkill RPC 60s 超时，非本批引入，修复提案 work-9 待批）
assignment:
  work-5: operator      # 删 93 个备份，命令已入档，仅 operator 终端执行
  work-6: done          # S1/S2/S4 交付，S3 按范围决定不做
  work-4: done          # 裁决 D+C 执行；选项 A 若重提须先有调用点再建桥
```

已 cap（05bbfc6c..90b5db34，两个独立 commit：e965c5c2 S1 / 90b5db34 work-4 D+C），工作区干净。待 operator：① work-5 终端执行删除（命令已入档）；② work-8 是否批准入图（子模块发布流）；③ work-9（A18 修复）是否批准；④ work-7 已解锁，入图需重确认范围。代码侧 work-1/2/3/4/6 均已交付；若重提结算接线（选项 A），必须先有调用点再建桥（ADR 0002 更新段）。
