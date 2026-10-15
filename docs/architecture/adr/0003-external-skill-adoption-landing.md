# ADR 0003: 外部 skill 采纳的落点判定

## Status

Accepted（2026-10-15）

## Context

外部参照 mattpocock/skills 在 v1.3.0/v1.3.1（2026-10-04）把 `implement-spec`、`pr`、`retro`
毕业进 engineering 桶。`pr` 给出交付正文的三节形状：最小可视摘要、before/after 证据、
merge danger（one-way/two-way door + blast radius）。

每引入一份外部 skill 都要重答一次「改父仓库还是改子模块」。该判据已由
ADR 0001 定过（"是子模块的东西就应该放在子模块"），本 ADR 不另立规则，
只把 ADR 0001 与 `rex-harness/docs/workflow-ownership.md:37` 两条既有判据合成一条可执行顺序，
并用 `pr` 走一遍。

## Decision

**判据不变，仍是 ADR 0001 的第 1 条**：变更属于子模块，当且仅当它属于「第三方可独立安装使用」
的公开产品面（状态内核、契约、CLI、公开 schema）。`workflow-ownership.md:37` 是同一条边界的
另一侧表述——「软件阶段发生变化时只应修改 rex；AIOS 自有治理阶段发生变化时才修改父项目」——
因为 rex 的 Capability / Evidence Contract / Provider Command 正是它可独立安装的公开面（独立模式
下客户端 `rex-harness init --client` 直接装 Skill，无需 AIOS）。

动手前按这三问顺序过（问到的第一个「是」即决定落点）：

1. **它是本仓库的贡献文书形状吗？**（PR / issue 模板、`AGENTS.md` 段落、docs/plans、docs/reports）
   → 父仓库。不进子模块，不需要 `skill certify`。
2. **它是宿主「什么时候允许声称完成」的门禁吗？**（客户端指令注入、quality gate、
   verification-before-completion、pre-edit/隐私/压缩门）→ 父仓库 `scripts/lib/`。
3. **它需要被 Command 选中并返回一份 Evidence 吗？**（新 Capability、新阶段、新 evidence schema、
   `skill-sources/*/SKILL.md` 正文）→ 子模块，并**必须**走 ADR 0001 第 2 条的完整发布流
   （CHANGELOG + semver + tag），父仓库子模块指针单独成 commit。

## Consequences

- `pr` 的三节模板形状 → 第 1 问命中，落父仓库 `.github/PULL_REQUEST_TEMPLATE.md` + `AGENTS.md` PR 段。
  现模板是 `- Problem:` / `- Solution:` 两行散文加 4 个 `- [ ] npm run test:scripts` 勾选框
  （`.github/PULL_REQUEST_TEMPLATE.md:1-17`）：勾选框属自证，不是 before→after 执行证据，这一条与
  三问无关，是模板自身缺陷。
- 同批毕业的另两个也在本 ADR 的对照下落地，但第一版判定有一处**已修正的推理漏洞**（operator 质疑
  「只装 Harness、不用 AIOS 的用户怎么办」后重查）：
  `retro` → 落父仓库目录 skill `skill-sources/retro/`（只提案不改文件，走既有 `skill-workshop` 闭环）；
  `implement-spec` → 落父仓库目录 skill `skill-sources/implement-spec/`（AIOS 宿主编排：executionHost
  选择 + `aios work` 批准制派发）。第一版曾以「Team/dispatch/worktree 子模块边界明文禁止拥有」为由把
  implement-spec 排除出子模块——该推理混淆了两件事：rex 宪法禁止的是**控制面实现**调度机器，不禁止
  **用户显式触发的编排指引 skill**（`rex-workflow` 即同形先例：非 Provider、不进 Command 选择、随
  `init --client` 投影）。据此修正：这类上游 framework-free skill 的正确落法是**双面**——父仓库薄入口
  服务 AIOS 用户，子模块 framework-free 版服务独立用户，`grill ↔ rex-requirements` 是既有先例。
  **独立用户缺口在案**：只装 rex-harness 的用户当前拿不到整份 spec 执行流，链尾也无收口站；补齐走
  子模块发布流（SKILL + evals + install 接线 + `skill-sources.test.mjs` 目录集更新 + certify + semver），
  npm 发布是对外动作需 operator 确认。同理，`/pr` 第 6 站拒绝理由中的「cap 直推 main」是**本仓库的
  消费习惯**，不是产品属性——独立用户的 PR 流收尾缺口独立成立，重估条件以产品面为准。
- 「报完成前必须出示 before/after 与可逆性判断」若要强制，→ 第 2 问命中，落父仓库门禁，
  不是新阶段。
- 「链尾第 6 站」（`/pr` intent + 独立 capability + `rex.delivery-closeout.v1`）→ 第 3 问命中，
  属子模块，**本轮不采纳**。成本按 ADR 0001 已登记：改子模块公开面要走发布流，高于父侧改一行。
  落地需同时动：子模块 `src/capabilities/` + `src/workflows/software-workflow-runtime.mjs`
  （阶段选择运行时）+ `skill-sources/rex-*/SKILL.md`；父侧 `workflow-policy.mjs:424-426` 的
  explicitRoute、`auto-gate.mjs:30` 命令族正则、七个客户端的命令注册、投影 digest 登记与指针 commit。
- 两条既有约束限制第 6 站的形状：`Provider 不拥有触发权`
  （`rex-harness/docs/workflow-ownership.md:47`）——新阶段只能由运行时按条件选中，不能靠 skill 文本自装；
  `rex-code-review/SKILL.md:100` 要求审查出 Evidence 后停止，不接力下一个 Provider。
- 日常直推 main（`cap` = commit+push）使「写 PR 正文」这件事在多数轮次不发生。因此第 6 站只有在把产物
  改判为**每轮验收单**（第 2 问的门禁强化）时才值得建；否则第 1 问的文书约定已经覆盖。
- `CONTEXT.md` → `GLOSSARY.md` 的上游改名分叉已由 ADR 0004 定性（保持 `CONTEXT.md`），本 ADR 不再展开。

## Rejected options

- **把 `pr` 直接做成子模块新 skill。** 拒绝：它先要过第 1/2 问；三节形状本身是文书与门禁，
  不构成新软件阶段；进子模块即触发发布流成本，与「第三方可独立安装」的收益不匹配。
- **另立一套落点判据。** 拒绝：ADR 0001 已有裁决与原话，重复立规则会产生第二套边界口径。
