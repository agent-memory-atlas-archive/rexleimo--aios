# ADR 0003：仓库「没意义的文件」按三级判定处置，只有第一级允许自动回收

日期：2026-10-26
状态：已确认（用户拍板；/grill 一轮收敛——第 1 轮在 A/B/C/D 四个范围中选 A，第 2 轮「提交并删除」授权 purge 与 B 的可证部分）

## 背景

用户请求「删除项目中没有意义的文件和文件内容」。这句话在本仓库有三种互不兼容的读法，而且**破坏半径完全不同**，所以必须先分级再动手。分级前实测到的事实：

| 观测 | 实测值 | 判定依据 |
|---|---|---|
| 根目录测试沙箱残留 | 120 个目录（`aios-browser-migrate-*` 44、`aios-browser-mode-*` 66、`aios-bsk-switch-*` 6、`aios-dbg-*` 4），共 205 KiB | 全部被仓库根 `.gitignore` 第 207 行的 `/aios-*/` 覆盖；目录内只有 `config*.toml/settings.json`，无 `.env*` |
| `temp/` | 2.6G / 4133 项，其中 >7 天 3430 项（1045.7 MiB）、≤7 天 702 项 | 被仓库根 `.gitignore` 第 20 行的 `temp/` 覆盖；docs 里有 31 条形如 `` `temp/<path>:<line>` `` 的引用需要原地保留 |
| 看着像垃圾但其实是活物 | `opencode.json`（`scripts/lib/clients/opencode/config.mjs` 生成）、`.contextdb-enable`（被 `scripts/lib/memory/contextdb/shell-bridge/*` 当开关读）、`src/`（被 `scripts/**` 大量 `import`）、`video/`（753M 但只有 30 个 tracked 源文件，余为本地产物） | grep 反查 call site，不是看文件名猜 |
| 仓库噪声 | `docs/plans/` 567 个顶层 md + 117 个 json（45 个只有自动脚手架、0 条勾选任务）、`docs-site`↔`blog-site` 字节相同的重复 PNG ≈9.4M、`pptx-ai-coding-share/` | `git ls-files` 有它们——删就是 commit |
| 内容级死代码 | 实测**约零**：`*.mjs/*.ts/*.tsx` 中没有一文件出现 ≥8 行被注释掉的代码 | 正则统计 `^\s*//\s*(import|export|const|let|function|if|for|return|class)` |

隐藏约束（差点踩的那条）：`scripts/check-doc-citations.mjs` 会扫 `docs/plans/*.md` 与 `docs/reports/*.md`，把 `` `path:line` `` 形式的引用拿去核对**目标文件存在且行号不越界**。基线已经是 538 引用 / 336 失效（missing=280），门本身没接进 `pretest:scripts`（只有自己的单测 `doc-citations.test.mjs` 跑它），所以它是个「不会自动报警但会静默漂移」的检查器。

## 决策

1. **只有「本地残留」这一级允许自动回收**：判据是客观事实三连——`git check-ignore` 命中 + 名字形状（`aios-<fixture>-<4–6 位、含大写或数字的后缀>`）+ mtime 年龄阈值，外加「无 `.env*`、无脏 git 状态」。执行统一走 `scripts/aios-tmp-gc.mjs`，默认 `dry-run`，落地用 `--mode to-trash`（可逆）。
2. **trash 暂存位置要同时满足两件事：同卷 + 落在安全门允许的路径里**：`execute()` 用的是 `fs.renameSync`（`scripts/aios-tmp-gc.mjs:220`），而 `trashDirFor()` 默认落在 `os.homedir()/.Trash`——本机 home 在 C:、仓库在 E:，默认值会跨卷失败，所以回收必须传 `--trash-dir` 指向同卷目录。另一面：真删时 AIOS 安全门会拒绝「易失临时区之外的绝对路径递归删除」，所以 purge 前要把暂存 `mv` 进仓库内相对路径（`temp/.trash-purge-<date>/`，同卷 rename 瞬时）再删。
3. **仓库噪声先算引用图，再定可否删；引用图必须按引用方是否进 git 分区**：对每个候选 stem 做入站引用反查，**排除候选自身所在目录**（同目录互链不是担保物，它们同批处置），再把引用方分成 tracked（需同批修指针）与未跟踪运行时快照（`.aios/context-db/**` 这类历史输出，悬空路径只是记录，不是 live 指针）。只有 tracked 引用才构成阻塞。
4. **完成担保 = 引用计数只减不增 + 门输出与 HEAD 逐项比对 + focused 测试绿**：不用「我觉得删干净了」当证据；其他检查器的告警要先用 `git stash` 对到 HEAD 确认是存量，否则会把存量问题算到本次变更头上。

