# Token Intelligence v3 — 取回不稳定的真实根因与修复

日期：2026-10-12。**替代** `2026-10-12-token-intelligence-v3-capability-symmetry.md`（已删除，错误归因见 §0）。
前置：`2026-09-30-token-intelligence-v2-architecture.md`（v2 已落地并跑出首批 A/B 数字）。
证据等级：**V**=源码已验证（带行号）／**I**=推断（需验证）／**D**=已发布数据。

---

## 0. 被删除的那份错在哪（留痕，防止重犯）

原文主张：「refs 层 94.8% 与 Pi 层 −64% 是**同一个**自动 offload 机制，差异只在取回需求频率；修法是把取回决策权从模型搬回 runtime。」

三处硬伤：

1. **归因错误（最关键）**：两个 offload 不是同一机制。见 §1.2 的对照表 —— 不同文件、不同阈值、不同触发面、不同客户端、不同钩子。共享的只有「自动挡」这个理念，代码路径不共享。因此「同一机制一边 94.8% 一边 −64%」的论证不成立。
2. **前提已过期**：P1.4 说要「评估 `memory_recall` 是否该默认注入（当前靠模型自觉）」。实际已默认注入，`planning/user-prompt-submit.mjs:34-45` 在 UserPromptSubmit 里 `collectTurnRecall` 并写 `additionalContext`；claude/codex/grok 均已注册（`.claude/settings.local.json` aiosNative、`.codex/hooks.json`、`.grok/hooks/aios-workflow.json`）。
3. **验收标准技术上报不出**：P0.1 要求 headroom 层 0 记录时打 `no-records`。但 `metrics/ledger.mjs:45` 是 `LEDGER_LAYERS.map(...).filter(Boolean)` —— 枚举成员字面写死，`metrics/report.mjs:25` 的 `(no records)` 只在**全部**层为空时触发，没有任何 per-layer 的 `no-records` 分支。把 `headroom` 写进枚举即自动产出「0 events」行，既非静默省略也非 `no-records`，恒不报警。

**本轮教训固化**（v3 原文 §4 已提过一次，仍然复发）：引用本仓库能力前必须先给出当前源码写入点/调用点行号；给不出行号就标未验证，不得当已完成引用。这次要落成**可执行门禁**，不是再写一句文档（见 §3 段 A）。

---

## 1. 源码事实（全部带行号，V）

### 1.1 四条压缩/取回通路，各有各的文件

| 通路 | 挡什么 | 谁决策 | 证据 |
|---|---|---|---|
| **interception refs** | 单次工具结果文本（shell **和 MCP**）≥2048 字节 | runtime 自动 | `core/engine.mjs:20-42 interceptToolResult()`；`core/types.mjs:3-8 DEFAULT_THRESHOLDS.minRawBytes=2048`；调用方 `shell/shell-wrapper.mjs:45`、`interception/mcp/json-rpc-proxy.mjs:43`、`turn/turn-gateway.mjs:42` |
| **PostToolUse offload**（claude 专属） | Bash/Read/Edit/Write 的整份工具输出 ≥2048 字节 | runtime 自动 | `offload/tool-offload.mjs:7 DEFAULT_TOOLS`、`:33-38 shouldOffload()`；装进 `aios-init/hooks.mjs:149-151`（仅 `agent === 'claude'`，见 `:134`） |
| **Pi 观察卸载**（ObservationPack-lite） | **每条消息里任何文本内容项** ≥20000 字符（阈值可调） | runtime 自动（但「取回」由模型自愿） | `packages/aios-pi/lib/offload.mjs:18-24 resolveOffloadConfig`、`:59-92 offloadMessages()`（在 pi 的 `context` 事件上扫所有 message.content）；取回工具 `packages/aios-pi/lib/tools.mjs:103 aios_offload_retrieve` |
| **headroom MCP** | 显式压缩 | **模型自愿** | 挂载 `headroom-mcp/commands.mjs:15-38`（带 `HEADROOM_MCP_READ=off`）；生命周期只有 install/remove（`headroom-mcp/lifecycle.mjs:23,38,111,129`），**全仓无调用点** |

**这是 v3 原文最重要的错误**：把 1.1 表格第 1、3 行当成同一机制。

