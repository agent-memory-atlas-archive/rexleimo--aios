# Review round 3 — 第三轮加固差异（verify-invariants 之后的标准与规格审查）

fixed-point `d59f16ff`，差异非空：子模块 `48040bb..1a1cd75` = `tests/domain/standard-config.test.mjs +22`、
`src/domain/standard-config.mjs` 头部注释 +4；父仓库两个指针 commit（`a4429b0b`、`f4ca9e76`）。
本轮审查范围就这一条：一次 coverage-gap 加固，不含新行为。

## Standards

**未发现违规（0 条），检查范围如下。**

- §4 文件粒度：测试文件 85 行、`standard-config.mjs` 111 行，均低于 400 软上限；kebab-case；一个文件一个职责 ✓
- §5 测试基线：新断言覆盖 parseExemptions 三条先前无担保的分支（列表非数组、条目缺 path、条目非对象），
  `--numstat` 证明删除 0 行——没有为绿而删断言；基线先跑（`c5ab3d50` 5/5），加完仍 6/6（`790c27c8`），
  最终态再跑 `14d0c942` 6/6，全量 227/227
- §3 DRY：错误码语义的声明写在拥有它的模块头（`standard-config.mjs`），ADR 只留验收口径——没有把同一知识点抄第二遍
- §1 边界：父侧仍只经公开面读数；本轮没有新增 deep import（`rex-import-boundaries` 3/3，父侧消费测试 3/3）
- 12 条 smell：Mysterious Name 曾有其一（用例名说 "invalid exemption" 而码是 `missing-reason`），
  已在 `1a1cd75` 改名消除；其余 11 条未见——包括上轮点名的 Speculative Generality（本轮未新增无人消费的字段）
  与 Duplicated Code（无重复逻辑）
- 一处 judgement 已在提交内自纠：第三个用例原先只钉 `path` 不钉 `code`，`1a1cd75` 补齐

## Spec

**未发现新增规格缺口（0 条）。**

- 本轮对应规格 = round-2 的 S4-R2-2 / S4-R2-3，均已关闭（见本文件与 round-2 文档 Round-3 节）
- 结转项不算本轮失败，且已在工单里有主：SKIP 与目标根解析 → `work-budget-engine` C7/C8；
  `measure`/`dispositions`/`exemptions` 消费或删除 → 同项 C3
- scope creep：未见——本轮没有触碰解析逻辑，也没有新增公开面符号

汇总：Standards 0 findings（检查范围见上），Spec 0 findings；最严重项为"无"。
verdict `pass`，类型化裁决见 `2026-10-22-portable-standard-rules-review-round3.json`（已用子模块
`normalizeReviewVerdict()` 校验）。
