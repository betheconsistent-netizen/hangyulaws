# 구독 가치 분석 웹앱 MVP

구독 서비스의 실사용 데이터 기반 가치 점수 산출, 벤치마크 비교, 해지·유지 추천을 제공하는 Vanilla HTML/CSS/JS 웹앱입니다.

---

## 실행 방법

```bash
# 이 한 줄로 실행합니다. 번들링·설치 없음.
python3 -m http.server 8765
```

브라우저에서 `http://localhost:8765` 접속.

> `index.html`을 `file://`로 직접 열면 ES Module CORS 제한과 무관하게 동작하지만,  
> 일부 브라우저에서 localStorage 접근이 제한될 수 있으므로 로컬 서버를 권장합니다.

---

## 프로젝트 구조

```
index.html          진입점 — JS 로드 순서 관리
styles.css          전체 UI 스타일 (다크 테마, 360px~1440px 반응형)

js/
  config.js         ★ 모든 임계값·가중치·상수 (매직넘버 없음)
  store.js          localStorage 영속화, 스키마 버전, import/export
  demo-data.js      데모 구독·기기·세션·카탈로그·변경이벤트·피어설문
  usage.js          세션 정규화, 자정 분할, 중복 제거, raw/adjusted 집계
  coverage.js       coverageTier(A/B/C), coverageSignature 산출
  benchmark.js      코호트 통계, 최소 표본 게이트, 폴백 사다리, self-benchmark
  score.js          Value Score 7컴포넌트, 결측 재정규화, Confidence, Utilization
  catalog.js        서비스/요금제 카탈로그, 가격 정규화, 요금제 전환 절감액
  changes.js        변경 이벤트 처리, Verification Gate, 기능 중복 2단계 관찰
  peer.js           피어 설문 집계, 응답률 게이트, 세그먼트 큐레이션
  predict.js        확정 공지 vs 패턴 예측 분리, 결제·환불 데드라인
  recommend.js      추천 규칙 엔진, 근거 문장 동적 생성, 예상 절감액
  notify.js         알림 생성·우선순위·예산·쿨다운·스누즈
  charts.js         인라인 SVG 차트 (스파크라인, 막대, 도넛, 컴포넌트 분해)
  ui.js             렌더링, SPA 라우팅, 이벤트 바인딩
```

---

## 화면 구성

| 화면 | 경로(뷰 이름) | 주요 기능 |
|---|---|---|
| 대시보드 | `dashboard` | 월 구독비·커버리지 요약, 다가오는 결제 D-day, 구독 현황 카드 |
| 구독 목록 | `subscriptions` | 추가·수정·삭제·스누즈, 필터·정렬, 커버리지 배지 |
| 서비스 상세 | `detail` | Value Score 7컴포넌트 분해, Confidence, 벤치마크, 변경 이력 타임라인, Peer 카드, 예측 카드 |
| 인사이트 & 알림 | `insights` | 발송된 알림 + 억제된 알림(사유 표시) 구분 |
| AI 포트폴리오 | `portfolio` | 전체 분석, 추천 등급별 그룹핑, 예상 절감액, 판단 보류 섹션 |
| 설정 | `settings` | 기기 토글, 동의 3단계, 알림 설정, JSON import/export |

---

## 핵심 설계 원칙

### 측정 정합성
- **Tier C 서비스**(`collectible:false` 또는 세션 없음)의 사용량은 `0분`이 아니라 `측정 안 됨`으로 표시합니다.
- `raw`(단순 합산)와 `adjusted`(구간 union 후 중복 제거)를 모두 보관합니다. UI 기본값은 `adjusted`.
- 기기 시뮬레이션 토글을 끄면 `coverageSignature`가 바뀌고 벤치마크·점수가 즉시 재계산됩니다.

### 통계 게이트
- 코호트 표본 미달(`MIN_N_AGGREGATE=50`) 시 벤치마크 블록 자체를 렌더링하지 않고 self-benchmark로 대체합니다.
- `MIN_AVAILABLE_WEIGHT=0.40` 미달 시 점수를 산출하지 않고 `판단 보류`로 처리합니다.
- Confidence `Low` 등급에서는 해지 추천을 생성하지 않습니다.

### 변경 감지
- `auto_detected` 이벤트는 알림 발송이 금지됩니다. `확인 필요` 배지와 함께 앱 내에서만 표시합니다.
- `official_announced` / `human_verified`만 알림 발송 대상입니다.