### 1.2 取回可行性：两类**都**可脚本化取回（推翻了「MCP 结果取不回」的猜想）

我一度推断 MCP 结果的 `.raw` 不是可 grep 文本、取回通路不可用。**实测反证**：

- `.aios/interception/refs/default/mcp-tools_call-*.meta.json` 显示 `source: 'mcp'`、`kind: 'mcp.tools_call'`、`raw_bytes` 3317…70009 —— MCP 工具结果**确实**走同一个 engine 落成完整文本 ref。
- `interception/refs/recall.mjs:21 grepInterceptionRefs()` 直接 `readFile` 每个 `.raw` 并做 regex 匹配 —— 能按内容搜。
- `interception/refs/raw-ref-store.mjs:47 readRawRef()` 同时读 `.raw` + `.meta.json`。
- 每个 packet 自带召回命令：`interception/packets/compact-packet.mjs:47-50`（`aios refs read <id>` / `aios refs grep "pattern"`）。

→ 取回通路对 shell **和** MCP 结果都可用。不对称不是「取不回」，而是「模型要不要去取」。

### 1.3 差异的真实来源（这才是靶心）

两条自动通路的**压缩产物形状不同**：

| | interception refs（shell + MCP） | Pi 观察卸载 |
|---|---|---|
| 留在上下文的东西 | **summary + errorLines + keyLines + refs + recall 命令** —— 结构化、有信号 | **handle + 2000 字符头 + 800 字符尾** —— 原始截断，无信号提取 |
| 证据 | `packets/compact-packet.mjs:32-34`（summary/key_lines/errors 三字段）、`:47-50`（recall 命令）；摘要策略 `shell/output-shrinker.mjs:3 shrinkToolOutput()`、`:31 selectErrorLines()` | `packages/aios-pi/lib/offload.mjs:39-42 excerptOf()`、`:48-56 buildHandleText()` |
| 触发粒度 | 单个工具结果 | 整条消息的任何文本项 |

**推论（I，需 §3 段 B 验证）**：refs 层「94.8% 挡在外、零代价」不是因为它的取回需求天生就低，而是因为它的**压缩产物已经回答了大部分问题**（错误行、路径、关键行都在上下文里），所以模型很少需要回读。Pi 层只留头尾，模型想拿中段就必须回读 —— 而回读次数由模型自由决定，于是出现 `bench-007` 的 10 轮。

→ **修复方向不是「把取回决策权搬回 runtime」，而是让自动压缩的产物本身保留信号，并在超预算时降级为有界摘要。** 这与博客自己的结论一致：「a retrieve budget per task is the obvious candidate」——把预算做在**产物侧**比做在「谁来决定取回」侧更直接。

### 1.4 headroom 层拿不到数据的根因是**设计决定**，不是遥测缺口

- `headroom-mcp/commands.mjs:15-38`：挂载时即带 `HEADROOM_MCP_READ=off`，透明读写模式被禁。
- `headroom-mcp/lifecycle.mjs` 只有 install/remove（`:23,38,111,129`），无任何运行期调用点。
- `packages/aios-pi/lib/tools.mjs:103` 只注册 `aios_offload_retrieve`，不注册 headroom 工具。
- v2 设计边界 `2026-09-30-token-intelligence-v2-architecture.md:14`：不做实时透明拦截。

→ 唯一可能产生 `headroom_compress` 调用的是**模型主动调**，而 `READ=off` 恰好抑制了这条路径。所以「采纳率」这个指标在现行设计下**度量对象不存在**。v3 原文 P0.1/P0.2 把一个设计决定当成接线遗漏。

### 1.5 refs 层现有数字（D）

`2026-06` 至今 2552 事件、5.73M raw token 进、5.43M 挡在上下文外（94.8%）、零失控、零策略违规。主力 MCP 工具结果（1768）与工具清单（578）。这些数字本身可信；**不可信的是拿它当 Pi 层的对照组**。

---

## 2. 非目标

