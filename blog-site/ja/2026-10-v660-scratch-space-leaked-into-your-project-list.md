---
title: "v6.6.0：エージェントの作業スペースがプロジェクト一覧に漏れた、推測を拒否するゴミ収集器"
description: "v6.6.0 はどのテストにも捕まえられない UX 欠陥を塞ぐ。開発者のプロジェクト親フォルダに使い捨てサンドボックス 41 個（9.9 GB）が生えていた。`mktemp -d prefix-XXXX` はシェルのカレントディレクトリに作るからで、そのシェルはリポジトリの親にいた。中身のどこもリポジトリ内ではないので、世界の .gitignore では隠しようがない。修正は二つ：明示的なルール（`mktemp -d -p \"${TMPDIR:-/tmp}\"`、プロジェクト親に作らない）と `scripts/aios-tmp-gc.mjs`。客観的事実（名前の形・経過時間・git 状態・資格情報の有無）だけで分類し、読めないものは全部残す収集器だ。初実走は `collect=0 keep=34`、そして回帰リストは「決してマッチさせてはならない実プロジェクト名 23 件」である。"
date: 2026-10-17
tags: ["AIOS", "v6.6.0", "tmp", "サンドボックス", "衛生", "GC", "ツール", "リリース"]
---

# v6.6.0：エージェントの作業スペースがプロジェクト一覧に漏れた、推測を拒否するゴミ収集器

> **要約：** Finder の `~/codes` の画面には、誰も名付けていないフォルダが並んでいた：`abhome-1zbU`、`ci-repro-home-R2MG`、`asset-check-EYJZ`、`heal-real-oiHH`、`v650-patch-check-38213`、`rex0111-qLxI`。正体は**エージェントの作業くず**——検証中に作った偽 `$HOME` と `npm pack` プローブ——しかも一つもリポジトリ内にない。だから `.gitignore` では救えない。原因は省略された一文字：`mktemp -d prefix-XXXXXX` は `-p` を付けないと **シェルのカレントディレクトリ**に作る。当時のシェルはリポジトリの親にいた。v6.6.0 はこのルールを明文化し、`scripts/aios-tmp-gc.mjs` を入れる。判断はすべて客観的事実、既定では何も触らない。

## あの中に何が入っていたか

開けば形は二つ。見分けがつけば驚かない。

ひとつは**偽 `$HOME`**：`abhome-1zbU`、`fix-home-9oTm`、`ctl2-home-bvMO`、`revert-probe-4vAl`。中身はクライアント設定の殻だけ——`.qoder/settings.json`、`.workbuddy/mcp.json`、`.zcode/cli/config.json`、`.hermes/config.yaml`。`aios init` の投影テストが本物の `~/.codex` に書きたくないと判断した結果で、動機は正しく、場所が違った。

ふたつめは**パックプローブ**：`asset3-zoV2`、`rex0111-qLxI`。中身は必ず同じ二つ——tarball（`rex-harness-0.11.1.tar.gz`）と `x/` というディレクトリ。`npm pack` して解凍して、公開前に成果物を見る作業。

それから重量級：`ci-repro-aios`（2.8 GB）と `ci-reg-home`（882 MB）、リポジトリの完全コピー＋完全な偽 HOME、CI 回帰のローカル再現用。`v650-patch-check-38213` と `ab-v641-x97833`、二つの完全ワークツリー、バージョン同士の A/B 用。合計 41 ディレクトリ、サンドボックス 4.06 GB、さらに古いリリースパック 5.8 GB——**実プロジェクトが住むあのフォルダに 9.9 GB**。

コードベースの責任ではない。このリポジトリのテストは既に `os.tmpdir()` を使っている——呼び出し 603 箇所、テストファイル 222 個。ゴミは**セッション中にその場で打たれたコマンド**から来ていて、それらはセッションの当時の `cwd` を継承する。

## 制約として書く、好みとしてではない

`AGENTS.md` に *Temp Sandbox Hygiene* 節が増え、実質は一行：

```bash
mktemp -d -p "${TMPDIR:-/tmp}" aios-probe-XXXXXX   # -p は省略不可
```

`-p` を省くと `mktemp` は `cwd` に書く。同じルールのプロンプト版：プロジェクトの親（`$HOME/codes`）にディレクトリを作るな。そこはバージョン管理から見えないので、リポジトリを対象にする安全網すべてから見えない。

この形の問題は Definition of Done では捕まらない。検証は通っている——偽 HOME は `aios init` が正しいファイルを書く証拠を出した。被害は純粋に**位置的**で、Finder ウィンドウでしか見えない。

## `aios-tmp-gc`：事実で分類し、読めなければ残す

275 行で、面白いのは削除ではなく**拒否の階段**。以下の規則はすべて反例に迫られて書かれ、順序そのものが安全特性：最初に落ちた時点で確定する。

