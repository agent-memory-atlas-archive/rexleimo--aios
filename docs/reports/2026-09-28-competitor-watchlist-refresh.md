# 竞品 watchlist 触发刷新（2026-09-28）

> 基线：`docs/reports/competitor-watchlist.json` schema v4（上次元数据 + 深挖 2026-08-14）；编排侧基线 `docs/reports/2026-09-05-competitor-orchestration-analysis.md`。
> 本仓库：`VERSION` = 5.19.2。
> 方法：GitHub REST 元数据（14 仓库 pushed_at / releases）+ 近 12 个 release 正文按各仓 `refreshTrigger` 关键词筛选。**本轮是触发筛选刷新，不做源码深挖**；archive 条目按组合策略不刷新，仅顺手记录元数据。

## 0. 结论先行

5 个活跃参照全部活跃（pushed_at 均在 3 天内，无一 archived）。触发判定：

| 参照 | trigger 是否命中 | 一句话结论 |
| --- | --- | --- |
| oh-my-openagent | **命中（架构级）** | v5.0.0 GA（09-26）脱离 OpenCode/Codex 宿主做原生引擎；git 化记忆 + Kibitzer 校验回路 + CodeMode + mass ulw 动态 DAG |
| OpenClaw | **命中（治理路径）** | v2026.8.1 起把 grounded dreaming 设为默认开启（provenance 门槛 + Dream Diary），新增 memory forget 溯源删除、Workshop 提案上限 ≤3、备份完整性校验 |
| TencentDB-Agent-Memory | 未命中核心契约 | v2.0.2-beta 加 MongoDB 后端；v1.0.x 是 OpenClaw 宿主插件兼容线（embedding 不可用降级 keyword、sqlite-vec 加载加固） |
| Graphiti | 未命中 | v0.30.x 是 Neo4j database 路由修复 + 搜索修复；temporal/provenance 契约未动 |
| letta-code | 未命中（citations 仍是 prototype） | 但 v0.33.0 出现 git 记忆后台冲突修复 worker + 工具输出凭证脱敏，方向与 OMO 同向 |

编排组（09-05 报告覆盖，仅记录 3 周增量）：**goose 仓库迁移到 `aaif-goose/goose` 新组织**（治理事件）；OpenHands v1.19→1.24 主打 agent profile 资产化（按 profile 圈定 MCP server 与 secrets、阻止静默降级）；codex/gemini-cli/langgraph/crewAI 为常规节奏，无结构信号。

另：agno（agno-agi/agno，**不在 watchlist**）9 月连发 v3.0.2→v3.0.11，知识检索两段式 rerank 管线 + Page 存储系统与 memo 支柱同类，但与 TencentDB/mem0 已覆盖问题重叠，按组合策略暂不进 watchlist（仅记录，见第三节）。

---

## 1. 逐仓触发详情

### 1.1 oh-my-openagent — v5.0.0 GA（2026-09-26），触发：架构级

v5.0.0 是一次"脱离宿主"的转型：`bun add -g omo-ai` 安装原生 `omo` 二进制（senpi 引擎，pi 的 fork），OpenCode 插件与 LazyCodex 降级为兼容线。与三支柱相关的增量：