- **不加新压缩层**。v2 已把 fusion/reducer 标为「暂缓，待账本数据显示对应浪费占大头」，先让现有层的产物质量可测。
- **不动 `rtk_ab`**。v2 已裁定 RTK 是外部工具、只做 A/B 计量。
- **不在 v3 处理 team-workflow 支柱空缺**。属竞品视野问题，见 `docs/reports/2026-10-12-competitor-refresh.md`。
- **不删 `refs read` / 不删 `aios_offload_retrieve`**。显式取回保留为旁路。

---

## 3. 计划

### 段 A · 先修「不可信引用」这个根因（0.5 天，无依赖）🔴 最高优先

v3 原文 §4 已把这条写成教训，本轮仍复发（且我本人在核对时也先推错了一次 —— 见 §1.2）。**再次写进文档无用，必须变成机器门禁。**

| # | 动作 | 验收 |
|---|---|---|
| A1 | 新增引用校验器 `scripts/check-doc-citations.mjs`：扫 `docs/plans/*.md`、`docs/reports/*.md`，提取 `` `<path>:<line>` `` 形式引用，核对 ① 文件存在（裸文件名按后缀唯一性解析到 `git ls-files` 内的真实路径）② **后缀歧义即报错**（同一 basename 命中多文件时必须写全路径，本轮实测 `offload.mjs` / `ledger.mjs` / `lifecycle.mjs` / `report.mjs` 各有 2–3 个同名文件）③ 行号 ≤ 文件行数 ④ 行号 > 0。**不校验语义相符**（那仍需人），只杜绝机械错误 | 新增 `scripts/tests/doc-citations.test.mjs` 覆盖四种失败态；跑一遍现存文档，输出失效清单 |
| A2 | 已知失效清单（本轮人工核对结果，作为 A1 的回归基线）：v3 原文里 `tool-offload.mjs:33-38` 实为 `:33-38 shouldOffload` 但白名单在 `:7`；`dispatch/offload.mjs:9-85 runRefsCommand` 实为 `:9`（原文把文件行数当函数范围）；`aios-init/hooks.mjs:134,149-151` 实为 `:134`（条件）与 `:149-151`（plan），可接受；原文 `metrics/ledger.mjs:45` 记的是枚举映射，headroom 分支在 `:52`。**本计划的 26 条引用已用同算法跑过：0 失效、0 歧义** —— 可直接作为 A1 的第一个绿样本 | 失效清单为空 |
| A3 | 把 A1 接进 release 前置门（`scripts/check-release-submodule.mjs` 同层，或 `verification-before-completion`） | 引用失效时红灯；`VERSION` bump 前必跑 |
| A4 | `competitor-watchlist.json` 的 `portfolioPolicy.decisionRules` 加两条：①「引用本仓库能力前必须给出当前源码写入点行号；给不出即标未验证，不得当已完成引用」②「新候选进 `pendingDeepDive` 前必须先给出『本仓库哪个模块最接近』自查结论」——后者是 `2026-10-12-competitor-refresh.md` §5 自己提的，只是没落进 policy | policy 文本更新；两条均可被 A1/A3 机械执行 |

### 段 B · 把取回不稳定修在**产物侧**（2–3 天，核心跃迁）

靶心是 §1.3 的产物形状差异，不是「谁决定取回」。

| # | 动作 | 验收 |
|---|---|---|
| B1 | **先做对照实验，再决定改动**：同任务集（`scripts/fixtures/token-bench/tasks/` 8 任务）、同模型，分别测「interception refs 产物（summary+errors+keyLines）」与「Pi 产物（头尾截断）」的取回轮次分布 | 出表。**若 refs 侧取回轮次本就很低**（预期 <1 轮/任务），§1.3 推论成立，B2 直接施工；若两侧相近，则推论不成立，回到「取回预算」路线并记录反证 |
| B2 | 给 Pi 观察卸载的产物加**信号提取**：参照 `shell/output-shrinker.mjs:3 shrinkToolOutput()` 的策略（错误行优先 `:31`、关键行 `:43`、首尾采样），让 `excerptOf()`（`packages/aios-pi/lib/offload.mjs:39`）从「头 2000 + 尾 800」升级为「errorLines + keyLines + 头尾」。纯函数，可 `node --test` | `packages/aios-pi/lib/offload.mjs` 新函数 + 测试；产物字节数与 refs 层同量级 |
| B3 | 给取回设**硬上限**（博客已自认的修复方向）：每任务 retrieve 轮次超限后，handle 降级为「archive 过大」指针，不再回灌 | 上限触发在账本可见；`bench-007` 类任务不再出现 10 轮 |
| B4 | B2+B3 用 §段 C 的 bench 过两道闸门（能力分容差内 + saved_tokens>0 且成本不升） | pass/fail + 证据；**允许并预期「不过」** |
| B5 | `memory_recall` 一项**关闭**：已默认注入（`planning/user-prompt-submit.mjs:34-45`），原 P1.4 系重复施工。改为记录既定事实 + 明确 gemini/hermes 的 hook 面是否存在真实缺口（`detectHookClient` 已认识 `WORKBUDDY_HOME`，见 `user-prompt-submit.mjs:10`；`aios-init` 里未发现 UserPromptSubmit 注册，需查 install 路径） | 出结论：缺口真实 or 已覆盖，附行号 |

