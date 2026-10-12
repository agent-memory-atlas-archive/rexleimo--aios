# 竞品刷新报告（2026-10-12）

> 日期: 2026-10-12
> 范围: watchlist schema v4 全量元数据更新 + 新玩家扫描
> 方法: WebSearch 公开信息 + 本仓库源码核实（候选立项前先自查现有实现）
> 基线: 上次元数据检查 2026-09-28；上次 deep-dive 2026-08-14
> 约束: 活跃项为 trigger screening，新玩家为外部扫描 + 内部对账，非外部源码级 deep dive

---

## 0. TL;DR

1. **Watchlist 4 个活跃项核心契约均未变**：TencentDB InjectionMode/预算降级、OMO Hashline stale-write、Graphiti bi-temporal、Letta citation prototype —— 不触发 deep dive。
2. **OpenClaw 于本轮移除**（user decision）：定位不一致，team-workflow 支柱出现参照缺口，详见 §1.1。
3. **新发现 5 个方向，经源码核实后只剩 1 个真候选**：Headroom 是**已消费依赖**（版本 pin + MCP 挂载 + ledger 计量），不是竞品；CodeWhale 的 append-only ledger 已被 `solo-journal` 同语义覆盖，**否决**。保留观察：Orca、Paperclip、MCP 无状态重构。
4. ~~**Paperclip 优先级上调**：OpenClaw 移除后它是 team-workflow 支柱最接近的填补候选。~~ **已修正（见 §6.4）**：**Hermes 比 Paperclip 更贴** —— 它的 `uniqueReferenceQuestion`（后台 skill review + curator 的可审计闭环）逐字对应缺口定义，而 Paperclip 回答的是组织管理。Hermes 还应从 `intelligent-planning` **复位到 `team-workflow`**（原归档理由依赖已移除的 OpenClaw，且属归类错误）。
5. **不建议跟**：渠道/桌面 UI 扩展、GPU 向量库、纯方法论 skill pack。
6. **本轮二次核实（§6）推翻了三处初稿判断**，共同根因是**组合账本的引用完整性**（无机制检查「移除 X 后谁的理由引用了 X」），非外部信息不足：SoL-Pi 影响过决策却不在册；OpenViking / Hermes 归档理由依赖已删的 OpenClaw；Hermes 归错 pillar 导致两处落空。建议补 `decisionRules` 第 ③ 条（§6.5）。
7. **CRG 在 Claude 下从未工作**（`codemap doctor` 实测：7 客户端仅 claude 缺注册，且 `.claude/settings.local.json` 显式禁用 5 项 MCP），而 `./CLAUDE.md:223` 整节在教如何用它。需修注册或修文档，见 §6.6。

---

## 1. Watchlist 活跃项动态（vs 2026-09-28）

### Core Reference

| 项目 | 版本变化 | 关键更新 | refreshTrigger 命中？ |
|------|---------|---------|---------------------|
| **TencentDB-Agent-Memory** | v2.0.x 稳定 | Star 25.4K+；四类记忆资产分类体系成熟；CodeGraph 按需加载工具化 | 否 — InjectionMode/预算降级/result_ref 核心契约未变 |
| **oh-my-openagent** | v5.x 持续迭代 | Star 69K+；多 harness 适配层重构中；Hashline 契约稳定 | 否 — Hashline/stale-write/lineage 核心契约未变 |
| ~~OpenClaw~~ | v2026.9.6 stable | **2026-10-12 已移除**（user decision，见 §1.1） | — |

### 1.1 OpenClaw 移除（user decision 2026-10-12）

**理由**：定位不一致 —— OpenClaw 是面向终端用户的多渠道 agent 产品，AIOS 是本地优先的 coding client 编排控制面。其 Skill Workshop 治理状态机证据已充分吸收，继续跟踪渠道/桌面/插件面的维护成本高于增量价值。

**后果**：
- 活跃刷新 5 → 4 项（2 core + 2 specialist）；全量源码 deep dive 3 → 2 项
- **team-workflow 支柱暂无活跃参照**。已知缺口："Agent 提出的 skill / 共享状态变更如何经 proposal → review → apply / rollback / quarantine，并用 provenance 与 stale hash 安全发布"
- 证据快照完整保留在 `portfolio.remove.openclaw.evidenceSnapshot`，不丢失历史
- 后续填补候选：Paperclip（组织治理/预算/心跳）；按 portfolioPolicy 需先通过准入评审，不自动晋升

