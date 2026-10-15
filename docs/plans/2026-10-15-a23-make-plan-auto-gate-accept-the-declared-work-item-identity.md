# A23: make plan auto-gate accept the declared work-item identity

> AIOS Planning Contract (schema v3)
> created: 2026-10-15T05:28:55.514Z
> client: cli
> source: aios plan auto-gate
> route: implement

## Objective

A22 gave `plan start` a canonical work-item id, but `plan auto-gate` still has no way to name one: its
capability bindings key on `plan.relativePath`. The declared identity is therefore only half-wired —
the ledger can be found by id, while the Provider Command attached to it is still addressed by path.

## Facts (measured 2026-10-15)

- **K1** `applyWorkflowDecision`'s create branch calls `startPlan(...)`, which does not receive a
  `workItemId`, so every gate-created ledger has `workItemId: ''` (schema default).
- **K2** `startCapability(plan)` derives `workItemKey` from `plan.relativePath`, falling back to a
  `turn:<client>:<session>:<sha256(message)>` hash. So a gate-created ledger has **no** identity that
  matches A22's `canonicalWorkItemId` normalisation (case/spacing/punctuation collapse).
- **K3** consequence: `plan start --work-item X` then `plan auto-gate --task "<text>"` may bind a
  capability under a path/hash key that `openWorkItemPlan` would later restore under a different
  representation of the same id, so "same id, same ledger" does not yet imply "same id, same Command".
- **K4** A21's reuse rule already prevents the duplicate-ledger case; this item is about identity
  **propagation**, not about preventing siblings.

## Scope decisions (operator sign-off required)

- **F-a (default)** `plan auto-gate --work-item <id>`: the gate passes the declared id into
  `startPlan`, and `startCapability` prefers `plan.workItemId` as `workItemKey` over both the path and
  the message hash. Additive: the flag already exists in the parser surface (A22), only its wiring widens.
- **F-b** make the capability key canonical id-only whenever `workItemId` is present, and store a
  migration note for existing path-keyed activations. Riskier: already-stored activations would need a
  lookup fallback (id → path) or they become unreachable.
- Refused: deriving identity from the task text (same reasoning as A21/A22 — identity is declared).
- Default if unsigned: **F-a**, with a read-through fallback in `findStoredAiosCapabilityActivation`
  (try id, then path) so existing activations keep resolving.

## 交付（已验证，2026-10-15）

用户 `ok 继续` → 按默认 **F-a** 落地。两处事实是设计里没有的，它们是本次真正的修正点：

- **G6 身份优先于复用**：A21 的「有非终态活动计划就复用」会吞掉*显式声明的另一个 id*——P6 实测
  `--work-item item-two` 落进了 item-one 的账本。现在的规则是：声明 id 的规范化形式与活动计划的
  `workItemId` 不等 → 新建；相等 → 复用；未声明 → 保持 A21 行为。比较只用规范化 id 相等，仍不做
  任务文本相似度（A21/A22 的拒绝理由不变）。
- **G7 `slugify` 的空值回退**：`slugify('')` 返回字面量 `'plan'`。非抛异常的 `canonicalizeWorkItemId`
  若继承该回退，「未声明身份」就被读成「声明了一个不同的身份」，于是 G6 的反向后果出现：A21 的
  复用被静默关掉，N1/N2/N6/P3/P4 同时失败。现在空输入必须是 `''`，并由 P8 直接钉住。
- **矛盾声明拒绝而非择一**：`--work-item X --new-work-item` 会写第二本账却共用同一个 activation key
  （绑定不自洽）。改为 exit 1，且不在拒绝前写任何文件（P7）。
- **键优先级**：`startCapability` 按 `plan.workItemId` → `plan.relativePath` →
  `turn:<client>:<session>:<sha256>` 取第一个可用键；复用分支按同一组键依次读（id 先、路径后），
  所以 pre-A23 以路径为键的 activation 不会变孤儿（P4）。
- `syncEvidenceToMatchingPlan` 同时比对 `relativePath` 与 `workItemId`，否则 id 键 activation 的证据
  回不到账本。

## Non-goals

- No change to the capability vocabulary, recipes, or stage advancement.
- No back-filling of `workItemId` onto historical plans; they stay path-keyed and must keep working.

## Tasks

- [x] **t1-understand**: confirm K1-K3 on the current tree and enumerate every `workItemKey` producer
- [x] **t2-plan**: pick F-a/F-b and the read-through fallback order（按默认 F-a；见「交付」G6/G7）
- [x] **t3-implement**: thread the declared id from parser → gate → startPlan → capability key
- [x] **t4-verify**: a guard test that the same id yields the same ledger **and** the same activation,
      plus a legacy path-keyed activation still resolving after the change（P1-P8）

## Declared work-item fields

- `type`: control-plane identity propagation
- `targets`: `scripts/lib/foundation/planning/flow/auto-gate.mjs`,
  `scripts/lib/tooling/cli/parse-args/govern/plan.mjs`, `scripts/lib/foundation/planning/ops/cli.mjs`,
  the rex capability-activation store module
- `allowedWrites`: those files + `scripts/tests/execution/planning/**` + `scripts/tests/execution/rex/**`
- `failureClass`: `no-progress` while F-a/F-b is unsigned — 已解除（F-a 按默认签署并交付）

## Acceptance

- `plan auto-gate --work-item X --explicit-intent plan` twice → one ledger and one activation.
- An activation created before this change (path-keyed) still resolves for the same plan.
- A21's reuse rule and A22's identity refusals stay green (no regression on either).

## Status

- status: done — F-a 按默认签署并已交付；守卫 P1-P8 进 `regression`，全量回归 2156/2147/0 fail/9 skip。
  曾误写为「blocked on sign-off」的那行是本文件交付前状态，保留在 git 历史里。
