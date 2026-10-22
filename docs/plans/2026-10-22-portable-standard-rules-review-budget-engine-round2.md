# Review — work-budget-engine 第二轮（行数这条规则回到一个 owner）

fixed-point `52244f7a`。差异：父仓库 `777a9621`（governance 接进引擎 + 新测试 + 一处措辞断言）
与 `24cc9306`（处置改单次有序查表）。子模块本轮未动。
规格：`delivery-ticket.json#work-budget-engine` 第 4 条 + 上一轮审查的 `SP-R9-1`。
标准：`rex-engineering-standards`（第 0 步已加载）。

## Standards（hard 0 / judgement 3）

1. judgement｜`failures[]` 这个字段名现在会说谎：`baseline` 的说明也被 push 进 `failures`，
   而该条 `status` 仍是 OK。判定结果是对的（`status` 只由"预算被突破"与"结构性缺失"决定），
   但读 `failures` 的消费者会把存量冻结当成错误。修法：基线说明只进 `detail`，`failures` 留给真失败。
2. judgement｜`countSourceLines` 保留为引擎度量的别名导出，但它**语义变了**（旧：先 `trim()`；
   新：physical lines）。实测旧语义唯一的差异来源是首尾空行；仓库内除那条测试断言外无其它消费者
   （`grep countSourceLines` 只命中 governance 与一个同名局部函数）。留着别名是为了不破既有导入，
   但它应当在下一次触碰该文件时删掉——兼容别名没有到期日就会变成新的第二条。
3. judgement｜**又找到第三套私有行数计数**：`scripts/tests/tooling/runtime-probe/platform-smoke.test.mjs`
   自己写了 `countSourceLines(source)` 并配一条 `<= 40` 的行数预算。这是同一条规则在本仓库的第三个 owner，
   且它不在我这轮的验收范围内（那是 work-dup-metric 的活），所以我只登记不顺手改——顺手改会把
   "消一条重复"变成"重排三个测试文件的职责"。

12 条 smell：Duplicated Code 见第 3 条；`Feature Envy` 已消（governance 不再自己数行）；
`Primitive Obsession` 轻微（`disposition` 是字符串而非闭集常量，引擎侧已有 `byDisposition` 键序可依赖）。

## Spec（hard 0 / judgement 3）

4. judgement｜**SP-R9-1 关闭**：行数度量与超标判定唯一来自 `measureFileLines` + `applyBudgetRule`，
   豁免与存量唯一来源是 `config/standards.json`。裁决**先量后选**：50 条既有规则上两种定义计数
   一字不差（0 条差异），所以这条 owner 从未产出过不同数字。迁移后判定集合逐字不变：
   `47 pass / 3 violation`（`cli-top-level-parser-facade 300>80`、`doctor-aggregate-facade 467>320`、
   `lifecycle-orchestrate-facade 417>320`）。`missing entrypoint` / `missing modules` 留在 governance，
   它们是结构事实不是预算——把它们塞进预算引擎会把一次有界修复扩成新抽象。
5. judgement｜本项 9 条验收全部达成 → **work-budget-engine 关闭**（清单：引擎在子模块 ✓、默认值读清单 ✓、
   EXEMPT/BASELINE 变配置输入 ✓ 26 条已迁、两度量共用处置 ✓ 见第 4 条、既有 dir-budget 测试全绿且断言未改 ✓、
   引擎输出无宿主路径 ✓、回退点未触发 ✓、C7 调用方定根 ✓、C8 SKIP ✓）。
6. judgement｜**挖到一条比本轮改动更重要的事实**：`quality:architecture` 这道门没有任何自动化路径会执行它
   （`package.json` 无 quality 脚本、`ci-main.yml` 不跑、`release-preflight.sh` 不跑），
   所以上面那 3 条超标长期存在而无人可见。我没有顺手接线：接进 CI 会让这 3 条立刻变红灯，
   而"修它 / 冻结存量 / 只留可见性"是需要用户定的存量处置（本轮已把 300/467/417 逐条列出）。
   另注：本轮我**故意没有**给它们登记 baselines，否则就是静默赦免。

verdict：`pass`。证据：RED `receipt:49eed7ab`（4 tests / pass 1 / fail 3，退出 1）、
GREEN `receipt:d43865bc`、重构 `receipt:a3444f90`、邻域 144/144、
`npm run test:regression` → 236 files / **0 fail** / 9 skipped（453s）。
自曝一处：第一次提交的 testability JSON 把 RED 写成 "pass 1 / fail 4"，与总数 4 自相矛盾；
按 receipt 输出重读后改正为 pass 1 / fail 3 并在 test-scope 里留了痕。
