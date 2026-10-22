# Review — work-budget-engine 第一轮（引擎出宿主）

fixed-point `52d129f1`。差异：子模块 `4dc18b0`（budget-rule.mjs + standard-config baselines + 公开面导出）、
父仓库 `67f609ac` + `52244f7a`（config/standards.json、standards-check.mjs、aios-standards.mjs、
check-dir-budget.mjs 退化为形状适配器、新测试目录 foundation/standards）。
规格：`delivery-ticket.json#work-budget-engine`（9 条）。标准：`rex-engineering-standards`（第 0 步已加载）。

## Standards（hard 0 / judgement 4）

1. judgement｜`evaluateBudgets` 为兼容既有测试保留了 `{dir: reason}` / `{dir: count}` 的**旧形状输入**，
   于是豁免数据在本仓库有两种拼法（对象表与配置数组）。适配层只换形状、不复制判定 ✓，
   但旧形状该有寿命上限：本仓库唯一调用者就是那条测试。建议下一轮把测试改喂配置数组后删除该兼容层。
2. judgement｜`runStandardsRule({config})` 既可传入也可内部 `loadProjectConfig` —— 同一条规则有两个配置来源入口。
   默认值是本命令的便利，不是第二个 owner（判定仍在引擎），但应在 CLI 之外不传 config 的调用点出现第二个真实
   使用者时重新审这条默认。
3. judgement｜清单把 `fileLines` 的豁免类别写成 `['generated','data-driven tables','pure data files']`，
   而 `resolveStandardConfig` 的条目只有 `{path, reason}` ——**类别无法表达**。实测后果：
   `docs-site/assets/vendor/three.module.js`（53044 行）这类 vendored blob 只能逐条手写豁免。
   这是真缺口，但补它要改配置契约（新字段与新错误码），属 work-self-consumer / work-dup-metric 的范围。
4. judgement｜`fileLines` 在本仓库**没有任何 CI 门在跑**（只被命令与引擎测试覆盖）。
   这是有意的：75 个超标文件是存量决定（豁免生成的、基线冻结手写的），不该由我在同一轮替人做完。

12 条 smell：`measureForRule` 抽出后主流程只剩控制流 ✓（Duplicate Code / Complex Function 已消）；
`toEntries` 残留在上一轮提交里，本轮重写适配层时已不存在；其余未见。

## Spec（hard 1 / judgement 2）

5. **hard｜第 4 条验收「目录条目度量与单文件行数度量共用同一处置模型」在仓库范围内尚未成立**：
   `scripts/lib/foundation/architecture/governance.mjs` 至今自带另一套行数判定——
   `countSourceLines()` 先 `trim()` 再按 `/\r?\n/` 切，与清单定义的
   "physical lines in one source file, blank lines count as content" **不是同一个量**；
   `evaluateArchitectureRule` 又自己拿 `maxLines` 比大小生成 failures。
   也就是说本仓库现在有两条"行数超标"的判定与两种行数定义。这正是本需求要消灭的形状，
   而它不在我这轮新增的代码里，所以我没有顺手改：改它要把 `DEFAULT_ARCHITECTURE_RULES` 的
   per-path 预算喂进引擎（引擎目前一条规则一个预算，per-path 覆盖是 `baselines` 形状的邻居，不是同一个东西）。
   下一轮的具体任务：把 governance 接到引擎上，并**先决定行数定义以谁为准**（这是语义裁决，
   会改变现有超标文件的计数），再动代码。
6. judgement｜C7/C8 达成，且达成方式可复核：新测试全在 `git init` 的 fixture 仓库上跑，
   不引用本仓库数字（9 条目目录 → blocking=1、退出 1、root 等于调用方给的目录）；
   非 git 目录 → `status:"skip"` + `reason` + `measured:null` + 退出 0。
7. judgement｜迁移保真是**量出来的**：私有门迁移前后同形（768 → 769 dirs，多的那一个就是本批新增文件本身，
   属于可解释增长）；既有 `dir-budget.test.mjs` **一条断言都没改**仍绿。

verdict：`changes-requested` — 本仓库范围内的第 4 条验收还差 governance 这条并行判定；
其余 8 条达成。证据：RED `receipt:07a4634f`（ERR_MODULE_NOT_FOUND，退出 1）、
引擎 GREEN `receipt:2917db72`、重构复测 `receipt:ddd3bf21` / `receipt:51a97c8f`、
全量回归 `npm run test:regression` 235 files / 2277 pass / **0 fail**。
