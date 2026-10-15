---
title: "v6.4.0：一个不再靠猜的控制平面——账本不许分叉、拒绝即功能、门禁跑在它声称的地方"
description: "v6.4.0 把三件事钉死：计划账本不再因重复登记而分叉（A21–A23）、CLI 面对写请求不再悄悄换成只读视图（A19）、声明了的检查真的在 CI 里跑（A20 + 目录预算 + 受影响测试）。同一版本落地 mattpocock/skills v1.3 三件套的双面采纳（retro / implement-spec / pr），并按授权删除了零引用的死 barrel（A16）。"
date: 2026-10-15
tags: ["AIOS", "v6.4.0", "plan", "workflow", "skills", "gates", "release"]
---

# v6.4.0：一个不再靠猜的控制平面——账本不许分叉、拒绝即功能、门禁跑在它声称的地方

> **TL;DR：** 这版的主题是「不许猜」。计划账本此前可以被重复登记悄悄分叉成两份、只有一个带能力激活；`aios plan` 会对写请求递上一张只读视图还返回 0；声明了的检查（目录预算、技能守卫的受影响测试选择）在磁盘上有、在 CI 里却没跑。v6.4.0 把三类问题各自钉死：A21 让计划轮复用活跃账本，A22 给工作项规范身份，A23 把这个身份一路传进 Capability Command 的绑定；A19 让 CLI 对没实现的子命令直接拒绝而不是替换成 `status`；A20 让训练门禁报出它校验的 base 和每条拒绝的具体补救。同一版本按 ADR 0003 的落点三问双面采纳 mattpocock/skills v1.3：主仓库新增 `retro` 和 `implement-spec`，rex-harness 0.11.0 新增 `rex-implement-spec` / `rex-pr` / `rex-retro` 三个独立面编排 skill——部署面从 14 涨到 17。

## 账本不许分叉（A21 → A22 → A23）

这条线修的是同一个病灶的三次显形：**计划账本以「哪份是活跃的」为准，而重复登记能造出两份。**

A21 先修复用：`workflow-policy.mjs` 此前硬编码「planned 轮必建新账本」，把同一个工作项登记两次（先 `plan start` 再 `plan auto-gate`）就会得到两份只差一个 `-2` 后缀的文档，而只有新的一份带能力激活——于是 `plan task` 和 `plan add-evidence` 这类只作用于活跃账本的命令，会悄悄把第一份变成孤儿。复用的键改成状态事实（存在活跃、未终结的账本），绝不基于目标文本相似度；声明的逃生门是 `plan auto-gate --new-work-item`，`strict` 模式同样复用——strict 的意思是「永远从账本干活」，不是「每轮铸一个新账本」。

A22 再补身份：`plan start --work-item <id>` 给工作项一个规范身份（大小写/空白/标点归一，拒绝 `..`、路径分隔符和控制字符）。身份是**声明**出来的，从不推断——已存在的 id 重新激活那份账本，丢失状态但文档还在就收养（`recovered: true`）而不是再铸一个 `-2`。守卫还抓到一个我们自己没想到的洞：声明了但值为空的 `--work-item ""` 会折叠成「flag 缺席」落进无 id 路径，铸出恰好这个功能要防的兄弟账本；现在身份按存在性判定，空白声明直接拒绝。

A23 收口传播：A22 给了 `plan start` 身份，但给计划轮写账本的 auto-gate 依旧什么都不传，gate 铸的账本 `workItemId: ''`，rex 激活却按路径或每轮哈希键控——账本认一个 id，判定完成的 Command 认另一个。现在激活键是有序偏好：声明 id → 账本路径 → 每轮哈希，并带 id→路径的读通，保证 A23 之前按路径键控的激活仍然可达。两条优先级规则来自实测而非设计：声明的 id 与活跃账本的规范形式**不同**时自建账本（A21 的复用不该吞掉一个明确不同的声明）；`--work-item X --new-work-item` 以 exit 1 拒绝，而不是靠优先级裁决——这个组合会写出第二份激活键相撞的账本。还有个反直觉的钉子：`canonicalizeWorkItemId('')` 必须返回 `''`，因为共享的 slugify 对空输入回退到字面 `'plan'`，这让每个未声明的工作项看起来都「换了个工作项」，悄悄关掉 A21 的复用（五个测试红了这个原因才被找到）。

## 拒绝即功能（A19）