| ゲート | 規則 | 失敗の向き |
|---|---|---|
| 名前の形 | `-[A-Za-z0-9]{4,6}$` **かつ** 末尾に大文字または数字を含む | 小文字のみランダム→回収しない（見逃しは許容、誤删は不可） |
| 経過時間 | `--older-than`、既定 60 分 | 今動いているプローブは絶対に触れない |
| git 状態 | `dirty`、`unpushed`、`stashed`、**そして `unknown`** を全部残す | 状態が読めないリポジトリは触らないリポジトリ |
| 資格情報 | 直下に `.env` または `.env.*.local` なら残す | 上書きには `--allow-secrets` |
| 揮発性ルートを除外 | システム一時ディレクトリは丸ごと除外 | 許可には `--allow-volatile-root`。あの手のランダム名は他アプリのものかもしれない |
| 不可逆 | `--mode purge` は **`--yes` 必須**、ないと exit 1 | 既定は `dry-run`。`to-trash` は削除でなく移動 |

名前のゲートは最初のテスト実行で第二条件を稼いだ。当初の正規表現 `-[A-Za-z0-9]{4,6}$` ひとつで **`rex-work`** にマッチした——実プロジェクト、小文字 4 文字、`mktemp -d rex-XXXX` の出力とまったく同じ形。同じく `hermes-setup`、`rex-videos`、`rex-ppt-codex`、`wordpress-shens`、`rex-ai-tools`、`rex-koubo`、`rex-game`、`rex-hugo`。これを捕えたアサーション群が回帰ガードとして実ディレクトリ名で固定：

```
harness-cli, aios, aios-pro, rex-work, rex-game, rex-hugo, rex-koubo, rex-videos,
rex-ai-tools, rex-ppt-codex, hermes-setup, wordpress-shens, claude-relay-service,
yilang-browser, inkloom.im, inkloom.im.worktrees, docsrag, agno-go, xsapp, huabu,
chrexai, tocraft-wordpass, rex-wordpass-tp        → すべて false でなければならない
```

`mktemp` のランダム列は約 92% の確率で大文字か数字を含む。英語の小文字の語は含まない。残り 8% の代价は回収漏れ 1 件。**この道具が意図的に選んだ取引：9.9 GB 残しても、プロジェクトディレクトリを 1 個も誤删しない。**

`unknown` 状態は被害妄想ではない。upstream を持たないリポジトリでは `git rev-list @{u}..HEAD` が非ゼロで終了する。これを「クリーン」と読んだら `v650-patch-check-38213` と `ab-v641-x97833` を消していた——実 git ワークツリー 2 つ、一般論として未 push の作業を載せている。今は「読めない」、「読めないなら残す」、つまり人間の判断に委ねる。

## 実走はこうだった

```
$ node --test scripts/tests/tooling/tools/aios-tmp-gc.test.mjs   → 12/12 pass
$ node --test scripts/tests/tooling/tools/*.test.mjs             → 62/62 pass（回帰なし）
$ node scripts/check-dir-budget.mjs                              → 0 blocking
$ node scripts/aios-tmp-gc.mjs --root ~/codes --older-than 30
  collect=0  keep=34
```

`collect=0 keep=34` が重要な数字。清掃後、生残り 34 の実プロジェクトを見て、**ひとつも提案しない**。清掃前、ステージングフォルダに向けると 44 個中 37 個を特定し、名前の形が規則に合わない 7 個を人間に残した——5.8 GB のリリースパック含む。名前で回収されることは永久にないのだから、中身で照合した：`.env*` 4 個を現役プロジェクトのコピーとハッシュ比較して完全一致。資格情報も一意のファイルも一つも壊れていない。

## 意図的に入れていないもの

- **ゲートは未接続。** pre-tool チェックで「`mktemp -d` の対象親がプロジェクトルート」を源头で止められるが、安全ゲート自体の改修になる——blast radius が大きく、別判断。
- **発生源は生きている。** 診断中の 21:21 と 21:29 に新しいプローブが増えた。並行していたリリース検証セッションの仕業。強制されるまでルールは勧告にすぎない。
- **9.9 GB はステージングであって解放ではない。** すべて `mv` で `~/.Trash/aios-sandbox-cleanup-2026-10-17` に移動し、`rm` は一度も使っていない。macOS の TCC は本プロセスの `~/.Trash` 列挙を拒否するので、他に何が入っているか確認できない。空にするのは人間のクリックに残す。`--mode purge --yes` は人がそう決めたときのためのもの。

## アップグレードノート

- プロジェクトを一つの親ディレクトリに置いていて `*-XXXXXX` が生え始めたら：`node scripts/aios-tmp-gc.mjs --root "$HOME/codes"` でプレビュー、`--mode to-trash` で可逆ステージング、`--mode purge --yes` で初めて容量が戻る。
- スクリプトやセッションでのサンドボックス作成は `mktemp -d -p "${TMPDIR:-/tmp}" <prefix>-XXXXXX`。`-p` が修正そのもので、他は元から正しかった。
- 他は何も変わらない。本リリースは設定・CLI 契約・ファイル配置を一切動かしていない。