### 段 C · headroom 层定性 + bench 过闸（1 天）

| # | 动作 | 验收 |
|---|---|---|
| C1 | **headroom 层二选一（决策点）**：①按「主设计决定不做透明拦截」**关闭该层**，从 `LEDGER_LAYERS` 移除并留注释说明原因；②若要保留度量，需先建一条真实会产生调用的路径（当前 `READ=off` 抑制了它）。**倾向 ①**：度量对象不存在时，占位枚举只会制造假仪表 | 明确处置 + 代码/文档同步 |
| C2 | 若选 ②，`report.mjs` 需新增 **per-layer** `no-records` 分支（当前 `:25` 仅在全体为空时触发，`:35 layerNote()` 无 headroom 条目） | 单层为空时该层显式打 `no-records`，不得打 0% 采纳率 |
| C3 | 死层守卫测试：`LEDGER_LAYERS` 成员若无生产写入点则红 | 新增测试；`rtk_ab` 按 v2 声明豁免 |
| C4 | v2 风险表「Headroom opt-in 采纳率可观测」从「已设计」更正为「未施工」 | memo 留痕，避免下轮再当已完成引用 |
| C5 | **基线复现**：重跑 3 组 A/B，确认能复算已发布数字（`scripts/token-bench/run.mjs` + `compare.mjs`，任务集与模型已存在） | 三组 Δ 与已发布值同量级；不能复算则先修 bench |
| C5b | **均值口径落成可执行断言**：把 §4.3 裁定的算法写进 `compare.mjs` 的输出（显式打印均值 + 所用算法 + 方差），使 `−4%` 这类算不出的值无法再被引用 | `compare.mjs` 输出含 `mean_convention` 字段；新增测试断言两种算法的值 |
| C5c | 按 §4.3 修已发布内容：`−4%` 改为裁定值 + 标注算法；docs-site 4 文件的 `savings` 标签改为 delta（或数字取反，二选一） | 三处均值一致；docs-site 标签与数字语义相符 |
| C6 | 对比臂换成「B2+B3 生效」，测 token / 成本 / **retrieve 轮次方差** / 能力分 四项 | 出表；**方差必须显式披露，不许只报均值** |
| C7 | 过两道闸门才允许 Pi 观察卸载默认开启；不过则继续 opt-in | pass/fail + 证据 |

---

## 4. 待裁决：已发布 A/B 数字的口径

> **状态：待你拍板，未裁决。** 本节给出复算事实与推荐方案；裁定后我才动已发布内容。竞品部分的待裁决项另见 `docs/reports/2026-10-12-competitor-refresh.md` 的「待裁决的处置」。

### 4.1 原始数据与两种算法（复算结果，V）

三对 A/B 的原始值（博客表格）：`{off,on}` tokens = `{304346,254348}`、`{338064,268559}`、`{237685,389675}`；成本 = `{0.1035,0.0602}`、`{0.0982,0.0585}`、`{0.0551,0.0837}`。

| 算法 | token | 成本 |
|---|---|---|
| **逐对 delta**（`(on−off)/off`，再取三对算术平均） | −16.4／−20.6／**+63.9** → **+9.0** | −41.8／−40.4／+51.9 → **−10.1** |
| **总量比**（`(Σon−Σoff)/Σoff`） | **+3.7** | **−21.2** |