**同时校正**：`tierCounts` 此前记 archive 5 / remove 2，未反映 2026-07-31 superpowers 由 archive→remove 的迁移。现已校正为 archive 4 / remove 4，合计 2+2+4+4=12 与 `baselineProjectCount` 一致。

### Specialist Reference

| 项目 | 版本变化 | 关键更新 | refreshTrigger 命中？ |
|------|---------|---------|---------------------|
| **Graphiti** | v0.28.x~v0.30.x | Star ~23K；bi-temporal + Episode 溯源稳定；MCP 集成 | 否 — temporal/provenance 契约未变 |
| **Letta Code** | v2.1.0-vscode | Star 3.5K；git-backed memory、OS 级分页上下文 | 否 — citation 仍为 tool_start prototype，无实质进展 |

### Archive / Remove

| 项目 | 状态 | 备注 |
|------|------|------|
| mem0 | archive | v2.1.0 / 65K★；ADD-only 管线 + 冲突去重算法有亮点，但 hook 矩阵问题已被 AIOS projection 吸收 |
| OpenViking | archive | v0.4.19 / 36K★；VikingMem 会话记忆自动提炼（VLDB 论文）；AGPL + 服务化形态不变 |
| Hermes | archive | v0.21.3 / 247K★；Multi-agent Kanban + 异步 fan-out；能力映射页已覆盖 |
| OpenHarness | archive | v0.1.9 / 14.9K★；静默 |
| gnhf | remove | v0.1.42 / 4.1K★；notes.md 跨迭代记忆是轻量实践，但核心已吸收 |
| ECC | remove | v2.2.0 / 250K★；Hook 生命周期有亮点，但与 Rex evidence 重叠 |
| superpowers | remove | v6.2.0 / 291K★；太重，与 rex-harness 方向不符（user decision 2026-07-31） |
| **OpenClaw** | **remove（本轮）** | v2026.9.6 / 369K★；定位不一致（终端用户多渠道产品 vs 本地优先编排控制面）（user decision 2026-10-12，详见 §1.1） |

---

## 2. 新发现的 5 个方向

### 2.1 Headroom（❌ 分类更正：已消费依赖，非竞品）

- **仓库**: github.com/headroomlabs-ai/headroom · **Star**: 30K+
- **核心**: LLM 上下文压缩层，三引擎分工（SmartCrusher/JSON、CodeCompressor/AST、Kompress-v2/文本），压缩率 60-95%；CCR 可逆压缩允许按需取回原文；Library/Proxy/MCP Server/Agent Wrap 四种形态
- **判据（user 指出，源码核实）**：**我们已经在消费它**，不是待评估的外部能力
  - `scripts/lib/aios-init/headroom-installer.mjs` — 版本 pin `headroom-ai[all]>=0.31.0,<0.32.0`，走 uv/pipx 安装，带 `--version/--help/wrap --help/mcp serve --help` 四项 smoke
  - `scripts/lib/components/pi/mcp-adapter.mjs` — 作为 MCP server 挂载，提供显式 compress/retrieve（即 CCR 能力）
  - `scripts/lib/interception/metrics/ledger.mjs` — Token Intelligence v2 里作为 `layer='headroom'` 独立计量，并统计 opt-in 采纳率
  - `docs/plans/2026-09-30-token-intelligence-v2-architecture.md:14` — 设计边界：「不做实时透明的输入拦截（Headroom 已声明该边界，本设计不越界）」
- **处置**: 移入 `consumedDependencies`（与 RTK、Caveman 同类），按版本 pin 漂移 + 采纳率跟踪，**不占 watchlist 坑位、不设 refreshTrigger**
- **教训**: 把已集成组件当新候选评估会虚增观察面，违背 portfolioPolicy 的成本收缩目标

### 2.2 CodeWhale（❌ 否决：不满足 portfolioPolicy 准入）

- **仓库**: github.com/Hmbown/CodeWhale · **Star**: 40K+
- **核心**: Rust 终端 coding agent harness；constitution.json 结构化行为约束；Fleet 模式 append-only ledger + `fleet resume` 断点续做；side-git 快照回滚；平台级沙箱隔离

**先澄清一个轴混淆**：CodeWhale 的 ledger 和 code-review-graph MCP **不是同一维度**，不构成替代关系。

