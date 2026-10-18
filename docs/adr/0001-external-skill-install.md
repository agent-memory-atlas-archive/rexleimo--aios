# ADR 0001：外部技能安装走新命令 `aios skill add`，分发到所有客户端全局技能根

日期：2026-10-18
状态：已确认（用户拍板，/grill 澄清 2 轮收敛）

## 背景

用户发现 `clone-website` 技能很好用，但它只装在 pi 客户端的全局技能目录（`~/.pi/agent/skills/clone-website`），其他客户端（codex / claude / opencode / gemini 等）都没有。AIOS 现有的技能同步机制（`scripts/lib/tooling/skills/install/sync.mjs` + `skill-sources/` canonical 树）只负责把**随 AIOS 发布的** canonical 技能投影到各客户端表面，没有"从外部来源安装一个技能"的入口。

## 决策

1. **新增安装命令**：提供 `aios skill add <来源>` 一类的新命令（不是扩展现有 sync），来源可以是本地技能目录、GitHub 仓库或技能包。安装过程中当来源含多个技能时，交互式勾选要装哪些。
2. **分发范围 = 所有客户端的全局技能根**：装到每个客户端的全局技能目录（`~/.pi/agent/skills/`、`~/.claude/skills/`、`~/.config/opencode/skills/` 等），任何项目里都可用；不做项目级安装。
3. **首个验收用例**：把 `~/.pi/agent/skills/clone-website` 收编安装，使其在全部客户端全局可用。

## 后果

- 需要一条与 canonical `skill-sources/` 并行的外部技能存放与归属追踪机制（复用 `.aios-skill-sync.json` 风格的元数据），保证幂等更新不产生重复副本。
- 现有 canonical sync 机制保持不动，两条通路在"客户端全局技能根"这个落点上汇合。
- 交互式选择需要非交互降级路径（CI / 脚本场景），具体形态为实现期决策（见假设清单）。
