# 子模块边界与 loop 闭环修复计划

日期：2026-10-14（第二轮重排：work-3 裁决 + work-6 排序）
Decision Ticket：`docs/architecture/adr/0001-submodule-landing-boundary.md`（边界与发布流）、
`docs/architecture/adr/0002-turn-outcome-reachability.md`（outcome 可达性契约）
来源：本次会话的 LoopX 对比 → 三项借鉴分析 → 架构评审 → 落点裁决

## 目标

把 2026-10-14 评审确认的缺口收敛成可验证结果：**先让子模块边界变成机器可检查的**，
再补唯一的正确性缺口，然后按 operator 指定顺序处理结构项。不重写现有 loop。

## 非目标

- 不重写 harness loop；attended 默认行为不变（`pacing=null` 全关）。
- 不实现 interaction contract（operator 已排序：单一真相源先做）。
- 不内嵌 LoopX 代码。

## 依赖图

```text
work-1 边界可执行化 ──┬──► work-4 P0 独立完成谓词 + 结算门 ──► 子模块发布 ──► 父指针独立 commit
work-2 self_repair ───┤
work-3 outcome 可达性 ─┤        （G1 并行组）
work-5 投影卫生 ──────┘

work-6 单一真相源              [ready，operator 排序在前]
work-7 interaction contract    [deferred，operator 排序在后]
```

**关键路径**：`work-1 → work-4 → 子模块 CHANGELOG+semver+tag → 父仓库指针独立 commit`

---

## work items

### work-1 — 子模块边界可执行化

- **dependsOn**: []
- **observable outcome**：父仓库对 `rex-harness/` 的静态 import 只出现 `src/index.mjs`；现存唯一越界消失
- **输入**：ADR 0001 的「公开面」定义；`rex-harness/src/index.mjs:69-78` 已导出 `deriveEffectRef` / `normalizeTurnResult`（**无需改子模块**）
- **改动**：`scripts/lib/execution/harness/solo/turn-settlement.mjs:4` 改走公开入口；新增父侧边界测试
- **completion criteria**：(a) 越界修复；(b) 测试含**反例**（故意注入 deep import 必须失败）
- **verification**：`node --test scripts/tests/<新>.test.mjs`、`npm run test:rex-integration`、`npm run test:affected`
- **evidence refs**：`rex-harness/src/index.mjs:69-78`；`rex-harness/tests/architecture/import-boundaries.test.mjs`（仅向内，缺向外）
- **回退点**：两个文件独立 revert；零子模块改动

### work-2 — `self_repair` 死枚举处置

- **dependsOn**: []
- **observable outcome**：`SHOULD_RUN_ACTIONS` 每个成员都有真实 call site
- **决定**：删除（ADR 0002；将来实现 self-repair lane 时随 call site 一并加回）
- **completion criteria**：枚举成员与 `resolveShouldRun` 返回值一一对应，且有测试断言
- **verification**：`node --test scripts/tests/execution/harness/`（solo-runtime 用例）
- **evidence refs**：`scripts/lib/execution/harness/solo/solo-runtime/gate/should-run.mjs:16`；ADR 0002
- **回退点**：单文件 revert

### work-3 — outcome 可达性契约钉死

- **dependsOn**: []
- **决定**：**不做映射**（ADR 0002）——`repair_required` / `replan_required` 声明为外部宿主产出，AIOS 桥继续只产 3 个
- **observable outcome**：枚举完整性与桥产出集合两侧都有测试钉死；结算/额度语义不变
- **改动**：子模块加断言（枚举 5 个成员仍在）；父侧加断言（`mapIterationToTurnContract` 产出集合恰为 3 个）
- **completion criteria**：任一方向被破坏（多产/少产）测试即失败
- **verification**：`npm --prefix rex-harness test`、父桥回归
- **evidence refs**：`rex-harness/src/domain/turn-contract.mjs:14-26`；`scripts/lib/execution/harness/solo/turn-settlement.mjs:29-40`；ADR 0002
- **发布**：**仅测试改动**（`tests/` 不在 package `files` 面）→ 不需 tag/npm，只需子模块 commit + 父指针独立 commit
- **回退点**：子模块 commit revert + 父指针回移

### work-5 — 投影残留卫生 + 刷新纪律

- **dependsOn**: []
- **observable outcome**：`.rex-projection-recovery` 残留清理归零；「改 `skill-sources/*/SKILL.md` 未跑 `refresh-projection-history.mjs`」会被检查拦下
- **completion criteria**：残留计数为 0；新增检查含反例
- **verification**：残留计数命令 + 新增检查的测试
- **evidence refs**：`rex-harness/scripts/refresh-projection-history.mjs`；`rex-harness/CHANGELOG.md` v0.9.1 条目（漏跑导致投影安装失败）
- **回退点**：残留目录为 gitignored，删除不可逆但**不影响仓库**；执行前需 human 确认