1. **git 化记忆 + Kibitzer**：记忆是 markdown 文件的 git 仓库，persona 与 self block 每会话投影；reflection/dreaming 是会话结束后的沙箱后台 worker。新增 **Kibitzer**——跑在 `quick` 便宜模型链上的第二 agent 回路，只在主回合触碰到"未判定记忆"时唤醒，用 5 个只读工具核查记忆，把"哦对了"以单条隐藏 nudge 注入对话；**不能写记忆**；召回 308ms → 5ms。这是 Letta citation 问题（"如何证明模型读过的记忆"）的另一种生产化答案：不做不可伪造 receipt，做**独立的廉价校验回路 + 只读工具面**。
2. **CodeMode（code-as-action）**：每步可以是一个 JS/Python eval cell，prelude 带 `tool.<name>() / parallel() / pipeline() / agent()`；官方实测同模型下每回 合上下文降到 0.39x（GPT-5.5）。
3. **mass ulw（动态并行编排）**：prompt 短语把工作变成节点 DAG，每节点按 task category 路由到不同模型，走 workpool 带重试与恢复——09-05 报告 P1-4（blueprint recipe 化 + 动态 DAG）方向被竞品落地验证。
4. **checkpoint 保留期清扫**：7 天保留策略此前"存在、有测试、但没人调用"，长期项目积压 711 个 checkpoint（170MB）；清扫挂在每次 DAG runtime 启动后、不阻塞启动路径，保留 lease 存活的暂停 run，实测 170MB→38MB。**我们做 P0-2 CheckpointSaver 时要自带保留期清扫，别重蹈这个覆辙。**
5. **交付前确定性证明 + 有界修复**（ulw-research）：报告交付前跑确定性检查（断行/色板/无来源数字/无引用章节/图片/溢出…），修复有硬上限（3 次尝试 / 连续 2 次无改进 / 15 分钟），修不完就**带缺陷清单交付**；每个承诺的交付物追踪到 delivered/skipped/impossible(+原因)。这是 P0-1"验证 runtime 化"的一个完整参考实现。
6. 模型路由按显式 category 声明（deep-low 等车道），符合我们的"声明而非猜测"北极星。

**Hashline stale-write 契约本身未变**（只是 ai SDK bump 到 7.0）。09-05 报告的"反向信号"仍然成立：OMO 走的是自建引擎路线，我们做的是跨 client 控制面，**不跟进其引擎化**，只吸收门控与记账模式。

### 1.2 OpenClaw — v2026.8.1（08-31）起治理路径密集变更，触发：命中

- **Grounded dreaming 默认开启**：模型参与的后台记忆整理升级为默认，**provenance 达标**的材料才晋升长期记忆，配 Dream Diary 与显式关闭开关（#114819）。对照我们：dream lane 默认 DENY + proposal-only 晋升更保守；他们的"provenance 门槛 + 日志 + 可关"是把默认值翻转但保留治理骨架——**晋升门槛设计（什么算 provenance 达标）值得抄，默认值不跟**。
- **Memory ownership / `openclaw memory forget`**：可检视"哪些会话贡献了这条记忆"、把选定来源排除出准入、删除可识别的派生记忆且保留源 transcript（#130151）。这是我们 memo supersede/遗忘机制迄今最完整的用户面参考。
- **Automatic self-learning 默认值**：scanner 批准的新 skill / Workshop 自有 skill 自动 apply，**用户自改 skill 保持 pending**（#115576）——按作者身份分信任档。07-26 记录的反向信号（免二次确认）被部分修正：用户内容仍走 pending。
- **Workshop 治理加固**：历史回顾扫描有 SQLite cursor、pending proposals 硬上限 **≤3**（#106182）；备份恢复前先校验 retained originals，拒收不完整快照（9.2，#138082）；pending child launch 随父 authority 关闭而终止（9.2，#139020）。
- **更新回滚门**：`openclaw update` 在升级后 Doctor 失败时回滚 npm candidate、保留配置与 SecretRef（9.1）——对应我们 release-preflight 的"装后验证失败即回滚"缺口。
- **其他**：Codex 工具 "Allow Always" 审批持久化并复用（9.1）；数据库 quarantine 决策单独存储，损坏不能自我擦除（8.1）；Control UI 的 Agents/Skills/Workshop 操作按 Gateway method catalog + operator scopes 授权（8.1）。

### 1.3 TencentDB-Agent-Memory — 未命中核心契约，两条旁路信号

- v2.0.1（08-25）→ v2.0.2-beta.1/2/3（09 月）：MongoDB 可选后端、企业登录、数据分析面板——都是 Hub 侧，**继续不吸收**（08-14 决策）。
- **v1.0.x 线是 OpenClaw 宿主插件兼容轨**（v1.0.2 适配 8.2、v1.0.3 适配 9.5）：embedding 服务不可用时**召回自动降级 keyword**（对齐我们零 LLM 退化哲学，可作交叉确认）；OpenClaw 9.5 把插件依赖 staged 进隔离 `package-N` 目录导致 `sqlite-vec` native 加载失败，他们的修复是"先定位嵌套 vec0.so 直连 loadExtension、失败回退、再失败显式 degraded"。**我们未来若分发 sqlite-vec 到沙箱/staged 环境，这条加载回退链是现成参考。**
- InjectionMode / ACL / result-ref 核心契约未动，不触发深挖。

