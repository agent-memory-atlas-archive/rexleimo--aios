# 多渠道分发草稿：Qwen 3.8 Flash + AIOS + Pi 宣传博文

Date: 2026-10-16
Status: draft for human review and publish（按 runbook：Agent 起草，人审核发布）
Primary link: https://cli.rexai.top/blog/2026-10-qwen-flash-aios-pi/
中文原链: https://cli.rexai.top/blog/zh/2026-10-qwen-flash-aios-pi/
Repo: https://github.com/rexleimo/aios

配图清单（按平台取用）：
1. `blog-site/assets/qwen-flash-aios/token-usage-30d.png` —— 36 亿 token + 96% 缓存命中（首选封面）
2. `blog-site/assets/qwen-flash-aios/shot-live-memory.png` —— 模型自己写记忆的 live 截图
3. `blog-site/assets/qwen-flash-aios/shot-memo.png` —— 里程碑 checkpoint 钉记忆
4. `blog-site/assets/qwen-flash-aios/shot-adr.png` —— ADR 决策记录

统一口径：36 亿 token（真实截图）、~40% 提升（标注为日常使用观察）、对标 GPT-6 Sol 单用境界、卖点 = 人人能把需求说清楚就能做开发。

---

## 一、小红书（中文，个人体感向）

**标题（≤20字）**：小模型一个月跑36亿token，我服了

**正文**：

说出来你可能不信，这个月我的主力编码模型，是一个"小模型"。

Qwen 3.8 Flash，中等思考档，接在 Pi coding agent 里，外面套了一层 AIOS。一个月烧掉 **36.28 亿 token**，缓存命中率 **96%**（图1是我用量面板的原图）。

以前我也觉得小模型干不了重活。直到我把环境换了个思路：

 它忘了？——AIOS 把每个里程碑钉进项目记忆，说"继续"真的能继续，不用重新解释背景
✅ 它糊弄？——想对我说"做完了"，必须先过测试、diff、截图这些硬证据，它骗不了我
📋 它跑偏？——需求没说清楚它会先反问我，一次只问一个决策性问题，问到能验收为止

最狠的一张图是图2：任务做到一半，模型自己调用记忆接口，把"Dockerfile 只 COPY 白名单脚本"这个反复踩的坑钉进了项目记忆。没有人要求它记，**它决定记**。

一个月下来我的体感：这套组合的日常交付水平，能对标旗舰大模型 GPT-6 Sol 单用的境界。模型小一号，成本降一档。

而且 AIOS 真正的卖点根本不是省 token——是**让每个人都能做软件开发**。你不需要会写代码，你需要的是把需求说清楚。说清楚需求，是人本来就会的技能。

从平台产品到网关监控到内容管线，我 E 盘那一排项目全是这套组合写的，每一个的起点都是一句话需求。

🔗 项目：github.com/rexleimo/aios（评论区放直达）
⏱️ 安装 30 秒，跑一天就知道差距

#AI编程 #AIAgent #开发者工具 #效率工具 #人工智能 #编程 #独立开发者

**发布建议**：封面用图1（数字冲击），图2 放第二张（live 截图最有说服力）；链接放评论区（小红书正文外链会限流）。

---

## 二、掘金（中文，技术向）

**标题**：把 Qwen 3.8 Flash 用到 GPT-6 Sol 单用的境界：一层控制平面做了什么（月耗 36 亿 token 实测）

**摘要/导语**：

一个月 36.28 亿 token、96% 缓存命中率、主力模型是一个中小尺寸的 Qwen 3.8 Flash——这不是调参玄学，是把"环境"换掉了。本文用真实用量截图、内部工件（ADR / 记忆 checkpoint / sha256 证据封套）和一整条 E 盘项目清单，讲清楚 AIOS 这层 local-first 控制平面如何让小模型的日常交付对标旗舰模型单用，以及为什么它的真正卖点是"人人能做开发"。

**正文骨架**（细节导流到博客全文）：

1. 数据先行：3627.97M token / 96% 缓存命中（截图原图）——命中率不是模型挣的，是记忆常驻 + pull-based 上下文 + 压缩拦截层挣的
2. 小模型的失败模式不是"想不对"，是"忘了、偏了、没验证就交"——这三类恰好全归控制平面管：
   - 跨会话记忆与 checkpoint 恢复
   - `/grill` 需求澄清：先查证、一次一个决策性问题、带假设提问、3 轮收敛
   - 证据门禁：完成声明必须先过测试/diff/截图
3. 内部工件实拍：ADR 决策记录、pinned 记忆（"验证：pnpm test 全绿"写在旁边）、证据封套（baseline/candidate contentSha256，做没做完由哈希说了算）
4. 对比表：裸 Pi+Qwen vs +AIOS——完成率相对提升约 40%（一个月日常使用观察，非受控基准，口径见原文）
5. 交付清单：aios-pro、inkloom.im、huabu、rex-ai-tools、discourse-worker、内容站管线……全部同一套组合产出
6. 在 Pi 里跑起来：`aios init --all` 三条命令，本地运行数据不出机器

**全文链接**：https://cli.rexai.top/blog/zh/2026-10-qwen-flash-aios-pi/?utm_source=juejin&utm_medium=post&utm_campaign=qwen-flash-aios

**标签建议**：AI 编程 / Agent / 开源 / 工具 / 大模型应用

**发布建议**：掘金对纯营销文会限流，正文保持技术骨架完整、把"40% 是宣传口径"的诚实脚注带上，反而更容易过社区审。