| | code-review-graph MCP | 执行流水账（ledger） |
|---|---|---|
| 记录对象 | **静态结构** — 符号、callers/callees、imports、tests_for、community | **动态执行** — agent 每一步动作与状态转移 |
| 回答问题 | 「改这个会影响谁」 | 「刚才发生了什么，能否从第 N 步重放」 |
| 时机 | 编辑前规划 / 编辑后 `detect_changes` | 全程在线 |

`detect_changes` 虽在编辑后运行，但读的是 diff，不记录动作序列，也不提供恢复能力。所以评估可恢复执行类竞品时，**正确的对照物是 `solo-journal`，不是 CRG**。

**对照 solo-journal 后的结论 —— 同一套 append-only 语义我们已有：**

| CodeWhale 主张 | AIOS 现状 | 证据 |
|---|---|---|
| append-only ledger（步级） | **已有** | `solo-journal/iteration.mjs:20` 每轮 NDJSON 追加步内日志；`solo-journal/hooks.mjs:23` 追加 hook 事件流 |
| 结构化 outcome | **已有** | `writeFileAtomic(iterationPath, ...)` 原子 per-iteration outcome 文件 + rolling summary |
| `fleet resume` 断点续做 | **已有且更早** | `claimSessionOwner` / `isProcessAlive` / `installSessionSignalHandlers` — 租约防脑裂，fleet resume 无对应 |
| side-git 快照回滚 | **已有等价** | `solo-worktree.mjs` + `session/changed-files.mjs` |
| constitution.json 声明式约束 | **重叠** | 现有 workflow policy / capability routing（我们按 disposition 路由，它按规则文件声明） |

**判据**: portfolioPolicy 要求新候选必须回答一个**现有参照未覆盖的独立问题**。CodeWhale 在 memo/planning/team 三支柱内都找不到这样的缺口 → **不进 watchlist**。残余差异只有「resume 起点能否落在 iteration 内部而非边界」，但按 iteration 边界恢复是现有设计意图，不构成立项理由。

### 2.3 Orca (ADE)

- **仓库**: github.com/stablyai/orca
- **Star**: 80K+
- **核心**: Agent Development Environment，30+ CLI agent 并行 worktree 隔离；BYOS 直连 API；Design Mode 截图注入 prompt；PTY daemon 后台保活
- **AIOS 借鉴**: worktree-per-agent 隔离模型和 fan-out/comparison 编排模式；PTY daemon 保活机制对可恢复长任务有参考价值
- **建议**: 暂作 crossCuttingTrends 观察；AIOS 已有 worktree 并发模型，需评估 Orca 是否有增量价值

### 2.4 Paperclip

- **仓库**: github.com/paperclipai/paperclip
- **Star**: 97K+
- **核心**: Agent 组织编排平台；组织架构（org chart）、目标对齐、月度预算上限、心跳调度、审计日志；Companies 模板仓库
- **AIOS 借鉴**: "agent 即员工"的组织抽象填补单 agent 与多 agent 之间的治理空白；预算控制和心跳调度对 long-running harness 有直接参考价值
- **建议**: 暂作 crossCuttingTrends 观察；其治理抽象与 AIOS team-workflow 支柱相关，但当前 AIOS team 模型更偏 capability routing 而非组织管理

### 2.5 MCP 无状态重构（生态级）

- **事件**: 2026-07 MCP 完成从会话握手到无状态协议的架构重构
- **规模**: 月 SDK 下载 4 亿、Server 1.4 万+、Google/OpenAI/Microsoft/Anthropic 全面适配
- **AIOS 借鉴**: 无状态重构使 MCP 可水平扩展；企业级 auth/governance 规范（DCR/EMA）成熟；AIOS MCP browser/ContextDB 应跟进适配
- **建议**: 写入 crossCuttingTrends；这是基础设施级变化，不是单一竞品

---

## 3. 建议优先级

### 本月可做（高 ROI）

| # | 动作 | 来源 | 对应支柱 |
|---|------|------|---------|
| 1 | team-workflow 支柱缺口处置决策：要么正式立项填补（Paperclip 候选评审），要么显式接受该支柱暂时无参照 | OpenClaw 移除后果 | team-workflow |
| 2 | MCP 无状态协议适配调研（ContextDB / browser MCP 跟进） | MCP 生态 | team-workflow |
| 3 | Headroom 采纳率复查：ledger 已有 `layer='headroom'` 计量，确认 opt-in 采纳率是否达到 09-30 设计里 Phase 3 条件评估的门槛 | 已消费依赖 | memo-memory |

