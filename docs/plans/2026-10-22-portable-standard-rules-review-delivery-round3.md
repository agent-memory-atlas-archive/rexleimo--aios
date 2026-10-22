# Review — work-delivery-guarantee 第三轮（wiring 担保 C0/C5）

fixed-point `1cd5a942`；父侧 `git diff --stat 1cd5a942...HEAD` 非空（含 `3c670274`、`41db8fcc` 与本轮文档提交），
子模块 `1a1cd75..cab9105` = CHANGELOG +6、`src/clients/install.mjs` +10、`src/index.mjs` +6/-1、
`tests/skills/standards-provider-wiring.test.mjs` +54/-0。
规格：工单 C0/C5/C8 + V0/V1。标准：`rex-engineering-standards`（第 0 步已加载）。

## Standards（hard 2 / judgement 3）

1. **hard｜送达担保依赖 cwd**。`scripts/tests/tooling/contracts/rex-standards-wiring.test.mjs`
   用 `process.cwd()` 拼 `REX_PACKAGE`，再动态 import 公开面。从仓库根跑就绿，从别处跑就红——
   而 CI 固定在根目录，所以这种脆弱是静默的。同仓库的适配器与测试都用静态相对导入
   （`../../../../rex-harness/src/index.mjs`），公开面入口不变，去掉 cwd 依赖即可。
2. **hard｜测试自己抄了一份标准技能名**。同一文件里 `const STANDARDS = 'rex-engineering-standards'`，
   而本轮刚刚把登记表放到公开面（`sharedReferenceSkillIds` / `standardsReferenceConsumers`）就是为了
   不让任何人再抄一份名单。修复：断言用 `sharedReferenceSkillIds[0]`，字面量只留在被担保的数据里。
3. judgement｜担保覆盖面是单客户端。只测了 `codex` 一条投影链；`supportedClients()` 有 10 个。
   与漂移工具（全客户端根）并列时合计覆盖足够，但送达加工若只发生在某客户端就会漏。
   修复：外层循环 `supportedClients()`，代价是运行时长。
4. judgement｜`assert.deepEqual([...sharedReferenceSkillIds], ['rex-engineering-standards'])`
   把"一个元素"钉死。将来加第二个共享参照技能会因形状而非语义变红。改为断言包含关系更诚实。
5. judgement｜父测试为取一个返回值把同步 API 包成 Promise（`new Promise((resolve,reject)=>…)`），
   属无信息中间层，直接调用即可。

12 条 smell：Duplicated Code 见第 2 条；Middle Man 见第 5 条；Speculative Generality 未见
（新导出的登记表有真实消费者——两处担保都读它）；其余 9 条未见。§4 文件粒度：新增 54 / 42 行，
命名与仓库一致，均通过。

## Spec（hard 1 / judgement 2）

6. **hard｜工作项仍未完成**：C4（doctor 机读漂移 + unmanaged 数）与 C6（`aios update` 重生投影）没有实现，
   grep 实测仍为零命中。本项 `completionClaim` 必须保持 soft。
7. judgement｜C0 达成且**可证伪**：两次反向验证（删第 0 步 → 存在性红；把第 0 步挪到正文之后 → 位置红），
   并且当场修掉一条自我实现断言（`firstHeadingAt` 原本从 reference 之后开始找，位置判断恒真）。
   这条最值得留下：先写出来的担保其实是假的，靠反向验证才暴露。
8. judgement｜C5 的"逐字节送达"是对的方向——源侧绿不等于客户端读到绿，本仓库正是靠这条口径才发现 30 条漂移；
   V0/V1 已达成。修好第 1、2 条后本项才算立得住。

verdict：`changes-requested`。类型化裁决见 `...-review-delivery-round3.json`。
