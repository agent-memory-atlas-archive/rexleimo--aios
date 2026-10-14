# ADR 0001: 子模块落点边界与发布流

## Status

Accepted（2026-10-14）。裁决原话："是子模块的东西就应该放在子模块，我更偏向 A"。

## Context

`rex-harness/` 是独立公开仓库（`github.com/rexleimo/rex-harness`）与独立包
（`@rexleimo/rex-harness`，v0.9.1，已 tag，带 CHANGELOG 与自己的 `release.yml`），
不是 AIOS 的内部目录。父仓库通过 `scripts/lib/execution/workflows/adapters/rex-*.mjs`
消费它。

2026-10-14 架构评审发现两件事：

1. 父仓库存在一处越界：`scripts/lib/execution/harness/solo/turn-settlement.mjs:4`
   直接 import `rex-harness/src/domain/turn-contract.mjs`（内部模块），绕过 package
   `exports`；其余 4 个适配器都走 `rex-harness/src/index.mjs`。
2. 子模块有**向内**的边界测试
   `rex-harness/tests/architecture/import-boundaries.test.mjs`（src 不得 import AIOS 内部），
   但没有**向外**的检查，所以越界无人拦。

同批评审还指出"完成可自证"是 harness loop 唯一的正确性缺口：完成与否只来自 provider
声明的 outcome，没有独立谓词校验 monitor / gate / successor / acceptance 是否真的清空。
若把该修复放在父仓库侧，terminal 语义必须在父仓库二次实现，与子模块的 turn outcome
之间多一层翻译——这正是评审认定的"决策语义外泄"缺陷。

## Decision

1. **落点判据**：一个变更属于子模块，当且仅当它属于"第三方可独立安装使用"的公开产品面
   （状态内核、契约、CLI、公开 schema）。不属于的留在父仓库（适配层、solo 编排、
   AIOS 集成如 plan 同步 / offload / continuity）。
2. **改动方式（选项 A）**：允许修改子模块公开面，但必须走完整发布流——CHANGELOG +
   semver + tag（子模块自己的 `release.yml`）。父仓库的子模块指针移动是**独立 commit**，
   不与功能改动混合，保证可单独 revert。

## Consequences

- 正确性修复（独立完成谓词 + 结算门）落在子模块，语义只实现一次，下游使用者同样受益。
- 需要新增一条**父侧**架构测试：父仓库只允许 import `rex-harness/src/index.mjs`，禁止
  deep import 内部模块；`bin/` 只允许通过进程调用（`rex-harness verify` / `settle`）。
  当前只有子模块向内检查，缺向外检查。
- 改动子模块公开面必须走发布流程，成本高于父侧改一行；因此"该不该进子模块"的判据必须
  在动手前先过一遍。
- 子模块 `rex-harness/docs/adr/` 与父仓库 `docs/architecture/adr/` 是两条独立编号序列，
  各自自治，不互相引用编号。
- ADR 落点：`docs/` 已在目录预算上限（8 条），故父仓库 ADR 系列落 `docs/architecture/adr/`。

## Rejected options

- **B：冻结子模块，在父仓库加校验层。** 拒绝：terminal 语义要在父仓库重复实现，产生第二套
  "什么算完成"的语义，正是本次评审认定的缺陷；与"一条规则一个 owner"冲突。
- **C：允许改子模块，但只 tag 不发 npm。** 拒绝：子模块是公开产品，源码标签与发布产物
  不一致会让"公开面"承诺不成立；子模块已有 CHANGELOG + semver + tag 的发布纪律在先。
