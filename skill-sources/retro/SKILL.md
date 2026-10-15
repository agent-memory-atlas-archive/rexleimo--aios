---
name: retro
description: "复盘一次会话，产出「该改环境而不是改代码」的改进候选：只提案不改文件，每条候选必须带源引用，按严重度列表交用户挑选。TRIGGER: /retro、retro、复盘、retrospective、环境改进"
installCatalogName: retro
clients: [codex, claude, gemini, opencode, hermes, workbuddy, pi, zcode, qoder]
scopes: [global, project]
defaultInstall:
  global: true
  project: false
tags: [aios, retro, environment]
repoTargets: [codex, claude, gemini, opencode, hermes, workbuddy, pi, zcode, qoder]
---

# Retro（会话复盘 → 环境改进候选）

复盘**一次会话**，产出的不是对代码的意见，而是对**编码环境**的改法：让下一轮同类任务更省、更少犯错。会话由用户指定，未指定则默认本次。

## 铁律：只提案，不改文件

- 本 skill **不写任何文件**，不创建分支，不改 skill / 规则 / 配置。
- 每条候选落地走既有受控闭环：`aios skill propose` → `review --approve|--reject|--quarantine` → `apply` → 需要时 `rollback`（`scripts/lib/tooling/skills/skill-workshop.mjs`）。不得新开第二条写入路径。
- 改动 rex-harness 的 skill 文本额外走 training gate（`aios skill certify`）与子模块发布流；改 AGENTS.md / 检查脚本属主仓库改动。

## 第一步：读原始材料，不靠回忆

从确定性来源取证，而不是凭记忆复述会话：

- 本轮对话记录（当前会话的完整轮次）；
- ContextDB 会话事件与 `.aios/` 运行状态；
- `git status` / `git diff` / `git log`（本轮真实改了什么）；
- `docs/plans/`、CHANGELOG、`.aios/planning/` 账本（计划与证据实际落到哪）；
- 如上下文被压缩过，`refs read <ref_id>` 召回原工具输出。

**每条候选必须给出源引用**（文件:行、事件 id 或对话轮次）。给不出引用的候选一律不列——宁可少列，不得编造。

## 第二步：七类候选

每一类都有触发条件，会话里没发生就**明确写"未见"**，不硬凑：

1. **导航（Navigation）** — agent 找文件/信息花了很久，或存在隐藏依赖？一条导航指针即可解决？_当会话里出现长时间找不到信息时。_
2. **确定性检查（Automated checks）** — agent 犯了本可被检查拦住的错？先读仓库**自己的** check 命令（`package.json` 脚本、CI workflow、`scripts/test-suites.json`），**已有但没接线或悄悄坏掉的检查算发现，不算重新发明**。仓库没有任何护栏（无 pre-commit、也无 CI 跑 lint/typecheck/test）= 本身就是一条 finding。_当错误本可被自动拦住，或仓库根本没有护栏时。_
3. **编码标准（Coding standards）** — reviewer agent 该拿到新规则？既有规则该删/该澄清？**先分类再给动作**：机械违规（固定句法模式、禁用 API、import 形状、文件位置规则）一律降级成确定性检查——仓库 linter 自定义规则、pre-commit hook 或 CI job，**能写检查就不写规则**；`rex-engineering-standards` / `CODING_STANDARDS.md` 只留真正需要判断力的条目（跨文件一致性、"与周围风格一致"这类检查永远替代不了的）。标准文本的 owner 仍是 `rex-engineering-standards`，本 skill 不新增第二个 owner。_当 reviewer 漏掉了错时。_
4. **AGENTS.md 增删** — 有 steering 指令该挪去标准或检查？文件是否过长？AGENTS.md 的用途是**导航指针**，塞进流程细节就是负资产。_当 AGENTS.md 明显膨胀时。_
5. **工具经济性（Tool economy）** — 昂贵/浪费的工具调用？哪个 CLI/MCP 输出特别吃 token（本仓库有 `refs` / offload / RTK 压缩面可对照）？_当出现昂贵工具调用时。_
6. **无效指令（No-ops）** — steering 文件里存在**不改变 agent 行为**的指令（写了也不会被遵守、或与其它指令重复）。_当 steering 文件臃肿时。_
7. **信息可达性（Information access）** — 关键信息当时拿不到，本可以低成本拿到（tee 开发服务器日志、只读访问某服务）？_当会话因缺信息而绕路时。_

## 分配原则（写进候选的理由里）

- **上下文压力在实施侧**：实施 agent 要做探索、写码、调试，review agent 只拿 diff、压力最小——所以**标准由 review 侧施加**，别往实施侧加规则。
- 标准、检查、导航指针三者的归属不混用：能机械判定的写成检查，需要判断力的写进标准，其余写成指针。

## 输出（完成判据，缺一不得报完成）

一张按**严重度降序**的候选表：

| # | 类别 | 发现（一句） | 源引用 | 建议动作 | 严重度 |
|---|---|---|---|---|---|
| 1 | … | … | 文件:行 / 事件 id / 轮次 | 检查 / 标准条目 / 导航指针 | 高·中·低 |

- 七类逐类交代：有发现的列行，无发现的写"未见"；
- 候选交用户挑选后才谈落地；未获挑选的候选不落地，也不记成已完成；
- 结尾一行总量：各类别发现数 + 最严重一项。
