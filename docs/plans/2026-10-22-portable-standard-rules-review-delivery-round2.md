# Review — work-delivery-guarantee 第二轮（覆盖面与归属修正）

fixed-point `172218c1`；差异非空：`git diff --stat 172218c1...HEAD`（两个提交：修正 + 重构）。
规格：工单 `work-delivery-guarantee` C9/C10（本轮新加的两条）。标准：`rex-engineering-standards`（第 0 步已加载）。

## Standards（hard 0 / judgement 3）

上轮三条发现已关闭并逐条复测：
- S4-R4-1：默认覆盖面改为注册表派生，真实仓库从 `checked=85` 变 `checked=153`，与 ad-hoc 注册表口径逐字相同
- S4-R4-2：`unmanaged` 判定改为"源侧存在同名目录且投影无 marker"，fixture 里 `helper-ui`（不带 `rex-` 前缀）现在会被看见
- S4-R4-4：`unmanaged` 不再混进"生成版本"列表

本轮新发现：

1. judgement｜**同一个映射用了两种写法**。实现用 `String(p).split('/')[0]`，测试用 `path.dirname(p)`。
   保持两份推导是有意的（否则"默认==注册表"就成同义反复），但两者只在"每个 projectSkillRoot 都含斜杠"时等价。
   实测 10 个客户端全部含斜杠且两种写法逐一致 ✓，所以今天没有行为差异；一旦有人加一个不带斜杠的根，
   `path.dirname` 会给出 `.`，交叉检查会以另一种方式失明。修复：在注册表侧加一条客观断言
   （每个 `projectSkillRoot` 必须有父目录段），把等价前提钉住，而不是靠两种写法碰巧一致。
2. judgement｜`collectDrift()` 只是转发 `collectProjectionDrift` 的薄包装（Middle Man），两处调用可直接内联。
3. judgement｜`checked` 现在同时含"已送达条目"和"未送达副本"，三个计数并列（`checked/skillDrift/attachmentDrift/unmanaged`）。
   字段名可能让 CI 消费者把 `checked` 读成"已交付数"。本轮不改公开字段（改名成本大于收益），
   但 doctor 那一格必须逐字段命名，不能只报一个总数。

§4 文件粒度：`projection-drift.mjs` 121 行、测试 172 行，均低于 400；kebab-case；单一职责 ✓。
12 条 smell：Duplicated Code 见第 1 条；Middle Man 见第 2 条；Speculative Generality 未见
（`clients` 覆盖参数有真实消费者——正是那个交叉检查）；其余 9 条未见。

## Spec（hard 1 / judgement 1）

4. **hard｜工作项未完成**：C9/C10 本轮达成，但 C4（doctor 机读漂移 + unmanaged 数）、C6（`aios update`
   重生投影，grep 实测仍零命中）、C0/C5（子模块内 Provider 第 0 步 wiring 担保测试）仍未实现。
   `completionClaim` 保持 soft。
5. judgement｜C3 的证据口径已修正为全集口径（153），旧的 85/81 两组数字在 test-scope 里标注为"部分表面，不能当验收结论"，
   避免下一个人拿旧数字交差。V1（工具进版本控制 + 登记回归套件）与 C8（附属物单独报数）保持达成。

verdict：`changes-requested`。本轮差异自身无硬违规；不通过的理由是工作项还有 4 条标准没实现。
类型化裁决见 `...-review-delivery-round2.json`。