> 原列「评估 Headroom CCR」「评估 CodeWhale ledger」两项已在本轮源码核实后关闭：前者是已消费依赖，后者已被 solo-journal 覆盖（见 §2.1 / §2.2）。

### 下季度规划

| # | 动作 | 来源 |
|---|------|------|
| 4 | **Paperclip 预算+心跳机制 → long-running harness 治理层**（OpenClaw 移除后，这是 team-workflow 支柱最接近的填补候选，优先级上调） | Paperclip |
| 5 | Orca worktree 隔离模型对照 AIOS 现有实现找差距 | Orca |
| 6 | mem0 冲突去重算法 → 独立评估（与 Headroom 无关，后者是压缩层不是记忆去重层） | mem0 |

### 明确不跟

- 渠道/WhatsApp/桌面 UI 扩展（Hermes 渠道面；OpenClaw 已于本轮整体移除）
- GPU 向量库大全家桶（OpenViking cuVS）
- 纯方法论 skill pack（superpowers 已 remove）
- 独立 Memory Gateway 商业化（TencentDB 服务化路径）

---

## 4. 与 2026-09-28 的差分

| 09-28 状态 | 10-12 变化 |
|-----------|-----------|
| 5 活跃项（3 core + 2 specialist），核心契约稳定 | 4 活跃项（2 core + 2 specialist）；OpenClaw 移除；剩余 4 项契约仍稳定，无 deep dive 触发 |
| pendingDeepDive 为空 | 曾新增 2 个候选，源码核实后全部关闭：Headroom 改判为已消费依赖（移入 `consumedDependencies`）、CodeWhale 否决（solo-journal 已覆盖）。新增 3 条 `consumedDependencies` 条目（Headroom/RTK/Caveman） |
| crossCuttingTrends 最后更新 09-28 | 新增 9 条趋势（5 个新方向 + OpenClaw 移除决策 + 支柱缺口登记 + Headroom 分类更正 + CodeWhale 否决判据） |
| tierCounts 记 archive 5 / remove 2 | 校正为 archive 4 / remove 4（补记 07-31 superpowers 迁移 + 本轮 OpenClaw 移除），合计 12 与 baselineProjectCount 一致 |
| nextRefresh 指向 2026-12-28 / 2027-03-28 | 顺延至 2027-01-12 / 2027-04-12；pendingDeepDiveWork 移除 OpenClaw 条目 |
| team-workflow 支柱由 OpenClaw 独占 | 该支柱无活跃参照，缺口已登记于 `portfolio.remove.openclaw.pillarGapNote` |

---

## 5. 证据与方法备注

- 活跃项部分为 trigger screening（对照 refreshTrigger），新玩家部分为 WebSearch 扫描 + **本仓库源码核实**
- 外部数据来源: GitHub releases、技术博客、新闻报道；star 数为近似值，以 GitHub API 实时查询为准
- 内部核实证据（判据均落到具体行号）：
  - `scripts/lib/aios-init/headroom-installer.mjs` — Headroom 版本 pin 与 smoke 检查
  - `scripts/lib/components/pi/mcp-adapter.mjs` — Headroom MCP server 挂载
  - `scripts/lib/interception/metrics/ledger.mjs` — `layer='headroom'` 计量
  - `scripts/lib/harness/solo-journal/iteration.mjs:20` — 每轮 NDJSON 步内追加日志（CodeWhale ledger 对照）
  - `scripts/lib/harness/solo-journal/hooks.mjs:23` — hook 事件流追加
  - `scripts/lib/harness/solo-journal/{owner,signals}.mjs` — 租约与进程存活恢复
  - `docs/plans/2026-09-30-token-intelligence-v2-architecture.md:14` — Headroom 设计边界
- **本轮教训（写入 crossCuttingTrends）**：新玩家扫描产出的候选必须先对照本仓库现有实现再决定是否立项。这一轮 5 个"值得学习"的方向里，2 个在源码核实后自行消解 —— 说明纯外部视角会系统性高估缺口。下一轮把「先 grep 自己」作为候选准入的第一步。
- 方法学修正建议：`portfolioPolicy.decisionRules` 可增加一条 —— 新候选在进入 `pendingDeepDive` 前，必须先给出「本仓库哪个模块最接近该能力」的自查结论。

---

## 6. 处置记录（2026-10-13 已裁决并落地）

> 本节初稿为「待裁决」清单。**2026-10-13 operator 裁决：6.1–6.5 全部采纳，6.6 选 A（修注册）且要求覆盖所有客户端。** 以下保留当时的分析与判断依据，并把落地结果标注在各项末尾。


