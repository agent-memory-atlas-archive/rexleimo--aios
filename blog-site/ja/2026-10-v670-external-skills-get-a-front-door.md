---
title: "v6.7.0：一つのコマンドで全クライアントへ——「aios skill add」がコミュニティスキルの正門を開ける"
description: "v6.7.0 は AIOS スキル体系の静かな欠落を塞ぐ：`skill-sources/` の外にある優れたスキルには入口がなかった。最も有用なコミュニティスキル（clone-website）は一つのクライアントのグローバルスキルディレクトリにしか存在せず、他の九つのクライアントからは見えなかった。解法は移行ではなく正門の設置：`aios skill add <source>` がローカルディレクトリか git URL（浅いクローン、owner/repo 短縮記法も対応）を解決し、canonical 外部レジストリ（~/.aios/skills/external/<name>/）にステージして所有権メタデータを書き、全クライアントのユーザーレベルスキルルートへ配布する。同じコマンドの再実行は冪等：内容が同一なら reuse、変化があれば refresh。選択は fail-closed：複数スキルのソースには明示的な --skill <names>/--yes か対話型プロンプトを要求し、決して推測しない。"
date: 2026-10-18
tags: ["AIOS", "v6.7.0", "skills", "外部スキル", "CLI", "release"]
---

# v6.7.0：一つのコマンドで全クライアントへ——「aios skill add」がコミュニティスキルの正門を開ける

> **TL;DR：** このマシンで最良のスキル——`clone-website`、実在するサイトをピクセル一致で再構築する——は、10 クライアントのうち 9 つから見えなかった。`pi` でしか動かない。たまたまそこにインストールされていたからだ。AIOS 独自のスキル同期（`skill-sources/` + `config/skills-sync-manifest.json`）はリリース同梱スキルしか配らず、コミュニティスキルには正門そのものがなかった。v6.7.0 がそれを追加する：`aios skill add <source>`。ソースはローカルディレクトリか git URL。canonical 外部レジストリにステージし、全クライアントのユーザーレベルスキルルートへ所有権メタデータ付きで配布する。再実行は冪等で、面白いのはガードレールの方：fail-closed な選択、unmanaged ディレクトリだけを引き取る force、そして `clone-website` のインストール中に原本の削除を拒んだ自己コピー・ガード。

## 欠落を正確に述べる

AIOS には元々二つのスキル面があった：

1. **Canonical スキル**——`skill-sources/` で書かれ、リリース時の同期が全クライアントへ投影。管理下、バージョン管理、テスト済み。
2. **ユーザーがクライアントのスキルディレクトリに放り込んだもの**——完全に管理外。`clone-website` はここに住んでいた：`~/.pi/agent/skills/clone-website/`、`LICENSE` と `README.md` と `SKILL.md` 付き。おそらくどこかの時点でコミュニティリポジトリからダウンロードされたもの。一クライアント、一ディレクトリ、出自なし、伝播なし。

故障モードは噛み付くまで見えない：`pi` でスキルの存在を知り、`codex` に切り替えると、スキルは単にそこにない。存在しえたことを教えてくれるものは何もない。これはどのコンポーネントのバグでもない——扉が一枚足りないのだ。

## パイプライン：三段階、一コマンド

`aios skill add <source> [--client <list|all>] [--skill <names>] [--yes] [--force] [--json]`

**第一段——ソースの解決。** ルートに `SKILL.md` を持つローカルディレクトリは単一スキル。直下のサブディレクトリがそれぞれ `SKILL.md` を持てば複数スキルのパック。`https://` URL、`*.git` 接尾辞、`owner/repo` 短縮記法は浅い git クローンとなり、ワンショットの一時ディレクトリに落ち、インストーラが `finally` で回収する。それ以外は一行の実行可能なメッセージと共に拒否される。

**第二段——外部レジストリへのステージ。** `~/.aios/skills/external/<name>/`（テストでは `AIOS_HOME` でリダイレクト可）。各エントリは `.aios-skill-install.json` を持つ：`client: "registry"`、`scope: "external"`、元のソースは `catalogSource` に記録。このレジストリはリポジトリ内の `skill-sources/` ツリーと**並行**して走り、取って代わるものではない——二つの同期経路は同じクライアントスキルルートに収束するが、コードも所有権も共有しない。

