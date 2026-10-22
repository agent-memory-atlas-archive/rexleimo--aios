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

## work-delivery-guarantee 范围（投影送达可观察化）

干净口径：**客户端投影目录 ↔ 安装运行时 `rex-harness/skill-sources`**（生成器是 `fs.cpSync` 原样拷贝，
所以内容差异只能来自"没重生"，不能来自发布加工——C8 的根据）。安装态布局实测：
`~/.rexcil/aios/rex-harness/src/index.mjs` 与 `scripts/` 同级，存在 ✓。

| 标准 | 行为性质 | 缝 | 断言 |
|---|---|---|---|
| C3/C4 漂移可机读 | **新用户可观察行为**（当前无任何 projection 检查，审计脚本还躺在 `.aios/tmp`） | 新 CLI `node scripts/aios-projection-drift.mjs --json --install-root <dir> --repo-root <dir>` | 输出 `{ checked, skillDrift, attachmentDrift, entries[] }`；`--fail-on-drift` 时 skillDrift>0 → 退出 1；根目录由调用方给，不固定为脚本自身仓库（吸收 work-config-surface 的 C7 教训） |
| C3 本机归零 | 证据（不可作 fixture 断言） | 同上，真实安装根 | 重生前后各跑一次：30 → 0，附属物差异单独报数 |
| C5/C0 wiring 担保 | 担保测试（源码已有第 0 步，今天不产生红） | 子模块 `tests/skills/standards-provider-wiring.test.mjs` | 逐个 code-producing Provider 的 `skill-sources/**/SKILL.md` 含"第 0 步先加载 rex-engineering-standards"；删掉即红 |
| C5 送达担保 | 担保测试 | 父侧 `scripts/tests/tooling/contracts/rex-standards-wiring.test.mjs` | 客户端实际读的投影里也含第 0 步（源侧绿不等于送达绿——本轮立项的直接原因） |
| C1/C6 升级重生 | 新行为 | `scripts/lib/execution/lifecycle/setup/self-update.mjs` 的既有依赖注入缝 | update 成功后调用投影重生；init 路径已有（`aios-init.mjs:97`），update 路径实测 grep 零命中 |
| C4 doctor | 新行为 | `scripts/lib/environment/doctor/aggregate.mjs` 的 `doctor:rex-*` gate | 新增 check，note 内含 `skillDrift=<n>` 与重生命令 |

诚实 RED 只登记机读漂移这一条。测试文件不得依赖本机安装：用 fixture 双根目录，真实安装只作为额外证据。

### 送达证据（真实安装态，工具产出）

重生前：`checked=66 skillDrift=30 attachmentDrift=15`，生成版本 `0.5.0, 0.5.1, 0.7.0`（安装运行时 rex-harness 0.11.1）。
重生后（当时覆盖面仍是硬编码 5 个根）：`checked=81 skillDrift=0 attachmentDrift=15`。
覆盖面改为注册表全集后的**最终口径**：`checked=153 skillDrift=0 attachmentDrift=35 unmanaged=6`。
前一组数字（包拮 85/15/4 那一次）只覆盖部分表面，不能当验收结论：68 个条目当时对报告不可见（审查 S4-R4-1）。

- `skillDrift` 30 → 0 ✓（C3 达成，口径 = 投影 ↔ 安装运行时 skill-sources）
- `checked` 66 → 81：重生把缺失的 rex workflow skill 补齐进来，被检查面变大而非变小——归零不是在缩分母
- `attachmentDrift` 仍 15：只有 evals/references 差异，按 C8 单独报数，不作通过条件
- **口径边界（refactor 阶段自曝）**：只量 marker 覆盖面会把"零漂移"说满。安装器对
  `unmanaged-target-differs` 的条目保留原文且不写 marker，于是客户端真正在读的旧副本不在度量里。
  实测例：`.agents/skills/rex-tdd/` 无 marker（`UNMARKED`），而 `.codex/skills/rex-tdd/` 有并被计入。
  故工具新增 `unmanaged`（无 marker 的 `rex-*` 目录）：单独报数，**不计入 skillDrift，也不触发
  `--fail-on-drift`**——覆盖人管文件是人的决定，不是门的决定。

## 第五轮范围（关闭 delivery 第一轮审查的 S4-R4-1 / S4-R4-2）

| 标准 | 行为性质 | 缝 | 断言 |
|---|---|---|---|
| C9 度量面 = 注册表全集 | **新用户可观察行为**（今天注册表 9 个根，工具只看 5 个；实测 `checked` 85 vs 153） | `collectProjectionDrift()` 默认覆盖面（不传 clients） | fixture 在 `.claude`（旧清单内）与 `.opencode`（旧清单外）各放一条带 marker 的投影 → 默认口径必须 `checked=2`；且默认口径结果 == 显式传注册表全集的结果 |
| C10 归属由源侧目录名决定 | **新用户可观察行为**（今天用 `/^rex-/` 前缀猜） | 同上 `unmanaged` 计数 | fixture 源侧存在 `helper-ui/`，投影侧同名目录存在但无 marker → 计入 unmanaged；同时源侧不存在的自有技能（`my-own-skill`）不得计入 |

诚实 RED 两条都是行为差异，不用字面断言凑数。本轮不新增 CLI 参数：覆盖面来自注册表就是默认行为，`--clients` 之类的覆盖留给以后有真实需求时再加（§2 反对预留参数）。

