# 测试范围契约：portable-standard-rules（第一前沿切片）

> 当前 Command：`software.testing.design` / stage `design-tests` / provider `rex-test-design`
> activationId `3ef3d048-bb58-4886-b88c-5401163ebe05`
> 上游：`docs/plans/2026-10-22-portable-standard-rules-plan.md`、`docs/adr/0002-portable-engineering-standard-rules.md`
> 范围：本契约只覆盖 frontier 上两条 ready 工单（`work-config-surface`、`work-delivery-guarantee`）。
> 其余工单各自进入 test-design 时另立契约，不借这一份直接进入 TDD。

## 用户目标

让"目录 8 项 / 单文件 ~400 行 / 重复片段 / 依赖方向"这些工程标准，在**任何装了 AIOS 的仓库**里
都能用一条命令拿到可判定的红灯，并且规范文本真的送达客户端（而不是只在子模块源里存在）。

## 明确非目标

- 不判定语义质量（薄转发、模块是否够深）——归 Provider 与 review 轴。
- 不引入项目自有 lint/pre-commit 平行规范（标准 §6）。
- 不在本切片实现依赖方向门（`work-layer-gate`，第二个切片）。
- 不 push 子模块、不发 0.12.0（用户已定：制作完毕且验证通过后才走发版流程）。

## 范围内行为（可观察）

| # | 行为 | 判定方式 |
|---|---|---|
| B1 | 默认预算有**单一权威**：子模块规则清单提供目录 8 / 单文件 400 / 重复阈值 | 从公开面读到清单；父侧默认值逐项相等，不等即测试红 |
| B2 | 项目侧配置只声明覆盖项与豁免理由 | 未知键、缺 `reason` 的 exempt、非法预算值 → 结构化错误对象，不是静默忽略，不是 throw 字符串 |
| B3 | 送达状态可机读 | 投影 `packageVersion` 与安装运行时 rex-harness 版本一致；不一致条数可被 doctor 报告 |
| B4 | Provider wiring 有担保 | 存在测试：把任一 code-producing Provider 的第 0 步"先加载 rex-engineering-standards"删掉即变红 |

## 范围外（本切片不测）

度量算法精度、重复检测的召回率、非 JS/TS 的 AST 覆盖、外部仓库真实接入（`work-external-proof` 的前置未满足）。

## 允许的测试缝（优先公共入口）

1. **子模块公开面** `rex-harness/src/index.mjs` 的导出（清单与引擎的纯函数形态）——第一优先。
2. **子模块 CLI 进程调用**（`bin/rex-harness.mjs`，落点边界允许的唯一非 import 通路）。
3. 父仓库 `aios` 适配层的**转发计划**（纯函数：输入 rootDir/配置 → 输出将执行的调用），不测真实子进程。
4. 仅当上面三条无法隔离风险时才用更窄的缝：投影 marker 的文件内容解析（`.rex-projection.json`）。

禁止的缝：为了测试而 deep import `rex-harness/src/**` 内部模块（违反公开面契约，且正是历史上出过的缺陷形态）。

## 度量口径（本契约纠正的一处测量错误）

送达漂移**只按**「客户端投影 ↔ 安装运行时 `skill-sources`」比较，且分两类报数：

```
SKILL.md 漂移（用户会读到错的那一份）    30 条 = 6 技能 × 5 客户端
  rex-code-review, rex-design, rex-engineering-standards,
  rex-implement, rex-refactor-hardening, rex-requirements
仅附属物漂移（evals/ references）        15 条
完全一致                                 21 条      合计检查 66 条
```

不得把「安装运行时 ↔ 仓库子模块 checkout」之间的差异（`evals/evals.json`、部分 `references/` 在发布归档里被加工过）
计入送达漂移——我第一版审计就是这么算的，于是得到 45/66 这个混入了 15 条无关项的数。
生成器是 `fs.cpSync` 原样拷贝（`rex-harness/src/clients/install.mjs:275`），所以投影对安装源码的比较是干净口径。

## 完成判据

- B1–B4 各有一条可运行测试，且 B1/B3/B4 至少各有一个**反例 fixture**（能证明测试会红）。
- B3 的报数按上面口径输出，`work-delivery-guarantee` 的验收目标从"45→0"改写为
  **"SKILL.md 漂移 30→0，附属物漂移单独报数不作通过条件"**。