### work-4 — P0 独立完成谓词 + 结算门

- **dependsOn**: [work-1]
- **observable outcome**：`validated_completion` 在存在未清缺口（monitor 到期 / gate 未解 / ready successor / acceptance gap）时被拒绝或降级
- **分界**（ADR 0001 落点判据）：**谓词与结算门在子模块**（公开契约，任何宿主可复用）；**facts 采集在父仓库**（solo summary / plan / gates）
- **completion criteria**：反例测试——`open=0 但 acceptance_gap=1 → 拒`；缺失计数（null/undefined）→ `invalid` 而非 0
- **verification**：`npm --prefix rex-harness test`、`npm --prefix rex-harness run doctor`、父桥回归
- **evidence refs**：`research/upstream/loopx/loopx/control_plane/goals/goal_frontier/terminal.py`（`_strict_zero` + source completeness + `terminal_no_followup`）；`scripts/lib/execution/harness/solo/turn-settlement.mjs:35`
- **发布**：子模块公开面变化 → CHANGELOG + semver + tag；父指针**独立 commit**（ADR 0001）
- **回退点**：子模块 revert + 父指针回移，两个独立 commit

### work-6 — 单一真相源收敛

- **dependsOn**: []
- **operator 排序**：P2 两项中**先做这一项**
- **observable outcome**：一次 turn 的结算只有一个 append-only 真相源，其余（run summary / continuity / plan 投影）可从它重放并检测漂移
- **现状**：`persistIterationState` 串行写 4 处（checkpoint / 迭代 append / continuity / run summary），不原子，存在部分写窗口
- **completion criteria**：崩溃注入（写中断）后重放得到一致投影；投影漂移可被检测并报警
- **verification**：崩溃注入测试 + 现有 harness 套件
- **evidence refs**：`scripts/lib/execution/harness/solo/solo-runtime/support/state.mjs`、`scripts/lib/execution/harness/solo/solo-journal.mjs`
- **回退点**：写入路径改动，需按子步骤 commit；保持现有读路径兼容
- **注**：这是本条里最大的改动，建议先出子设计再实现

### work-7 — interaction contract 决策编译器 [deferred]

- **dependsOn**: [work-6]
- **operator 排序**：排在 work-6 之后
- **deferred reason**：非阻塞，仅排序；范围与验收见本次会话的分析（typed 三通道 + scheduler hint 拆分）
- 入图时需重新确认范围。

---

## frontier

| 状态 | work |
|---|---|
| ready | work-5, work-6 |
| blocked | — |
| deferred | work-7（operator 排序在 work-6 之后） |
| in_progress | — |
| done | work-1, work-2, work-3（2026-10-14） |

## parallelGroups

- **G1** = [work-1, work-2, work-3, work-5] —— ✅ 已执行（work-5 外，见交付记录）；work-1/2 纯父仓库，work-3 含一次子模块测试改动
- **G2** = [work-4] —— dependsOn work-1（已解除）
- **G3** = [work-6] —— 与 G1/G2 无共享文件，但体量最大，建议独立进行；完成后才解锁 work-7

## convergenceGate

汇合条件（全部满足才算完成）：

1. 子模块：`npm --prefix rex-harness test` + `doctor` 绿
2. 父仓库：`npm run test:affected` 绿（rex-harness 变更会 bail 到全量，符合 `scripts/lib/tooling/test-impact.mjs:26` 的既有行为）
3. 边界：父侧边界测试存在且**反例生效**；全仓无 `rex-harness/src/**` deep import
4. 枚举：无可达性破坏（子模块 5 个、父桥 3 个，双向断言）
5. P0：反例测试绿（含缺失计数场景）
6. 单一源：崩溃注入后重放一致
7. 发布：子模块 CHANGELOG + tag 落地（仅 work-4 需要）；父指针为独立 commit

required evidence refs：上面每条 verification 命令的真实输出。

## completionClaim

**soft**。hard completion 需要 `rex.runtime-artifact-contract.v1`（consumer + artifact ref + verification + evidence refs），本计划未产出。

## 假设清单

1. attended 默认行为不变（沿用 v5.14 立场）。
2. work-1 无需动子模块——**已核实** `rex-harness/src/index.mjs:69-78` 已导出所需两个符号。
3. work-4 的 facts 采集在父仓库（子模块只提供谓词与结算门）。
4. work-5 的残留删除不可逆但无仓库影响，执行前需 human 确认。
5. **「单一源先做」的解读**：指 P2 两项中 work-6 排在 work-7 之前，**不是**指 work-6 优先于 G1/G2。
   若原意是"先于一切"，请更正——那会改变关键路径。

## 未决

- 无阻塞项。work-6 的范围细节需在其子设计中确认。

## 交付记录（G1，2026-10-14）

### work-1 子模块边界可执行化 ✅