> 本节记录需要 operator 拍板的项。**未确认前不施工**——此前一轮曾把未裁决项写成 ADR 的「已裁决」，违反 rex-requirements 的「假设不落 ADR，已裁决才落」，那两个 ADR 已删除、内容归位到这里。

### 6.1 archive 4 项去留（等拍板）—— 已修正：四项不可一并处置

**修正说明**：本节初稿建议「archive 4 项一并移除」，理由是「定位口径一致适用」。**该建议基于文本复核而非逐项核实，已撤回。** 真查后发现四项的归档理由质量不同，其中两项的理由**依赖本轮刚被移除的 OpenClaw**，属理由失效：

| 项目 | 归档理由（原文） | 依赖已删的 OpenClaw？ | 处置 |
|---|---|---|---|
| mem0 | 「hook 矩阵历史证据已充分；该问题已被 AIOS client projection 与 candidate-gate 方向吸收」 | 否 | 理由成立，可退 |
| OpenHarness | 「readiness 结构已被 AIOS 吸收；PREVIEW 仅提示词写保护，作为反例记录」 | 否 | 理由成立，可退 |
| **OpenViking** | 「namespace、ref-only 与 audit 信号已由 **OpenClaw**、TencentDB-Agent-Memory 等更聚焦来源覆盖」 | **是** | **理由失效，需重评** |
| **Hermes Agent** | 「curator/skill 治理又与 **OpenClaw** 核心问题重叠」 | **是** | **理由失效，需重评（见 6.4）** |

**这是本轮第二个结构性发现（与 6.3 的 SoL-Pi 缺口同类）**：组合收缩会**静默地让其他条目的归档理由失效**。移除一个参照时，没有任何机制检查「谁的理由引用了它」。当被引用的条目本身是「它已被 X 覆盖」里的 X，移除它就把「已覆盖」变成悬空断言。

**建议处置（分两步）**：

- **(A) mem0 / OpenHarness 移除**：理由成立，且 tierDefinitions.archive-reference 已声明该层「无定期刷新」——占坑但零维护。转归档报告文件、退出 watchlist。
- **(B) OpenViking / Hermes 换理由或复位**：必须给出**不依赖任何已移除条目**的新理由。换不出即回到活跃层，因为它们的 uniqueReferenceQuestion 现在确实无覆盖者：
  - **OpenViking**：「URI 级 agent namespace + link-only 预算降级 → 可审计 context container」。原覆盖者三名，OpenClaw 已去，**只剩 TencentDB 一个**；而 TencentDB 的窄问题是「full → summary+ref 降级」，不含 namespace 与 audit 语义。
  - **Hermes**：问题见 6.4，**可能就是 team-workflow 缺口的天然填补者**。

**另有一处口径冲突（未变）**：portfolioPolicy.decisionRules[5] 声明「Stars, forks and routine release numbers are no longer maintained」，而本报告 0/1 节通篇以 star 数（"Star 25.4K+"、"369K★"、"97K+"）作叙述与优先级依据。实测 12 个 portfolio 条目**零个**含 star 字段——报告里的 star 是自由文本。

### 6.2 star 数退出决策依据（等拍板）

若采纳 6.1(A) 或独立采纳：报告正文不再以 star 作优先级理由，改为「它回答哪个未覆盖问题」。历史 star 数字保留在附注并标注不维护。**若你希望保留 star 作参考**，则需反过来修 `decisionRules[5]`——两者必须有一个改，不能并存。

### 6.3 SoL-Pi 入册（建议直接做，等你一句话）

**SoL-Pi（NVlabs）不在册**——`portfolio` 12 项、`rejectedCandidates` 1 项、`consumedDependencies` 3 项里都没有。但它**真实影响过产品决策**：v2 方法论来源（`docs/plans/2026-09-30-token-intelligence-v2-architecture.md` 开头）、A/B 命名、两道闸门规则，博客 `tags` 里也署名 `"SoL-Pi"`。

这是本报告发现的最有价值的一格缺口：**影响过决策的来源却没进册，说明准入流程只覆盖「候选进 pendingDeepDive」这一条路，漏了「已在影响我们的来源」**。建议按 `uniqueReferenceQuestion` 格式补入 `consumedDependencies`（我们不装它的包，只借方法论）。

### 6.4 team-workflow 支柱缺口（已修正：Hermes 是本缺口的天然候选）

