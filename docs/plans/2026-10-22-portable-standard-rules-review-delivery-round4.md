# Review — work-delivery-guarantee 第四轮（wiring 担保加固）

fixed-point `0cab76cb`（上一轮审查提交）。差异：父侧 `git diff --numstat 0cab76cb..HEAD`
= `scripts/lib/.../projection-drift.mjs 5/2`、`contracts/rex-standards-wiring.test.mjs 74/25`、
`projection-delivery/projection-drift.test.mjs 1/1`、文档；子模块 `cab9105..e402bff` = 一处断言放宽。
规格：工单 C0/C5/C8 + V0；审查项来源 `...-review-delivery-round3.md`。标准：`rex-engineering-standards`（第 0 步已加载）。

## Standards（hard 0 / judgement 3）

上轮 5 条全部关闭，且都有复测：静态导入公开面（文件内已无 `process.cwd()`）、名单只从公开面取、
循环 `supportedClients()`（10 个客户端 × 4 个 Provider = 40 次逐字节比对，1.5s）、包含关系断言、去掉 Promise 包装。

1. judgement｜同一个"rex-harness 在哪里"用了两种写法：静态 import 说明符 `../../../../rex-harness/src/index.mjs`
   与运行时 `path.resolve(import.meta.dirname, '../../../..', 'rex-harness')`。两处相对路径必须同时正确才绿，
   改一处会另一处悄悄指错。修复：由一处派生（`fileURLToPath(new URL(...))`）后复用。
2. judgement｜`new RegExp(standards, 'u')` 把技能名当正则用。当前名字是字面量安全，但这是巧合：
   技能名含 `.`/`+` 等元字符时断言语义会变松。修复：用 `includes(standards)`，或显式转义。
3. judgement｜`clientSkillRoots` 改名是正确方向（参数确实接受目录名而非客户端 id），但它暴露了旧调用点
   会被**静默忽略**：改名后测试仍传 `clients`，随即落回默认值，"默认 == 注册表全集"的交叉检查当场退化成
   同义反复而全绿。已把调用点改为新名，并用反向验证证明它不再同义反复。契约面：以后凡是"未知选项回落默认"
   的 API，都该拒绝未知键（与 `resolveStandardConfig` 同一原则），这条留给 work-budget-engine 一并处理。

12 条 smell：Duplicated Code 见第 1 条；Primitive Obsession 见第 2 条（用正则承担字符串包含）；
Middle Man 已消除（Promise 包装删除）；其余 9 条未见。§4 文件粒度：父侧担保 92 行、子模块 56 行 ✓。

## Spec（hard 1 / judgement 1）

4. **hard｜C4 与 C6 仍未实现**：doctor 没有机读漂移与 unmanaged 数（grep 零命中），`aios update` 不重生投影。
   本项 `completionClaim` 必须保持 soft，不得因 C0/C5/C8/V0/V1 已达成而对外声称送达已闭环。
5. judgement｜本轮新增了一条比假设更严的事实并已入档：目标字节与自己记录的 `sourceDigest` 不一致时，
   安装器归为 `unmanaged-target-differs` 保留原文，**即使 marker 是它自己写的**——所以意外编辑会永久冻结该文件。
   担保据此改为"手改必须可见"（drift 里出现 skillDrift=true），而不是"重生日会修好手改"。

verdict：本轮差异 `pass`（0 硬违规），工作项因第 4 条继续 open。类型化裁决见 `...-review-delivery-round4.json`。
