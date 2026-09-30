# Frozen token-bench task set (held-out)

规则（借鉴 SoL-Pi 的验证纪律）：

1. **冻结**：加入本目录的任务即冻结，只做终审，永不按结果调参；改任务 = 新任务新 id。
2. **扩充**：从真实任务历史里挑不同长度档（短/中/长），走 code review 后加入；每条必须有客观 `checks`（当前仅 `reply_contains`，后续按需扩类型，需同步 `validateTask`）。
3. **跑分**：`node scripts/token-bench/run.mjs --dry --json` 验证；去掉 `--dry` 真跑（消耗真实 token，写入 ledger session `token-bench`，layer `pi_usage`，带 `task_id` 归属）。
4. **两道闸门**：任何压缩机制要默认开启，必须在同一冻结集上证明"能力检查全过 + saved_tokens > 0"。
