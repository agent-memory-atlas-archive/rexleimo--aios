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