## 第六轮范围（C0 / C5：wiring 担保）

| 标准 | 行为性质 | 缝 | 断言 |
|---|---|---|---|
| C0 源侧担保 | **behavior-preserving-hardening**：第 0 步自 0.8.0 就在源码里，缺的是担保不是行为 | 子模块 `tests/skills/standards-provider-wiring.test.mjs`，名单取自公开面 `standardsReferenceConsumers`（测试不抄第二份名单） | 登记表里每个 Provider：① 是 bundled provider；② 提到 `rex-engineering-standards`；③ 位置在正文首个 `##`/`###` 之前；④ 空表变红 |
| C5 送达担保 | 同上 | 父侧 `scripts/tests/tooling/contracts/rex-standards-wiring.test.mjs`（工单 V0 指定的文件名） | 经公开面 `installClientProjection` 落到临时项目根后，每个 Provider 的 SKILL.md 与源侧**逐字节相同**且仍含标准引用 |

基线（加担保前的真实通过）：`node --test scripts/tests/clients/projection-delivery/projection-drift.test.mjs rex-harness/tests/skills/skill-sources.test.mjs` → 14/14，退出 0（`receipt:83c6e2ee`）。
两条反向验证（子代理式自证，不是嘴上说绿）：删掉 rex-code-review 的第 0 步 → 4 条里 1 红，报 "no longer references"；
把第 0 步移到正文之后 → 1 红（位置担保）。两次都还原并复测 4/4；`git status` 确认源文件已回原状。
过程中还纠掉一处自我实现断言：`firstHeadingAt` 原本从 reference 之后开始找，使 `referenceAt < firstHeadingAt` 恒真。

### wiring 加固的不变式复核（verify-invariants）

| 不变式 | 核对方式 | 实测 |
|---|---|---|
| 生产逻辑未改 | `git -C rex-harness diff 1a1cd75..cab9105 -- src/ \| grep '^+' \| grep -cE 'function \|if \|return \|=>\|for '` | `0`：src 侧只加了一个冻结常量与一条导出（install.mjs +10，index.mjs +6/-1，-1 是导出块重写） |
| 未删未弱化既有用例 | `--numstat -- tests/` 去掉新文件后 | 空——只新增 `standards-provider-wiring.test.mjs`（+54/-0） |
| 担保真的会咬 | 两次反向验证后还原 | 删第 0 步 → 1 红（no longer references）；把第 0 步移到正文之后 → 1 红（位置）；还原后 4/4 |
| 未把假安心带进去 | 自查过程中发现并当场修掉 | `firstHeadingAt` 原先从 reference 之后开始找，使位置断言恒真；改为从文件开头找之后，位置反向验证才会红 |
| 全量未退 | 子模块 `npm test` / 父侧四套合跑 / 接线门 / 目录预算 | 231/231；19/19（`receipt:736a40d7`）；wiring gate 6/6；`0 blocking` |

## 第七轮范围（关闭 wiring 审查的 5 条发现）

无新增用户可观察行为，全部是担保自身的加固；因此按 hardening 分流，基线用上一轮留下的
`receipt:736a40d7`（14/14，退出 0，命令逐字一致）。

| 发现 | 处置 | 复测证据 |
|---|---|---|
| S4-R6-1 cwd 依赖 | 公开面改为静态相对导入 `../../../../rex-harness/src/index.mjs`，源文件路径用 `import.meta.dirname` 解析 | 父侧 12/12 绿；`process.cwd()` 已从该文件消失 |
| S4-R6-2 测试抄名单 | 删掉 `const STANDARDS`，改用公开面 `sharedReferenceSkillIds[0]`；落点映射也只从注册表取 | 同上 |
| S4-R6-3 只测一个客户端 | 外层循环 `supportedClients()`，每客户端一个子用例（10 个） | 12 条用例，1.5s |
| S4-R6-4 元素个数钉死 | 子模块改为断言包含关系 | 子模块 4/4，全量 231/231 |
| S4-R6-5 无信息 Promise 包装 | 去掉，直接调用同步 API | — |
| 追加：手改投影的可见性 | 新增用例：手改已送达投影 → 漂移工具必须记为 skillDrift；且重生**不会**悄悄覆盖手改 | 见下方机制发现 |

### 本轮实测出的安装机制（比原假设更严）

安装器只要发现目标与它自己写过的 `sourceDigest` 不一致，就归为 `unmanaged-target-differs` 并保留原文
——**即使那个 marker 是它自己写的**。所以：一次意外编辑会把文件永久冻结，`aios init` 救不回来；
本仓库 30→0 那批属于"没人改过的旧投影"，因此才会被覆盖。担保据此改写为"手改必须可见"，
而不是"手改会被修好"（后者不成立，也不应当成立）。

### 反向验证（不是嘴上说绿）

- 源侧删掉标准引用 → 父侧 12 条全红、子模块存在性断言 1 红（`no longer references`）；还原 16/16
- 把默认覆盖面临时缩回旧的 5 个根 → 交叉检查 1 红（`both registry client roots must be measured by default`）；还原 6/6
- 顺手抓到一个自己造成的假安心：把选项 `clients` 改名成 `clientSkillRoots` 后，测试仍传旧名会被**静默忽略**并落回默认值，
  于是"默认 == 显式全集"退化成同义反复却照样全绿。第二条反向验证就是为了确认它不再同义反复。
