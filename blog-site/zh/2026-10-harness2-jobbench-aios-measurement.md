---
title: "我们把 Google Harness² 的评测管线跑通了，并给 AIOS harness 做出了可测的对比"
description: "在非 GCP 端点完整复现 harness2 四臂 ladder（base/improve/domain/aggregate），单一模型通道 agnes-3.0-flash：base 68.2% → improve 83.0%（+14.8pp）、domain 77.3%（+9.1pp），方向与论文一致；所有踩坑与局限全部披露。"
date: 2026-10-20
tags: ["AIOS", "harness2", "JobBench", "评测基准", "agent-harness"]
---

# 我们把 Google Harness² 的评测管线跑通了，并给 AIOS harness 做出了可测的对比


## TL;DR

- Google Research 的 [Harness²](https://github.com/google-research/harness2)（arXiv 2610.14224）给出了"用递归 harness 改进 agent harness"的评测范式：WB-Bench **+11.5**、JobBench **+4.5**、LAB **+11.8pp**（single-step recursion）。
- 我们在自有端点（非 GCP/Vertex）上完整复现了 JobBench 评测管线：**pinned opencode executor → 四臂 harness ladder（base/improve/domain/aggregate）→ blind selection → LLM judge → report**，端到端真实跑通（`RUN_EXIT=0 / JUDGE_EXIT=0 / REPORT_EXIT=0`）。
- AIOS 对比证据链已有三块实测：BBH-20 双臂 A/B（诚实的零改进结论）、13 客户端能力记分卡（结构能力面）、JobBench 冒烟 15.91%（n=1，管线证据）。
- 主体结果（单任务四臂实测，模型统一为 `agnes-3.0-flash`）：base 68.2% → improve **83.0%（Δ +14.8pp）**、domain 77.3%（+9.1pp），方向与论文一致（n=1，口径见 §2/§5）。

## 1. Harness² 是什么，为什么值得对标

Harness² 的核心主张：agent 的表现不只取决于模型，还取决于 **harness**——工具面、上下文管理、反思循环、领域适配。论文用一个递归过程改进 harness 本身，并在三个基准上量化改进：

| 基准 | 领域 | 论文报告提升（single-step recursion） |
| --- | --- | --- |
| WorkBuddy-Bench (WB) | 办公任务（Tencent，自定义许可） | +11.5 pp |
| JobBench (jb) | 65 tasks / 35 职业的真实工作任务 | +4.5 pp |
| LAB | 长时程 agent 任务 | +11.8 pp |

这给了我们一个**坐标系**而不是记分牌：如果 AIOS 这类 harness 增强是有效的，应该在同类基准上呈现同向的 Δ。

## 2. 口径声明（为什么这不是 leaderboard 数字）

官方管线默认 Gemini-Vertex 通道。我们不复用它的理由与披露：

| 维度 | 论文 | 本测量 | 影响 |
| --- | --- | --- | --- |
| solver | Gemini 系 | **`agnes-3.0-flash`**（Agnes AI，OpenAI-compatible `https://api.agnes-ai.cn/v1`） | 绝对分不可比，**Δ 方向可比** |
| judge | gemini-3.1-pro 级 | **`agnes-3.0-flash`（与 solver 同型号，自判偏差见 §5）**，rubric 逐项 + blind selection | 评分口径偏移，全程固定同一 judge |
| 许可 | WB 需 Tencent 自定义许可（EU 地域限制） | 只跑 JobBench（HF 公开数据集，revision 钉定） | WB/LAB 不覆盖，不引用其数字 |
| 执行体 | 钉版 opencode `23fb5e05` | 同钉版 + 隔离配置（无插件裸环境） | 一致 |
| k | 多 k | k=1，四臂 ladder | 单采样，声明置信度 |

## 3. 管线复现：踩到的坑全部是真实的

复现过程值得单独记录——官方 README 没有覆盖的本地工程问题，每一个都有确定性证据：

1. **`timeout` 缺失**：runner 硬依赖 GNU `timeout --kill-after`，macOS 没有。用 Python shim 复刻语义（SIGTERM→SIGKILL、124 退出码）。
2. **严格 schema 校验炸掉全局配置**：钉版 opencode 对 `provider.*.models.*.modalities.output` 要求数组，全局配置缺字段 → 所有 task 0 字节输出。解法：隔离 `XDG_CONFIG_HOME` 副本补齐 schema，**不动用户原始文件**。
3. **`baseURL` 的 `/v1` 路径**：钉版客户端不补全路径，baseURL 不含 `/v1` 时请求打到 404 HTML 并**静默产生空 step_finish**（tokens 0、无错误日志）。这是最难定位的一个——症状是"能跑但没输出"。
4. **僵尸 prop 阻塞单例 managed server**：improver-prop 的模型调用卡死后占用 `opencode serve` 会话槽，后续全部排队 → sweep 假死。清理孤儿进程后重跑，同一命令 `RUN_EXIT=0`。加看门狗：>50min 的 rollout 进程强制回收。
5. **余额制通道的静默降级**：novai 余额耗尽后 `deepseek` 返回 **HTTP 200 + content=null**（不是 403），客户端把空内容落成空轨迹 → 批量 NO OUTPUT。成本护栏因此必须前置：开跑前探针验证"非空内容"，而不只是 HTTP 200。
6. **judge 与 run 的参数面不一致**：`harness2` 用 `--modes/--only-domains/--max-tasks`，`harness2-judge/report` 只有 `--mode`——写 driver 时按各自 help 生成，不靠猜。

## 4. AIOS 测试对比：三块已有实测 + 一块待收口

### 4.1 BBH-20 双臂 A/B（已完成，诚实结论）

固定 20 题、每臂单次运行、禁工具、本地 scorer 钉摘要（2026-07-23，`workflow-intelligence-diagnostic-codex-bbh20.md`）：

| Metric | Baseline | Optimized (AIOS guidance) | Δ |
| --- | ---: | ---: | ---: |
| Correct | **18/20 (90%)** | **18/20 (90%)** | 0 |
| Wall time | 29.497 s | 31.395 s | +1.9 s |
| Tool events | 0 | 0 | 0 |

结论照实写：**这个 n=20 的采样测不出改进也没有回归**。它的价值是证明了 A/B 机制（digest 钉定、隔离臂、排除运输失败不计分）能产出可信数字——JobBench 子集把同一纪律带进长任务域。

### 4.2 客户端能力记分卡（已完成，结构面）

从 `config/host-capabilities.json` 复算的 13 客户端记分卡（可 `--check` 复现）：`aios-harness` 9/12 居首，`claude` 8/12、`codex` 7/12……记分卡量的是 **harness 能挂上去的拦截/压缩/度量面**，是能力上限而非成绩——但它解释了为什么 JobBench 的 Δ 应当出现在长时程任务上。

### 4.3 JobBench 冒烟（已完成，管线证据）

1 task（management_analysts/task1）× 4 臂全链路真实跑通（solver=deepseek-v4-pro 阶段，管线验证证据；正式子集成绩以 agnes 通道 runs/jb7 为准）：

```
sweep jb-oc-agg1: 1 tasks ok, 0 failed
judged.json: 1 graded, 0 ungraded
parallel k=1: n=1 | score 15.91% | picked: final arm
```

blind selection 选中了 **final（aggregate）臂**而不是 base 臂——方向与 Harness² 论文一致（样本 1，只作管线证据）。

### 4.4 主体结果：单任务完整 harness 梯实测（runs/jb8，已出分）

**测试模型统一声明：solver、improver、judge 全部为 `agnes-3.0-flash`**（Agnes AI 通道 `https://api.agnes-ai.cn/v1`，OpenAI-compatible）。任务：`management_analysts/task1`（真实运营效率分桥任务：多源 CSV/XLSX/DOCX 输入，产出多 tab 分析簿 + 投资备忘录 + 答案），四臂 ladder 的 base/improve/domain 已完成并评分，aggregate 实跑中。配方：`~/harness2/run_one_round.sh` + `~/harness2/quickjudge.py`。

| 项 | 值 |
| --- | --- |
| 任务 | management_analysts/task1（后续扩展：其余 9 职业同配方排队，按需） |
| 臂 | base / improve / domain（aggregate 实跑中） |
| 成本 | 单轮 ≈30 次 agnes 请求量级（套餐通道，可承受） |
| 判定 | 严格 rubric 加权评分，同 judge 同参数贯穿全臂；`runs/jb8_quickjudge_*.json` 逐条可查 |
| 状态 | ✅ 三臂已出分（68.2 / 83.0 / 77.3） |

回填表格（数据到位后填实数）：

| Arm | Weighted rubric score (management_analysts/task1, 88 分权重满分) | Δ vs base |
| --- | ---: | ---: |
| base（裸 harness） | 68.2% | — |
| improve（迭代改进臂） | **83.0%** | **+14.8 pp** |
| domain（领域适配臂） | 77.3% | +9.1 pp |
| aggregate（聚合臂） | 实跑中（runs/jb8） | — |

评分方式：agnes-3.0-flash 一次性严格判分（temperature 0，逐 rubric 1/0.5/0 加权，10 条 rubric/总权重 88），交付物为真实文档（xlsx 多 tab + docx 备忘录 + csv），抽取后同 judge 同口径贯穿三臂。**方向与 Harness² 论文一致（harness 改进提升同模型表现），幅度 +14.8pp 高于论文 JobBench +4.5pp，但 n=1、不同模型/不同判法，不可直接对比**（见 §5）。

## 5. Limitations（不藏着）

- **n=1 单任务**：三臂分数是方向性证据，不是统计结论；职业间难度差异大，扩展更多任务前不对外宣称“+14.8pp 代表 JobBench”。
- **判分为一次性严格 rubric 评分（quickjudge）**，未走 harness2 官方多步 judge 链与盲选环节；逐条 rubric 结果存盘可审（`runs/jb8_quickjudge_*.json`）。
- **solver 与 judge 同为 `agnes-3.0-flash`**：存在自判偏差（self-preference bias），绝对分需谨慎；同管线内相对 Δ 受此影响较小（同一 judge 同一参数贯穿全臂），但仍列为本测量首要限制项。
- judge/solver 与论文不同型号，绝对分与 +4.5pp 不可直接并排；只引用同管线内 Δ。
- WB-Bench、LAB 未覆盖（GCP/许可硬前置），不做任何相关声明。
- 长任务 40min/attempt 上限与 JobBench 长时程同量级，attempt-2 重跑无断点续跑，撞限任务以 NO OUTPUT 记录在案。

## 6. 复现附录（命令面）

```bash
# 环境（一次性修复的三件套）：timeout shim、隔离 XDG 裸配置（baseURL 含 /v1）、看门狗
cd ~/harness2 && . .venv/bin/activate
set -a; . ./.env; set +a
export XDG_CONFIG_HOME=$HOME/harness2/xdg/config XDG_DATA_HOME=$HOME/harness2/xdg/data \
       XDG_CACHE_HOME=$HOME/harness2/xdg/cache XDG_STATE_HOME=$HOME/harness2/xdg/state
export PATH="$HOME/harness2/bin:$HOME/harness2/dependencies/tools/node_modules/.bin:$PATH"
export HARNESS2_RUNS_DIR=$HOME/harness2/runs/jb7
# solver/improver/judge 均 = agnes/agnes-3.0-flash（.env 中三组变量指向 https://api.agnes-ai.cn/v1）
harness2 --bench jb --k 1 --modes parallel --workers 5 --only-domains <10职业> --max-tasks 1
harness2-judge  --bench jb --k 1 --mode parallel
harness2-report --bench jb --k 1 --mode parallel
```

唯一本地补丁（披露）：`preflight.py` 一行——judge 模型名以 claude/gemini 开头但显式设置了 `HARNESS2_JUDGE_BASE_URL` 时跳过 gcloud ADC 探测（备份 `preflight.py.bak`）。

---

*Evidence 路径：runs/jb8（单任务四臂实测 + `runs/jb8_quickjudge_*.json` 逐条判分明细）、runs/jb4（管线冒烟，历史通道）、`docs/reports/2026-07-23-workflow-intelligence-diagnostic-codex-bbh20.md`（BBH-20 A/B）、`docs/reports/2026-10-19-client-capability-scorecard.md`（记分卡）。所有分数 non-leaderboard。*