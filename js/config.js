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
  FREE_PLAN_MARKER: 0,          // price=0 이면 무료 플랜으로 취급

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

  /* ───── 시간당 비용 기준 (카테고리별) ───── */
  // 업무·개발 도구는 생산성 가치가 높아 기준 높게, 엔터테인먼트는 낮게
  COST_PER_HOUR_BASELINE_BY_CATEGORY: {
    ai:           15000,  // AI 도구: 업무 대체 가치 높음
    dev:          15000,  // 개발 도구: 업무 직결
    design:       12000,  // 디자인 도구
    productivity: 10000,  // 생산성 도구
    education:    8000,   // 교육
    cloud:        8000,   // 클라우드 저장소
    music:        3000,   // 음악: 여가
    media:        3000,   // 영상: 여가
    game:         4000,   // 게임: 여가+몰입도
    shopping:     5000,   // 쇼핑: 절약 혜택 기반
    delivery:     4000,   // 배달: 할인 혜택 기반
    fitness:      6000,   // 피트니스
    reading:      5000,   // 독서·뉴스
    other:        8000,   // 기타
  },
  COST_PER_HOUR_BASELINE: 8000, // 카테고리 정보 없을 때 기본값

  /* ───── 카테고리 목록 (한국어 레이블) ───── */
  CATEGORIES: {
    ai:           { label: 'AI 도구',    icon: '🤖' },
    dev:          { label: '개발',        icon: '💻' },
    design:       { label: '디자인',      icon: '🎨' },
    productivity: { label: '생산성',      icon: '📋' },
    media:        { label: '영상 스트리밍', icon: '🎬' },
    music:        { label: '음악',        icon: '🎵' },
    game:         { label: '게임',        icon: '🎮' },
    shopping:     { label: '쇼핑',        icon: '🛒' },
    delivery:     { label: '배달·배송',   icon: '🛵' },
    cloud:        { label: '클라우드',    icon: '☁️' },
    education:    { label: '교육',        icon: '📚' },
    fitness:      { label: '피트니스',    icon: '💪' },
    reading:      { label: '독서·뉴스',   icon: '📰' },
    security:     { label: '보안',        icon: '🔒' },
    finance:      { label: '금융',        icon: '💰' },
    other:        { label: '기타',        icon: '📦' },
  },

  /* ───── 추천 등급 레이블 ───── */
  RECOMMENDATION_LABELS: {
    HOLD:       '판단 보류',
    CANCEL:     '해지 검토',
    DOWNGRADE:  '다운그레이드 검토',
    KEEP:       '유지',
  },

  /* ───── 커버리지 배지 레이블 ───── */
  COVERAGE_LABELS: {
    A: '추적 중',
    B: '일부 추적',
    C: '추적 안 됨',
  },

  /* ───── 커버리지 상세 설명 (툴팁용) ───── */
  COVERAGE_DESCRIPTIONS: {
    A: '최근 14일간 정확하게 사용 시간을 측정하고 있습니다.',
    B: '사용 시간을 일부 측정 중이나 정확도가 낮을 수 있습니다.',
    C: '사용 시간을 측정하지 못하고 있습니다. 수집기를 연결하면 정확한 분석이 가능합니다.',
  },

  /* ───── 출처 배지 ───── */
  SOURCE_LABELS: {
    measured:      '추적 중',
    partial:       '일부 추적',
    unmeasured:    '추적 안 됨',
    user_input:    '사용자 입력',
    user_survey:   '사용자 설문',
    demo:          '데모',
    official:      '공식 발표',
    human_verified:'검증됨',
    auto_detected: '확인 필요',
  },

  /* ───── 검증 상태 레이블 ───── */
  VERIFICATION_LABELS: {
    official_announced: '확정',
    human_verified:     '검증됨',
    auto_detected:      '확인 필요',
  },
};
