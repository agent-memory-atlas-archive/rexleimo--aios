# Pi 停顿自愈 — 测试范围契约（rex-test-design / software.testing.design / design-tests）

activationId: `724c7cf2-e0e4-448f-8f6c-c59e0712daac` · capability: `software.testing.design` · stage: `design-tests` · reasonCode: `explicit-intent-implement`

本文件只决定**测什么、从哪里观察**。不执行实现，不升级为严格 TDD，不调用下一个 Provider。

## 1. 证据基线（决定"为什么是这三条"的实测数据）

扫描对象：`~/.pi/agent/sessions`，226 个会话文件 / 60,673 个 assistant 轮次 / 126,264 条消息。分类器不是自造正则，而是直接调用 pi 自己的
`@earendil-works/pi-ai` `isRetryableAssistantError()`，因此"会不会自动重试"是产品事实而非推断。

| 实测事实 | 数值 | 对应本次范围内行为 |
|---|---|---|
| `400 developer is not one of ['system'…]` 硬停（bailian） | 10 次，全部 ≤2026-09-18 | A1 compat 自愈 |
| 同类形态的第二例：`meqwen` `compat:{}` + `reasoning:true` | 同风险面，未爆发 | A1（判定式必须覆盖它） |
| gate 拦截 `rm -rf …AIOS safety gate` | 135 次 | A2 |
| 其中拦截后 run 立即终止（下一条是 `user` 重新发话或会话结束） | **99 次（73%）** | A2 |
| `This operation was aborted` + `stopReason:"error"` | 55 次（bailian 24 次），往返延迟中位数 **0s**、240–360s 窗口 **0 例** | 判定为 Esc 打断长命令的残留，**非** provider 超时；故本次不改 retry/timeout，见 §3 |
| `before_agent_start` → `runAios` `execFile(…, {timeout:120000})` | 正常 0.57s；CLI 卡住时每轮起始静默最长 120s | A3 |

pi 侧语义依据（不是本仓库的猜测）：`docs/extensions.md:253` "Return `terminate: true` only when the agent should skip its automatic follow-up…"；
`dist/core/extensions/types.d.ts:1093-1097` 同义注释。

## 2. 用户目标（已勾选的 ✅ 三项）

1. **A1 compat 确定性自愈**：`aios init --agent pi` 对 pi `models.json` 做 additive 合并，给 `reasoning:true` + `api:openai-completions` + 非 OpenAI 标准 baseUrl + compat 未声明的模型补 `supportsDeveloperRole: false`，消除 `400 developer is not one of` 硬停。
2. **A2 gate 不再掐停 run**：`packages/aios-pi/lib/gates.mjs` bash 拦截返回 `terminate` 不为 true；拦截原因仍作为 toolResult 交回模型。
3. **A3 起始钩子有界**：`runAios` 的 `execFile` 超时 120000ms → 8000ms，`before_agent_start` 不得把每轮起始静默拉过 8s。

## 3. 明确非目标（防范围膨胀）

- 不改 `retry.*`、`httpIdleTimeoutMs`、`compaction.*` 的任何值（那是表里 ⚠️/🟡，用户未勾选；且 55 例 `This operation was aborted` 实测 0s 往返，证明它们不是超时类，调 timeout 无收益）。
- 不做 L2 `session_start` 只读自检，不做 L3 `agent_before_settle` 续命。
- 不修配额、不做长命令纪律规则、不改 `meqwen` 的 `baseUrl`（只允许 doctor 报告，不允许自动改）。
- 不新增 `--yes-pi-resilience` 之外的 flag 语义；不改 `mcp.json` 合并逻辑；不改 `packages/aios-pi/lib/offload.mjs`。
- 不自动换 model/provider（成本与质量属用户决定）。

## 4. 范围内行为 → 可观察断言（一条行为一个断言，禁止用内部调用次数代替行为）

公共入口优先。每条断言的观察对象是**磁盘上的真实文件或函数返回值**，不是 mock 的调用计数。

### A1 · `ensurePiCompatSelfHeal({ modelsJsonPath, dryRun, io })`（新公共入口）

| ID | 场景 | 断言（观察事实） |
|---|---|---|
| A1-1 | 缺 compat + `reasoning:true` + `openai-completions` + 非标准 baseUrl | 写后**重新读回文件**：该模型 `compat.supportsDeveloperRole === false`；其余键、其余 provider 逐字段不变 |
| A1-2 | 用户已显式写 `true` | 返回 `action: 'kept-user-value'`；文件字节完全不变（哈希前后相等） |
| A1-3 | `dryRun: true` | 返回 `would-add` 预览；文件字节完全不变 |
| A1-4 | `models.json` 非法 JSON | 抛错且**不产生/不覆盖任何文件**（fail closed，沿用 `refusing to clobber` 纪律） |
| A1-5 | 已是 `false`（重复运行） | 返回 `action: 'present'`；文件字节不变（幂等） |
| A1-6 | 标准 OpenAI/Anthropic baseUrl | 返回 skipped/not-applicable；不写 |

判定式必须同时覆盖 bailian（已手工修复的现存实例，A1-5 即它）与 `meqwen`（`compat:{}`，A1-1 用它的形状构造），因为 A1 的价值在于**同类形态不再复发**，不在于修好某一个文件。

