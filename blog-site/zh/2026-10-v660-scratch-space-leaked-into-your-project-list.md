---
title: "v6.6.0：agent 的草稿空间漏进了你的项目列表，以及一个拒绝猜测的垃圾回收器"
description: "v6.6.0 收口一个任何测试都抓不到的体验缺陷：开发者工程目录里长出了 41 个一次性沙箱（9.9 GB），因为 `mktemp -d prefix-XXXX` 落在 shell 的当前目录，而那些 shell 当时正站在仓库的父目录上。这些东西不在任何仓库里，所以全世界的 .gitignore 都挡不住它。修复由两部分组成：一条明说的规则（`mktemp -d -p \"${TMPDIR:-/tmp}\"`，绝不在工程父目录建目录），加上 `scripts/aios-tmp-gc.mjs`——一个只按客观事实（名字形状、年龄、git 状态、是否含凭据）判定、读不出来就一律保留的回收器。它第一次真跑的输出是 `collect=0 keep=34`，而它的回归清单就是那 23 个绝不允许命中的真实工程名。"
date: 2026-10-17
tags: ["AIOS", "v6.6.0", "临时目录", "沙箱", "卫生", "回收", "工具链", "发布"]
---

# v6.6.0：agent 的草稿空间漏进了你的项目列表，以及一个拒绝猜测的垃圾回收器

> **一句话：** Finder 里的 `~/codes` 截图上全是没人取过的名字：`abhome-1zbU`、`ci-repro-home-R2MG`、`asset-check-EYJZ`、`heal-real-oiHH`、`v650-patch-check-38213`、`rex0111-qLxI`。它们是**agent 的草稿**——验证过程中造的假 `$HOME` 和 `npm pack` 探针——而且一个都不在仓库里，所以任何 `.gitignore` 都救不了。根因是一个被省略的参数：`mktemp -d prefix-XXXXXX` 不带 `-p` 时，目录建在 **shell 的当前工作目录**，而当时那些 shell 正站在仓库的父目录。v6.6.0 把这条规则说出口，并交付 `scripts/aios-tmp-gc.mjs`：每个判定都是客观事实，默认什么都不碰。

## 那些文件夹里到底是什么

打开之后是两种形状，认出来就不奇怪了。

第一种是**假 `$HOME`**：`abhome-1zbU`、`fix-home-9oTm`、`ctl2-home-bvMO`、`revert-probe-4vAl`。里面只有客户端配置壳——`.qoder/settings.json`、`.workbuddy/mcp.json`、`.zcode/cli/config.json`、`.hermes/config.yaml`。这是一次 `aios init` 投影测试不想写进真实的 `~/.codex`，动机完全正确，只是地方选错了。

第二种是**发包探针**：`asset3-zoV2`、`rex0111-qLxI`。里面永远是同样的两样东西——一个 tarball（`rex-harness-0.11.1.tar.gz`）和一个叫 `x/` 的目录。就是 `npm pack`、解包、发布前检查产物。

然后是重量级：`ci-repro-aios`（2.8 GB）和 `ci-reg-home`（882 MB），一份完整仓库副本加一个完整假 HOME，用来本地复现 CI 回归；`v650-patch-check-38213` 和 `ab-v641-x97833`，两份完整工作树，用来把两个版本做 A/B。41 个目录，4.06 GB 沙箱，再加一份 5.8 GB 的过期发布包——**9.9 GB 就躺在真实项目住的那个文件夹里**。

这些都不是代码库的锅。本仓库每个测试文件早就用 `os.tmpdir()`——603 处调用、222 个测试文件。垃圾来自**会话里临时敲的命令**，它们继承了会话当时所在的 `cwd`。

## 规则被写成约束，而不是偏好

`AGENTS.md` 新增了 *Temp Sandbox Hygiene* 一节，实质内容就一行：

```bash
mktemp -d -p "${TMPDIR:-/tmp}" aios-probe-XXXXXX   # -p 不是可选项
```

省掉 `-p`，`mktemp` 就写进 `cwd`。同一条规则的提示词版本：绝不在工程父目录（`$HOME/codes`）创建目录，因为那里对版本控制不可见，于是对所有以仓库为作用域的安全网都不可见。

这类问题的形状决定了 Definition of Done 抓不到它。验证是通过的——假 HOME 确实证明了 `aios init` 写对了文件。损害纯粹是**位置性**的，只在 Finder 窗口里看得见。

## `aios-tmp-gc`：按事实分类，读不出来就保留

工具 275 行，有意思的不是删除，是**那道拒绝阶梯**。下面每条规则都是被一个反例逼出来的，而顺序本身就是安全属性：第一个不通过即短路。