## 后果

- **正向**：根目录 `ls` 从 120 个沙箱目录归零；`temp/` 从 4133 项 / 2.6G 降到 702 项 / ≈670M；搬进易失区的 1.9G 残留已真删（E: 可用 74G → 76G）。purge 后不可逆，但删的全部是 `git check-ignore` 命中的本地残留。
- **B 类实测结论：自动脚手架 plan 确实可删，但前提是引用图分区做对（本 ADR 初版在这里算错过一次）**。第一遍审计把同目录互链与 `.aios/**` 未跟踪快照当成交付阻塞，得出「44 个被 CHANGELOG/memo/file-index 引用，全仓 198 条」的结论；第二遍按上条决策重算后，**43 个纯脚手架 plan 的 tracked 入站引用为 0**（引用方全在 `.aios/context-db/reconciliation/*.json` 历史快照里），因此同批删除，不需修任何文档。CHANGELOG.md / CONTEXT.md 的引用指向的是带真结论的 plan，不在这个子集里。
- **B 类仍然不可删的部分（这些是真约束，不是保守）**：`docs/plans/` 里 117 个 `*-testability/decision/review-round/ticket.json` 抽样证实装的是真决策（objective / decision / blockingUnknowns / nonGoals）；`research/upstream/loopx-analysis.md` 被 4 个 `scripts/lib/**` 模块引用；`docs/superpowers/` 78 个文件被 4 个脚本引用；`docs-site`↔`blog-site` 字节相同的重复 PNG 删一份就要改页面资源引用，那是重构不是清理。已删的两个例外：`pptx-ai-coding-share/AI-Coding-技术分享.pptx`（`create-ppt.js:440` 可重建）与 `2026-10-19-workbuddy-打分-….md`。
- **担保实测值**：`check-doc-citations` 逐批变化 538 refs/628 files → 537/627（删 2 个）→ 536/**584**（删 43 个），**invalid 336 → 336 → 335、missing 280 → 280 → 279，每批都不增**（降的 1 条是被删文件自己携带的失效引用）。`check-site-sync.mjs` 对 `docs/plans` 的引用数为 0（grep 计数），所以它与本次变更无因果；它的输出多出一条 ko 翻译缺失警告，已核为存量（与上一提交同现）。测试：`doc-citations + aios-tmp-gc + check-site-sync` 30/30、`aios-tmp-gc + browser-core` 49/49、`planning` 全族（contract / single-ledger / auto-gate-identity / explicit-intent / work-item-identity）46/46。
- **负向 / 新暴露的问题**：
  - `aios-tmp-gc.mjs` 的名字谓词「后缀须含大写或数字」是刻意的 fail-safe（全小写随机串宁可漏收），因此 `aios-browser-migrate-pw-zrhiqe`、`aios-browser-mode-write-yqreft` 这两个同族目录机器判不出归属，需人工确认内容（12 个 config 文件、零凭据）后手工搬——工具在自家仓库根上仍然偏保守，而 `aios-` 前缀本身就是所有权凭据这一事实没被利用。
  - 仓库里存在**两套 ADR 序号**：`docs/adr/`（0001–0003，本文件）与 `docs/architecture/adr/`（0001–0004）。本 ADR 按 `grill`/`rex-requirements` 的字面约定落在 `docs/adr/0003`，于是 `0003` 这个号在两处指向两份不同文档。序号唯一性现在不成立，需要一次独立的收敛决策。
  - `docs/reports/*.md` 引用的 `temp/vendor/*`、`temp/research/*` 等路径实际已不存在（已计入基线 missing=280 的一部分）。清理不修它，但它让「引用计数不变」这条担保只具备**相对比较**的意义，不是绝对干净。
