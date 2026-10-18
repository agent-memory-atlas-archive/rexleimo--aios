---
title: "v6.7.0: 한 명령, 모든 클라이언트 — 'aios skill add'가 커뮤니티 스킬에 정문을 열어주다"
description: "v6.7.0은 AIOS 스킬 체계의 조용한 공백을 메운다: `skill-sources/` 바깥의 훌륭한 스킬에는入口가 없었다. 가장 유용한 커뮤니티 스킬(clone-website)은 한 클라이언트의 전역 스킬 디렉터리에만 존재했고, 나머지 아홉 클라이언트는 그 존재를 볼 수 없었다. 해법은 마이그레이션이 아니라 정문 설치다: `aios skill add <source>`가 로컬 디렉터리나 git URL(얕은 클론, owner/repo 약칭 포함)을 해석하고, canonical 외부 레지스트리(~/.aios/skills/external/<name>/)에 스테이징하며 소유권 메타데이터를 기록한 뒤, 모든 클라이언트의 사용자 레벨 스킬 루트로 배포한다. 같은 명령의 재실행은 멱등: 내용이 같으면 reuse, 달라지면 refresh. 선택은 fail-closed: 다중 스킬 소스에는 명시적인 --skill <names>/--yes 또는 대화형 프롬프트를 요구하며, 절대 추측하지 않는다."
date: 2026-10-18
tags: ["AIOS", "v6.7.0", "skills", "외부 스킬", "CLI", "release"]
---

# v6.7.0: 한 명령, 모든 클라이언트 — 'aios skill add'가 커뮤니티 스킬에 정문을 열어주다

> **TL;DR:** 이 머신에서 가장 쓸모 있는 스킬 — `clone-website`, 실존하는 사이트를 픽셀 단위로 일치시키는 재건축으로 되돌리는 — 은 열 클라이언트 중 아홉에서 보이지 않았다. `pi`에서만 동작했다. 우연히 그곳에 설치되어 있었을 뿐이다. AIOS 자체의 스킬 동기화(`skill-sources/` + `config/skills-sync-manifest.json`)는 릴리스에 동봉되는 스킬만 배포한다. 커뮤니티 스킬에는 정문 자체가 없었다. v6.7.0이 그 문을 하나 달았다: `aios skill add <source>`. 소스는 로컬 디렉터리이거나 git URL이다. canonical 외부 레지스트리에 스테이징한 뒤, 모든 클라이언트의 사용자 레벨 스킬 루트에 소유권 메타데이터와 함께 배포한다. 재실행은 멱등하고, 진짜 흥미로운 부분은 가드레일이다: fail-closed 선택, unmanaged 디렉터리만 인수하는 force, 그리고 `clone-website` 설치 도중 원본 삭제를 거부한 자가복사 가드.

## 공백을 정확히 말하면

AIOS에는 원래 두 개의 스킬 면이 있었다:

1. **Canonical 스킬** — `skill-sources/`에서 작성되고, 릴리스 시점의 동기화가 모든 클라이언트에 투영한다. 관리 대상이고, 버전 관리되고, 테스트된다.
2. **사용자가 클라이언트 스킬 디렉터리에 넣어둔 것들** — 완전히 비관리. `clone-website`는 여기 살고 있었다: `~/.pi/agent/skills/clone-website/`, `LICENSE`와 `README.md`와 `SKILL.md`를 갖추고. 아마 언젠가 커뮤니티 저장소에서 내려받은 것. 한 클라이언트, 한 디렉터리, 출처 없음, 전파 없음.

고장 양상은 물기 전까지 보이지 않는다: `pi`에서 그 스킬의 존재를 알고, `codex`로 갈아타면, 스킬은 단지 없다. 있을 수 있었다는 것을 알려주는 것은 아무것도 없다. 어느 컴포넌트의 버그도 아니다 — 문이 하나 없는 것이다.

## 파이프라인: 세 단계, 한 명령

`aios skill add <source> [--client <list|all>] [--skill <names>] [--yes] [--force] [--json]`

**1단계 — 소스 해석.** 루트에 `SKILL.md`를 둔 로컬 디렉터리는 단일 스킬. 바로 아래 하위 디렉터리들이 각자 `SKILL.md`를 두면 다중 스킬 팩. `https://` URL, `*.git` 접미사, `owner/repo` 약칭은 얕은 git 클론이 되어 일회용 임시 디렉터리에 떨어지고, 설치자가 `finally`에서 회수한다. 그 외에는 실행 가능한 한 줄과 함께 거부된다.

**2단계 — 외부 레지스트리로 스테이징.** `~/.aios/skills/external/<name>/`(테스트에서는 `AIOS_HOME`으로 리디렉트 가능). 각 엔트리는 `.aios-skill-install.json`을 갖는다: `client: "registry"`, `scope: "external"`, 원본 소스는 `catalogSource`에 기록. 이 레지스트리는 저장소 내 `skill-sources/` 트리와 **병렬**로 달리며, 그것을 대체하지 않는다 — 두 동기화 경로는 같은 클라이언트 스킬 루트에 수렴하지만, 코드도 소유권도 공유하지 않는다.