### 1.4 Graphiti — 未命中

v0.30.0/0.30.2（09-01/09-08）为 Neo4j database 路由修复、cross-encoder shortlist 修复、FactResult 补 source/target uuid + episodes（PR #1750，08-14 已快照）。**temporal/provenance 契约未变**，specialist 半年检节奏维持即可。

### 1.5 letta-code — citations 未动，相邻信号两条

v0.30.20 → v0.33.4（半个月 20+ 个版本）。memory-citations 仍无实质进展（release 里的 "receipts" 是 fork/recall launch 回执，不是记忆读取凭证）。相邻信号：

- **v0.33.0：post-turn git 记忆冲突后台修复 worker**（PR #4628）——与 OMO git 化记忆同向：git-backed memory 正在成为"可版本化 agent 记忆"的默认形态，冲突修复做成后台 worker 而非阻塞主循环。
- v0.33.0 工具输出强制脱敏 ambient 运行时凭证；v0.32.15 Workflow tool 薄封装 Agent SDK query() + 转发结构化输出 schema；v0.32.13 终止 stopped subagent 的整棵进程树。

### 1.6 编排组 3 周增量（09-05 报告之后）

- **goose：仓库迁移至 `aaif-goose/goose`**（API 301 重定向确认，2026-09-28 仍在 push）。组织迁移通常伴随治理/赞助结构变化，保持元数据观察，v1.48→1.52 无 recipe/权限结构变化。
- **OpenHands v1.19→1.24**：agent profile 资产化——profile 圈定可用 MCP server 集合与 secrets 子集、automations 选择保存的 profile、阻止静默 profile 降级。与 09-05 报告规律 7（声明式资产化）同向，对 P1-4 recipe 化是又一例证。
- codex 0.158/0.159 alpha、gemini-cli 0.62/0.63 nightly、langgraph 1.2.12、crewAI 1.15.22：常规节奏，release notes 无结构信号。

---

## 2. 对 AIOS 的迭代方向（按 09-05 报告 P0/P1 编号映射）

本轮刷新没有推翻 09-05 报告的任何结论，反而提供了四个可直接引用的实现范本：

1. **P0-1（验证 runtime 化）——新增范本：OMO ulw-research 交付证明。** 确定性检查清单 + 有界修复（次数/无改进/时限三重上限）+ "带缺陷清单交付" + 交付物逐项追踪（delivered/skipped/impossible+原因）。比单纯 hook 拦截更完整的"verification-before-completion runtime 化"参考；缺陷清单直连我们 evidence envelope 的 `partial` 状态语义（"显式降级"而非静默掩盖）。
2. **P0-2（CheckpointSaver）——新增护栏：保留期清扫。** OMO 的教训（711 个积压 checkpoint、策略存在但从未调用）说明 checkpoint 系统必须自带 sweep：挂在 runtime 启动后、不阻塞启动、保留活跃 lease。我们落 CheckpointSaver 时把 `retention` 作为接口一等字段。
3. **P0-3（记忆四件套）——新增两个机制参考：**
   - **git 化记忆 + 后台冲突修复**（OMO v5 + letta v0.33.0 双重印证）：memo 目录已是 git-friendly，加"会话结束后台整理 worker + git 冲突自动修复"是 P0-3 之 4（sleeptime 整理）的低成本实现路径。
   - **memory forget 溯源删除**（OpenClaw）：检视贡献来源 → 排除来源准入 → 删派生留源 transcript。直接可用于 memo 的 supersede/遗忘用户面。
   - **Kibitzer 模式**（OMO）给 ContextReceipt（p0 targets 既有项）提供了一个便宜变体：不做不可伪造读取凭证，先做 opt-in 的第二只读回路校验记忆质量。注意与北极星兼容性：它是模型自报告"这条记忆还有效吗"，runtime 只计次与注入 nudge，语义判断留给模型，符合自报告原则。