`aios plan` 曾经用两种静默替换把账本变成了不可写：argv 解析器把**任何**没实现的子命令改写成 `status`（所以 `plan list` 或打错的 `plan setstatus` 会打印计划然后退出 0），`status` 分支又忽略 `--status/--note/--force`（所以 `plan status --status done` 退出 0 但什么都没改）。一个 2026-09-21 就完成的工作项因此卡在 `executing` 三周——而过期不死的 `executing` 恰是每次「继续」恢复所信任的东西，账本在主动误导下一个会话。

修复沿 fail-closed 走：解析器把声明的子命令名逐字传递，不再自持一份词表拷贝；拥有分支集合的 ops 层导出 `PLAN_SUBCOMMANDS` 并拒绝没实现的名字、同时列出合法项；`status` 拒绝写标志并指向 `plan set-status`；help 首次写出 `aios plan set-status …`——缺了这行正是这个陷阱能存活的原因。两条变异测试各自独立被抓住：重新引入解析器回退只挂 C2，删掉 `status` 守卫只挂 C3。

## 门禁跑在它声称的地方（A20 + 目录预算 + 受影响测试）

**A20 — 训练门禁会说「按哪个 base 校验」。** `verify-training` 此前把九种失败压成一句话，于是在**错误 base** 记录的证书看起来和过期内容一模一样——而补救完全不同。现在每条被拒条目带 `code` + `reasonKind` + `remedy`（给出确切命令），被篡改的基线工件和在别的 base 记录的证书拆成两个分支，PowerShell 侧的预检失败会把捕获的输出回流出来而不是吞掉。

**目录预算 — 规则跑进 CI。** AGENTS.md 声明「每目录最多 8 项」，`check-dir-budget.mjs` 也确实在违规时 exit 1，但它没有任何执行面——不在 `package.json`、不在 workflow、不在 pre-commit，仓库漂移出 2 个阻塞违规而所有测试全绿。现在它作为 `pretest:scripts` 的第二步运行：CI（和发版）会因新的超预算目录而失败。两个已漂移的目录先冻结在脚本的棘轮基线里，语义拆分单独走一项。

**受影响测试 — 不再对技能改动静默跑 0 个测试。** 实测：改动 8 个文件（含 `skill-sources/retro/SKILL.md`）时，选择器打印「选中 0/219」——`skill-sources/` 由守卫套件按目录遍历读取、从不走 import，静态影响图上无边。现在任何 `skill-sources/` 改动都归因到技能守卫前缀，守卫套件里 13 个测试会被选中。

## 会话到环境的闭环（三件套双面 + A16）

这版同时回答了一个问题：**复盘出来的环境教训，落地到哪里？**

主仓库按 ADR 0003 的落点三问采纳 mattpocock/skills v1.3 的 `retro` 和 `implement-spec`：`retro` 复盘一次会话只找「该改环境而不是改代码」的候选（导航指针、确定性检查、编码标准、AGENTS.md 增删、工具经济性、无效指令、信息可达性七类），铁律是只提案不改文件、每条候选必须带源引用、七类逐类交代「未见」；`implement-spec` 是交付链的执行入口，输入一份已带验收标准与工作项的 spec，把它整份实现到底——任务图取前沿、`aios work` 并发派发须人工批准、集成分支收口、`/review` 审查收尾。

只装 rex-harness 的独立用户拿不到这两个入口，所以 rex-harness 0.11.0 同步发布 `rex-implement-spec` / `rex-pr` / `rex-retro` 三个 framework-free 编排 skill——它们不是 Provider、不被 Capability Command 选择，与 `rex-workflow` 同属编排面，standalone 安装投影从 14 个 skill 涨到 17 个。双面并存与 `grill` ↔ `rex-requirements` 同一先例。

最后按 operator 授权删除了 `src/core/index.mjs`（A16 关闭）：自封「核心基础设施 barrel」但全仓零 importer，接为入口需要全仓改 import 路径却无功能收益——未来真需要统一入口时按需重建比维持死代码便宜。

## 升级注意

- 无破坏性迁移：更新后重跑 `aios init`（或拉取后重新同步技能）即可拿到 `retro` / `implement-spec` 两个新技能。
- rex-harness 指针随版本推进到 0.11.0；只用独立安装面的用户会多投影 3 个编排 skill，无既有行为变化。
- 本版的训练证据按 v6.3.0 base 重新签发（确定性、本地、无模型参与）；如果你的工作区有自己的技能改动，发版前请对 `aios skill certify --changed --base v6.3.0` 走同一补救。
