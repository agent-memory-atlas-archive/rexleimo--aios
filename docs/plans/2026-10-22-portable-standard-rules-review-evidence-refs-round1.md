# Review — work-evidence-ref-integrity (round 1)

- Verdict: **pass-with-findings-fixed**（两条在轮内修掉并有真实回执，一条判断性发现只记录不动）
- Fixed point: 子模块 `5c537d5`（被审差异 = `4cd4dcc` + 轮内修复），父仓库 `72fd26df`（被审差异 = ticket `f4a1dc8f` + 指针 `69697f53`）
- Diff 非空核对：`git -C rex-harness diff 5c537d5...HEAD --stat` → `application/validate-command-evidence.mjs`、`tests/standalone/evidence-ref-integrity.test.mjs`
- Spec 来源：`docs/plans/2026-10-22-portable-standard-rules-delivery-ticket.json` → `workItems[id=work-evidence-ref-integrity]`（5 条 completionCriteria）
- Standards 来源：`rex-engineering-standards`（§4 文件粒度：112 行，未越 400 预算）、`AGENTS.md` Coding Style / Testing Tiers
- 验证：子模块 `246/246`；父侧全量 `npm run test:regression` → files=237、tests=2294、fail=0、skipped=9、`temp_sandbox=removed`

## Standards

| # | 位置 | 证据 | 严重度 | 处置 |
|---|---|---|---|---|
| S-R1-1 | `validate-command-evidence.mjs:GIT_OBJECT_REF` | 原写 `/^git:[0-9a-f]{7,40}$/iu`；探针 `RE.test("git:ABCDEF0123456789ABCDEF")` 返回 `true`。git 对象 id 只会是小写十六进制，`i` 等于把大写占位符放进来，规则自我削弱 | **hard** | 轮内改为 `/u`，并在测试里加一条 `assert.throws(git:ABCDEF…)`；首跑即红（复现了缺陷），修复后 4/4。回执 `receipt:5539767a`（exit 0，命令 `node --test rex-harness/tests/standalone/evidence-ref-integrity.test.mjs`） |
| S-R1-2 | 同文件 ref 循环 | 同一句 `contains an invalid or placeholder ref` 被复制两遍（git 分支单写一次），报错文本出现两个所有者 → Duplicated Code | judgement | 轮内收敛成单一条件式 throw，git 规则并入原判定 |
| S-R1-3 | `receiptRefs = item.refs.filter(ref => ref.startsWith('receipt:'))` 与 `assert` 前的 namespace 判定 | `receipt:` 这个命名空间知识在应用层出现两处裸字符串判断，而 ref 归一化在 `domain/evidence.mjs`——命名空间的真正所有者 | judgement | **不在本轮修**：抽出 `isReceiptRef()` 会顺带决定 `artifact:`/`doc:` 是否也该由 domain 提供解析器接口（见 Spec S-R1-3），属另一项设计裁决，记录待办 |

12 条 smell 基线逐项结论：Duplicated Code（S-R1-2，已修）、Primitive Obsession（S-R1-3，字符串前缀当类型用，已记）、Mysterious Name 未见（`requireExpectedReceipt` 命名可读）、Feature Envy 未见、Data Clumps 未见、Repeated Switches 未见（`requiredReceiptExitCode` 仍是单张表）、Shotgun Surgery 未见（存在性校验收在一处，三条宿主入口都传同一个 resolver，实测 `rex-activation-store.mjs:294`、`rex-capability-runtime.mjs:304`、`store.mjs:389`）、Speculative Generality 未见（未加未需求的 amend 通道）、Message Chains 未见、Middle Man 未见、Refused Bequest 未见、过度嵌套未见。文件粒度：112 行 / 单一职责，未越预算。

## Spec

| # | 规格原文（ticket criteria） | 实现事实 | 严重度 | 结论 |
|---|---|---|---|---|
| S-R1-A | "任何 evidence kind 的 receipt: ref 必须能在本工作区 receipt store 解析到文件，解析失败在写账本之前抛出" | 已达成；`submitStandaloneEvidence` 的 `appendEvidence` 在校验之后，测试第 4 条正是按"账本没被写"来断言 | — | 满足 |
| S-R1-B | "artifact:/doc: 等非凭证命名空间保持原样" | 已达成并有守卫（第 2 条测试首跑即绿，防过度收紧） | — | 满足 |
| S-R1-C | "git: ref 必须是 7-40 位十六进制对象 id；跨仓库/子模块 odb 存在性证明列为非目标" | 形状规则达成（含轮内修的大写漏洞）；非目标在代码注释与 ticket 双处写明 | judgement | 满足，但**留下一个已知脏行**：activation `427dce66` 的账本里仍挂着 `receipt:00000000-…`，本项显式不做更正通道，所以那条假凭证无法标 superseded |
| S-R1-D | "按 kind 的退出码期望行为不变" | 不变；重构后仍是"先解析存在性，再按 kind 检查退出码"，白名单外只多了解析这一步 | — | 满足 |
| S-R1-E | 规格未要求但值得警惕 | 本项把伪造类缺陷**收窄**而非消灭：`artifact:`/`doc:`/`git:` 三类 ref 依然从不解析。审查用的一条 `doc:` ref 写错也不会被发现 | judgement | 需另立工作项：给 artifact:/doc: 定义可解析的边界（宿主 artifact store 或仓库内路径存在性），否则"ref 必须可核验"这句话只是半真 |

范围核对：diff 未出现规格外的行为（无 amend 通道、无新配置项、无宿主侧第二实现）。

## Round 2 — 审查过程中撞出的另一件事（与本轮同因）

为了取一张“修复后的全量回执”，我从宿主仓库根跑了 `node --test "rex-harness/tests/**/*.test.mjs"`，结果 243 pass / 3 fail；而 `cd rex-harness && npm -s test` 是 246/246。差异不是测试不稳定，是两条结构守卫把 `process.cwd()` 当成仓库根：

| # | 位置 | 证据 | 严重度 | 处置 |
|---|---|---|---|---|
| S-R2-1 | `tests/architecture/import-boundaries.test.mjs:6` `path.join(process.cwd(),'src')`；`tests/contract/package-boundary.test.mjs:6` `const packageRoot = process.cwd()` | 从宿主根跑时它们去量 `E:\coding\harness-cli\src\...`：两条 ENOENT，而第三条更报出 `forbidden catch-all directory: shared`——那说的是**宿主仓库**的目录，与本包无关 | **hard** | 轮内锈定到 `fileURLToPath(import.meta.url)` 上推三层的仓库根。红：`receipt:39a91aec`（exit 1）；绿：`receipt:077e69fe`（同一命令）与 `receipt:3ae89376`（从子模块目录跑那两条） |

这件事和本工作项同因：**一个量错根的检查不会报空，它会报假的违规。** 本轮差点再出一次：我原先把 `node --test rex-harness/tests`（目录形式）当全量运行，它 exit 1 但不是测试红，而是 Node 把目录当单个测试文件处理——退码从 `receipt --` 读回来才拦住了我拿一张空红当证据。

## 汇总

Standards 4 条（hard 2 已修 / judgement 2：1 已修、1 记录）；Spec 5 条判定，其中 2 条留给下一轮（假凭证行无法更正、非凭证 ref 仍不解析）。最严重项：Standards = S-R2-1（结构守卫量错仓库时会报一条假违规，已修并双 cwd 验证）；Spec = S-R1-E（伪造面只收窄未消灭）。