- `scripts/lib/execution/harness/solo/turn-settlement.mjs` 改走 `rex-harness/src/index.mjs`（公开面）；
  `rex-harness/src/index.mjs:69-78` 已导出 `deriveEffectRef` / `normalizeTurnResult`，**无需改子模块公开面**。
- 新增 `scripts/tests/execution/rex/runtime/rex-import-boundaries.test.mjs`（B2 反例 / B3 生产自检 / B4 测试树基线只许收缩），
  接入 `test:rex-integration`；接线守卫 W2/W5 确认其可达且 CI 执行。
- 复用 `scripts/lib/tooling/test-impact.mjs::collectReferences`（新增 export），避免两处引用抽取正则漂移。
- **范围发现**：除已知 1 处生产越界，测试树另有 6 处内部耦合（`rex-harness/tests/fixtures/requirements-decision.mjs` ×4、
  `src/cli/start.mjs`、`src/clients/projection-manifest.mjs`）。修它们需子模块补公开面并走发布流 → **不纳入 G1**，
  以只许收缩的 TEST_BASELINE 冻结，留待独立工作项。

### work-2 `self_repair` 死枚举处置 ✅

- `SHOULD_RUN_ACTIONS` 改为 `['run','wait','ask','quiet']`，docstring 同步（ADR 0002）。
- `scripts/tests/execution/harness/infra/pacing/pacing.mjs` 新增可达性断言：声明的动作集合必须等于
  决策函数在真实输入下能产出的集合。

### work-3 outcome 可达性契约钉死 ✅

- 父侧 `infra/core/turn-settlement.mjs`：桥的产出集合断言恰为 `blocked / validated_completion / validated_progress`。
- 子模块 `tests/domain/turn-contract.test.mjs`：枚举含 `repair_required` / `replan_required`，
  且 `repair_required` 为 material、`replan_required` 不是。
- 仅测试改动（`tests/` 不在 package `files` 面）→ 不走 tag/npm 发布流；
  但父仓库子模块指针因此变脏（`m rex-harness`），提交时需**独立 commit** 移指针。

### 验证证据

| 命令 | 结果 |
|---|---|
| `node --test scripts/tests/execution/rex/runtime/rex-import-boundaries.test.mjs` | 3/3 通过 |
| `node --test scripts/tests/execution/harness/harness-runtime.test.mjs` | 53/53 通过 |
| `npm --prefix rex-harness test` | 216/216 通过 |
| `npm run test:rex-integration` | 57/57 通过 |
| `node --test scripts/tests/tooling/suites/test-suite-wiring.test.mjs` | 6/6 通过（W1/W2/W3/W5/W6/漂移） |
| `npm run test:affected`（bail 全量） | **2118 项 2105 通过 / 4 失败** |

**反例验证（突变注入 + `finally` 还原，4/4 被拦）**：

| 突变 | 拦截者 |
|---|---|
| 生产源码追加 deep import | B3 失败 |
| 把 `self_repair` 加回枚举 | 可达性断言失败 |
| 让桥映射 `repair_required` | 桥产集断言失败 |
| 子模块移除 `repair_required` 的 material 资格 | 合约断言失败 |

### 存量失败（非本次引入，已证因果独立）

`npm run test:affected` 的 4 项失败位于 3 个文件，均与本次改动集**在影响图上不可达**
（用仓库自己的 `buildImpactIndex` 对三个测试求可达集，与改动集交集为空）：

| 测试 | 症状 | 定性 |
|---|---|---|
| `rex-v2-case-selection.test.mjs` | 训练认证 gate 报 `blocked`（hash 已匹配，失败在确定性重跑比对） | 存量；`docs/reference/outstanding-work.md` A3 同形 |
| `llms-txt.test.mjs` ×2 | `docs-site/llms.txt` 与生成器不一致 | 存量；生成物自 2026-10-02 未再生 |
| `cli-project-root.test.mjs` | guard 拒绝消息断言 0 !== 1 | 存量；与 Rex/harness 无关 |

因此 **convergenceGate 第 2 项"父仓库 test:affected 绿"未满足**，但失败均非本次改动引入。

## ledger

```
is_complete: false
in_progress: []
facts:
  - work-1/2/3 完成（2026-10-14），证据见交付记录
  - 生产源码越界数 1 → 0；测试树内部耦合 6 处已冻结为只许收缩的基线
  - work-1 无需子模块公开面改动（rex-harness/src/index.mjs:69-78 已导出所需符号）
  - 存量失败 4 项 / 3 文件，与本改动集影响图不可达
assignment:
  work-5: implementer   # 删除 285 个残留目录前需 human 确认
  work-6: design-first  # 先出子设计，再实现
  work-4: implementer   # 关键路径下一站，产物需走子模块发布流
```

G1 已交付；等 operator 选择下一批（work-4 / work-6 子设计 / work-5 确认）。
