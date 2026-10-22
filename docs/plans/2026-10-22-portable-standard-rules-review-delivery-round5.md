# Review — work-delivery-guarantee 第五轮（C4 doctor 机读投影状态 + C6 升级重生归属）

fixed-point `6419ffc3`。差异：`git diff --numstat 6419ffc3..HEAD`，父仓库
`scripts/lib/environment/doctor/aggregate.mjs`、`aggregate/projection-drift-gate.mjs`（新）、
`scripts/lib/clients/rex-harness/projection-drift.mjs`、`scripts/aios-projection-drift.mjs`、
`scripts/lib/execution/lifecycle/setup/self-update.mjs`、三个测试文件、`scripts/test-suites.json`、文档。
规格：`delivery-ticket.json#work-delivery-guarantee`（11 条）。标准：`rex-engineering-standards`（第 0 步已加载）。

## Standards（hard 2 / judgement 1）

两条 hard 都是**我本轮自己制造、本轮自己发现并当场删掉**的，写在这里是为了让下一个人不重犯：

1. **hard（已在同一轮消除）｜第二条自动重生路径 = 一条规则两个 owner。**
   我按工单字面"aios update 会重生投影"在 `updateHarnessRuntime` 里加了 `refreshProjectProjections`，
   随后核对调用方时发现 `runUpdate` 早已在 `skills` 组件里调 `installRexClientProjections`
   （`update.mjs:268`，且 `update.mjs` 有显式 `projectRoot`，默认 components 含 skills）。
   我加的那条不仅重复，还更差：项目根靠 `projectRoot = process.cwd()` 隐式取，而 `updateHarnessRuntime`
   体内会调 `ensureWorkingDirectoryOutsideInstallTree` → `process.chdir(HOME)`。今天它侥幸正确
   （默认参数在函数体之前求值），一旦有人把重生挪进那个三元分支里，升级就会去重生 `$HOME` 的投影，
   并且不会有任何测试变红。处置：删除该路径与其 3 个测试，`self-update.mjs` 回到本轮之前的形状；
   C6 的担保改成正解——守卫既有路径的**时序**（runtime → projections）与**参数**（projectRoot 是调用方的），
   用 `runUpdate` 已有的 `deps` 接缝驱动，不靠 grep。
2. **hard（已消除）｜"重生命令"有三个 owner。** 漂移 CLI、doctor 的 fix 行、refresh 模块各拼一遍。
   收敛为 `projectionRegenCommand()`（放在拥有"投影"这条知识的 projection-drift 模块），
   并把担保写成两个消费者**各自产出命令再逐字相等**，而不是数字符出现次数。
3. judgement｜`aggregate.mjs` 已超文件预算，门实现拆到 `aggregate/projection-drift-gate.mjs`
   （与同目录 `reporting.mjs`、`native-only.mjs` 同惯例）✓ 已做。

12 条 smell：Duplicated Code 见第 1、2 条（都是新增的，非遗留）；Feature Envy/Middle Man 未见；
`inspectProjectionDelivery` 返回 `{counts, drifted, checked, line, fix, note?}` 的键略杂，
留待 work-budget-engine 与门输出契约一起收口。

## Spec（hard 0 / judgement 2）

4. judgement｜C4 达成但语义补了一处本轮才发现的真问题：`checked=0` 有两种相反含义——
   "这项目没投过影"（无义务，ok）与"项目有副本而安装侧没有源"（没测，warn + `Repair:`）。
   只看 `checked===0` 会对不使用 rex 的项目报噪（`aios-doctor.test.mjs` 既有的 `effective_warn=2`
   就是第一个受害者），改为按"项目里是否存在注册表投影目录"判定；两面都有测试钉住。
5. judgement｜工单 11 条**全部达成**，逐条：
   (1) 子模块自有 wiring 测试 ✓ `rex-harness/tests/skills/standards-provider-wiring.test.mjs` 4/4，
   且反向验证过"删第 0 步"与"把第 0 步挪到正文之后"都会变红；
   (2) 升级重生与 doctor 报告落父仓库 ✓ 均在 adapter 层，子模块公开面未被挪用；
   (3) 子模块批量一次 release、指针独立提交 ✓ 本项子模块只有 `cab9105`、`e402bff` 两个提交，指针各自成提交；
   (4) SKILL.md 送达漂移 30→0 ✓ 真实仓库 `skillDrift=0`，`checked` 66→153（分母变大不是变小）；
   仅附属物差异单独报数、不作通过条件 ✓ 本轮连定级也不参与；
   (5) doctor 机读 ✓ `note: skillDrift=… attachmentDrift=… unmanaged=… checked=…`，fix 里给可执行命令；
   (6) wiring 测试存在 ✓ 同 (1)；
   (7) 升级路径重生投影 ✓ 由既有 `runUpdate` skills 组件承担，本轮补上时序与参数担保；
   (8) 不把发布归档加工差异计入送达漂移 ✓ 度量取安装侧 `skill-sources`，与子模块 checkout 分开报数；
   (9) 审计从 `.aios/tmp` 提升为受版本控制工具与测试 ✓ `scripts/aios-projection-drift.mjs` + 3 个测试文件已入 `test-suites.json`；
   (10) 覆盖面取自注册表全集 ✓ `clientSkillRootDirs()`，并有"默认面 == 注册表全集"的交叉检查（反向验证过它会红）；
   (11) unmanaged 以源侧目录名为权威 ✓ 不再用 `rex-` 前缀。
   因此 **work-delivery-guarantee 关闭**；整个 work item `portable-standard-rules` 仍 open
   （work-budget-engine / CLI / 自我消费 / 依赖方向 / 外部证明 / DRY 六项未做），`completionClaim` 保持 soft。

验证证据：RED `receipt:914f5d5a`（5 tests / 4 fail，退出 1）；GREEN `receipt:e5002dd0`（退出 0）；
本轮纠正后的复测 `receipt:1865c148`（退出 0）；邻域 77/77（含未被改动的 `aios-doctor.test.mjs`）；
接线门 6/6；dir-budget `0 blocking`；真实仓库 `checked=153 skillDrift=0 unmanaged=6`；
`npm run test:affected` → 2282 tests / 2273 pass / 0 fail / 9 skipped。

verdict：`pass`（本轮差异无遗留硬违规；第 1、2 条 hard 在同一轮内已消除并留下守卫）。