**3단계 — 모든 클라이언트로 배포.** 목표 루트는 catalog 설치자와 같은 `getClientHomes()` 맵에서 나온다: `~/.codex/skills`, `~/.claude/skills`, `~/.gemini/skills`, `~/.config/opencode/skills`, `~/.hermes/skills`, `~/.grok/skills`, `~/.workbuddy/skills`, `~/.pi/agent/skills`, `~/.zcode/skills`, 그리고 Qoder의 에디션 인식 홈(`~/.qoder-cn` 또는 `~/.qoder`). 모든 복사본은 자신의 메타데이터를 쓰고, `catalogSource`는 레지스트리 엔트리를 가리킨다 — 사슬 전체가 감사 가능: *이 복사본 ← 레지스트리 ← 원본 소스*.

첫 실제 실행은 자신이 한 일을 한 글자도 빠뜨리지 않고 말했다:

```
[copy] registry skill installed: clone-website
[copy] codex skill installed (global): clone-website
[copy] claude skill installed (global): clone-website
...
[skip] pi target is the source directory itself; keeping the original untouched
[done] ... installed=10 reused=0 replaced=0 skipped=1
```

재실행에서 나온 것은 이것을 동기화 스크립트가 아닌 **동기화**로 만드는 형상이다: `installed=0 reused=10 replaced=0 skipped=0`.

## 기본값으로 넘어가지 않고 결정된 세 가지 의미

**선택은 fail-closed.** 다중 스킬 소스, 명시적 선택 없음, `--yes` 없음, TTY 밖 — "전부"도 "첫 번째"도 설치하지 않고, 목록과 해결 플래그를 붙여 오류를 낸다. 대화형 모드는 `Install which skills? [a=all, 1,3 or names, Enter=cancel]`라고 묻는다. AIOS 전체를 관통하는 원칙과 같은 뿌리다: 코어는 모호함에서 의미를 추측하지 않는다 — 빠진 결정은 거부이지, 기본값이 아니다.

**`--force`는 불도저가 아니다.** 역할은 *unmanaged* 디렉터리의 인수 — 존재하지만 AIOS 메타데이터를 갖지 않는 표적. 사용자가 손으로 놓았을 수도 있다. 내용이 소스와 동일한 관리 대상 복사본은 force가 있든 없든 *reuse*된다. 이 구분에는 무게가 있다: 출력의 `replaced`는 "AIOS가 존재하는 것을 덮어썼다"를 뜻하며, 이 줄은 정말로 인수할 것이 있을 때만 나타나야 한다.

**자가복사 가드는 편집증이 아니다.** `copyDirRecursive`는 복사 전에 표적에 `rmSync`를 한다. 스킬의 첫 채택 시점에 클라이언트 쪽 표적 경로(`~/.pi/agent/skills/clone-website`)는 *바로* 소스 경로 그 자체다. 가드가 없다면, `pi`로의 `clone-website` 설치는 원본을 먼저 지운다 — 레지스트리 복사본이 먼저 만들어지므로 데이터는 살아남지만, 사용자의 디렉터리는 재투영이 되고 원본이 아니게 된다. 가드는 resolve된 경로를 비교하고, 표적이 소스로 resolve되면 거부한다. 플래그가 무엇을 말하든.

## 알려진 한계, changelog에 적은 그대로

TTY 프롬프트 경로는 로직은 커버되지만 실제 대화형 세션 테스트는 없다 — agent와 CI는 `--skill`/`--yes` 경로를 걷는다. `--mode link`(레지스트리→클라이언트 symlink)는 실행 가능한 오류로 거부되며, 별도의 결정 사항이다. 제거 명령은 이번 배치에 없다: 외부 스킬은 손으로 지울 수 있지만, 메타데이터의 소유권 사슬은 훗날의 `skill remove`를 위해 이미 깔려 있다. GitHub 소스는 얕은 클론이며, tarball/registry 프로토콜은 없다.

그리고 한 가지 정직한 과정 기록: 개발 중 한 테스트가 `client: 'all'`을 기본으로 삼으면서 세 개의 클라이언트 홈만 모킹했다 — 테스트 스킬이 실제 `~/.gemini`, `~/.hermes` 등에 기록되었다. 정리에 쓰인 것은 바로 이 기능 자체가 제공하는 출처 메커니즘이다: 오염된 모든 디렉터리의 `catalogSource`는 `/aios-home/skills/external/`를 포함했고, 스물한 디렉터리는 정확히 제거되었으며, 실제 사용자 내용은 온전했다. 테스트 스위트는 이제 모든 클라이언트 선택을 모킹 집합에 고정한다. 교훈은 일반화된다: *여러 루트로 배포하는 도구는 자신의 메타데이터에서 "어느 루트를 건드렸는지"에 답할 수 있어야 한다* — 이제 답할 수 있다.
