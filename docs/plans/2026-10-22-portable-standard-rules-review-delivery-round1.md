# Review — work-delivery-guarantee 第一轮（漂移工具与两根 CLI）

fixed-point `9224dd98`（红测试提交），差异：`git diff --stat 9224dd98...HEAD` 非空。
规格：工单 `work-delivery-guarantee` C0–C8 + V1。标准：`rex-engineering-standards`（第 0 步已加载）。

## Standards（hard 2 / judgement 2）

1. **hard｜度量面由本地清单决定，不是注册表**。`scripts/lib/clients/rex-harness/projection-drift.mjs:13`
   写死 `CLIENT_SKILL_ROOTS = ['.agents','.claude','.codex','.grok','.gemini']`，而 `projectSkillRoot` 的权威是
   `scripts/lib/foundation/clients/selection/core/definitions.mjs`（10 客户端 / 9 个根）。实测两套口径：
   registry-driven `checked=153 skillDrift=0 attachmentDrift=35 unmanaged=6` vs 硬编码 `checked=85 / 15 / 4`
   ——**68 个条目对报告不可见**。修复：默认覆盖面取自注册表；加一条担保测试"度量面 == 注册表客户端全集"
   （同形状已在 `rex-client-projection.test.mjs` 存在，可直接对齐）。
2. **hard｜用前缀猜归属**。`unmanaged` 判定是 `/^rex-/u`，而源侧目录名（`skill-sources` 列表）才是
   "哪些 skill 属于 rex"的权威。修复：判定改为"源侧存在同名目录且投影侧无 marker"；否则 rex 新增非 `rex-`
   前缀技能就再次失明——这与本需求要消灭的"一个知识两个 owner"是同一类缺陷。
3. judgement｜`payload()` 对每个客户端根重复读取同一份源目录，无缓存。规模小（153 条）可接受，
   但按 skill 记忆一次是纯赚。
4. judgement｜人读报告把 sentinel `unmanaged` 混进"生成版本"列表，容易被当成一个版本号。
   版本列表只收真实版本，unmanaged 用计数表达即可。

## Spec（hard 1 / judgement 3）

5. **hard｜本项未完成**：C4 doctor 机读漂移计数未实现（该 grep 至今零命中）；C6 `self-update` 不重生投影
   （grep `projection` 零命中，只有 `aios-init.mjs:97` 会）；C0/C5 的 wiring 担保测试一条都还没写。
6. judgement｜C3 的 30→0 口径成立，但取证时覆盖面是 5 个根；按第 1 条修正后须以全集重测并报 153/0。
7. judgement｜C8 被遵守：附属物差异单独报数且有测试钉住；V1 达成（工具进版本控制 + 登记进回归套件，
   wiring 6/6）。
8. judgement｜工单 C4 应补一句"同时报 unmanaged/冲突数"，否则 doctor 绿灯仍可能掩盖人管旧副本
   （实测本仓库 6 条 unmanaged，安装器只打 warn 并保留原文）。

verdict：`changes-requested`。类型化裁决见 `...-review-delivery-round1.json`（已用子模块
`normalizeReviewVerdict()` 校验）。
