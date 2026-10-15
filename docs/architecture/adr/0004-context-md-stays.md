# ADR 0004: 词汇表约定保持 CONTEXT.md

## Status

Accepted（2026-10-15）。裁决原话："就 CONTEXT.md 好了"。

## Context

上游 mattpocock/skills 在 v1.3.1（2026-10-04）把领域文档约定 `CONTEXT.md` / `CONTEXT-MAP.md`
全仓改名为 `GLOSSARY.md` / `GLOSSARY-MAP.md`，涉及 `domain-modeling`、`grill-with-docs`、
`improve-codebase-architecture`、`setup-matt-pocock-skills`、`triage`、`tdd`、`diagnosing-bugs`、
`ask-matt`、`codebase-design`、`pr` 等 12 个 skill 的读写目标。

本仓库与上游的接触面在 `pr` 采纳时出现（`docs/architecture/adr/0003`），但改名分叉独立于它：
AIOS 在 v6.3.0 发布的 `/grill` 写回步骤把目标定成 `CONTEXT.md` + `docs/adr/`
（`rex-harness/skill-sources/rex-requirements/SKILL.md`，0.9.0），并已铺到七个客户端的命令注册、
四语博客与 `docs-site/llms.txt`；根目录 `CONTEXT.md` 是活文件，含真实词条与 ADR 交叉引用。

## Decision

**保持 `CONTEXT.md`，不跟上游改名。**

- 我们的词汇表是**自有产品面的对外承诺**（已发布的写回行为），不是对上游约定的跟随；
  跟改名等于为一个我们不安装的 skill 体系改动已发布契约。
- 若将来真的引入上游 `domain-modeling` / `grill-with-docs` 的 skill 文本，改写其读写目标为
  `CONTEXT.md`，而不是让仓库迁就它们。
- 上游 `GLOSSARY-MAP.md` 的"多上下文索引"能力当前无对应物：如果出现多个词汇表的需求，
  在 `CONTEXT.md` 内部加索引节，不引入第二个文件名。

## Consequences

- 与上游读同一仓库的 agent 会各找各的文件，这是接受的成本——两者不共享 skill 文本，也不共享状态。
- `pr` 的"用 GLOSSARY.md 的领域语言写正文"要求落到我们这里即读 `CONTEXT.md`
  （ADR 0003 的第①问采纳中已按此处理）。
- 任何引用上游 skill 的文档如果照抄了 `GLOSSARY.md` 字样，需改写为 `CONTEXT.md`，
  否则会产生第三个名字。

## Rejected options

- **跟上游改名。** 拒绝：改的是已发布契约（v6.3.0 写回 + 7 客户端 + 四语博客 + llms.txt），
  收益只是与一个不安装的 skill 体系对齐文件名。
- **双写兼容（两份文件互为副本）。** 拒绝：一个词汇表两个 owner，必然漂移；
  违反"一条规则一个 owner"。
