# AIOS 宣传片 · Remotion 子应用（竖版 9:16）

30 秒 / 1080x1920 / 30fps 的 AIOS 短视频广告，投抖音 / 小红书 / 视频号。8 个分镜全部由 React + SVG
代码绘制：零外部素材、零网络依赖、可离线复现、可在 CI 重渲染。本片是一个**独立子应用**，不参与 AIOS
运行时，不被 `mcp-server` 或根 `scripts/` import。

```bash
cd video
npm install
npm run typecheck
npm test
npm run studio                                    # 浏览器实时预览
npm run render -- --output out/aios-promo.mp4     # 真实渲染，进度实时打印
npm run render -- --still --frame "45,145,255,355,470,505,595,660,700,820,880"   # 只出问题稿
```

## 为什么是竖版、为什么没声音

平台默认静音自动播放，所以**硬字幕就是旁白**：台词写在 `src/timeline.json` 里，由 `PromoVideo.tsx`
注入场景，`Captions` 组件按帧区间显示，同一时刻只出一条。音频刻意不做——加了也用不上，还会让
「离线可复现」这条约束破掉。

排版跟着这个决定走：

- 内容只放在 `layout.contentTop(250) .. contentBottom(1330)`，避开顶部搜索栏与底部文案遮挡带。
- 字幕盒宽 920、字号 52，`tests/timeline.test.mjs` 按全角 1 em / 半角 0.55 em 估算宽度，超过一行
  就红，防止中文折行留下孤字。
- 单场 3~5 秒（同一个测试断言），超出即滑走。
- 每场都有推镜（`Stage` 里 `scale 1 → 1.042`）和硬切白闪，静止画面在短视频里等于没做完。

## 分镜表（storyboard）

时间轴唯一来源是 `src/timeline.json`，`src/timeline.ts` 与 `scripts/render.mjs` 都读它；
`tests/timeline.test.mjs` 断言总帧数、连续性、节奏、字幕覆盖与「每个 scene id 都有对应场景文件」。

全片跟一个真实任务走：`/implement 重构浏览器层，测试全绿`。

| 帧区间 | 秒 | 场景 id | 画面 | 字幕 |
| --- | --- | --- | --- | --- |
| 0–90 | 0–3 | `hook` | 116px 大字两行「一句话，/ 整晚交给它」+ 终端打出 `/implement 重构浏览器层，测试全绿` | 让 AI 跑一个 40 分钟的活。/ 一句话就派出去了。 |
| 90–190 | 3–6.3 | `crash` | 进度条冻在 78% 转红、画面抖一下、会话日志吐 `kernel killed the process` / `exit code 137`，下方两枚代价 chip | 第 18 分钟，进程被杀掉。/ 上下文全丢，只能从头再跑。 |
| 190–300 | 6.3–10 | `resume` | 竖向断点轨道：两个 `ckpt-N` 检查点 + 红色「断」+ 从最后检查点重新推进的青→绿段；右侧两张节点卡 `.aios/`、`--session` | AIOS 把每一步都落了检查点。/ 早上八点对它说：接着跑。 |
| 300–400 | 10–13.3 | `route` | 五枚命令 chip（`/plan /implement /review /debug /team`）+ `direct / guarded / planned` 三张处方卡 | 它不猜你想要什么。/ 命令面声明意图，流程分三档。 |
| 400–520 | 13.3–17.3 | `work` | 真实 IDE：三个文件标签 + 逐行揭开的 diff（`−` 红 / `+` 绿），下方 `$ npm test` 与滚到 128 的计数器 | 接下来它一直在干活。/ diff 一行行长出来。/ 测试也跟着跑完。 |
| 520–640 | 17.3–21.3 | `team` | 一张工作项卡扇出 4 个文件所有权节点，汇入 `merge gate`（`checking… → 4/4 merged`），两枚状态 chip | 活太大？拆成独立工作项并行跑。/ 收口有一道闸门：不合格打回。 |
| 640–750 | 21.3–25 | `proof` | `Fact → Capability → Evidence` 三节点连线，下面四条主张逐条打勾 | 它说「做完了」不算数。/ 每条主张都要留下可复核的证据。 |
| 750–900 | 25–30 | `cta` | `A` 字标 spring 弹入 + `AIOS 6.3.0` + 10 枚客户端 chip 网格 + `$ aios init` 终端 + 三枚收束 chip | 断掉能续，干完有证据。/ 十个客户端，一套记忆。/ 一条命令，今晚就交给它。 |

## 画面主张与代码证据

屏上不再印 `file:line` 角标（那是评审产物，观众不看），证据留在本表。以下路径在 2026-10-13 逐条
打开确认；AIOS 源码重构后若行号漂移，改场景而不是改说法。