**缺口定义**（`portfolio.remove.openclaw.pillarGapNote`）：「Agent 提出的 skill / 共享状态变更如何经 proposal → review → apply / rollback / quarantine 并用 provenance 与 stale hash 安全发布」。

**修正**：本节初稿建议「显式接受该支柱无参照，不硬塞 Paperclip」，并只把 Paperclip 列为候选。**漏了一个更贴的候选，已补。**

#### 6.4.1 Hermes 的问法就是缺口本身

逐字对照：

| 缺口需要的 | Hermes 的 uniqueReferenceQuestion |
|---|---|
| agent 提出的 skill / 共享状态变更如何安全发布 | 「后台 skill review 与 curator 如何形成**可审计的自改进闭环**」 |

这不是「重叠」（Hermes 原归档理由的说法），是**同一个问题**。

**而且 Hermes 被归错了 pillar。** 在册记录为 `pillar=intelligent-planning`，但这个 pillar 的定义是规划/工作集装配（对照 oh-my-openagent 的「session lineage + stale content 写保护」）。skill 的 review→apply→rollback 治理属 **team-workflow**。归错 pillar 的直接后果：它既没被算作 team-workflow 的参照，又在 intelligent-planning 里被当成「与 OpenClaw 重叠」而归档 —— **两处都落空**。

**证据状态**：Hermes 已有一份专门的能力映射 `docs/hermes-inspired-capability-mapping.md`（2026-04-12），6 项能力中 5 项标 `Done`、1 项 `Deferred by design`，并写明「No open Hermes-inspired baseline follow-ups in this cycle」。**但那份映射覆盖的是 session recall / memory injection safety / subagent progress / executor capability / pre-mutation rollback —— 没有一项是 skill governance。** 所以「已有专门映射」不构成归档理由：映射覆盖的是另一批问题，缺口那一项从未被映射过。

#### 6.4.2 Paperclip 不匹配（判断不变）

Paperclip 的「组织架构 / 目标对齐 / 月度预算上限 / 心跳调度」是**组织管理**，与「变更如何经 proposal→review→apply 安全发布」不是同一个问题。按 `decisionRules[4]`，候选必须回答未覆盖问题 —— Paperclip 需先证明这一点。

#### 6.4.3 建议

把 **Hermes 复位为 team-workflow 的活跃参照**（specialist-reference 层即可，只回答这一个窄问题），理由必须是新的、不依赖 OpenClaw 的：

- 它是该缺口最直接的现存实现（curator + 后台 skill review）；
- 已有一份不覆盖该问题的旧映射，可在此基础上补 skill governance 一节；
- 相比 Paperclip，它回答的正是缺口原话。

**这意味着 6.1 的 Hermes 处置应选「复位」而非「移除」。** 若你不同意，则该支柱需显式接受无参照 —— 但要在记录里写明「曾有一个贴合的候选被归错 pillar 而归档」，否则下次刷新仍会重复这个盲区。

### 6.5 decisionRules 增补三条（建议直接做）

① 引用本仓库能力前必须给出当前源码写入点行号；给不出即标未验证，不得当已完成引用。

② 新候选进 `pendingDeepDive` 前，必须先给出「本仓库哪个模块最接近该能力」自查结论——后者是本报告 §5 自己提的，只是没落进 policy。

③ **移除任何参照前，必须先扫一遍其它条目的理由是否引用了它**；若引用，被引用项的移除必须连带重评引用方。

第 ③ 条来自本轮两个发现共有的一个根因。把它们并列看：

| 发现 | 形式 |
|---|---|
| §6.3 SoL-Pi 不在册 | 一个来源**已在影响决策**，却从未进册 |
| §6.1 OpenViking / Hermes 理由失效 | 归档理由「已被 X 覆盖」里的 X 被移除了，理由悬空 |
| §6.4 Hermes 归错 pillar | 一个贴合缺口的候选，因归类错误**两处都落空**（既不算该支柱参照，又在别处被当「重叠」归档） |

三者都是**组合账本内部的引用完整性问题**，不是外部信息不足：没有一处需要新的外部情报，只需在改动账本时检查引用。portfolioPolicy 目前只规定了「新候选如何进」（`decisionRules[4]`），**没有规定「已有条目被移除/改类时如何维护引用图」**。建议补第 ③ 条，并在 `cleanupNotes` 的每次收缩记录里加一列「受影响的引用方」。