---

## 三、知乎（中文，回答体/文章体）

**标题**：小模型 + 好环境，能不能替代旗舰模型写代码？（一个月 36 亿 token 实测）

**开头**：

先给结论：**能到日常交付对标 GPT-6 Sol 单用的水平，但前提不是模型变强，而是你把环境补齐了。**

过去一个月我把主力编码模型换成 Qwen 3.8 Flash（中等思考档），跑在 Pi coding agent 里，外面套一层 AIOS 控制平面。这是用量面板原图：36.28 亿 token，96% 缓存命中。

**正文逻辑**（知乎体，重论证）：

一、为什么小模型"看起来不行"。
拆开看，它的失败三类：忘了（跨会话失忆）、偏了（需求没对齐就开写）、糊弄（没验证就报完成）。注意——这三类没有一类是"智力问题"，全是流程问题。而流程问题，本来就不该由模型独自承担。

二、控制平面做了什么。
- 记忆：里程碑自动钉 checkpoint，验证行写在旁边；说"继续"，真的继续
- 对齐：`/grill` 需求澄清不赌你"恰好说清楚"——先查仓库，再一次只问一个决策性问题，3 轮内收敛成可验收规格
- 防糊弄：想报"完成"，先过测试、diff、截图；证据封套里 baseline/candidate 的 sha256 机器可复核
- 最有说服力的一张图：任务中途模型自己调用 `aios_memory_write` 把反复踩的坑钉进记忆。没人要求它记，它决定记——记忆系统真正的形态不是查表，是习惯

三、代价与口径。
完成率相对提升约 40%——这是个人日常使用观察，不是学术基准，我在原文里也这么标注。但机制可验证：环境错误率压下去，模型原始能力的利用率就上来。

四、这件事真正重要的地方。
不是省钱。是"开发者"的门槛从"会写代码"变成"说得清需求"——后者是人本来就会的技能。我 E 盘一个季度的项目（平台产品、网关、监控、内容管线）全部由这套组合从一句话需求长出来。

**结尾 CTA**：项目开源本地运行，安装 30 秒：github.com/rexleimo/aios ｜ 全文含截图与工件图：cli.rexai.top/blog/zh/2026-10-qwen-flash-aios-pi/?utm_source=zhihu&utm_medium=article&utm_campaign=qwen-flash-aios

**话题建议**：人工智能 / 程序员 / GitHub 开源项目 / AI 编程工具

---

## 四、X（英文 thread）

**Thread 8/8**：

1/
I ran a small model as my primary coding agent for a month.

Qwen 3.8 Flash (medium thinking) inside Pi, wrapped in a local control plane called AIOS.

Result: 3.63 BILLION tokens, 96% cache hits, and delivery that rivals flagship GPT-6 Sol used solo. 🧵

2/
The panel, unedited:

• 3,627.97M tokens in 30 days — real daily work, not benchmark farming
• 96% cache-hit rate (3,459M of 3,604M input tokens)
• Peak day: 263M tokens

The model didn't earn that 96%. The layer around it did.

3/
Here's the thing about small models:

Their failure modes aren't "can't reason."
They're: forgets, drifts, ships unverified.

All three are ENVIRONMENT failures.
Push the environment error rate down and raw model utilization goes up. Same model, feels swapped.

4/
What the layer actually does:

• Memory: every milestone pinned as a checkpoint, with "tests all green" written beside it
• Grill: it won't start coding a vague ask — one decision question at a time, converges in ≤3 rounds
• Evidence gates: to say "done" it must pass tests, diffs, screenshots first

5/
My favorite artifact: mid-task, the model called aios_memory_write on its own — pinned a repeated trap ("Dockerfile runtime stage only COPYs allowlisted scripts") into project memory.

Nobody told it to remember. It decided to remember.

That's a habit, not a lookup table.

6/
The receipts aren't adjectives:

• ADRs for settled decisions (even "we won't follow the upstream rename" has a quote + date)
• sha256 evidence envelopes — done is decided by hashes, not vibes
• A whole drive of shipped projects, each one starting as a single sentence

7/
But the real selling point isn't tokens or cost.

It rewrites who counts as a developer:
from "can write code" → "can state a requirement."

Software development is becoming something anyone can do. AIOS is the machine that exchanges "described clearly" for "delivered."

8/
Repo (local-first, open source, 10 clients incl. Pi/Codex/Claude Code):
👉 github.com/rexleimo/aios

Full write-up with screenshots:
👉 cli.rexai.top/blog/2026-10-qwen-flash-aios-pi/?utm_source=x&utm_medium=thread&utm_campaign=qwen-flash-aios

Install takes 30s. One day shows the gap.

**发布建议**：tweet 1 配图 = token 面板截图；tweet 5 配图 = live 记忆写入截图（shot-live-memory.png）；thread 发完在主贴回复里挂博客链接一次即可，避免外链降权。

---

## 人工审核检查点（发布前逐项确认）

- [ ] 数字口径：36 亿 / 96% / ~40% / GPT-6 Sol 与博客一致，无"30B"残留
- [ ] 项目清单只含 AIOS 产出（无 sub2api / uptime-edge / general_agent）
- [ ] 各平台外链政策：小红书正文不放外链；掘金/知乎/X 可放
- [ ] UTM 链接按渠道替换（juejin / zhihu / x / xiaohongshu）
- [ ] 发布后 72h 回收点击数据（runbook 要求）