**第三段——全クライアントへの配布。** 目標ルートは catalog インストーラと同じ `getClientHomes()` マップから来る：`~/.codex/skills`、`~/.claude/skills`、`~/.gemini/skills`、`~/.config/opencode/skills`、`~/.hermes/skills`、`~/.grok/skills`、`~/.workbuddy/skills`、`~/.pi/agent/skills`、`~/.zcode/skills`、そして Qoder のエディション対応ホーム（`~/.qoder-cn` か `~/.qoder`）。全てのコピーが独自のメタデータを書き、`catalogSource` はレジストリのエントリを指す——鎖全体が監査可能：*このコピー ← レジストリ ← 元のソース*。

最初の実走は自分が何をしたかを一字一句語った：

```
[copy] registry skill installed: clone-website
[copy] codex skill installed (global): clone-website
[copy] claude skill installed (global): clone-website
...
[skip] pi target is the source directory itself; keeping the original untouched
[done] ... installed=10 reused=0 replaced=0 skipped=1
```

再実行で出たのは、これを**同期**たらしめコピー脚本ではなくす形だ：`installed=0 reused=10 replaced=0 skipped=0`。

## 決められた三つのセマンティクス（デフォルトに沈んだものはない）

**選択は fail-closed。** 複数スキルのソース、明示的な選択なし、`--yes` なし、TTY の外——「全部」も「最初の一つ」もインストールせず、リストと解決フラグを添えてエラーになる。対話モードは `Install which skills? [a=all, 1,3 or names, Enter=cancel]` と尋ねる。AIOS 全体を貫く原則と同根だ：コアは曖昧さからセマンティクスを推測しない——欠けた決定は拒否であり、デフォルト値ではない。

**`--force` はブルドーザーではない。** 役目は *unmanaged* ディレクトリの引き取り——存在するが AIOS メタデータを持たない標的。ユーザーが手で置いたものかもしれない。内容がソースと同一の管理下コピーは、force があろうとなかろうと *reuse* される。この区別には重みがある：出力の `replaced` は「AIOS が存在するものを上書きした」を意味し、この行は本当に引き取るものがある時にしか現れてはならない。

**自己コピー・ガードは被害妄想ではない。** `copyDirRecursive` はコピーの前に標的へ `rmSync` する。スキルの初回採用時、クライアント側の標的パス（`~/.pi/agent/skills/clone-website`）は*まさに*ソースパスそのものだ。ガードがなければ、`pi` への `clone-website` のインストールは原本を先に削除する——レジストリのコピーが先に作られるのでデータは生き残るが、ユーザーのディレクトリは再投影になり、原本ではなくなる。ガードは resolve 後のパスを比較し、標的がソースに解決されるなら拒む。フラグが何を言おうと。

## 既知の限界、changelog に記した通り

TTY プロンプト経路はロジックはカバーされているが、実対話セッションのテストはない——agent と CI は `--skill`/`--yes` を歩く。`--mode link`（レジストリ→クライアントの symlink）は実行可能なエラーで拒否され、別の決定事項。アンインストールは本バッチ外：外部スキルは手で消せるが、メタデータの所有権チェーンは将来の `skill remove` のために既に敷かれている。GitHub ソースは浅いクローンで、tarball/registry プロトコルはない。

もう一つの正直な過程記録：開発中、あるテストが `client: 'all'` をデフォルトとしながら三つのクライアントホームしかモックせず、テスト用スキルが実家の `~/.gemini` や `~/.hermes` に書き込まれた。クリーンアップに使ったのはこの機能自身が提供する出自メカニズムだ：汚染された全ディレクトリの `catalogSource` は `/aios-home/skills/external/` を含み、21 ディレクトリは正確に除去され、実ユーザー内容は無傷だった。テストスイートは今、全クライアント選択をモック集合に固定する。教訓は一般化できる：*複数ルートへ配布するツールは、自らのメタデータから「どのルートに触れたか」に答えられねばならない*——今は答えられる。
