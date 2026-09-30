---
title: "降低 AI 编码 Agent 的 Token 成本：Claude Code 与 Codex 预算控制"
description: "Claude Code 和 Codex 的 token 账单来自注入的上下文、重复的历史和过大的工具输出。用本地压缩边界（RTK、Caveman、Headroom MCP、ContextDB）在不改变工作方式的前提下砍掉 token 用量。"
date: 2026-08-10
schema_type: techarticle
---

# 降低 AI 编码 Agent 的 Token 成本：Claude Code 与 Codex 预算控制

> **快速答案：** 编码 Agent 的 token 账单来自三个无声的泄漏：从未被使用的注入上下文、不断重复的对话历史、淹没模型窗口的工具输出。降本靠**压缩边界**：用 pull-based 上下文代替注入、用本地输出压缩（RTK / Caveman）、用显式检索代替全量历史（Headroom MCP）、用跨会话项目记忆避免重复读取。AIOS 把四者全部本地化——数据不出机器。

## Token 到底花在哪了

一次典型编码会话把 token 花在你根本没要求的东西上：

1. **注入的上下文**——每条提示都背着项目前言，不管当前任务需不需要。
2. **重复的历史**——因为没人记住上次的答案，Agent 反复重读同一批文件。
3. **工具输出**——`git diff`、日志、浏览器快照整段落进窗口，挤掉模型真正需要做的决策。

砍掉这三样，账单就降下来了，而工作质量不变。

## 四个本地压缩边界

| 边界 | 工具 | 作用 |
| --- | --- | --- |
| **上下文 pull-based** | [ContextDB](https://cli.rexai.top/zh/contextdb/) | Agent 按需搜索/召回相关记忆，而不是每条提示都背整个项目。 |
| **输出压缩** | RTK / Caveman | 进程内、本地过滤压缩命令输出——工具结果缩小 60–90%。 |
| **显式检索** | Headroom MCP | 后续步骤需要时用压缩/检索工具取内容——不透明拦截每个请求。 |
| **模型分层** | [模型路由](https://cli.rexai.top/zh/model-router/) | 有边界、重复的活（抽取、分类）跑便宜模型；判断力重的节点保留强模型。 |

## 今天就能做的事

```bash
# 本地安装 AIOS
curl -fsSL https://github.com/rexleimo/aios/releases/latest/download/aios-install.sh | bash
source ~/.zshrc
aios init --all

# 验证压缩边界与 token 配置
aios doctor --native --verbose
```

然后测量：同样的任务，开/关 AIOS 各跑一次，对比服务商报告的 token 用量。架构见 [Token 智能文档](https://cli.rexai.top/zh/token-compression/)；实战数字见[成本危机文章](https://cli.rexai.top/zh/blog/2026-08-ai-coding-cost-crisis/)。

## 自家 harness 上的实测

我们用冻结的 8 任务 token bench 对自己的托管 Pi 传输跑 A/B（模型钉死、机制关 vs 开）——三对重复，不是一次：

| 配对 | 关·tokens | 开·tokens | Δ tokens | Δ 成本 |
| --- | --- | --- | --- | --- |
| 1 | 304,346（$0.1035） | 254,348（$0.0602） | −16% | −42% |
| 2 | 338,064（$0.0982） | 268,559（$0.0585） | −21% | −40% |
| 3 | 237,685（$0.0551） | 389,675（$0.0837） | +64% | +52% |
| **均值** | 293,365 | 304,194 | **−4%** | **−21%** |

观察卸载机制在模型快速收敛时能把 126 KB 观察任务的 token 砍半，但它的取回轮次行为是高方差的——按两道闸门规则**以 opt-in 发布（默认关闭）**。自 2026 年 6 月起，边界卸载层已记录 2,552 个事件：约 5.43M token 未进入上下文，零失控事件。完整表格、诊断与免责口径见 [token bench A/B 文章](https://cli.rexai.top/zh/blog/2026-09-token-bench-first-ab-numbers/)。

## FAQ

**压缩会伤害回答质量吗？**
不会——它去掉的是噪音，不是信号。pull-based 上下文和输出压缩把决策留在窗口里，丢掉样板。

**RTK / Caveman 是云服务吗？**
不是。两者都在你机器上的进程内运行。RTK 本地过滤命令输出；Caveman 压缩 Agent 输出风格。数据不出机器。

**还能继续用裸 codex / claude CLI 吗？**
能。AIOS 躺在客户端下面。命令不变，压缩边界在周围工作。

## 下一步

读 [Token 智能与压缩](https://cli.rexai.top/zh/token-compression/) 了解完整架构，或从[快速开始](https://cli.rexai.top/zh/getting-started/)入手。
