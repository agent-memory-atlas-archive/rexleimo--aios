---
title: "v6.2.0：真正会触发的工程标准"
description: "AIOS 早就发布了工程标准技能——但它一次都没触发过。一次“被分发却无人点名”的审计、一条新的共享参照投影通道、一份文件粒度基线，让经典软件工程纪律落到了每一条产出代码的路径上。"
date: 2026-09-28
tags: ["AIOS", "v6.2.0", "工程标准", "rex", "skills", "projection", "clean-code"]
---

# 真正会触发的工程标准

我们有个怀疑，而实际情况比怀疑更糟：AIOS 早就带着一个
`rex-engineering-standards` 技能——Clean Architecture 边界、深层模块、命名、
Definition of Done 一应俱全——但它一次都没有触发过。不是内容写错了，而是
**该消费它的地方，没一个点名让它消费**。

## 审计结果

把文件装进包里算修好了一处，而 0.7.0 已经修好了它：这个标准原本只活在某台机器的
`~/.zcode/skills/` 目录里——不受版本管理、不投影到其他 client、重装即失。现在它
已经在被投影的技能树里。

审计要看的，是那次修复之后仍然剩下的东西。两处断点，每一处都足以让它永不生效：

1. **被分发，却没被点名。** `install.mjs` 会投影它、`client-install.test.mjs` 会
   数它，所以文件确实躺在每个客户端的磁盘上。但在发布物内部，没有任何地方告诉
   谁要去读它：四个代码生产类 Provider 没一个点名它，`AGENTS.md` 也不提。
   存在的引用者只有 `aios-workflow-router` 与 `pre-edit-safety-gate`——那是 AIOS
   宿主侧的指引，独立使用 rex-harness 的客户端根本不会加载它们。文件分发给了
   所有人，却不被任何流程要求。标准声称“实现前先读我”，但实施技能
   并不知道它存在。技能加载是按次拉取的，没人点名就没人拉取。
2. **没有 runtime 兜底。** 文件粒度——用户真正有痛感的那条——恰是最容易
   机器检查的规则，而没有任何东西检查它。“有没有被点名”本身也没人校，
   所以这道断点是隐形的。

结果就是你会预想到的样子：代码没有工程形状。文件命名不清晰，一个文件里
堆了一大堆职责。

## 修法：第三种技能

Rex 技能原来有两种：`rex-workflow` 入口，和 Provider——能被 Rex Command
选中并推进的 Capability。而这个标准两者都不是：它不该是 Provider（没有
capability 契约），但又必须随投影分发。于是安装器长出了第三条通道：

- `rex-harness/src/clients/install.mjs` 新增 `sharedReferenceSkillIds`——
  与 Provider 同步投影到所有 client，但永远不会被 Command 选中。技能自己的
  契约（"不是 Provider 流程，而是前置标准"）得以保持诚实。
- 代码生产类 Provider——`rex-implement`、`rex-design`、`rex-code-review`、
  `rex-refactor-hardening`——现在都带一个显式前置步骤：先读标准，并把它
  的 Definition of Done 与各自的门禁一并逐项确认。
- AGENTS.md 记录了这条规则，每个 client 在会话开始就能看到。

## 补上的基线：文件粒度

原标准覆盖了函数和模块，却跳过了用户抱怨最多的单位。新增的 §4 补上了：

- **一个文件一个职责。** 文件名说不清它装什么 = 职责不清——先拆或先改名，
  再写代码。
- **约 400 行的软预算。** 接近预算先问是否在跨越职责边界；确需超限必须在
  交付说明里写明为什么它仍是单一职责（generated、表驱动、纯数据文件除外）。
- **命名遵循仓库约定**（kebab-case 动作模块、`index.ts` 入口），并禁止
  `a_v2`、`a_final`、`a_utils` 这类无语义拆分。

它作为 Definition of Done 第 5 条加入——意味着 `rex-implement` 的
self-check gate 现在会对"一个大文件"式的交付判否。

## 我们反复学到的那条反教训

这次奏效的修法不是"把技能写得更好"，而是"让技能被引用、被投影、可检查"——
和我们从竞品分析反反复复得出的结论同向：没有一个成熟的 harness 会把
"该不该发生"留在 prompt 层。只活在 prompt 里的标准是建议；被消费方点名的标准才是闸门。
分发从来不是缺的那块——文件本来就躺在每个客户端的磁盘上，它照样一次都没触发。

还加了一道守卫，防止这件事静默回归：`skill-sources.test.mjs` 现在会在任何一个
代码生产类 Provider 不再点名该标准时直接构建失败。“没有任何地方引用的技能”
在运行时是看不出来的，所以这道检查只验客观事实（已发布技能树里的字符串存在），
不依赖评审意见。

## 本版本另一件事：宿主不能再打包一个没发布的内核

同一次审计暴露了更上一层的更糟形态。已发布的 v6.1.0 产物打包的是 `rex-harness`
工作树，而它带出去的 rex-harness 版本在子模块远端没有 tag、没有发布产物。什么都没
报错，因为没有任何东西在检查：宿主 changelog 引用了一个哪都解析不到的内核版本，
独立使用 rex-harness 的人则根本没收到过它。

现在 `scripts/check-release-submodule.mjs` 会证明记录的 gitlink 确实被子模块远端的
某个 tag 指向，`release-preflight.sh` 在未打 tag 或无法证明时拒绝打宿主 tag。
发版顺序是闸门，不是约定：先发子模块，再发宿主。

验证：rex-harness 215 个测试、client-install 与 skill-sources 套件、
scripts 侧投影套件全部通过；每个被投影技能的 digest 已按 append-only 登记进
`projection-history.json`（保留 0.7.0 的历史 digest，已在 0.7.0 的客户端才能升级），
本机投影已刷新，`rex-harness doctor` 零错误。