4. **P1-4（动态编排）——两处被竞品落地验证**：OMO mass ulw（prompt→DAG→按 category 路由→workpool 重试恢复）与 OpenHands agent profile 资产化（MCP server/secrets 圈定、阻止静默降级）。blueprint recipe 化的参数清单可直接对齐后者。
5. **新候选小项（进 backlog，不抢 P0）**：OpenClaw 更新回滚门（装后 Doctor 失败→回滚 candidate）可评估移植到 `aios setup`/自更新流；OpenClaw Workshop "pending proposals ≤3 + 历史扫描 cursor" 若启动 C-1 skill workshop 直接采用。
6. **明确不跟进**：OMO 原生引擎化（我们是控制面不是宿主）；OpenClaw grounded dreaming 默认开启（保持默认 DENY，抄 provenance 门槛设计）；TencentDB Hub/Mongo/面板（08-14 决策不变）。

## 3. agno 候选筛选（不进 watchlist，仅记录）

agno v3.0.2→v3.0.11（08-30→09-23）集中做 memo 支柱同类问题：知识检索两段式管线（先扩召回再 rerank，MMR/Recency reranker）、Page 存储系统（原子发布 + 修订历史 + grep API）、embedding 失败显式化（`EmbeddingError` + `partial` 状态）、安全默认值翻转（`run_shell`/`ingest_path` opt-in、MCP auth 默认 localhost）。按组合策略（"新候选必须回答一个未覆盖问题或替换现有参照"），其 rerank 管线与 TencentDB/mem0 已覆盖的检索问题重叠，**暂不进 watchlist**；若后续启动 ContextDB rerank 实施且需要实现细节参照，再按新候选评审。

> 更正（2026-09-28）：本节曾短暂改写为"user decision 否决 agno"，系对用户提问的误读（用户实际要求评估的是 watchlist **现有**项目哪些已无跟踪必要，见第五节）。agno 从未进入 watchlist，本节维持"筛选不收录"的原始结论。

## 4. 方法与置信度

- 数据：api.github.com 元数据（14 仓库）+ 每仓近 12 个 release 正文（本地留存 `/tmp/rel/`，临时）。
- 覆盖度：5 活跃参照 release 正文全读（中高置信）；编排组只筛了 OpenHands/goose 正文关键词（中置信）；codex alpha notes 过薄，未逐条（低置信，但 09-05 报告刚做过源码级分析，3 周 alpha 不太可能推翻）。
- 未做：源码 diff 级核对（本轮为触发筛选，深挖留给 trigger 命中后的下一轮）。

## 5. 组合瘦身评估（建议，待用户确认）

用户问"这些项目里有没有已经没必要跟的"。按组合策略逐项评估（"唯一参考问题是否仍被独占回答"）：

| 条目 | 现档位 | 建议 | 理由 |
| --- | --- | --- | --- |
| letta-code | specialist | **降 archive（或 remove）** | 唯一问题（实际读取的 citation/receipt）自 07-28 起零进展，仍是 tool_start prototype；同问题已被 OMO Kibitzer 以生产化机制回答（本轮 §1.1）。按"同一问题保留更强来源"，它失去唯一性；ContextReceipt 参照改挂 OMO |
| OpenHarness | archive | **remove** | 最后 push 2026-06-04（截至今日 116 天 dormant）；readiness 已吸收、mailbox 教训已录 trends；无剩余独立问题（与 07-09 移除 overstory 同判据） |
| TencentDB-Agent-Memory | core | **降 specialist** | InjectionMode/Loadout/ACL 证据 08-14 已采完，9 月核心契约零变化；剩余问题收窄为"ACL 纯函数/publish gate 在 memo supersede 的应用"，半年检足够 |
| oh-my-openagent | core | 保留 | 本轮 trigger 架构级命中（v5 GA），仍是 planning 支柱最强参照 |
| OpenClaw | core | 保留 | 治理问题独家且仍密集演进（grounded dreaming/memory forget/Workshop 上限） |
| Graphiti | specialist | 保留 | 双时态事实语义无人覆盖，半年检近零成本 |
| mem0 / OpenViking / hermes-agent | archive | 保留 | archive 已是零刷新维护，各自留一条教训出处；删除省不下成本只丢 provenance |

执行后活跃刷新 5 → 3（core：OMO、OpenClaw；specialist：Graphiti、TencentDB——若 TencentDB 降档则 specialist 为 2），维护面进一步收缩。**此表为建议，watchlist 未改动；用户确认后落盘。**
