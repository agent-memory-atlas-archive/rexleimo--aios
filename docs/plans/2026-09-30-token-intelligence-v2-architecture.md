# Token Intelligence v2 — 遥测账本优先的架构设计

日期：2026-09-30。来源：SoL-Pi（NVlabs）研究线闭环，吸收其方法论（两道闸门验收、冻结 held-out、每机制计账），不引入其工件。前置讨论见 memo `memo:default:20260929163626710` / `memo:default:20260929164059678`。

## 目标

1. 每一层压缩（refs / pi 轮内 / Headroom / RTK）有独立的 token 收支记录，`aios tokens report` 一条命令出报表。
2. pi 客户端获得轮内 compress/retrieve 能力（止血：Headroom MCP 挂 mcp.json，零代码；自动卸载为条件触发项）。
3. 任何新压缩机制（自研或外部）默认 opt-in，在冻结任务集上过两道闸门后才可默认开启。

## 非目标

- 不安装 SoL-Pi（闸门绕过 / RPC 传输竞争 / pi 0.87.1 超出其验证域 0.85.1/0.84.2）。
- 不做实时透明的输入拦截（Headroom 已声明该边界，本设计不越界）。
- RTK 不做线上归因（外部工具，无法从外侧计量）——只在 A/B 跑分中计量。
- 账本不写任何 raw 内容（沿用 metrics-sink 既有纪律：只写数字和 ref 指针，防审计日志反向泄漏）。

## 现状（as-is）

```
                      ┌─────────────────────────────────────────────────┐
                      │              AIOS harness（solo / team）          │
                      │   iteration prompt · JSON 契约 · 每轮 newSession  │
                      └───────┬────────────────────────────┬────────────┘
                              │ pre_send 压缩               │ post_receive 压缩
                              ▼                            ▲
  shell 命令输出               │  ┌──────────────────────────┴───────────────┐
  ────▶ RTK 过滤 ────────────▶│  │ interception turn 压缩（refs/packets）    │
  （进上下文之前）             │  │ ✅ 已有 metrics-sink：bytes/tokens 记账    │
                              │  └──────────────────────────────────────────┘
  ┌──────────┐  ┌──────────┐  ┌───────────────────────────────────────────┐
  │ Caveman   │  │ ContextDB│  │ Headroom MCP（显式 compress/retrieve）     │
  │ 文风压缩   │  │ 按需召回  │  │ ✅ 已注册：gemini / grok / hermes          │
  └──────────┘  └──────────┘  │ ❌ pi 未挂（mcp-adapter 基建已存在）        │
                              └───────────────────────────────────────────┘

  pi 客户端轮内工具循环：❌ 无记账、无卸载 —— 全栈唯一盲区
  缺口：账本按 session 散落、无 layer 归属、无报表出口、pi 轮内 usage 未捕获
```

## 目标架构（to-be）

```
                        ┌────────────────────────────────────────────────────┐
                        │        Token Ledger —— 统一 JSONL 账本              │
                        │   <stateRoot>/interception/metrics/<session>.jsonl  │
                        │   既有 sink 保留，record 增加 layer/task_id 归属     │
                        └──────▲──────────────▲──────────────▲──────────▲────┘
                               │              │              │          │
             ┌─────────────────┘              │              │          └──────────────┐
             │                                │              │                         │
   ┌─────────┴─────────┐          ┌─────────┴─────┐  ┌─────┴──────────┐  ┌───────────┴──────────┐
   │ refs 层（已有产出） │          │ pi usage tap  │  │ headroom stats │  │ A/B 跑分器            │
   │ metrics-sink 适配   │          │ rpc-client    │  │ stats 采集      │  │ token-bench run.mjs  │
   │ layer='refs'       │          │ 新增（先 spike）│  │ layer='headroom'│  │ RTK 仅在此计量        │
   └────────────────────┘          └───────────────┘  └────────────────┘  └──────────────────────┘
                                             │
                              ┌──────────────▼───────────────────┐
                              │  aios tokens report（新 CLI 命令） │
                              │  按层聚合：saved tokens / 比率     │
                              └──────────────────────────────────┘

  pi 客户端（交互式或托管）：
  ├─ settings.json → extensions: aios.ts（闸门 / 工具 / 记忆，不变）
  ├─ mcp.json（AIOS-managed 幂等合并表）
  │    └─ ＋ headroom server        ← 止血步：配置级，opt-in compress/retrieve
  └─（条件触发）aios.ts 挂 context 事件：
        大工具结果 ─▶ content-addressed 落盘 <sessionDir>/aios/observation/<sha256>.txt
                  ─▶ 上下文只留 handle + 摘要
                  ─▶ 注册 aios_retrieve 工具按需分页取回（只读，不涉闸门）
```

## 账本记录 schema

在现有 `writeMetricsRecord` 的 record 上增补，不破坏既有消费方：