| 场景 | 屏上主张 | 证据 |
| --- | --- | --- |
| `hook` | `/implement` 是真实命令前缀，路由结果落 `planned` | `scripts/lib/cli/commander/specs/execution.mjs`（`/plan /implement /review /debug /team` 命令面）· `scripts/lib/planning/contract/workflow-policy.mjs:14`（`WORKFLOW_DISPOSITIONS = noop/direct/guarded/planned`） |
| `crash` | 会话交接文件按 session 落盘，进程一死上下文就没了 | `scripts/lib/contextdb/context-registry.mjs:19`（`{contextDb}/sessions/{sessionId}/handoff.json` 路径模板） |
| `resume` | 迭代检查点落盘；续跑是显式动作，不自动放行 | `scripts/lib/harness/solo/solo-runtime/checkpoint.mjs:43`（`writeSoloIterationCheckpoint`，缺 session meta 时返回 `persisted:false` 而不是伪造）· `.../solo-runtime/should-run.mjs:38`（`resolveShouldRun`）· `:50`（`operatorGateAcknowledged` 未确认时 human-gate / budget-exhausted 一律不放行） |
| `route` | 只读与否由代码硬返回，绝不从措辞猜 | `scripts/lib/planning/contract/workflow-policy.mjs:277`（`isReadOnlyMessage()` 直接 `return false`） |
| `work` | 屏上 IDE 标签是真实存在的浏览器层文件；diff 画的是 CDP attach / 本地启动那条真实分支（函数名为示意） | `mcp-server/src/browser/launcher.ts:300`（`resolveExecutablePath(profile)`）· `:322`（`chromium.connectOverCDP(cdpEndpoint)`）· `:254`（`chromium.launchPersistentContext`）· `mcp-server/src/browser/health.ts:31`（`resolveCdpEndpoint`）· `mcp-server/src/browser/actions/navigate.ts`；`npm run typecheck` = `tsc --noEmit`（`mcp-server/package.json`） |
| `team` | 合并前有一道独立性闸门；默认模拟，真实执行要环境变量 | `scripts/lib/harness/team/subagent-runtime/merge-gate.mjs:43`（`executeMergeGateJob`）· `scripts/lib/harness/orchestration/orchestrator-runtimes/simulation.mjs:69`（`status: 'simulated'`）· `.../orchestrator-runtimes/constants.mjs:5`（`LIVE_EXECUTION_ENV = 'AIOS_EXECUTE_LIVE'`） |
| `proof` | 13 个能力 ID，与 Provider 无关；证据接受后 token 轮换；证据只追加 | `rex-harness/src/domain/capability-ids.mjs:3`（`CAPABILITY` 冻结表，`Object.keys(CAPABILITY).length === 13`）· `rex-harness/src/domain/turn-contract.mjs:69`（「token 在每次接受证据后轮换，因此旧 token 派生的 effectRef 永远无法重复结算」）· `rex-harness/src/standalone/store.mjs:167`（`appendEvidence`，NDJSON Evidence Journal） |
| `cta` | 10 个已注册编码客户端；MIT；6.3.0；`aios init` 是入口 | `scripts/lib/clients/core/definitions.mjs:15`（`CLIENT_DEFINITIONS`，实测计数 10：codex, claude, gemini, opencode, hermes, grok, workbuddy, pi, zcode, qoder）· `LICENSE`（MIT）· `VERSION`（6.3.0）· `scripts/aios-init/`（`aios init` 子命令） |

**刻意没有出现的画面**：README 营销段落、模型注册表里的 benchmark 字符串、任何没在代码里落地的
路线图能力，以及上一版横片里的抽象节点示意图——观众看不出那是一台电脑在干活。本片只画能截图成
真实界面的东西：终端、diff、测试计数、文件标签。

## 可见渲染进度

`npm run render`（`scripts/render.mjs`）把 Remotion 的 `onProgress` 归一后同时输出三个通道：

1. **TTY**：单行 `\r` 进度条，实时刷新。
2. **非 TTY**（Agent / CI 捕获）：每 2.5% 打一行，保证中间过程可被日志观察到。
3. **JSON**：`out/render-progress.json` 节流写入，供外部轮询。

```
██████████░░░░░░░░░░░░░░░░░░░░░░░░   21%  frame  189/900  crash   render 1.4MB  eta 02:06
```

字段依次是：34 格进度条、百分比、`已渲染帧/本次总帧`、当前场景 id、Remotion 透传的 `stitchStage`、
已写出的 mp4 体积、按真实渲染速率算出的 ETA（不把 bundle 耗时算进剩余时间）。

换场景时插入一行 `✔ 上一场完成 → 进入 <id> · <label>`；整体阶段为
`[1/3] bundling`（每 10% 刷一次）→ `[2/3] rendering video`（`▶ render started · 30.00s of video`）
→ `[3/3] done`（`✔ out/aios-promo.mp4  <MB>  用时 mm:ss`）。静帧模式走
`[2/3] rendering N still(s)`，每帧一行 `✔ frame <N> → out/still-<NNNN>.png`。

`out/render-progress.json` 的 `phase` 取值：`render`（渲染中）、`still-done`、`done`。渲染中样本：

