# ADR 0002: turn outcome 可达性契约（repair_required / replan_required）

## Status

Accepted（2026-10-14）。裁决原话：“work-3 不做映射”。

2026-10-14 更新（work-4 裁决 C）：父侧桥已删除（零生产 importer，见
`docs/reference/outstanding-work.md` A17）。本 ADR 对子模块公开枚举的完整性与 material 定性仍然有效；
“父桥只产 3 个”的测试钉随桥自然消失。若将来重新接线（裁决 A 分支），必须带真实调用点重新引入双向钉定。

## Context

`rex-harness/src/domain/turn-contract.mjs` 的 `TURN_OUTCOMES` 有 5 个成员
（`validated_progress` / `validated_completion` / `repair_required` / `replan_required` / `blocked`）。
AIOS 的桥 `scripts/lib/execution/harness/solo/turn-settlement.mjs::mapIterationToTurnContract`
只产出其中 3 个——`repair_required` / `replan_required` 从 AIOS 不可达。

两个候选方向：

**(a) 父桥映射。** 例如 `blocked` + 特定 failureClass → `repair_required` / `replan_required`。
问题：这两个 outcome 属 `MATERIAL_TURN_OUTCOMES`（`turn-contract.mjs:22-26`），映射后
**失败轮会开始消耗额度**，并把"provider 报错"升格为"控制面要求修复"——语义变化超出 AIOS
当前需要。更根本的是：该枚举是公开 wire 契约，语义应由子模块拥有，不应由父桥行为反向定义。

**(b) 声明为外部宿主产出。** 枚举保持 5 个成员，AIOS 桥继续只产 3 个，用测试钉死这条可达性契约。

## Decision

采用 **(b)：不做映射**。

- `repair_required` / `replan_required` 保留在公开枚举中，语义为"外部宿主可产出的 outcome"；
- AIOS 桥继续只产出 `validated_progress` / `validated_completion` / `blocked`；
- 删除父侧不可达的 `self_repair`（`should-run.mjs:16`）——同一原则：**无 call site 不进枚举**；
- 用测试同时覆盖两侧：子模块断言枚举完整性，父桥断言产出集合只有 3 个。

## Consequences

- **结算与额度语义不变**：失败轮仍不产生 material outcome、不扣额度。
- 子模块枚举保持 5 个成员，第三方宿主可用；非破坏性变更。
- 若将来 AIOS 需要 repair lane，那是**新能力**，必须带真实 call site 并修订本 ADR 一起进，
  不能靠改桥的映射悄悄引入。
- 子模块若只加测试（`tests/` 不在 package `files` 面 `["bin/","docs/","skill-sources/","src/","CHANGELOG.md"]`），
  **不需走 tag/npm 发布流**，只需子模块 commit + 父指针独立 commit（ADR 0001）。

## Rejected options

- **(a) 父桥映射**：拒绝——把失败轮变成 material（消耗额度、状态机升格），语义变化超出当前需要；
  且让父桥行为反向定义公开契约语义，违反"一条规则一个 owner"。
