# Review verdict round 2 — work-config-surface（C1/C2/C3/C5）

类型化裁决：`2026-10-22-portable-standard-rules-review-config-surface-round2.json`，已用子模块自己的
`normalizeReviewVerdict()` 校验通过（`complete / changes-requested`，Standards 4 条、Spec 4 条）。

## diff

fixed-point `d701ea6a`（第一轮审查时的 HEAD），三点差异非空：

```
git diff --stat d701ea6a...HEAD              →  10 files changed, 156 insertions(+), 28 deletions(-)
git -C rex-harness diff --stat 48bbe7a...48040bb →  5 files changed, 181 insertions(+), 21 deletions(-)
```

规格来源：`docs/adr/0002-portable-engineering-standard-rules.md` + 工单 `work-config-surface` C0–C7。
标准来源：`rex-engineering-standards`（第 0 步先加载，已执行）+ `AGENTS.md` 目录预算节。

## Standards

**hard 2 / judgement 2**

1. **文档写的降级行为不存在**（`docs/adr/0002:101` ↔ `scripts/check-dir-budget.mjs:109`）。我在 ADR 里写「无
   git 目录时输出 SKIP、退出 0」，实测不成立：私有门把目标根固定为**脚本自身所在仓库**，在非 git 临时目录运行
   仍输出 `[dir-budget] 767 dirs, 24 over budget 8` 并退出 0——量的是 AIOS 自己。已把该条改写为「目标行为，
   尚未实现 + 实测事实」，并把两条要求（目标根由调用方决定、取不到 tracked 列表即 SKIP）写成
   `work-budget-engine` 的 C7/C8。**这也是本需求真正的拦路石**：验收 #1/#5 要的是外部仓库可用，而现在的门
   根本不看 cwd。
2. **豁免结构分支零覆盖**（`standard-config.mjs:69-82`）：条目缺 path / 非对象、`exemptions.<rule>` 不是数组
   ——两条分支在子模块测试里没有一次命中。修复只需两条断言。
3. judgement：结构缺陷借用 `missing-reason` 码。三码是 C3 闭集，不该偷偷加第四个，但要在契约里写明该码覆盖
   「豁免条目整体不成立」。
4. judgement：清单里 `measure` / `dispositions` / `fileLines.exemptions` 暂无消费者，而 ADR 已把 `measure`
   指认为口径唯一权威——权威暂时无人读取，等于口径仍活在脚本行为里（与第 1 条同源）。引擎切片必须消费或删除。
5. §4 文件粒度通过：`standard-config.mjs` 107 行、`quantitative-rules.mjs` 28 行、两个测试 59/63 行，均远低于
   400 软上限，kebab-case，单一职责。
6. 12 条 smell：Duplicated Code（第 1 条，口径两处）、Shotgun Surgery（同条：改口径要同时动 ADR 文本与脚本
   行为）、Speculative Generality（第 4 条）、Primitive Obsession（第 3 条，用码字符串承担结构判定）；
   Mysterious Name / Feature Envy / Data Clumps / Repeated Switches / Divergent Change / Message Chains /
   Middle Man / Refused Bequest **未见**。上一轮的两条已验证修复：死面 `QUANTITATIVE_RULE_OVERRIDE_KEYS`
   与第二条预算入口 `quantitativeRuleBudget` 都没带进发布，公开面只剩一条解析入口。

## Spec

**达成 C1、C2、C3（主体）；C5 只达成文档，实现结转。**

- **C1 ✓**：`scripts/tests/tooling/contracts/standard-rule-config.test.mjs` 现在比对**父侧读到的** `DEFAULT_BUDGET`
  与清单值。固有边界如实说明：两侧同时改成同一个别的数不会变红——在「一个 owner」的定义下这可以接受。
- **C2 ✓**：`DEFAULT_BUDGET = QUANTITATIVE_STANDARD_RULES.directoryEntries.budget`，父侧独立字面量 8 消失（grep 实测）。
- **C3 ✓ 有缺口**：三类结构化错误都返回且被覆盖，除第 2 条里的豁免结构分支。
- **C5 ✗**：文档达成，SKIP 行为未实现，已结转 `work-budget-engine`；`completionClaim` 保持 soft。
- **scope creep 无新增**（上轮那条已删）。
- **过程缺陷必须记进规格面**：重命名测试时我误删了 `search/search.test.mjs` 的登记，然后用
  `AIOS_UPDATE_TEST_WIRING=1` 刷新基线，把这次删除伪装成「存量未接线」。是门自己的报错文本戳穿的。恢复登记后
  `knownUnwired` 回到空集，wiring 套件 6/6——**基线没变宽，绿才是真的**。工单 V0 路径随重命名更新，
  `normalizePlanningArtifact` 重新校验 PASS（status ready）。

汇总：Standards 轴 4 条发现（hard 2 / judgement 2），最严重第 1 条——文档声称的行为不存在，而且它挡的正是整个
需求的验收 #1。Spec 轴 4 条发现（hard 2 / judgement 2），最严重 C5：只做了文档就差点当成做完。
verdict `changes-requested`：下一轮补第 2 条的两条断言与第 3 条的契约声明，SKIP 实现与目标根解析按工单进
`work-budget-engine`。
