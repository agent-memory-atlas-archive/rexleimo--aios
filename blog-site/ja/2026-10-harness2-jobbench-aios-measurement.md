---
title: "Google の Harness² パイプラインを再現し、AIOS harness を JobBench で実測した"
description: "非 GCP エンドポイントで harness2 の 4 脚ラダーを完全再現（solver/judge/improve すべて agnes-3.0-flash）：base 68.2% → improve 83.0%（+14.8pp）、domain 77.3%（+9.1pp）。方向は論文と一致、踏んだ穴と限界はすべて開示。"
date: 2026-10-20
tags: ["AIOS", "harness2", "JobBench", "ベンチマーク", "agent-harness"]
---

# Google の Harness² 評価パイプラインを再現し、AIOS harness の測定可能な比較を出した

> 状態：**最終版 (v1.0)** · 日付：2026-10-19 · 宣言：すべての数値は **non-leaderboard / AIOS 環境計測** — Google 公式とは計測条件が異なるため、座標系としての対照のみを行い、直接比較は行わない。

## TL;DR

- Google Research の [Harness²](https://github.com/google-research/harness2)（arXiv 2610.14224）は「再帰的に agent harness を改善する」評価パラダイムを提示した：WB-Bench **+11.5**、JobBench **+4.5**、LAB **+11.8pp**（single-step recursion）。
- 我々は自社エンドポイント（非 GCP/Vertex）で JobBench パイプラインを完全に再現した：**pinned opencode executor → 4 脚ラダー（base/improve/domain/aggregate）→ blind selection → LLM judge → report**、エンドツーエンドで実走成功（`RUN_EXIT=0 / JUDGE_EXIT=0 / REPORT_EXIT=0`）。
- AIOS の証拠チェーンは 3 つの実測済み：BBH-20 二脚 A/B（誠実なゼロ改善結論）、13 クライアント能力スコアカード（構造面）、JobBench スモーク 15.91%（n=1、パイプライン証拠）。
- 主要結果（1 タスク 4 脚実測、モデル統一 `agnes-3.0-flash`）：base 68.2% → improve **83.0%（Δ +14.8pp）**、domain 77.3%（+9.1pp）、方向は論文と一致（n=1、条件は §2/§5）。

## 1. Harness² と、対標する価値

Harness² の中核的主張：agent の成績はモデルだけでなく **harness**（ツール面・コンテキスト管理・反省ループ・ドメイン適応）で決まる。論文は再帰プロセスで harness 自体を改善し、3 ベンチマークで定量した：

| ベンチマーク | 領域 | 論文報告の改善（single-step recursion） |
| --- | --- | --- |
| WorkBuddy-Bench (WB) | オフィス業務（Tencent、カスタムライセンス） | +11.5 pp |
| JobBench (jb) | 65 タスク / 35 職種の実際の業務タスク | +4.5 pp |
| LAB | ロングホライズン agent タスク | +11.8 pp |

これは**座標系**であってスコアボードではない。AIOS のような harness 増強が有効なら、同種ベンチマークで同方向の Δ が出るはずだ。

## 2. 計測条件の宣言（なぜ leaderboard 数値ではないか）

公式パイプラインは既定で Gemini-Vertex チャネルを使う。再利用しない理由と開示：

| 次元 | 論文 | 本計測 | 影響 |
| --- | --- | --- | --- |
| solver | Gemini 系 | **`agnes-3.0-flash`**（Agnes AI、OpenAI-compatible `https://api.agnes-ai.cn/v1`） | 絶対点は非比較、**Δ の方向は比較可** |
| judge | gemini-3.1-pro クラス | **`agnes-3.0-flash`（solver と同一型号、自己評価バイアスは §5）**、rubric 項目別 + blind selection | 採点基準はズレるが全脚で同一 judge 固定 |
| ライセンス | WB は Tencent カスタムライセンス（EU 地域制限） | JobBench のみ（HF 公開データセット、revision 固定） | WB/LAB は非覆盖、数値引用なし |
| executor | pinned opencode `23fb5e05` | 同一 pin + 隔離ベア設定（プラグインなし） | 一致 |
| k | 複数 k | k=1、4 脚ラダー | 単一サンプル、信頼度は明記 |

## 3. パイプライン再現：踏んだ穴はすべて本物

公式 README に載っていないローカル技術課題を個別に記録 — すべて確定的証拠あり：

1. **`timeout` 欠如**：runner は GNU `timeout --kill-after` に硬依存、macOS に存在しない。Python shim で意味を再現（SIGTERM→SIGKILL、終了コード 124）。
2. **厳格 schema 検証がグローバル設定を破壊**：pinned opencode は `provider.*.models.*.modalities.output` に配列を要求、欠落字段 → 全タスク 0 バイト出力。解決策は隔離 `XDG_CONFIG_HOME` コピーで schema 補完、**ユーザーの originals は触らない**。
3. **`baseURL` の `/v1` パス**：pinned クライアントはパスを補完せず、`/v1` 欠落時はリクエストが 404 HTML に当たり、**静かに空 step_finish を生成**（tokens 0、エラーログなし）。「動くが出力なし」で最も発見困難だった。
4. **ゾンビ prop が singleton managed server を占有**：improver-prop のモデル呼び出しハングが `opencode serve` セッション枠を奪い、以降が全待ち → sweep 見かけ上フリーズ。孤児プロセス掃除後、同一コマンドで `RUN_EXIT=0`。監視を追加：50 分超の rollout プロセスを強制回収。
5. **残高分課チャネルの静かな劣化**：novai 残高枯渇後 `deepseek` が **HTTP 200 + content=null**（403 ではない）を返し、クライアントは空軌跡を書き大量 NO OUTPUT。コスト防護は「HTTP 200」ではなく「非空コンテンツ」で事前検証すべき。
6. **judge と run の引数面の非対称**：`harness2` は `--modes/--only-domains/--max-tasks`、`harness2-judge/report` は `--mode` のみ — driver は各自の help から生成し、推測で書かない。

## 4. AIOS 比較：実測済み 3 ブロック + 収口済み 1 ブロック

### 4.1 BBH-20 二脚 A/B（完了、誠実な結論）

固定 20 問、脚ごと 1 回実行、ツール禁止、ローカル scorer を digest 固定（2026-07-23、`workflow-intelligence-diagnostic-codex-bbh20.md`）：

| 指標 | Baseline | Optimized (AIOS guidance) | Δ |
| --- | ---: | ---: | ---: |
| 正答 | **18/20 (90%)** | **18/20 (90%)** | 0 |
| 経過時間 | 29.497 s | 31.395 s | +1.9 s |
| tool events | 0 | 0 | 0 |

結論もそのまま書く：**この n=20 サンプリングは改善も退行も検出できない**。価値は A/B 機構（digest 固定、脚隔離、輸送失敗を点数外に分離）が信頼できる数値を作れることの証明 — JobBench サブセットは同じ規律を長期タスク領域に持ち込んだ。

### 4.2 クライアント能力スコアカード（完了、構造面）

`config/host-capabilities.json` から 13 クライアントを再計算（`--check` で再現可）：`aios-harness` 9/12 が首位、`claude` 8/12、`codex` 7/12…。スコアカードが測るのは **harness が取り付けた遮断/圧縮/計測面の上限** — 成績ではない — が、なぜ JobBench の Δ が長期タスクに出るかを説明する。

### 4.3 JobBench スモーク（完了、パイプライン証拠）

1 タスク（management_analysts/task1）× 4 脚の全経路実走（solver=deepseek-v4-pro 段階、パイプライン証拠として保持；正式成績は下記 agnes チャネル）：

```
sweep jb-oc-agg1: 1 tasks ok, 0 failed
judged.json: 1 graded, 0 ungraded
parallel k=1: n=1 | score 15.91% | picked: final arm
```

blind selection は base ではなく **final（aggregate）脚**を選んだ — 方向は Harness² 論文と一致（サンプル 1、パイプライン証拠のみ）。

### 4.4 主要結果：実タスクでの完全 harness ラダー（runs/jb8、採点済み）

**モデル統一宣言：solver・improver・judge すべて `agnes-3.0-flash`**（Agnes AI チャネル `https://api.agnes-ai.cn/v1`、OpenAI-compatible）。タスク：`management_analysts/task1`（実運用効率分析：複数ソース CSV/XLSX/DOCX → 多タブ分析ブック + 投資メモ + 回答）。4 脚ラダーの base/improve/domain 完了・採点済み、aggregate は実走中。レシピ：`~/harness2/run_one_round.sh` + `~/harness2/quickjudge.py`。

| 項目 | 値 |
| --- | --- |
| タスク | management_analysts/task1（他職種も同一レシピで随時拡張） |
| 脚 | base / improve / domain（aggregate 実走中） |
| コスト | 1 ラウンド約 30 回の agnes リクエスト（パッケージチャネル、承受能力内） |
| 採点 | 厳格 rubric 加重採点、全脚で同一 judge・同一パラメータ；`runs/jb8_quickjudge_*.json` に項目別証拠 |
| 状態 | ✅ 3 脚採点済み（68.2 / 83.0 / 77.3） |

| 脚 | Weighted rubric 点（management_analysts/task1、重み満点 88） | Δ vs base |
| --- | ---: | ---: |
| base（ベア harness） | 68.2% | — |
| improve（反復改善脚） | **83.0%** | **+14.8 pp** |
| domain（ドメイン適応脚） | 77.3% | +9.1 pp |
| aggregate（集約脚） | 実走中（runs/jb8） | — |

採点方式：agnes-3.0-flash による一回の厳格採点（temperature 0、rubric ごと 1/0.5/0 加重、10 項目/重み合計 88）。成果物は実文書（多タブ xlsx + docx メモ + csv）、抽出後に同一 judge・同一条件で全脚を採点。**方向は Harness² 論文と一致（harness 改善が同一モデルの成績を上げる）、幅 +14.8pp は論文の JobBench +4.5pp を上回るが、n=1・別モデル・別採点のため直接比較不可**（§5 参照）。

## 5. Limitations（隠さない）

- **n=1 の単一タスク**：脚の点数は方向性の証拠であり統計的結論ではない。職種間の難易度差は大きく、拡張前に「+14.8pp は JobBench を代表する」とは主張しない。
- **採点は一回の厳格 rubric 採点（quickjudge）** で、harness2 公式の多段 judge 連鎖と blind selection は経由していない。項目別結果は保存され監査可能（`runs/jb8_quickjudge_*.json`）。
- **solver と judge が同一 `agnes-3.0-flash`**：自己選好バイアス（self-preference bias）が存在し絶対点は注意が必要。同一パイプライン内の相対 Δ は影響が小さい（全脚で同一 judge・固定パラメータ）が、依然として本計測の第一の制限事項。
- judge/solver は論文と型違いのため、絶対点を +4.5pp と並べられない。同一パイプライン内の Δ のみを引用。
- WB-Bench・LAB は非覆盖（GCP/ライセンスのハード前提）。関連する主張は一切しない。
- 長期タスクの 40 分/attempt 上限は JobBench の長期スケールと同オーダー。attempt-2 にチェックポイント再開はなく、上限到達タスクは NO OUTPUT として記録。

## 6. 再現付録（コマンド面）

```bash
# 環境（一度だけの 3 種の修復）：timeout shim、隔離ベア XDG 設定（baseURL に /v1 必須）、監視 watchdog
cd ~/harness2 && . .venv/bin/activate
set -a; . ./.env; set +a
export XDG_CONFIG_HOME=$HOME/harness2/xdg/config XDG_DATA_HOME=$HOME/harness2/xdg/data \
       XDG_CACHE_HOME=$HOME/harness2/xdg/cache XDG_STATE_HOME=$HOME/harness2/xdg/state
export PATH="$HOME/harness2/bin:$HOME/harness2/dependencies/tools/node_modules/.bin:$PATH"
export HARNESS2_RUNS_DIR=$HOME/harness2/runs/jb7
# solver/improver/judge すべて = agnes/agnes-3.0-flash（.env の 3 組の変数が https://api.agnes-ai.cn/v1 を指す）
harness2 --bench jb --k 1 --modes parallel --workers 5 --only-domains <職種> --max-tasks 1
harness2-judge  --bench jb --k 1 --mode parallel
harness2-report --bench jb --k 1 --mode parallel
```

唯一のローカルパッチ（開示）：`preflight.py` の 1 行 — judge モデル名が claude/gemini で始まるが `HARNESS2_JUDGE_BASE_URL` が明示設定されている場合、gcloud ADC 探測をスキップ（バックアップ `preflight.py.bak`）。

---

*証拠パス：runs/jb8（単一タスク 4 脚実測 + 項目別採点 `runs/jb8_quickjudge_*.json`）、runs/jb4（パイプラインスモーク、履歴チャネル）、`docs/reports/2026-07-23-workflow-intelligence-diagnostic-codex-bbh20.md`（BBH-20 A/B）、`docs/reports/2026-10-19-client-capability-scorecard.md`（スコアカード）。全数値 non-leaderboard。*