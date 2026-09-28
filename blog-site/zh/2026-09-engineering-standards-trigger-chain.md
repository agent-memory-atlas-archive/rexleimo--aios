---
title: "真正会触发的工程标准"
description: "AIOS 早就发布了工程标准技能——但它一次都没触发过。一次零引用审计、一条新的共享参照投影通道、一份文件粒度基线，让经典软件工程纪律落到了每一条产出代码的路径上。"
date: 2026-09-28
tags: ["AIOS", "工程标准", "rex", "skills", "projection", "clean-code"]
---

# 真正会触发的工程标准

我们有个怀疑，而实际情况比怀疑更糟：AIOS 早就带着一个
`rex-engineering-standards` 技能——Clean Architecture 边界、深层模块、命名、
Definition of Done 一应俱全——但它一次都没有触发过。不是内容写错了，而是
**没有任何东西引用它**。

## 审计结果

三处断点，每一处都足以让它永不生效：

1. **它从没进过仓库。** 技能只活在某台机器的 `~/.zcode/skills/` 目录里：
   不受版本管理、不投影到其他 client、重装即失。
2. **零引用。** 全仓库搜索找不到任何文件提到它——AGENTS.md 不提、工作流路由
   不认识，最关键的是 `rex-implement` 自己也不知道。标准声称"实现前先读我"，
   但实施技能根本不知道它存在。技能加载是按次拉取的，没人点名就没人拉取。
3. **没有 runtime 兜底。** 文件粒度——用户真正有痛感的那条——恰是最容易
   机器检查的规则，而没有任何东西检查它。

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
"该不该发生"留在 prompt 层。只活在 prompt 里的标准是建议；被 runtime
点名的标准才是闸门。

还加了一道守卫，防止这件事静默回归：`skill-sources.test.mjs` 现在会在任何一个
代码生产类 Provider 不再点名该标准时直接构建失败。“没有任何地方引用的技能”
在运行时是看不出来的，所以这道检查只验客观事实（已发布技能树里的字符串存在），
不依赖评审意见。

验证：rex-harness 215 个测试、client-install 与 skill-sources 套件、
scripts 侧投影套件全部通过；每个被投影技能的 digest 已按 append-only 登记进
`projection-history.json`（保留 0.7.0 的历史 digest，已在 0.7.0 的客户端才能升级），
本机投影已刷新，`rex-harness doctor` 零错误。
