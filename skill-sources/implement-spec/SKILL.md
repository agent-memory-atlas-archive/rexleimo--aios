---
name: implement-spec
description: "/implement-spec <spec> — 把一份已带验收标准与工作项图的 spec（docs/plans/ 或 /spec 产出）整份实现完整：任务图取前沿并发执行、集成分支收口、/review 审查收尾。TRIGGER: /implement-spec、implement spec、实现整份 spec、spec 并行实现、并行落地"
installCatalogName: implement-spec
clients: [codex, claude, gemini, opencode, hermes, workbuddy, pi, zcode, qoder]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [aios, workflow, delivery, parallel, worktree]
repoTargets: [codex, claude, gemini, opencode, hermes, workbuddy, pi, zcode, qoder]
---

# Implement-Spec（整份 spec → 并行实现 → 收口）

交付链的执行入口：输入一份 spec（含验收标准与工作项），把它**整份**实现完。不重造调度器——把既有入口按序接起来：`/plan`（依赖分组）→ `aios work`（并发派发，需批准）→ `/review`（审查收尾）。本入口只由用户显式触发，不自动进入。

## 前置检查（缺一就停，先补齐，不猜）

| 缺什么 | 先补什么 |
|---|---|
| spec 含糊 / 缺验收标准 | `/grill` 或 `/spec` |
| 无工作项 / 无依赖分组 | `/tickets` 或 `/plan` |
| 工作项文件所有权重叠 | 重划边界；画不清就串行，不硬派 |

## 执行顺序

1. **读 spec 建任务图**：工作项是带阻塞关系的任务图，不是步骤列表。取当前**前沿**（无阻塞、可同时开工的集合）——即 `/plan` 产出的依赖分组；没有就先跑 `/plan`。
2. **探索（可选）**：需要摸代码或查外部资料时，先派只读探索子代理，笔记写到 `.aios/`（不入库），供实施子代理引用——实施阶段专注写码而非探索。
3. **核对可并行性**：按 `aios-work-dispatch` 准入条件核对（≥2 个独立工作项、文件所有权不重叠、无严格前后序）。不满足 → 串行逐项 `/implement`。
4. **派发实施**：`aios work` 预览 → **人工显式批准** → 后台并发执行；需要隔离与可续的长工作项用 `aios harness`（自带 worktree）。并行工作项各占一个 worktree，开工前确认基于同一集成基点。
5. **推进前沿**：某项完成并在任务图上解锁新前沿 → 继续派发（保持最大并发）；仍被阻塞的不派。
6. **集成分支收口**：多 worktree 先汇到一条集成分支确认整体一致（回归 + 交叉依赖），再回主线流程。
7. **审查收尾**：整合结果跑 `/review`（标准与规格双查）；提出的问题一次性修完，重跑验证。
8. **清理与报告**：清理 worktree；未达验收标准的工作项如实列出，不勾掉。

## 通讯纪律（子代理之间）

通讯尽量稀疏，主要走**上下文指针**：spec、工作项、探索笔记、commit。不复制已可由指针取得的信息。

## 完成判据（缺一不得报完成）

- 每条验收标准都有对应执行证据（真实命令输出），不是勾选框；
- `/review` 无未处理项；
- 任务图所有工作项收口，或如实列出未完成项与原因；
- worktree 已清理。

## 与其他入口的边界

- 单工作项 / 小改动：直接 `/implement` 或 `/single`，不走本入口。
- 多个独立工作项的一次性并发：`/team`。
- 一个长且可续的目标：`/harness`。
- 本入口的语义 = 一份 spec 的**完整**落地（跨多轮、多工作项）。
