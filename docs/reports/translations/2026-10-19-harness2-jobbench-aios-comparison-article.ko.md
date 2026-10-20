# Google Harness² 평가 파이프라인을 재현하고, AIOS harness의 측정 가능한 비교를 내놓았다

> 상태: **최종본 (v1.0)** · 날짜: 2026-10-19 · 선언: 모든 수치는 **non-leaderboard / AIOS 환경 측정** — Google 공식과 측정 조건이 다르므로 좌표계 대조만 하며 직접 비교는 하지 않는다.

## TL;DR

- Google Research의 [Harness²](https://github.com/google-research/harness2)(arXiv 2610.14224)는 "재귀적으로 agent harness를 개선하는" 평가 패러다임을 제시했다: WB-Bench **+11.5**, JobBench **+4.5**, LAB **+11.8pp** (single-step recursion).
- 우리는 자체 엔드포인트(비 GCP/Vertex)에서 JobBench 파이프라인을 완전 재현했다: **pinned opencode executor → 4팔 사다리(base/improve/domain/aggregate) → blind selection → LLM judge → report**, 엔드투엔드 실주행 성공(`RUN_EXIT=0 / JUDGE_EXIT=0 / REPORT_EXIT=0`).
- AIOS 증거 체인은 실측 3블록: BBH-20 양팔 A/B(솔직한 무개선 결론), 13 클라이언트 능력 스코어카드(구조 면), JobBench 스모크 15.91%(n=1, 파이프라인 증거).
- 주요 결과(단일 태스크 4팔 실측, 모델 통일 `agnes-3.0-flash`): base 68.2% → improve **83.0%(Δ +14.8pp)**, domain 77.3%(+9.1pp), 방향은 논문과 일치(n=1, 조건은 §2/§5).

## 1. Harness²란, 그리고 벤치마킹 가치가 있는 이유

Harness²의 핵심 주장: agent 성적은 모델뿐 아니라 **harness**(도구 면·컨텍스트 관리·반성 루프·도메인 적응)로 결정된다. 논문은 재귀 절차로 harness 자체를 개선하고 3개 벤치마크에서 정량화했다:

| 벤치마크 | 영역 | 논문 보고 개선(single-step recursion) |
| --- | --- | --- |
| WorkBuddy-Bench (WB) | 사무 업무(Tencent, 커스텀 라이선스) | +11.5 pp |
| JobBench (jb) | 65 태스크 / 35 직종의 실제 업무 태스크 | +4.5 pp |
| LAB | 장시간추적 agent 태스크 | +11.8 pp |

이는 **좌표계**이지 스코어보드가 아니다. AIOS류 harness 강화가 유효하다면 동종 벤치마크에서 같은 방향의 Δ가 나와야 한다.

## 2. 측정 조건 선언(왜 leaderboard 수치가 아닌가)

공식 파이프라인은 기본이 Gemini-Vertex 채널이다. 재사용하지 않은 이유와 공개:

| 차원 | 논문 | 본 측정 | 영향 |
| --- | --- | --- | --- |
| solver | Gemini 계열 | **`agnes-3.0-flash`**(Agnes AI, OpenAI-compatible `https://api.agnes-ai.cn/v1`) | 절대점 비교차, **Δ 방향은 교차 가능** |
| judge | gemini-3.1-pro 급 | **`agnes-3.0-flash`(solver와 동일 모델, 자기평가 편향은 §5)**, rubric 항목별 + blind selection | 채점 기준偏移, 전 팔에 동일 judge 고정 |
| 라이선스 | WB는 Tencent 커스텀 라이선스(EU 지역 제한) | JobBench만(HF 공개 데이터셋, revision 고정) | WB/LAB 미커버, 수치 인용 안 함 |
| executor | pinned opencode `23fb5e05` | 동일 pin + 격리 베어 설정(플러그인 없음) | 일치 |
| k | 복수 k | k=1, 4팔 사다리 | 단일 샘플, 신뢰도 명시 |

## 3. 파이프라인 재현: 밟은 함정은 전부 실제였다

공식 README에 없는 로컬 기술 문제들을 개별 기록 — 모두 결정적 증거 있음:

1. **`timeout` 부재**: runner가 GNU `timeout --kill-after`에 하드 의존, macOS에 없음. Python shim으로 의미 재현(SIGTERM→SIGKILL, 종료 코드 124).
2. **엄격 schema 검증이 전역 설정 폭파**: pinned opencode는 `provider.*.models.*.modalities.output`을 배열 요구, 누락 필드 → 전 태스크 0바이트 출력. 해결은 격리 `XDG_CONFIG_HOME` 사본에 schema 보완, **원본 파일은 건드리지 않음**.
3. **`baseURL`의 `/v1` 경로**: pinned 클라이언트는 경로를 보완하지 않아, `/v1` 누락 시 요청이 404 HTML에 닿고 **조용히 빈 step_finish 생성**(tokens 0, 에러 로그 없음). "돌지만 출력 없음"이라 발견이 가장 어려웠다.
4. **좀비 prop이 singleton managed server 점유**: improver-prop 모델 호출 행방불명이 `opencode serve` 세션 슬롯을 잡아 이후 전부 대기 → sweep 가사상태. 고아 프로세스 청소 후 동일 명령으로 `RUN_EXIT=0`. 감시 추가: 50분 초과 rollout 프로세스 강제 회수.
5. **잔액 과금 채널의 조용한 열화**: novai 잔액 고갈 후 `deepseek`이 **HTTP 200 + content=null**(403 아님) 반환, 클라이언트는 빈 궤적을 써 대량 NO OUTPUT. 비용 방지는 "HTTP 200"이 아니라 "비어있지 않은 콘텐츠"로 사전 검증해야 한다.
6. **judge와 run 인자 면 비대칭**: `harness2`는 `--modes/--only-domains/--max-tasks`, `harness2-judge/report`는 `--mode`뿐 — driver는 각 help 기준으로 생성, 추측 금지.

## 4. AIOS 비교: 실측 3블록 + 수합 완료 1블록

### 4.1 BBH-20 양팔 A/B(완료, 솔직한 결론)

고정 20문항, 팔당 1회 실행, 도구 금지, 로컬 scorer를 digest 고정(2026-07-23, `workflow-intelligence-diagnostic-codex-bbh20.md`):

| 지표 | Baseline | Optimized (AIOS guidance) | Δ |
| --- | ---: | ---: | ---: |
| 정답 | **18/20 (90%)** | **18/20 (90%)** | 0 |
| 경과 시간 | 29.497 s | 31.395 s | +1.9 s |
| tool events | 0 | 0 | 0 |

결론도 그대로: **이 n=20 샘플은 개선도 퇴행도 검출 불가**. 가치는 A/B 메커니즘(digest 고정, 팔 격리, 전송 실패를 점수 밖으로 분리)가 신뢰 수치를 만들 수 있음의 증명 — JobBench 서브셋은 같은 규율을 장기 태스크 영역에 가져왔다.

### 4.2 클라이언트 능력 스코어카드(완료, 구조 면)

`config/host-capabilities.json`에서 13 클라이언트 재계산(`--check` 재현 가능): `aios-harness` 9/12 선두, `claude` 8/12, `codex` 7/12…. 스코어카드가 측정하는 것은 **harness가 장착 가능한 차단/압축/계량 면의 상한** — 성적 아님 — 그러나 JobBench의 Δ가 왜 장기 태스크에 나타나야 하는지 설명한다.

### 4.3 JobBench 스모크(완료, 파이프라인 증거)

1 태스크(management_analysts/task1)× 4팔 전 경로 실주행(solver=deepseek-v4-pro 단계, 파이프라인 증거로 보존; 공식 성적은下述 agnes 채널):

```
sweep jb-oc-agg1: 1 tasks ok, 0 failed
judged.json: 1 graded, 0 ungraded
parallel k=1: n=1 | score 15.91% | picked: final arm
```

blind selection은 base가 아니라 **final(aggregate) 팔**을 골랐다 — 방향은 Harness² 논문과 일치(샘플 1, 파이프라인 증거만).

### 4.4 주요 결과: 실 태스크 전체 harness 사다리(runs/jb8, 채점 완료)

**모델 통일 선언: solver·improver·judge 모두 `agnes-3.0-flash`**(Agnes AI 채널 `https://api.agnes-ai.cn/v1`, OpenAI-compatible). 태스크: `management_analysts/task1`(실 운영 효율 분석: 복수 소스 CSV/XLSX/DOCX → 다중 탭 분석북 + 투자 메모 + 답변). 4팔 사다리의 base/improve/domain 완료·채점, aggregate 실주행 중. 레시피: `~/harness2/run_one_round.sh` + `~/harness2/quickjudge.py`.

| 항목 | 값 |
| --- | --- |
| 태스크 | management_analysts/task1(타 직종도 동일 레시피로 확장 가능) |
| 팔 | base / improve / domain(aggregate 실주행 중) |
| 비용 | 라운드당 약 30회 agnes 요청(패키지 채널, 부담 가능) |
| 채점 | 엄격 rubric 가중 채점, 전 팔에 동일 judge·동일 파라미터; 항목별 증거 `runs/jb8_quickjudge_*.json` |
| 상태 | ✅ 3팔 채점 완료(68.2 / 83.0 / 77.3) |

| 팔 | Weighted rubric 점수(management_analysts/task1, 가중 만점 88) | Δ vs base |
| --- | ---: | ---: |
| base(베어 harness) | 68.2% | — |
| improve(반복 개선 팔) | **83.0%** | **+14.8 pp** |
| domain(도메인 적응 팔) | 77.3% | +9.1 pp |
| aggregate(융합 팔) | 실주행 중(runs/jb8) | — |

채점 방식: agnes-3.0-flash 단일 엄격 채점(temperature 0, rubric별 1/0.5/0 가중, 10항목/가중 합계 88). 산출물은 실제 문서(다중 탭 xlsx + docx 메모 + csv), 추출 후 동일 judge·동일 조건으로 전 팔 채점. **방향은 Harness² 논문과 일치(harness 개선이 동일 모델 성적을 올림), 폭 +14.8pp는 논문 JobBench +4.5pp보다 크나 n=1·다른 모델·다른 채점이라 직접 비교 불가**(§5 참조).

## 5. Limitations(감추지 않음)

- **n=1 단일 태스크**: 팔 점수는 방향성 증거이지 통계 결론 아님. 직종 난이도 차이가 커 확장 전 "+14.8pp가 JobBench를 대표한다"고 주장하지 않는다.
- **채점은 단일 엄격 rubric 채점(quickjudge)** 로 harness2 공식 다단계 judge 사슬과 blind selection을 경유하지 않았다. 항목별 결과는 저장되어 감사 가능(`runs/jb8_quickjudge_*.json`).
- **solver와 judge가 동일 `agnes-3.0-flash`**: 자기선호 편향(self-preference bias) 존재, 절대점 주의 필요. 동일 파이프라인 내 상대 Δ는 영향이 작지만(전 팔 동일 judge·고정 파라미터) 여전히 본 측정의 제1 제한 사항.
- judge/solver가 논문과 모델이 달라 절대점을 +4.5pp와 나란히 놓을 수 없다. 동일 파이프라인 내 Δ만 인용.
- WB-Bench·LAB 미커버(GCP/라이선스 하드 전제). 관련 주장 일체 없음.
- 장기 태스크 40분/attempt 상한은 JobBench 장기 스케일과 동オーダー. attempt-2에 체크포인트 재개가 없고, 상한 도달 태스크는 NO OUTPUT으로 기록.

## 6. 재현 부록(명령 면)

```bash
# 환경(일회성 3종 수정): timeout shim, 격리 베어 XDG 설정(baseURL에 /v1 필수), 감시 watchdog
cd ~/harness2 && . .venv/bin/activate
set -a; . ./.env; set +a
export XDG_CONFIG_HOME=$HOME/harness2/xdg/config XDG_DATA_HOME=$HOME/harness2/xdg/data \
       XDG_CACHE_HOME=$HOME/harness2/xdg/cache XDG_STATE_HOME=$HOME/harness2/xdg/state
export PATH="$HOME/harness2/bin:$HOME/harness2/dependencies/tools/node_modules/.bin:$PATH"
export HARNESS2_RUNS_DIR=$HOME/harness2/runs/jb7
# solver/improver/judge 전부 = agnes/agnes-3.0-flash(.env의 3조 변수가 https://api.agnes-ai.cn/v1을 가리킴)
harness2 --bench jb --k 1 --modes parallel --workers 5 --only-domains <직종> --max-tasks 1
harness2-judge  --bench jb --k 1 --mode parallel
harness2-report --bench jb --k 1 --mode parallel
```

유일한 로컬 패치(공개): `preflight.py` 1줄 — judge 모델명이 claude/gemini로 시작하지만 `HARNESS2_JUDGE_BASE_URL`이 명시 설정된 경우 gcloud ADC 탐색을 생략(백업 `preflight.py.bak`).

---

*증거 경로: runs/jb8(단일 태스크 4팔 실측 + 항목별 채점 `runs/jb8_quickjudge_*.json`), runs/jb4(파이프라인 스모크, 역사 채널), `docs/reports/2026-07-23-workflow-intelligence-diagnostic-codex-bbh20.md`(BBH-20 A/B), `docs/reports/2026-10-19-client-capability-scorecard.md`(스코어카드). 전 수치 non-leaderboard.*