### A2 · `decideToolCall({ toolName, input })`

| ID | 场景 | 断言 |
|---|---|---|
| A2-1 | `bash` + `rm -rf /x` | 返回 `{ block: true, reason: /AIOS safety gate/ }` 且 **`result.terminate !== true`** |
| A2-2 | `write` 到 `.env` / `node_modules/` | 行为与现状一致：`block:true`、`terminate:false`（回归保护，证明只动了 bash 一支） |
| A2-3 | 普通 `bash` + 普通 `write` | 返回 `undefined`（放行） |

A2-1 是**断言方向翻转**：现有 `scripts/tests/clients/pi-agent/pi-extension.test.mjs:27` 用例名与期望写着 "terminate the turn"。本次改变的就是该行为，因此必须改写该断言并在用例名/注释里写明新语义；这是行为变更的表达，不是"放宽期望求通过"。

### A3 · `runAios({ aiosRoot, argv, execFileImpl })`

| ID | 场景 | 断言 |
|---|---|---|
| A3-1 | 注入 `execFileImpl` 记录 options | options.timeout **=== 8000**（不是 `< 120000` 这种放宽式期望） |
| A3-2 | `execFileImpl` 回调一个 error | 抛 `AiosCliError`，消息含 argv 首项与 stderr（失败路径不因超时下调而退化） |

### A4 · 集成：`aios init --agent pi` 与 `aios doctor`

| ID | 场景 | 断言 |
|---|---|---|
| A4-1 | init 带 `--dry-run` | 输出 `[plan] would …` 且 `models.json` 字节不变 |
| A4-2 | init 无 consent flag | 不写用户全局 `models.json`（一条性门：仓库外副作用必须显式授权），输出给出可执行的授权命令 |
| A4-3 | `doctorPiBridge` 增加 compat 检查 | 缺声明 → 一条 warn 且带 `--fix`/init 修复指引；已声明 → `[ok]`，warning 计数为 0 |

## 5. 允许修改 / 新增的测试缝

- 新增 `scripts/tests/clients/pi-adapter/pi-compat-self-heal.test.mjs`（A1、A4-1/A4-2 的纯函数部分；真实临时文件，走现有 `run-test-suite.mjs` 的 temp sandbox，测试自身不再建工程目录）
- 改写 `scripts/tests/clients/pi-agent/pi-extension.test.mjs`：`:27` bash 用例（A2-1/A2-2/A2-3）+ `:70` 区域新增 A3-1/A3-2
- 扩写 `scripts/tests/clients/pi-adapter/pi-doctor.test.mjs`：A4-3
- **不得**新增窄缝去测私有 helper；A1 只从 `ensurePiCompatSelfHeal` 入口观察，A3 只从 `runAios` 入口观察
- 禁止的假通过：删除/跳过用例、把 `=== false` 放宽成 `!== true`、只断言 mock 被调用、用 `dryRun` 结果代替真实读盘

## 6. 最小纵向切片（能独立失败）

**A1-1**。理由：A1 是本次唯一会**写用户全局文件**的行为，风险最高；A1-1 走真实临时文件 + 真实 fs + 公共入口 + 读盘验证，合并逻辑、判定式、写回、其他键保全任意一处坏掉都会独立变红，且不需要 A2/A3/A4 的任何配合。A2-1、A3-1 各自是单条断言的独立切片，不依赖 A1。

## 7. 完成判据（已接受 + 否定条款）

已接受（必须全部为真才可声称完成）：

1. `node --test scripts/tests/clients/pi-adapter/pi-compat-self-heal.test.mjs scripts/tests/clients/pi-agent/pi-extension.test.mjs scripts/tests/clients/pi-adapter/pi-doctor.test.mjs` 全绿，输出留存于交付。
2. `npm run test:affected` 全绿（真实输出，非勾选框）。
3. `node scripts/aios-standards.mjs standards check --root . --rule directoryEntries`（或 `aios standards check`）对新目录返回 pass：`scripts/lib/tooling/components/integrations/pi/` 当前 3 项，新增 resilience/compat owner 文件后仍 ≤8。
4. 版本与变更日志：按 `versioning-by-impact` 判定（行为变更 + 新公共面 → 至少 minor），CHANGELOG 写明"gate 不再终止 run"是可见行为变化。

否定条款（明确不接受）：

- 不接受"改代码但留旧断言注释掉"；不接受为过测试而把 `terminate` 语义改成两可。
- 不接受在用户机器上未授权写 `~/.pi/agent/models.json`（A4-2 是这条的担保）。
- 不接受把 ⚠️/🟡/❌ 行（retry、timeout、配额、长命令纪律、baseUrl 改写、L2/L3）混进本批交付。

已有 sediment（沿用的既有契约，不重造）：`scripts/tests/clients/pi-adapter/pi-extension-settings.test.mjs` 的 5 条用例已确立 `present / would-add / added / fail-closed on invalid JSON` 四态 + "preserves other keys" 语义。A1 的状态机与断言风格必须与它一致，因为两者写的是同一族用户配置文件。
