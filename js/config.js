/**
 * config.js
 * 모든 임계값·가중치·상수의 단일 소스. 다른 파일에서 매직넘버 사용 금지.
 */
window.AppConfig = {

  /* ───── 스키마 ───── */
  SCHEMA_VERSION: 1,

  /* ───── 세션 정규화 ───── */
  MIN_SESSION_SEC: 10,          // 이 미만 세션 폐기
  MAX_SESSION_SEC: 14400,       // 4시간 초과 시 분할
  DEFAULT_TIMEZONE: 'Asia/Seoul',

  /* ───── Coverage ───── */
  COVERAGE_STRICT_DAYS: 14,     // strict 세션이 이 기간 내에 있어야 Tier A
  COVERAGE_FACTORS: { A: 1.0, B: 0.6, C: 0.2 },

  /* ───── Benchmark 최소 표본 ───── */
  MIN_N_AGGREGATE: 50,          // 평균/중앙값 표시 최소 표본
  MIN_N_PERCENTILE: 200,        // percentile 표시 최소 표본
  MULTI_CONDITION_MULTIPLIER: 1.5,  // 조건 3개 이상 결합 코호트 임계값 배수
  WINSORIZE_PCTILE: 0.01,       // 상·하위 1% winsorize

  /* ───── Value Score 가중치 (합 = 1.00) ───── */
  WEIGHTS: {
    usageIntensity:       0.20,
    relativeUsage:        0.15,
    usageConsistency:     0.15,
    functionalImportance: 0.15,
    featureUniqueness:    0.15,
    costEfficiency:       0.10,
    replacementDifficulty: 0.10,
  },

  /* ───── Score 컴포넌트 파라미터 ───── */
  TARGET_DAILY_MIN: 60,         // usageIntensity 100점 기준 일평균(분)
  COST_PER_HOUR_BASELINE: 10000, // costEfficiency 50점 기준 시간당 비용(KRW)

  /* ───── 재정규화 하한 가드 ───── */
  MIN_AVAILABLE_WEIGHT: 0.40,   // 이 미만이면 점수 미산출 → '판단 보류'

  /* ───── Confidence 계산 ───── */
  CONFIDENCE_WEIGHTS: {
    coverage: 0.45,
    days:     0.30,
    cohort:   0.25,
  },
  CONFIDENCE_THRESHOLDS: {
    HIGH:   0.75,
    MEDIUM: 0.45,
    // LOW: 0.45 미만
  },
  CONFIDENCE_MIN_DAYS: 30,      // daysFactor 분모

  /* ───── 추천 점수 임계값 ───── */
  SCORE_CANCEL_THRESHOLD:    35,
  SCORE_DOWNGRADE_THRESHOLD: 55,

  /* ───── 알림 예산 ───── */
  MAX_PUSH_PER_WEEK:  3,
  COOLDOWN_DAYS:      30,
  MIN_SAVING_KRW:     3000,
  SNOOZE_DAYS:        90,

  /* ───── 기능 중복 관찰 ───── */
  OBSERVE_DAYS:              28,   // 2단계 관찰 기간
  OVERLAP_USAGE_INCREASE:    0.20, // B 증가 기준 (+20%)
  OVERLAP_USAGE_DECREASE:    0.30, // C 감소 기준 (-30%)

  /* ───── 가격 예측 ───── */
  PRICE_HISTORY_MIN_COUNT: 3,   // 인상 이력 이 미만이면 예측 미표시

  /* ───── Self-benchmark ───── */
  SELF_BENCHMARK_DAYS: 30,      // 비교 기준 기간

  /* ───── Peer 응답률 ───── */
  PEER_RESPONSE_RATE_MIN: 0.20, // 이 미만이면 % 표시 금지

  /* ───── Utilization ───── */
  UTILIZATION_BASELINE: 'p75',  // 분모 기준 (적극 활용 사용자 기준)

  /* ───── 추천 등급 레이블 ───── */
  RECOMMENDATION_LABELS: {
    HOLD:       '판단 보류',
    CANCEL:     '해지 검토',
    DOWNGRADE:  '다운그레이드 검토',
    KEEP:       '유지',
  },

  /* ───── 커버리지 배지 레이블 ───── */
  COVERAGE_LABELS: {
    A: '실측',
    B: '일부 실측',
    C: '미측정',
  },

  /* ───── 출처 배지 ───── */
  SOURCE_LABELS: {
    measured:      '실측',
    partial:       '일부 실측',
    unmeasured:    '미측정',
    user_input:    '사용자 입력',
    user_survey:   '사용자 설문',
    demo:          '데모',
    official:      '공식 발표',
    human_verified:'검증됨',
    auto_detected: '자동 감지',
  },

  /* ───── 검증 상태 레이블 ───── */
  VERIFICATION_LABELS: {
    official_announced: '확정',
    human_verified:     '검증됨',
    auto_detected:      '확인 필요',
  },
};
