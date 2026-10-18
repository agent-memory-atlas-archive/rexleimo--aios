---
title: "v6.7.0：一条命令，所有客户端——'aios skill add' 给社区技能开了正门"
description: "v6.7.0 堵上 AIOS 技能体系的一个安静缺口：`skill-sources/` 之外的好技能没有入口。最好用的社区技能（clone-website）只活在某一个客户端的全局技能目录里，其余九个客户端根本看不见它。修法不是迁移，是开正门：`aios skill add <source>` 解析本地目录或 git URL（浅克隆，含 owner/repo 简写），暂存进 canonical 外部注册处（~/.aios/skills/external/<name>/）并写归属元数据，再分发到每个客户端的用户级技能根。同一命令复跑即幂等：内容相同的 reuse，有变化的刷新。选择语义 fail-closed：多技能来源要么显式给 --skill <names>/--yes，要么进交互勾选——永不猜测。"
date: 2026-10-18
tags: ["AIOS", "v6.7.0", "skills", "外部技能", "CLI", "release"]
---

# v6.7.0：一条命令，所有客户端——'aios skill add' 给社区技能开了正门

> **TL;DR：** 这台机器上最好用的技能——`clone-website`，把一个真实网站逆向成像素级一致的重建——十个客户端里有九个看不见它。它只在 `pi` 里能用，因为它恰好装在那里。AIOS 自己的技能同步（`skill-sources/` + `config/skills-sync-manifest.json`）只发布随版本发行的技能；社区技能连个正门都没有。v6.7.0 加了一扇：`aios skill add <source>`。来源可以是本地目录或 git URL；先暂存进 canonical 外部注册处，再分发到每个客户端的用户级技能根，全程带归属元数据。复跑幂等，而真正有意思的是护栏：fail-closed 的选择语义、只接管 unmanaged 目录的 force、以及安装 `clone-website` 时拒绝删除原始目录的防自毁守卫。

## 缺口，精确地说

AIOS 原本有两套技能面：

1. **Canonical 技能**——在 `skill-sources/` 里创作，发布时同步投影到所有客户端。受管、版本化、有测试。
2. **用户自己丢进客户端技能目录的东西**——完全不受管。`clone-website` 就住在这里：`~/.pi/agent/skills/clone-website/`，带着 `LICENSE`、`README.md`、`SKILL.md`，多半是从某个社区仓库下载的。一个客户端、一个目录、没有来历、不会传播。

故障模式要等咬人才看得见：你在 `pi` 里知道有这个技能，切到 `codex`，技能就不在了。没有任何东西告诉你它本可以在。这不是哪个组件的 bug——是一扇缺了的门。

## 管线：三段，一条命令

`aios skill add <source> [--client <list|all>] [--skill <names>] [--yes] [--force] [--json]`

**第一段——解析来源。** 根目录带 `SKILL.md` 的本地目录是单技能；直接子目录各带 `SKILL.md` 的是多技能包；`https://` URL、`*.git` 后缀、`owner/repo` 简写走 git 浅克隆，落在一次性临时目录里，安装结束在 `finally` 里回收。其余一律拒绝，只给一行可操作的结论。

**第二段——暂存进外部注册处。** `~/.aios/skills/external/<name>/`（测试可用 `AIOS_HOME` 重定向）。每个条目带 `.aios-skill-install.json`：`client: "registry"`、`scope: "external"`，原始来源记在 `catalogSource`。这个注册处与仓库内 `skill-sources/` 树**并行**、不取而代之——两条同步路径汇合在同样的客户端技能根上，但不共享代码、不共享归属。

**第三段——分发到所有客户端。** 目标根来自 catalog 安装器同一个 `getClientHomes()` 映射：`~/.codex/skills`、`~/.claude/skills`、`~/.gemini/skills`、`~/.config/opencode/skills`、`~/.hermes/skills`、`~/.grok/skills`、`~/.workbuddy/skills`、`~/.pi/agent/skills`、`~/.zcode/skills`，以及 Qoder 的发行版感知家目录（`~/.qoder-cn` 或 `~/.qoder`）。每个副本写自己的元数据，`catalogSource` 指回注册处条目——整条链可审计：*这份副本 ← 注册处 ← 原始来源*。

首次真跑的输出一字不差地说清了自己做了什么：

```
[copy] registry skill installed: clone-website
[copy] codex skill installed (global): clone-website
[copy] claude skill installed (global): clone-website
...
[skip] pi target is the source directory itself; keeping the original untouched
[done] ... installed=10 reused=0 replaced=0 skipped=1
```

复跑出的是让这成为**同步**而不是复制脚本的形状：`installed=0 reused=10 replaced=0 skipped=0`。

## 三个被拍板而不是被默认的语义

**选择是 fail-closed 的。** 多技能来源、没有显式选择、没有 `--yes`、又不在 TTY 上——既不装"全部"也不装"第一个"，而是报错列出清单和解决旗标。交互模式问 `Install which skills? [a=all, 1,3 or names, Enter=cancel]`。这和 AIOS 其余部分的原则同源：核心永远不从歧义里猜语义——缺失的决定是拒绝，不是默认值。

**`--force` 不是推土机。** 它的用途是接管 *unmanaged* 目录——存在但没有 AIOS 元数据的目标，可能是用户手放的或自己装的。受管且内容与来源一致的副本**无论 force 与否都 reuse**。这个区分有分量：输出里的 `replaced` 意味着"AIOS 覆盖了已存在的东西"，这一行只应该在真的有东西被接管时出现。

**防自毁守卫不是被害妄想。** `copyDirRecursive` 复制前先对目标 `rmSync`。首次收编一个技能时，客户端目标路径（`~/.pi/agent/skills/clone-website`）*就是*来源路径。没有守卫的话，往 `pi` 装 `clone-website` 会先把原件删掉——注册处副本先做所以数据不丢，但用户的目录会变成一份再投影，不再是他的原件。守卫比较 resolve 后的路径，凡目标 resolve 到来源就拒绝触碰，旗标说什么都没用。

## 已知限制，changelog 里说过了

TTY 提示路径有逻辑覆盖但没有真交互会话实测——agent 和 CI 走的都是 `--skill`/`--yes`。`--mode link`（注册处→客户端 symlink）报错拒绝，属独立决策。卸载不在本批：外部技能可以手删，但元数据里的归属链已经为将来的 `skill remove` 铺好。GitHub 来源是浅克隆，没有 tarball/registry 协议。

还有一条诚实的过程记录：开发期间有个测试默认 `client: 'all'` 却只 mock 了三个客户端家目录——测试技能被写进了真实的 `~/.gemini`、`~/.hermes` 等。清理用的正是这个功能自己提供的出处机制：每个被污染目录的 `catalogSource` 都含 `/aios-home/skills/external/`，于是 21 个目录被精确移除，真实用户内容分毫未动。测试套件现已把所有 client 选择钉死在 mock 集合上。教训可以泛化：*向多个根分发的工具，必须能从自己的元数据回答"你碰过哪些根"*——现在它能了。
