---
title: "v6.6.0: 에이전트 작업 공간이 프로젝트 목록에 새었다 — 추측을 거부하는 정리 도구"
description: "v6.6.0 은 어떤 테스트도 잡아 낼 수 없는 UX 결함을 막는다. 개발자의 프로젝트 상위 폴더에 일회용 샌드박스 41 개 (9.9 GB) 가 자라 있었다. `mktemp -d prefix-XXXX` 는 셸의 현재 디렉터리에 만들기 때문이고, 그 셸은 저장조의 상위 디렉터리에 있었다. 내용은 저장소 밖 어디에도 없으므로 세상의 모든 .gitignore 로는 숨길 수 없다. 수정은 두 부분: 명시적 규칙 (`mktemp -d -p \"${TMPDIR:-/tmp}\"`, 프로젝트 상위에는 만들지 않는다) 그리고 `scripts/aios-tmp-gc.mjs` — 객관적 사실 (이름 형태·경과 시간·git 상태·자격 증명 유무) 로만 분류하고 읽을 수 없는 것은 전부 남겨 두는 회수기. 첫 실측 출력은 `collect=0 keep=34` 이고, 회귀 목록은 「절대 매칭되어선 안 되는 실제 프로젝트명 23 개」다."
date: 2026-10-17
tags: ["AIOS", "v6.6.0", "tmp", "샌드박스", "위생", "GC", "툴링", "릴리스"]
---

# v6.6.0: 에이전트 작업 공간이 프로젝트 목록에 새었다 — 추측을 거부하는 정리 도구

> **요약:** Finder 의 `~/codes` 화면에는 아무도 이름 붙이지 않은 폴더가 늘어서 있었다: `abhome-1zbU`、`ci-repro-home-R2MG`、`asset-check-EYJZ`、`heal-real-oiHH`、`v650-patch-check-38213`、`rex0111-qLxI`. 정체는 **에이전트 작업 잔재** — 검증 중에 만든 가짜 `$HOME` 와 `npm pack` 프로브 — 그리고 하나도 저장소 안에 있지 않다. 그래서 `.gitignore` 로는 구할 수 없다. 원인은 빠진 인수 하나: `mktemp -d prefix-XXXXXX` 는 `-p` 가 없으면 **셸의 현재 작업 디렉터리**에 만든다. 그때 그 셸은 저장조의 상위 디렉터리에 있었다. v6.6.0 은 이 규칙을 문서로 밝히고 `scripts/aios-tmp-gc.mjs` 를 더한다. 판단은 전부 객관적 사실, 기본값은 아무것도 건드리지 않는다.

## 그 폴더 안에 실제로 뭐가 있었나

열면 모양은 둘이다. 알아보면 놀랍지 않다.

하나는 **가짜 `$HOME`**: `abhome-1zbU`、`fix-home-9oTm`、`ctl2-home-bvMO`、`revert-probe-4vAl`. 안에는 클라이언트 설정 껍데기만 — `.qoder/settings.json`、`.workbuddy/mcp.json`、`.zcode/cli/config.json`、`.hermes/config.yaml`. `aios init` 투영 테스트가 진짜 `~/.codex` 에 쓰기 싫어한 결과다. 동기는 정확했고 장소가 틀렸다.

다른 하나는 **팩 프로브**: `asset3-zoV2`、`rex0111-qLxI`. 안에는 늘 같은 두 개 — tarball (`rex-harness-0.11.1.tar.gz`) 과 `x/` 디렉터리. `npm pack` 후 풀어서 배포 전 산출물을 확인하는 작업이다.

그다음은 무거운 축: `ci-repro-aios` (2.8 GB) 와 `ci-reg-home` (882 MB), 저장소 전체 사본 + 완전한 가짜 HOME, CI 회귀 지역 재현용. `v650-patch-check-38213` 과 `ab-v641-x97833`, 완전한 워크트리 두 개, 버전 간 A/B 용. 합쳐서 41 개 디렉터리, 샌드박스 4.06 GB, 여기에 낡은 릴리스 팩 5.8 GB — **실제 프로젝트가 사는 그 폴더에 9.9 GB**.

