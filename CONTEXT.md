# CONTEXT.md — 领域词汇表

本文件记录 AIOS 的领域术语：一行定义 + 一行「为什么需要它」。
由 `/grill`（rex-requirements 写回步骤）实时 upsert；用户手写内容不重写。

---

## Token / 上下文压缩

### interception refs

**定义**：`scripts/lib/foundation/interception/runtime/core/engine.mjs:15 interceptToolResult()` 在工具结果边界把 ≥2048 字节（`scripts/lib/foundation/interception/runtime/core/types.mjs:4 minRawBytes`）的原文写入本地 `.raw` ref，上下文只保留 summary + errorLines + keyLines + ref_id + 召回命令。

**为什么**：把「完整证据留在本地、可召回」和「上下文里只放可行动信号」拆成两件事，使压缩不必以丢失可诊断性为代价。

### Pi 观察卸载（ObservationPack-lite）

**定义**：`packages/aios-pi/lib/offload.mjs:59 offloadMessages()` 在 pi 的 `context` 事件（每次 LLM 调用前）扫描**每条消息的任何文本内容项**，≥20000 字符者归档一次，上下文中替换为 handle + 2000 字符头 + 800 字符尾；取回靠 `packages/aios-pi/lib/tools.mjs:103 aios_offload_retrieve`。默认关（`packages/aios-pi/lib/offload.mjs:18-24`）。

**为什么**：pi 是全栈唯一没有拦截面的客户端，工具循环内的观察量不受任何压缩层约束。**注意：它和 interception refs 是两条独立通路**（不同文件、阈值、触发面、客户端），不共享代码路径——早先文档把两者当作"同一个自动 offload"是错的。

### 取回不对称

**定义**：AIOS 的压缩在多个通路是 **runtime 强制**的（interception refs、PostToolUse offload、Pi 观察卸载都自动挡），而取回全部是**模型自愿**的（`cli/dispatch/offload.mjs:9 runRefsCommand` 的 `refs read`、`aios_offload_retrieve`）。

**为什么**：这个不对称是 Pi 观察卸载 A/B 出现 −64% 翻转的背景。但**它本身不是根因**——refs 层同样不对称却零代价。根因在压缩产物的形状（refs 留结构化信号，Pi 只留头尾截断），见 `docs/plans/2026-10-12-token-intelligence-v3-retrieval-root-cause.md` §1.3。

### 产物形状（压缩产物的信号保留）

**定义**：一次自动压缩**留在上下文里的东西**。refs 层留 summary + errorLines + keyLines + ref_id + 召回命令（`scripts/lib/foundation/interception/runtime/packets/compact-packet.mjs:32-34`）；Pi 层留 handle + 2000 字符头 + 800 字符尾（`packages/aios-pi/lib/offload.mjs:39-42`）。

**为什么**：这是取回轮次方差的根因判据——产物保留了信号，模型就少回读；只留头尾，模型想要中段就必须回读且回读几次由模型自定。所以修法在产物侧，不在「谁决定取回」侧。推论状态为**待验证**（v3 计划段 B1 的对照实验），尚未证实。

### ledger layer

**定义**：`scripts/lib/foundation/interception/observability/metrics/ledger.mjs:11 LEDGER_LAYERS` 的四层枚举 `['refs','pi_usage','headroom','rtk_ab']`，每层在统一 JSONL 账本里独立计账。

**为什么**：让每 token 事件可归因到机制，使 A/B 结论能被拆解而非整体宣称。**写入点与枚举成员是两个概念**——枚举里有名字不等于有生产写入点（`headroom` 就是只有枚举、无写入点）。

---

## 竞品组合

### consumed dependency

**定义**：AIOS 实际安装并计量的上游组件（Headroom / RTK / Caveman），不是竞品。按版本 pin 漂移 + 采纳率跟踪，**不占 watchlist 坑位、不设 refreshTrigger**。

**为什么**：把已集成组件当新候选评估会虚增观察面，虚增的观察面会产出虚增的缺口判断。

### uniqueReferenceQuestion

**定义**：每个 watchlist 条目的核心字段——该竞品回答的**一个**、AIOS 计划内尚未被覆盖的问题。没有这个问题的条目不能保留。

**为什么**：把「参考竞品」从「值得看的项目清单」变成「按问题索引的证据源」；这是 2026-07-28 组合收缩的依据，也是淘汰时唯一需要的判据。

### 定位口径

**定义**：AIOS 是**本地优先的 coding client 编排控制面**（`docs/reports/competitor-watchlist.json` → `coreValue.product`）。

**为什么**：它是判断一个项目是否在参照范围内的依据。2026-10-12 据它移除了 OpenClaw（`portfolio.remove.openclaw.reason`）——面向终端用户的多渠道 agent 产品在范围外。

> **口径的外延尚未裁决。** 同属范围外的 archive 条目（Hermes / OpenViking / mem0 / OpenHarness）是否一并移除，是 `docs/reports/2026-10-12-competitor-refresh.md` §6.1 的待裁决项；在 operator 拍板前，本条术语只记录**已确立**的定义与一次**已发生**的适用，不代表口径已一致适用于全部条目。