```json
{
  "phase": "render",
  "percent": 21,
  "renderedFrames": 189,
  "totalFrames": 900,
  "currentScene": "crash",
  "currentSceneLabel": "进程中断",
  "etaSeconds": 126,
  "elapsedSeconds": 31,
  "outputMb": 1.4,
  "stitchStage": "render",
  "compositionId": "AiosPromo",
  "outputFile": "E:\\coding\\harness-cli\\video\\out\\aios-promo.mp4",
  "concurrency": 10,
  "updatedAt": "2026-10-13T06:41:02.207Z"
}
```

JSON 写入按 350ms 节流、完成时强制落一次，所以外部轮询方（主线程监控子代理分段进度）读到的是最后
一个状态而不是中间状态。

参数：

| 参数 | 作用 |
| --- | --- |
| `--output <path>` | mp4 输出位置，默认 `out/aios-promo.mp4` |
| `--still` | 只渲染静帧，一次 bundle 出多帧，用于画面验收 |
| `--frame "45,145,255"` | 配合 `--still`，逗号分隔帧号，产出 `out/still-NNNN.png` |
| `--scene <id>` | 只渲染某个分镜的帧区间（并行派发时子代理交付分段素材） |
| `--concurrency <n>` | 默认 `min(核数-2, 10)`，下限 2 |
| `--browser <path>` | 指定本机 Chrome/Chromium；Chromium 启动失败时脚本会打印这条提示 |
| `--composition <id>` | 覆盖 `timeline.json` 里的 `compositionId` |

并行派发分镜工作项时，本文件的分镜表 + 证据表是 `promo-video-pipeline` 技能的冻结合同输入：
主线程先固定 `src/components/`、`src/theme.ts`、`src/timeline.json`、`src/PromoVideo.tsx` 的注册顺序
和 `SceneProps` 契约，子代理只认领自己的 `src/scenes/<id>.tsx`（`--scene <id>` 就是它的自验命令）。

## 目录与约束

```
video/
├── package.json          # 独立依赖：remotion 4.0.535 + react 18，不与根工程共用 node_modules
├── tsconfig.json         # strict + jsx react，npm run typecheck = tsc --noEmit
├── README.md             # 本文件：分镜表 + 证据合同
├── src/
│   ├── Root.tsx index.ts PromoVideo.tsx      # Composition 注册与场景宿主（Chrome/Rail 常驻）
│   ├── timeline.json timeline.ts theme.ts   # 单一时间轴、台词与视觉基线
│   ├── components/      # stage terminal text panel diagram ide（共享，主线程所有权）
│   └── scenes/          # 8 个分镜，各自只依赖 components
├── scripts/render.mjs    # 带可见进度的 bundle + renderMedia/renderStill
└── tests/timeline.test.mjs
```

- 场景组件只有一个入参契约 `SceneProps = { localFrame, durationInFrames, captions }`（`src/timeline.ts`）：
  台词由主线程下发，场景文件不自带字幕数组，`tests/timeline.test.mjs` 会直接拒绝内联 cues。
- `src/scenes/` 恰好 8 个文件，受仓库目录预算（≤8）约束；新增分镜要先做语义合并。
- 不加载 webfont：CJK 依赖渲染机字体。Windows 走 `Microsoft YaHei UI`，Linux/CI 需装 `Noto Sans SC`，
  否则中文回退字体导致画面宽度变化——画面验收以本机渲染静帧为准。
- `out/`、`node_modules/`、`remotion-out/`、`dist/`、`.cache/` 全部 gitignore：渲染产物不入库。
- 单场景文件保持一屏职责，动画一律 `localFrame` 驱动（`useVideoConfig` 只在 `cta` 的 spring 和
  `BreakTrack` 里用），因此每个分镜可独立重渲染验证。

## 复现验收

```bash
cd video && npm install
npm run typecheck                      # tsc --noEmit，0 错误
npm test                               # 10/10：画幅 + 时长 + 节奏 + 字幕覆盖 + 注册顺序 + 单真源
npm run render -- --still --frame "45,145,255,355,470,505,595,660,700,820,880"
                                       # 人眼检查静帧：溢出、撞字、遮挡、留白空档
npm run render -- --output out/aios-promo.mp4                     # 全程可见进度
# 用仓库自带的 ffprobe（本机没有全局 ffmpeg）核对时长与分辨率
node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe \
  -v error -show_entries format=duration:stream=width,height -of default=nw=1 out/aios-promo.mp4
node -e "const p=require('./out/render-progress.json');console.log(p.phase,p.percent)"   # done 100
```

期望：`duration` ≈ 30.0，`width=1080 / height=1920`，进度文件终态 `phase=done`。

静帧是主要的画面验收手段：本片所有排版问题（面板撞字、diff 出框、字幕折行留孤字、轨道压进度条）
都是在静帧里发现的，不是在读代码时发现的。改完场景先出静帧，再跑整片。

横版 60 秒的第一版已作废并归档在 `out/archive-landscape-60s.mp4`（gitignore，不入库）；被删掉的横版
场景源码留在 `out/landscape-src-archive/`，同样不入库。