코드베이스의 잘못이 아니다. 이 저장소의 테스트는 이미 `os.tmpdir()` 을 쓴다 — 호출 603 곳, 테스트 파일 222 개. 쓰레기는 **세션 도중 즉석에서 친 명령**에서 나왔고, 그것들은 그 순간의 `cwd` 를 상속한다.

## 규칙은 선호가 아니라 제약으로 쓴다

`AGENTS.md` 에 *Temp Sandbox Hygiene* 절이 생겼고, 실질은 한 줄이다:

```bash
mktemp -d -p "${TMPDIR:-/tmp}" aios-probe-XXXXXX   # -p 는 선택이 아니다
```

`-p` 를 빼면 `mktemp` 는 `cwd` 에 쓴다. 같은 규칙의 프롬프트 버전: 프로젝트 상위 (`$HOME/codes`) 에 디렉터리를 만들지 말 것. 거기서는 버전 관리가 보이지 않고, 따라서 저장소를 대상으로 하는 모든 안전망에서도 보이지 않는다.

이 모양의 문제는 Definition of Done 으로 잡히지 않는다. 검증은 통과했다 — 가짜 HOME 은 `aios init` 이 올바른 파일을 쓴다는 증거를 냈다. 피해는 순수하게 **위치적** 이었고, Finder 창에서만 보인다.

## `aios-tmp-gc`: 사실로 분류하고, 읽을 수 없으면 남긴다

275 줄이고, 흥미로운 부분은 삭제가 아니라 **거부 계단**이다. 아래 규칙은 모두 반례에 떠밀려 쓰였고, 순서 자체가 안전 속성이다: 처음 실패하는 순간 확정된다.

| 게이트 | 규칙 | 실패 방향 |
|---|---|---|
| 이름 형태 | `-[A-Za-z0-9]{4,6}$` **그리고** 접미사에 대문자 또는 숫자 포함 | 소문자만 있는 랜덤 → 회수 안 함 (놓침은 허용, 오삭제는 불가) |
| 경과 시간 | `--older-than`, 기본 60 분 | 지금 도는 프로브는 절대 건드릴 수 없다 |
| git 상태 | `dirty`, `unpushed`, `stashed`, **그리고 `unknown`** 전부 보존 | 상태를 읽을 수 없는 저장소는 만지면 안 되는 저장소 |
| 자격 증명 | 최상위에 `.env` 또는 `.env.*.local` 이 있으면 보존 | 덮으려면 `--allow-secrets` |
| 휘발성 루트 | 시스템 임시 디렉터리는 통째로 제외 | 허용하려면 `--allow-volatile-root`; 그 안의 랜덤 이름은 다른 앱 것일 수 있다 |
| 비가역 | `--mode purge` 는 **`--yes` 필수**, 없으면 exit 1 | 기본은 `dry-run`; `to-trash` 는 삭제가 아니라 이동 |

이름 게이트는 첫 테스트 실행에서 두 번째 조건을 벌어 들였다. 처음에는 정규식 `-[A-Za-z0-9]{4,6}$` 하나였고, **`rex-work`** 에 매칭됐다 — 실제 프로젝트, 소문자 4 글자, `mktemp -d rex-XXXX` 결과와 똑같은 모양. 똑같이 매칭된 것에 `hermes-setup`, `rex-videos`, `rex-ppt-codex`, `wordpress-shens`, `rex-ai-tools`, `rex-koubo`, `rex-game`, `rex-hugo` 가 있다. 이를 잡아 낸 단언 목록이 이제 회귀 방호벽으로, 실제 디렉터리 이름 못 박혀 있다:

```
harness-cli, aios, aios-pro, rex-work, rex-game, rex-hugo, rex-koubo, rex-videos,
rex-ai-tools, rex-ppt-codex, hermes-setup, wordpress-shens, claude-relay-service,
yilang-browser, inkloom.im, inkloom.im.worktrees, docsrag, agno-go, xsapp, huabu,
chrexai, tocraft-wordpass, rex-wordpass-tp        → 전부 false 여야 한다
```