---

## 子模块与发布边界

### 落点边界

**定义**：一个变更属于 `rex-harness/` 子模块，当且仅当它属于「第三方可独立安装使用」的公开产品面（状态内核、契约、CLI、公开 schema）；不属于的留在父仓库（适配层、solo 编排、AIOS 集成如 plan 同步 / offload / continuity）。裁决与拒绝项见 `docs/architecture/adr/0001-submodule-landing-boundary.md`。

**为什么**：在父仓库侧二次实现同一条语义（例如「什么算完成」）会让一条规则有两个 owner——这正是 2026-10-14 评审认定的「决策语义外泄」缺陷；子模块是独立公开仓库（`@rexleimo/rex-harness`），语义只实现一次，下游使用者同样受益。

### 公开面（public face）

**定义**：父仓库唯一允许 import 的子模块入口是 `rex-harness/src/index.mjs`（对应 package `exports` 的 `.`）；`rex-harness/src/**` 其余内部模块禁止 deep import，`bin/` 只允许通过进程调用（`rex-harness verify` / `settle`）。

**为什么**：子模块已有向内的边界测试（`rex-harness/tests/architecture/import-boundaries.test.mjs`），但向外的检查缺失——历史上的 `scripts/lib/execution/harness/solo/turn-settlement.mjs:4` 就是一处未受约束的 deep import（该模块已于 2026-10-14 被 work-4 C 裁决删除：零生产 importer）。没有检查的边界不是边界。

### 可达性（枚举）

**定义**：一个枚举成员只有在存在**真实 call site** 时才允许留在该枚举里；没有 call site 的能力不进 public enum / CLI flag / event schema / 空 adapter。反向地，公开 wire 契约里的成员可以由**外部宿主**产出，宿主桥不得为了“用满枚举”自行映射。

**为什么**：两侧都会腐化：① 声明了不可达的能力（父 `SHOULD_RUN_ACTIONS.self_repair` 永不返回）会让契约撒谎；② 桥为了填满枚举把失败轮映射成 material outcome（`repair_required`）会静默改变结算与额度语义。裁决见 `docs/architecture/adr/0002-turn-outcome-reachability.md`。

## Solo 循环的决策契约

### 声明通道（F / S / O）

**定义**：solo 循环的一次 turn 只从三个**声明**来源取信息——**F 事实**：`solo-journal` 账本已记录的轮次与额度（work-6 的单一写者）；**S 自报**：provider 的 `selfReport{progressMade, blockedReason, summary}`（`support/turn-consequences.mjs:normalizeSelfReport`）；**O 操作者**：显式声明（resume ack / 门放行）。程序不从 summary 文本猜进展，也不从缺字段推意图。

**为什么**：迁移前这些语义由 ≥6 处手写字符串分支各自推断（`normalizers.mjs` 的三个 `infer*`、`backoff.mjs`、`cadence.mjs`、`checkpoint.mjs`、`state.mjs` 的 runStatus、`should-run.mjs`），加一个 outcome 要同时改多处且无守卫证明它们一致。声明是字段，猜测是分歧的源头。

### 材料性（material）

**定义**：一轮 turn 有资格产生**副作用**（扣额度、把节奏拉回基准、推进工作流、以成功收尾）当且仅当 `TURN_CONSEQUENCES[outcome].material === true` **且** S 通道声明 `selfReport.progressMade === true`（`support/turn-consequences.mjs:isMaterialTurn`）。裸 `outcome: 'success'` 而无声明：归类照常，副作用一律不给。

**为什么**：executor 不得自验完成声明（turn 契约 §前言），而"字符串等于成功"曾经是唯一的进展证据。实测现网 provider 根本不声明 success（`execute-turn.mjs` / `execute-turn-pi-rpc.mjs` 只发 stopped/blocked/infra-retry/human-gate），所以这条收紧不剥夺任何真实声明，只堵住"给裸字符串就能白拿额度与节奏"。safe_bypass 封印是它的第二道防线。

### 后果表（单一 owner）

**定义**：`outcome → 全部后果`（failureClass / backoffAction / checkpointStatus / runStatus / verificationResult / cadenceClass / stopByDefault / requiresOperator / countsAsNoopPoll / material）只登记在 `support/turn-consequences.mjs:TURN_CONSEQUENCES` 一处；其余模块调用 `derive*` / `turnConsequencesFor`，未登记名字直接抛错。`findTurnTableGaps()` 是这张表与 `SOLO_OUTCOMES` 的一致性检查，`scripts/tests/execution/harness/harness-turn-consequences.test.mjs` T7 额外扫描运行时源码，禁止第二处 outcome 字符串比较。

**为什么**：D1 裁决保留 rex `TURN_OUTCOMES` 与 `SOLO_OUTCOMES` 两套词表（不跨表映射，直到有真实 call site——见 ADR 0002 的「可达性（枚举）」），前提是映射所有权唯一。没有这个约束，"两套词表"就会退化成"两套互相漂移的推理"。