- 现有测试（`dir-budget.test.mjs`、`planning-artifact`/`review-verdict` 契约测试）保持全绿，作为回归底线。

## honest-red 候选（今天就是红的客观事实，不是为反而反）

1. 父侧不存在"默认预算 == 子模块清单"的契约测试 → B1 现在无从判定（新增即红）。
2. `grep engineering-standards scripts/tests rex-harness/tests` = 0 命中 → B4 现在无任何担保（新增即红）。
3. 66 条投影里 30 条 `SKILL.md` 与安装源码不一致，其中 `rex-code-review` 缺第 0 步 → B3 现在就是红。

## acceptance-test mapping（ADR 0002 六条验收 → 测试）

| ADR 验收 | 覆盖它的测试 | 本切片是否覆盖 |
|---|---|---|
| #1 非 AIOS 仓库一条命令 | 配置解析 + 清单默认值单测（B1/B2）；端到端属 `work-cli-surface` 之后 | 部分（契约层先行） |
| #2 超预算即红、拆小即绿 | 需要引擎与 CLI → 属 `work-budget-engine`/`work-cli-surface` 的 TDD 切片 | 否（不在本前沿） |
| #3 存量自动进 baseline | 同上（三处置逻辑） | 否 |
| #4 分层 SKIP/红灯 | `work-layer-gate` 自有 test-design | 否 |
| #5 CI 接入无副本 | `work-cli-surface` 的退出码契约测试 | 否 |
| #6 送达可验 | B3 + B4 | **是** |

## test seam recorded

主缝 = 子模块公开面导出（清单 + 预算解析纯函数）；辅缝 = marker 文件解析（仅用于 B3 漂移报数）。
本切片不新增窄缝，不新增第二条命令入口。

## 第二轮范围（审查未完成项 C1/C2/C3/C5）

来源：`docs/plans/2026-10-22-portable-standard-rules-review-config-surface.md`（verdict incomplete）。

| 标准 | 行为性质 | 测试缝 | 断言 |
|---|---|---|---|
| C3 未知键 / 缺 reason 的 exempt / 非法预算 → 结构化错误 | **新用户可观察行为**（第一轮无解析器，实测未知键被静默忽略） | 子模块公开面 `resolveStandardConfig()` | 返回 `{ ok:false, errors:[{code,path,message}] }`，三种输入各命中一条 code；合法输入返回合并后的预算 |
| C1 父侧读到的默认值与清单逐项相等 | 担保测试（当前两侧同为 8，不产生红；作用是让父侧改数即红） | 父侧 `scripts/check-dir-budget.mjs` 导出的 `DEFAULT_BUDGET` ↔ 公开面清单 | `equal(parent.DEFAULT_BUDGET, manifest.directoryEntries.budget)` |
| C2 父侧不二次实现预算语义 | 担保测试 | 同上 + 父侧从公开面读数 | 独立字面量 8 从父侧消失，值由清单提供 |
| C5 无 git tracked-file 列表时的行为 | 不可观察（文档验收） | 无 | 记为文档缺口，不伪造测试 |

诚实 RED 只登记 C3：C1/C2 两侧数值本就相同，若把它们写成"红"就是把字面断言当行为差异。

## 第三轮范围（关闭 round-2 的 changes-requested）

| 项 | 行为性质 | 缝 | 断言 |
|---|---|---|---|
| S4-R2-2 豁免结构分支 | **behavior-preserving-hardening**：代码已有分支与文案，缺的是担保，不新增用户可观察行为 | 子模块 `tests/domain/standard-config.test.mjs` | `exemptions.fileLines` 不是数组 → missing-reason 且 path 指到 `exemptions.fileLines`；条目缺 path → missing-reason 且 path 为 `exemptions.fileLines[0]` |
| S4-R2-3 码语义声明 | 文档契约（不可测） | `ADR 0002` 度量口径节 | 写明 missing-reason 覆盖「豁免条目整体不成立（缺 path / 列表形状错）」，不新增第四个码 |

基线（加断言前必须真实通过）：`node --test rex-harness/tests/domain/standard-config.test.mjs`，5 条用例全绿。
本轮不产生诚实 RED：若把已有行为写成"新行为"就是伪造差异；因此按 hardening 分流，Rex 应选加固验证而非 TDD。