`mktemp` 랜덤 열은 회당 약 92% 확률로 대문자나 숫자를 포함한다. 영어 소문자 단어는 포함하지 않는다. 나머지 8% 의 대가는 회수 누락 한 번이다. **이 도구가 의도적으로 택한 거래: 9.9 GB 를 남기더라도 프로젝트 디렉터리를 하나도 잘못 지우지 않는다.**

`unknown` 상태는 편집증이 아니다. upstream 이 없는 저장소에서 `git rev-list @{u}..HEAD` 는 0 이 아닌 코드로 끝난다. 이를 '깨끗함' 으로 읽으면 `v650-patch-check-38213` 과 `ab-v641-x97833` 을 지웠을 것이다 — 실제 git 워크트리 두 개, 일반론으로 푸시 전 작업을 싣고 있다. 지금은 '읽을 수 없음', 읽을 수 없으면 보존, 보존은 사람이 판단한다는 뜻이다.

## 실측은 이렇게 나왔다

```
$ node --test scripts/tests/tooling/tools/aios-tmp-gc.test.mjs   → 12/12 pass
$ node --test scripts/tests/tooling/tools/*.test.mjs             → 62/62 pass (회귀 없음)
$ node scripts/check-dir-budget.mjs                              → 0 blocking
$ node scripts/aios-tmp-gc.mjs --root ~/codes --older-than 30
  collect=0  keep=34
```

`collect=0 keep=34` 가 핵심 숫자다. 정리 뒤에 도구는 살아남은 실제 프로젝트 34 개를 보고 **하나도 제안하지 않는다**. 정리 전, 스테이징 폴더를 향해서는 44 개 중 37 개를 지목하고, 이름이 규칙에 맞지 않는 7 개는 사람에게 남겼다 — 5.8 GB 릴리스 팩 포함. 이름으로는 영원히 회수되지 않으니 내용으로 대조했다: `.env*` 4 개를 현행 프로젝트 사본과 해시 비교해 바이트 단위로 일치. 자격 증기도 고유 파일도 하나도 파괴되지 않았다.

## 의도적으로 넣지 않은 것

- **게이트는 미연결.** pre-tool 검사로 「`mktemp -d` 의 대상 상위 디렉터리가 프로젝트 루트」를 소스에서 막을 수 있지만, 안전 게이트 자체를 고치는 일이다 — blast radius 가 크고 별도의 결정이다.
- **발생원은 살아 있다.** 진단 중 21:21 과 21:29 에 새 프로브가 또 생겼다. 병렬로 돌던 릴리스 검증 세션의 소행. 강제되기 전까지 규칙은 권고에 불과하다.
- **9.9 GB 는 스테이징이지 해제가 아니다.** 전부 `mv` 로 `~/.Trash/aios-sandbox-cleanup-2026-10-17` 에 옮겼고 `rm` 은 한 번도 쓰지 않았다. macOS TCC 는 이 프로세스의 `~/.Trash` 열거를 거부하므로 안에 뭐가 더 있는지 확인할 수 없다. 비우는 일은 사람의 클릭으로 남긴다. `--mode purge --yes` 는 사람이 그렇게 정한 순간을 위한 것이다.

## 업그레이드 노트

- 프로젝트들을 하나의 상위 디렉터리에 두는데 `*-XXXXXX` 가 자라기 시작했다면: `node scripts/aios-tmp-gc.mjs --root "$HOME/codes"` 로 미리보기, `--mode to-trash` 로 되돌릴 수 있게 스테이징, `--mode purge --yes` 에서야 공간이 돌아온다.
- 스크립트와 세션의 샌드박스는 `mktemp -d -p "${TMPDIR:-/tmp}" <prefix>-XXXXXX`. `-p` 가 수정 자체이고 나머지는 원래 옳았다.
- 다른 것은 변하지 않는다. 이번 릴리스는 설정·CLI 계약·파일 배치를 전혀 움직이지 않았다.