| 门 | 规则 | 失败方向 |
|---|---|---|
| 名字形状 | `-[A-Za-z0-9]{4,6}$` **且**后缀含大写或数字 | 全小写随机串→不回收（宁可漏，不可错） |
| 年龄 | `--older-than`，默认 60 分钟 | 正在跑的探针永远碰不到 |
| git 状态 | `dirty`、`unpushed`、`stashed`，**以及 `unknown`** 全部保留 | 状态读不出的仓库就是不该动的仓库 |
| 凭据 | 根层有 `.env` 或 `.env.*.local` 即保留 | 需 `--allow-secrets` 才能覆盖 |
| 易失根 | 系统临时目录整根剔除 | 需 `--allow-volatile-root`；那里随机名可能属于别的 app |
| 不可逆 | `--mode purge` **必须**带 `--yes`，否则退出码 1 | 默认 `dry-run`；`to-trash` 是移动不是删除 |

名字那道门在第一次跑测试时就挣到了它的第二个条件。原本只有一条正则 `-[A-Za-z0-9]{4,6}$`，它命中了 **`rex-work`**——一个真实工程，四个小写字母，形状和 `mktemp -d rex-XXXX` 的产物一模一样。同样命中的还有 `hermes-setup`、`rex-videos`、`rex-ppt-codex`、`wordpress-shens`、`rex-ai-tools`、`rex-koubo`、`rex-game`、`rex-hugo`。抓住它的那批断言现在就是回归护栏，用真实目录名写死：

```
harness-cli, aios, aios-pro, rex-work, rex-game, rex-hugo, rex-koubo, rex-videos,
rex-ai-tools, rex-ppt-codex, hermes-setup, wordpress-shens, claude-relay-service,
yilang-browser, inkloom.im, inkloom.im.worktrees, docsrag, agno-go, xsapp, huabu,
chrexai, tocraft-wordpass, rex-wordpass-tp        → 全部必须为 false
```

`mktemp` 的随机串每次抽样有约 92% 概率含大写或数字；英文小写词永远不含。剩下那 8% 的代价是一次漏收。**这是本工具刻意做的交易：宁可留下 9.9 GB，也不误删一个项目目录。**

`unknown` 这个状态不是被害妄想。有提交但没有 upstream 的仓库，`git rev-list @{u}..HEAD` 会以非零退出。把它读成「干净」就会删掉 `v650-patch-check-38213` 和 `ab-v641-x97833`——两份真实 git 工作树，一般情况下都带着未推送的改动。现在它读成「读不出」，读不出即保留，保留意味着交给人判断。

## 真实运行长什么样

```
$ node --test scripts/tests/tooling/tools/aios-tmp-gc.test.mjs   → 12/12 pass
$ node --test scripts/tests/tooling/tools/*.test.mjs             → 62/62 pass（无回归）
$ node scripts/check-dir-budget.mjs                              → 0 blocking
$ node scripts/aios-tmp-gc.mjs --root ~/codes --older-than 30
  collect=0  keep=34
```

`collect=0 keep=34` 是那个关键数字：清理之后，工具看着存活的 34 个真实项目，**一个都不建议动**。清理之前，指向暂存目录时它认出 44 项里的 37 项，把名字不规则的 7 项留给人——包括那个 5.8 GB 的发布包，工具按名字永远不会收它，而这也正是为什么它的内容被单独核过：四个 `.env*` 与在用的项目副本逐一哈希比对，逐字节一致，所以没有任何凭据、没有任何独有文件被销毁。

## 本次发布刻意不包含

- **门禁没接上。** 一个 pre-tool 检查可以在源头拦下「`mktemp -d` 的目标父目录是工程根」，而不是事后打扫。但那要改安全门禁本身——blast radius 更大，是独立决策。
- **制造者还活着。** 诊断过程中 21:21 和 21:29 又冒出新探针，来自一个并行的发布验证会话。规则在被强制执行之前只是建议。
- **9.9 GB 是暂存，不是释放。** 全部经 `mv` 进入 `~/.Trash/aios-sandbox-cleanup-2026-10-17`，一次 `rm` 都没有。macOS TCC 禁止本进程枚举 `~/.Trash`，因此无法确认里面还有什么，清空废纸篓这一步留给人点。`--mode purge --yes` 就是为人决定执行的那一刻准备的。

## 升级说明

- 如果你的项目都住在同一个父目录下，而它开始长出 `*-XXXXXX`：`node scripts/aios-tmp-gc.mjs --root "$HOME/codes"` 预览，`--mode to-trash` 可逆暂存，`--mode purge --yes` 才真正释放空间。
- 脚本和会话里造沙箱请用 `mktemp -d -p "${TMPDIR:-/tmp}" <prefix>-XXXXXX`。`-p` 才是修复本身，其余部分本来就是对的。
- 其他一切不变。本次发布没有动任何配置、CLI 契约或文件布局。