### 알림 거버넌스
- 주간 최대 `MAX_PUSH_PER_WEEK=3`건 초과분은 `suppressedReason:'budget'`으로 앱 내 피드에만 기록합니다.
- 쿨다운(`COOLDOWN_DAYS=30`), 스누즈(`SNOOZE_DAYS=90`), 절감액 임계(`MIN_SAVING_KRW=3000`) 게이트가 순서대로 적용됩니다.

---

## Provider 6종 — 실 API 연결 지점

현재는 모두 데모 데이터 또는 로컬 계산으로 동작합니다.  
아래 6개 함수만 교체하면 실서비스로 전환됩니다.

```js
// js/usage.js (향후 교체)
UsageProvider.fetchSessions({ from, to })
// 현재: demo-data → 향후: GET /api/usage/sessions

// js/benchmark.js (향후 교체)
BenchmarkProvider.fetchCohortStats(cohortKey)
// 현재: 로컬 cohortStats 배열 → 향후: GET /api/benchmark/cohort

// js/catalog.js (향후 교체)
CatalogProvider.fetchCatalog()
// 현재: _appState.catalog → 향후: GET /api/catalog

// js/changes.js (향후 교체)
ChangeFeedProvider.fetchChanges({ since })
// 현재: _appState.changeEvents → 향후: GET /api/changes

// js/peer.js (향후 교체)
PeerProvider.fetchReports(serviceId)
// 현재: _appState.peerReports → 향후: GET /api/peer

// js/recommend.js (향후 교체)
RecommendationEngine.analyze(portfolio)
// 현재: 규칙 엔진 → 향후: POST /api/recommend (LLM API 포함 가능)
```

모두 `async`로 선언되어 있으므로 호출부 수정 없이 내부 구현만 교체하면 됩니다.

---

## 검증 케이스 13종

| # | 케이스 | 확인 방법 |
|---|---|---|
| 1 | **Tier C** — Adobe CC `collectible:false` | 상세 화면에서 `판단 보류`, 사용량 `측정 안 됨` 표시 |
| 2 | **중복 계측** — Perplexity PC+모바일 동시 세션 | `raw > adjusted` |
| 3 | **표본 부족** — Canva 코호트 N<50 | 벤치마크 블록 미표시, self-benchmark 대체 |
| 4 | **기능 중복** — ChatGPT × Perplexity capabilityTags 겹침 | 상세 화면 추천 근거에 중복 서비스 언급 |
| 5 | **저사용 고가** — Claude | `해지 검토` 등급 |
| 6 | **고사용** — ChatGPT, Cursor | `유지` 등급 |
| 7 | **auto_detected 가격 변경** — Perplexity | `확인 필요` 배지만, 알림 미발송 |
| 8 | **official_announced 가격 인상** — Claude | `확정` 배지 + 출처 링크 + 알림 발송 |
| 9 | **패밀리 플랜 신설** — ChatGPT Family | `expectedMembers` 미입력 시 손익분기 인원 제시 |
| 10a | **feature_added 10일차** — Notion | 정보 카드만 표시, 추천 미생성 |
| 10b | **feature_added 35일차 + 3조건** — Cursor → Claude | `해지 검토` 추천 생성 |
| 11 | **응답률 15% PeerReport** — Canva | % 표시 억제, 사유 나열만 |
| 12 | **priceHistory 2건** — ChatGPT | 예측 카드 미표시 |
| 13 | **알림 예산 초과** | 4번째 알림 `suppressedReason:'budget'` |

---

## 상수 조정

모든 임계값·가중치는 `js/config.js` 한 곳에서 변경합니다.

```js
// 자주 조정하는 값
TARGET_DAILY_MIN:       60    // Value Score 100점 기준 일평균(분)
COST_PER_HOUR_BASELINE: 10000 // costEfficiency 50점 기준 시간당 비용(KRW)
MIN_AVAILABLE_WEIGHT:   0.40  // 이 미만이면 '판단 보류'
SCORE_CANCEL_THRESHOLD: 35    // 이 미만이면 '해지 검토'
MAX_PUSH_PER_WEEK:      3     // 주간 알림 최대 발송 수
MIN_SAVING_KRW:         3000  // 절감액 알림 발송 최소 금액
```

---

## 라이선스

MIT