注意：`+9.0` / `−10.1`（逐对 delta 的均值）**匹配不了已发布的 −4% / −21%**。发布值 `−21%` 成本只能由**总量比**得到（−21.2）；`−4%` token 则两个算法都得不到（+9.0 或 +3.7）。

### 4.2 三处已发布内容用了**三种不同**的口径

| 位置 | 逐对数字 | 均值 | 均值算法 | 标签 |
|---|---|---|---|---|
| 博客**正文**表格 | −16／−21／+64 | **−4%** | ❓ 复算不出（逐对 delta 均值=+9.0，总量比=+3.7） | 列头写 `Δ tokens`（delta） |
| 博客**description** | +16／+21／−64 | **−4%** | ❓ 同上 | 写 `savings`（savings=+16／+21／−64 与 delta 数字同源、符号相反，自洽） |
| `docs-site/token-compression.md:40`（+ zh/ja/ko 三份副本） | −16／−21／+64 | **−4%** | ❓ 同上 | 写 `token savings of −16%, −21%, and +64%` |

**结论（与我第一版判断相反，此处更正）**：三处的*逐对数字*其实是同一组 delta；真正的缺陷是 **`−4%` 这个均值两个算法都算不出来**，并且 docs-site 把 delta 数字贴上了 `savings` 标签（符号语义反了）。

- 博客正文：数字与 `Δ tokens` 列头一致 → **自洽**，只有均值存疑。
- 博客 description：`savings +21%→−64%` 是 delta 的镜像 → **自洽**（措辞与正文列头不同但语义都对）。
- docs-site：`savings −16%/−21%/+64%` → **符号语义错误**（把 delta 当 savings 且未取反）。
- 三处共同的 `−4%`：需先确定口径才能定值。取「三对算术平均」得 **+9.0%（delta）／−9.0%（savings）**；取「总量比」得 **+3.7%／−3.7%**。**没有一种算法给出 −4%。**

### 4.3 推荐方案（待确认）

1. **采用「逐对 delta 的算术平均」**，不用总量比。理由：实验设计是「三对重复 + 显式披露方差」，总量比会把重复对当一次大样本，**掩盖 pair 3 的翻转**——而翻转是本轮最有价值的数据点。→ 均值应为 **+9.0%（delta）／−9.0%（savings）**。
2. **修 `−4%`**：三处均改为口径裁定后的值，并标注「算术平均，非总量比」。
3. **修 docs-site 符号标签**（4 文件：`docs-site/{,zh,ja,ko}/token-compression.md`）：要么把数字取反成真正的 savings（+16／+21／−64），要么把标签改成 delta。**建议改标签**（改 1 处标签比改 3 个数字+均值风险小）。
4. **博客正文与 description 不动**（除均值数字外）；`site/` 下是构建产物，随 docs-site 重新生成。
5. 成本同理：正文 `−42／−40／+52`，均值 `−21%` 其实**能**由总量比得出（−21.2），但逐对平均是 `−10.1%`。选同一口径后一并处理。

> **你没有回答这一项时**：段 C 的 C5c（修改已发布内容）不执行；C5b（把口径写进 `compare.mjs` 输出）仍可做，因为它是「让数字可复算」而非「替已发布数字选值」。

> 本节为对 v3 原文 §5 的**再更正**：原文称「博客翻成了 savings 但均值没跟着翻」——方向对（均值确有问题），但把 docs-site 的 delta 数字误读成了与博客相反的 savings 序列，且未发现 `−4%` 两个算法都算不出。用 §段 A 的引用校验器无法发现这类**数值**错误，只能靠复算；建议 A1 之后补一条「已发布数字必须附可复算命令」的规范。

---

## 5. 完成判据

- 段 A：`check-doc-citations.mjs` 绿；policy 两条已落；VERSION bump 前置门含 A1。
- 段 B：B1 出表并有明确结论（成立/反证）；B2+B3 有测试；B5 结论已记录。
- 段 C：headroom 层处置明确；C5 能复算；C6 四项出表含方差；C7 pass/fail。
- §4 叙述用词已统一。
- 全程：引用行号可被 A1 机械验证。