### 6.6 CRG（code-review-graph）在 Claude 下未工作（等拍板：修注册 or 修文档）

**症状**：CRG 在 Claude Code 里从不生效，其余客户端正常。

**根因（`node scripts/aios.mjs internal codemap doctor`，2026-10-12 实跑）**：

```
[5/7] Checking MCP config in clients
OK   code-review-graph found in ~/.codex/config.toml (codex)
WARN code-review-graph missing in ~/.claude.json (claude)      <-- 唯一失败项
OK   ... gemini / opencode / hermes / grok / workbuddy 全部 OK
Result: OK (1 warnings)
```

7 个客户端里 6 个正常，只有 Claude 缺注册。两层原因叠加：

1. **`~/.claude.json` 项目条目下 `mcpServers` 为空**（实测 `E:/coding/harness-cli` → `mcpServers: {}`）。CRG 只在项目根 `.mcp.json` 里，而项目级 MCP 需用户批准才加载。
2. **`.claude/settings.local.json` 显式禁用**：`disabledMcpjsonServers` 含 5 项 —— `code-review-graph`、`aios-auth-tools`、`mcp-browser-use`、`aios-shell`、`aios-memory`。该文件被 `./.gitignore:60` 排除，属纯本地状态，是此前「轻会话」批量关 MCP 的副产物（不止 CRG 一项）。

**后果**：会话工具列表里没有 `mcp__code-review-graph__*`，而 `./CLAUDE.md:223` 整节在教如何使用 `get_minimal_context` / `detect_changes` 等工具 —— **文档在教一个默认不存在的工具**。`AGENTS.md` / `GEMINI.md` 同样含该节（doctor 第 7 步报三项均 OK）。

**第二个独立问题**：`graph.db` 时间戳 2026-09-21，而仓库最新 commit 是 2026-10-02 —— **图已落后 11 天**（且 `.code-review-graph/.gitignore` 声明 `*`，图不入库）。即便修好注册，读到的也是旧图。

**两条路（互斥）**：

- **(A) 修注册**：从 `disabledMcpjsonServers` 移除 `code-review-graph`，并批准 `.mcp.json` 的项目级 MCP；随后重建图。恢复可用，但把「5 项全关」的轻会话状态破掉一项。
- **(B) 修文档**：承认默认不用，把 `./CLAUDE.md:223` 那节与 `aios-codemap-ops` skill 标注为「需先 `aios internal codemap install` + 启用客户端 MCP」。**更诚实** —— 文档当前承诺的能力与实际默认状态不符，属 §6.5 同类的「引用一个当前不成立的能力」。

**修复可行性实测**（`aios internal codemap doctor --fix --dry-run`）：该命令**确实**会写 claude 注册（`OK codemap MCP planned: C:\Users\Administrator\.claude.json (claude)`），所以 (A) 的第一层有内置修复路径，不必手改。但要注意它**只能修一层**：

- `--fix` 写的是 **user 级** `~/.claude.json` 的 `mcpServers`；
- 会话实际生效还取决于 **project 级** `.claude/settings.local.json` 的 `disabledMcpjsonServers` —— 该键**不会被 `--fix` 触碰**（全仓无写入点，实测只有该文件自身含此键）。

所以走 (A) 需要两步：跑 `doctor --fix`（修 user 注册）+ 手工从 `.claude/settings.local.json` 的 `disabledMcpjsonServers` 移除 `code-review-graph`（修 project 禁用）。**只做第一步不会生效** —— 这正是该问题此前反复出现却看不出原因的机制：命令报 OK，实际仍被禁用。

**建议 (B)**，因为 doctor 的 `graph.db` 落后说明即使启用也需先重建，而当前没有任何机制保证图新鲜；把「可选、需显式启用」写清比维持一个默认关闭的承诺更准确。若你常用 CRG 做多文件改动的影响分析，则选 (A)。

---

### 6.7 落地结果（2026-10-13）

| 项 | 裁决 | 落地状态 |
|---|---|---|
| 6.1 | archive 四项分别处置 | ✅ mem0 / OpenHarness → `remove`；OpenViking 保留 archive 但理由改按**定位口径**重写（不再引用 OpenClaw）；Hermes 复位为 `specialist-reference` |
| 6.2 | star 退出决策依据 | ✅ 已补入 `decisionRules` 语义（不维护 star 作决策依据）；本报告新增内容不再以 star 领述 |
| 6.3 | SoL-Pi 入册 | ✅ 补入 `consumedDependencies.entries`，标注它是**方法论**消费（不装包） |
| 6.4 | Hermes 复位 | ✅ `archive-reference` → `specialist-reference`，`pillar` 由 `intelligent-planning` 校正为 **`team-workflow`**；OpenClaw 的 `pillarGapNote` 同步改为指向 Hermes |
| 6.5 | decisionRules 补条 | ✅ 补至 **8 条**（新增引用行号纪律、候选自查、移除前扫引用方） |
| 6.6 | CRG 修注册（A）+ 全客户端 | ✅ 代码已落地并验证，详见下节 |

