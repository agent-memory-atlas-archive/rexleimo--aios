# Harness²/JobBench × AIOS 原生臂 证据包（2026-10-19/20）

主结论：同任务（management_analysts/task1）、同模型（agnes-3.0-flash）、同客户端（pi headless），
唯一变量 = 工位有无 AIOS 工程纪律；多轮判分：裸 51.1%（中位）→ AIOS 85.8%（均值），**Δ +34.7pp**。

| 文件 | 内容 |
| --- | --- |
| `arms/bare/output/` | 裸工位臂交付物（xlsx/csv/docx/answer.md） |
| `arms/aios/output/` | AIOS 工位臂交付物 |
| `arms/*.log` | 双臂 pi headless 会话输出 |
| `arms/aios/AGENTS.md` | AIOS 工位注入件本体（AIOS NATIVE 政策块：工作流路由/规划先行/编辑前门禁/证据收口）——A/B 的处理变量原文 |
| `RESULT_quickjudge_pi_{bare1,aios1}.json` | 主结论双臂逐条 rubric 判分明细 |
| `RESULT_quickjudge_{base1,inv1,dom1,agg1}.json` | harness² ladder 历史单轮判分（已作废为结论依据，留作噪声样本审计） |
| `stability.log` | 多轮重复判分原始记录（判分器方差 ±15pp 的出处） |
| `run_one_round.sh` / `run_subset10_jb7.sh` | harness² ladder 复现 driver（§4.4 历史臂起跑命令；runs 目录在 `~/harness2/runs/jb7-jb9`，未入库） |
| `quickjudge.py` | 判分脚本（密钥运行时从 ~/.pi/agent/models.json 读取，包内无凭据） |

口径：non-leaderboard / AIOS-config measurement。判分器 = 同型号 agnes（自判偏差见技术报告 §5）。
上下文：`docs/reports/2026-10-19-harness2-jobbench-aios-comparison-article.md`（v1.2 §4.5 主结论）。