```js
{
  // —— 既有字段全部保留 ——
  ts, session_id, client_id, host_level, mode, ref_id,
  raw_bytes, compact_bytes, saved_bytes, saving_ratio, strategy,
  raw_tokens_estimate, compact_tokens_estimate, refs_count,

  // —— 新增：层归属与任务关联 ——
  layer: 'refs' | 'pi_usage' | 'headroom' | 'rtk_ab',
  task_id: 'bench-001' | null,        // 跑分时填冻结任务 id；线上为 null

  // —— pi_usage 专属（spike 确认字段名后定稿）——
  input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, context_size,

  // —— headroom 专属 ——
  op: 'compress' | 'retrieve', bytes_in, bytes_out,
}
```

报表输出（`aios tokens report --session <id> --last 7d`）：

```
layer      events   saved_tokens   saving_ratio   note
refs          412      1.83M            61%        已有
headroom       38      412k             55%        opt-in 采纳率见 stats
pi_usage     1,204          —              —        总消耗基线（轮内卸载的分子）
rtk_ab         —     (仅跑分产出)         —        线上不可归因，见 A/B
```

## 文件级变更地图

| 阶段 | 文件 | 变更类型 | 说明 |
|---|---|---|---|
| 0-spike | `scripts/lib/pi/rpc-client.mjs` | 修改 | 验证 pi RPC 事件流是否含 usage 字段（第一个任务，决定 pi_usage schema）|
| 0 | `scripts/lib/interception/metrics/ledger.mjs` | 新增 | layer 归属、追加写入、按层/时段聚合查询 |
| 0 | `scripts/lib/interception/metrics/metrics-sink.mjs` | 小改 | record 写入 `layer: 'refs'` |
| 0 | `scripts/lib/cli/commander-app.mjs` + `dispatch/` + `help/commands/` | 新增 | `tokens report` 命令注册与帮助 |
| 1 | `scripts/fixtures/token-bench/tasks/*.json` | 新增 | 冻结任务集 20–30 条（objective + 客观产物校验 + 预计长度分档）|
| 2 | `scripts/token-bench/run.mjs` | 新增 | A/B 执行器：同一任务集跑"机制关/开"，产两份 ledger 并 diff |
| 止血 | `scripts/lib/components/pi/mcp-adapter.mjs` | 小改 | AIOS-managed entries 增加 headroom server（builder fn + 幂等合并，沿用 browser server 模式）|
| 3-条件 | `packages/aios-pi/lib/offload.mjs` | 新增 | 纯函数：`shouldOffload(bytes, threshold)` / `buildHandle()` / `buildExcerpt()`，node --test 可测 |
| 3-条件 | `packages/aios-pi/lib/tools.mjs` + `extensions/aios.ts` | 修改 | 注册 `aios_retrieve` 工具；`context` 事件接线（SoL-Pi 验证过的公共 API 面）|
| 4/5 | — | 暂缓 | fusion / reducer 待账本数据显示对应浪费占大头后再设计 |

## 两道闸门执行流

```
 冻结任务集（20–30，永不调参）
    │
    ├─ A 轮：机制全关（基线）      ─▶ ledger A
    ├─ B 轮：待验机制开启          ─▶ ledger B
    ▼
 diff = 能力分 Δ + token/成本 Δ
    │
    ├─ gate1：能力分落在预设容差内？（客观产物校验，非主观打分）
    ├─ gate2：效率有正收益？（saved_tokens > 0 且成本不升）
    ▼
 两条都过 ─▶ 该机制可默认开启；任一不过 ─▶ 保持 opt-in 或回滚，进候选复核
```

## 风险与未知

| 风险 | 处置 |
|---|---|
| pi RPC 事件流可能无 usage 字段 | Phase 0 第一个任务就是 spike；若无，pi_usage 层降级为轮前后 context_size 采样 |
| RTK 线上不可归因 | 明示为 A/B-only 层，报表标 `—`，不造假数 |
| Headroom opt-in 采纳率低（模型不主动调） | stats 事件计数直接暴露采纳率；过低则触发 Phase 3 条件评估 |
| 账本写放大 | JSONL 追加 + 只写数字，量级远小于被压缩对象；沿用现有 sink 无新风险 |
| aios-pi offload 误伤小结果 | `shouldOffload` 阈值 + 每会话上限，且该机制默认 off，过闸门才开 |

## 里程碑

| 里程碑 | 内容 | 规模 | 验收 |
|---|---|---|---|
| M1 | spike + ledger + `tokens report` | 1–2 天 | 对既有 session 跑出第一份真实分层报表 |
| M2 | 冻结任务集 + A/B 跑分器 | 1 天 | 同一任务集两轮跑出可 diff 的两份账本 |
| M3 | pi 挂 Headroom MCP（止血） | 半天 | `aios doctor` 报告 pi 侧 headroom server 就绪 |
| M4 | （条件）aios-pi offload | 2–3 天 | 冻结集过两道闸门，默认仍 opt-in |

M1/M2/M3 相互独立，可并行；M4 严格排在 M1/M2 之后（无数字不施工）。
