# Review verdict — work-config-surface（rex-standards-spec-review.v1）

- fixed-point: `874795b2`（= `origin/main`，`git rev-parse` 通过）
- 差异非空：父仓库 `git diff --stat 874795b2...HEAD` → `10 files changed, 670 insertions(+), 1 deletion(-)`；
  子模块 `git -C rex-harness diff --stat f143b9f...48bbe7a` → `3 files changed, 57 insertions(+)`
- 规格来源：`docs/adr/0002-portable-engineering-standard-rules.md` + `docs/plans/2026-10-22-portable-standard-rules-delivery-ticket.json#work-config-surface`（C0–C7）
- 标准来源：`rex-harness/skill-sources/rex-engineering-standards/SKILL.md`（第 0 步先加载，已执行）+ 本仓库 `AGENTS.md` Coding Style / 目录预算节
- **verdict: `incomplete`**（不是 blocked：缺口全部可在本工作项内补齐，无需重开落点裁决）

## Standards

硬违规 3 条，判断性 2 条。

1. **hard｜注释与代码矛盾（§3 DRY：同一知识点两处表示且互斥）**
   位置：`rex-harness/src/domain/quantitative-rules.mjs:31` 声明「项目侧只允许覆盖这三类字段；其余键视为契约外，由解析方拒绝而不是忽略」。
   证据：实测 `quantitativeRuleBudget("fileLines", { "fileLines.nonsense": 99 })` → 返回 `400`，无错误无警告。函数体只读 `${ruleId}.budget`，其余键静默丢弃。
   修复：解析入口对未知键返回结构化错误（同时满足 C3），并把这条行为写成测试。

2. **hard｜一条规则两个 owner（§1 边界 / §3 正交性；ADR 0002 立意的原缺陷）**
   位置：`scripts/check-dir-budget.mjs:11` `export const DEFAULT_BUDGET = 8;`
   证据：子模块清单同一数字在 `QUANTITATIVE_STANDARD_RULES.directoryEntries.budget`；父侧未 import 公开面（`grep -n "index.mjs\|QUANTITATIVE" scripts/check-dir-budget.mjs` 无命中）。
   修复：父侧改从公开面读数（C2），契约测试逐项比对（C1）。

3. **hard｜核心分支无测试担保（§5 测试基线）**
   位置：`scripts/tests/tooling/standards/rule-config.test.mjs`
   证据：全文件只断言清单形状与两个数字；`quantitativeRuleBudget()` 的抛错分支（未知 ruleId、非正整数覆盖）零覆盖，实测未拒未知键也无测试发现。
   修复：补三条断言（未知 ruleId 抛、非法 budget 抛、合法覆盖返回覆盖值）。

4. **judgement｜Speculative Generality（Fowler）**
   位置：`quantitative-rules.mjs:28` `'fileLines.exemptions'`
   证据：无任何代码路径读取该键（上条实测打印）。为尚未出现的项目侧配置提前开面。
   修复：引擎落地前删掉，或改由 `resolveExemptions()` 唯一消费。

5. **judgement｜Duplicated Code / Shotgun Surgery（Fowler）**
   位置：`quantitative-rules.mjs:12` `measure: 'git tracked files grouped by their containing directory'`
   证据：真正的度量口径活在 `check-dir-budget.mjs` 的 `git ls-files` 行为里；两处一致靠人肉记忆。
   修复：要么让清单文本成为唯一口径并由引擎读取，要么删字段；并按 C5 写非 git 目录降级说明。

12 条 smell 基线逐条结论：Duplicated Code 见 5/2；Speculative Generality 见 4；Shotgun Surgery 见 5（新增一条规则需同时改清单与父常量）；Primitive Obsession 轻度（覆盖键为扁平字符串，见 1 的修复会收敛）；Mysterious Name、Feature Envy、Data Clumps、Repeated Switches、Divergent Change、Message Chains、Middle Man、Refused Bequest **未见**。§4 文件粒度：两个新文件 44 / 24 行，kebab-case，名实相符，无超预算 → 通过。

## Spec

对照 C0–C7：**达成 C4、C6、C7（不适用）；未达成 C0（部分）、C1、C2、C3、C5。**

- **C1 未达成（规格缺口，非实现瑕疵）**：工单原文「父侧读到的默认值与子模块清单逐项相等，不一致即红灯」。现有测试断言的是清单自身字面值 8/400，**没有与父侧读到的值比对**，因此父常量改成 9 也不会变红——这条测试给了假安心，必须改。
- **C2 未达成**：原文「父仓库消费该清单，不在父侧二次实现任何预算语义」；`check-dir-budget.mjs:11` 就是二次实现。
- **C3 未达成**：原文「解析器对未知键、缺 reason 的 exempt、非法预算值返回结构化错误而不是静默忽略」。项目侧配置解析器**不存在**；非法预算值仅有 `quantitativeRuleBudget` 内的正整数检查（有错误但无测试），未知键与缺 reason 的 exempt 完全未实现。
- **C5 未达成**：无任何文档写明「无 git tracked-file 列表时的行为」与非 git 目录降级口径。
- **未被规格要求的行为（scope creep）一处**：`QUANTITATIVE_RULE_OVERRIDE_KEYS` 提前声明了 `fileLines.exemptions`（Standards 轴第 4 条同源）。
- **实现有误的需求**：C0「默认预算的单一权威在子模块」在子模块侧成立，但在父侧被 `DEFAULT_BUDGET` 反驳——同一数字仍有两个 owner，即 ADR 0002 认定要消灭的缺陷本身。

汇总：Standards 轴 5 条发现（硬 3 / 判断 2），最严重为第 2 条（一条规则两个 owner，正是本需求立项理由）。Spec 轴 5 条未达成（C1/C2/C3/C5 + 一处 scope creep），最严重为 C1（契约测试给了假安心，会让后续切片误以为单一权威已担保）。下一 Command 应在本工作项内补 C1/C2/C3/C5，不回退落点。