**新的组合结构**：`core-reference` 2 / `specialist-reference` **3** / `archive-reference` **1** / `remove` **6**，合计 12（与 `baselineProjectCount` 一致）。活跃参照由 4 升至 **5**——Hermes 复位使 `team-workflow` 支柱重新有了参照。

**`cleanupNotes` 新增一条**，并首次附「受影响的引用方」一列：OpenViking（理由引用 OpenClaw）、Hermes（同上）、crossCuttingTrends（缺口原指向 Paperclip）。

### 6.8 CRG 全客户端修复（6.6 选项 A）—— 已落地

**代码改动**（`scripts/lib`）：

| 文件 | 改动 |
|---|---|
| `components/codemap/mcp-targets/targets.mjs` | 客户端清单 **7 → 10**：补 `pi` / `zcode` / `qoder`；`namespace` 透传 |
| `components/codemap/mcp-targets/json.mjs` | 新增 `resolveNamespaceBucket` 点路径下钻；**修掉三处静默 no-op**（inject / remove / inspect 原先用单层取值，对 zcode 的 `mcp.servers` 恒落空）|
| `components/codemap/mcp-targets/entries.mjs` | 新增 `buildCrgPiEntry`——pi 条目**独立构造**（不走 overrides，因其只能合并不删字段）|
| `components/codemap/mcp-targets/formats.mjs` | 注册 `mcp-json-nested`（zcode，落盘前按白名单规范化）与 `pi-json` |
| `components/codemap/freshness.mjs` | **新建**：图陈旧判定（图龄 vs 落后 HEAD 两个量分开）|
| `components/codemap/install.mjs` | 图陈旧时重建（原先只在图**不存在**时构建）|
| `components/codemap/doctor.mjs` | 报告图陈旧；报告 claude 的 project 级禁用（`--fix` 修不到）|
| `clients/mcp/zcode-schema.mjs` | **新建**：zcode 严格白名单提取为中立共享模块，browser 与 codemap 共用（browser 侧改为 re-export，import 路径不变）|
| `cli/help/codemap.mjs` | 修正过时的 claude / pi 落点说明 |

**测试改动**：`scripts/tests/codemap.test.mjs`
- **删掉假绿逃生口**：原断言遍历 `ALL_CLIENTS` 却带 `if (!target) continue;`，把「清单里根本没这个客户端」当作「路径被 dedup 覆盖」静默跳过——这正是清单漏掉三个客户端而测试全绿的原因。现改为断言每个声明了 MCP 落点的客户端**都必须有目标**。
- 测试夹具由 6 个 home 补至 10 个。
- 新增 4 组测试：zcode 点路径读写与白名单规范化、pi 条目与 pi 组件**逐字节一致**、doctor 报告 claude 禁用态、图陈旧判定。

**验证结果**：`codemap.test.mjs` 13/13 通过；`mcp-targets` + `zcode-mcp-nested-migration` 合计 22/22 通过；客户端注册表 / 组件 / pi-doctor / browser 相关 7 套共 94 通过 1 跳过 0 失败；全量回归 212 文件，仅 2 项既有失败（`llms-txt` / `rex-v2-case-selection`，其输入文件均不在本次改动清单内，与本次无关）。

**`doctor` 实测**（全 10 客户端）：正确报出 5 项待处理 —— claude 缺注册、claude 被 project 级禁用、zcode 缺、qoder 缺、图陈旧（图龄 21 天 / 落后 HEAD 10 天）。

**尚未执行的两步（需本机交互权限）**：
1. `node scripts/aios.mjs internal codemap install` —— 真实写入 10 个客户端的用户级配置，并重建图。属对外可逆但有面的改动，待授权。
2. 从 `.claude/settings.local.json` 的 `disabledMcpjsonServers` 手工移除 `code-review-graph` —— 该文件是 gitignored 的本地状态，无代码写入面，`--fix` 不会碰它。
