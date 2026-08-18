/**
 * benchmark.js
 * 코호트 통계 조회, 최소 표본 게이트, 폴백 사다리, self-benchmark.
 * Hard Rule 2: 표본 미달 시 해당 블록 자체를 렌더링하지 않음.
 * Hard Rule 6: "전체 사용자 평균" 표현 금지 — 이 앱 사용자 표본임을 명시.
 */
(function (global) {
  'use strict';

  const CFG = global.AppConfig;

  /* ─────────────────────────────────────
   * 코호트 키 조합
   * serviceId + planId + coverageSignature + period [+ purpose]
   * ───────────────────────────────────── */
  function buildCohortKey(serviceId, planId, coverageSignature, period, purpose) {
    let key = `${serviceId}|${planId}|${coverageSignature}|${period}`;
    if (purpose) key += `|${purpose}`;
    return key;
  }

  /* ─────────────────────────────────────
   * 최소 표본 게이트
   * conditionCount: 결합된 조건 수 (3개 이상이면 임계값 × 1.5)
   * ───────────────────────────────────── */
  function getMinN(type, conditionCount) {
    const base = type === 'percentile'
      ? CFG.MIN_N_PERCENTILE
      : CFG.MIN_N_AGGREGATE;
    const multiplier = conditionCount >= 3 ? CFG.MULTI_CONDITION_MULTIPLIER : 1;
    return Math.ceil(base * multiplier);
  }

  /* ─────────────────────────────────────
   * Winsorize
   * 상·하위 각 1% 클리핑
   * ───────────────────────────────────── */
  function winsorize(values) {
    if (!values || values.length === 0) return [];
    const sorted = values.slice().sort((a, b) => a - b);
    const n = sorted.length;
    const lo = Math.floor(n * CFG.WINSORIZE_PCTILE);
    const hi = Math.ceil(n * (1 - CFG.WINSORIZE_PCTILE)) - 1;
    const loVal = sorted[Math.max(0, lo)];
    const hiVal = sorted[Math.min(n - 1, hi)];
    return sorted.map(v => Math.max(loVal, Math.min(hiVal, v)));
  }

  /* ─────────────────────────────────────
   * 백분위 계산 (0~1 범위 p)
   * ───────────────────────────────────── */
  function percentile(sortedValues, p) {
    if (!sortedValues.length) return 0;
    const idx = p * (sortedValues.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sortedValues[lo];
    return sortedValues[lo] * (hi - idx) + sortedValues[hi] * (idx - lo);
  }

  /* ─────────────────────────────────────
   * 코호트 통계 조회 (폴백 사다리 포함)
   *
   * 폴백 순서:
   *   1. service+plan+coverage+purpose
   *   2. service+plan+coverage
   *   3. service+coverage
   *   4. 미표시 (null 반환) → self-benchmark로 전환
   *
   * cohortStats: demo-data의 COHORT_STATS 배열
   * 반환:
   *   null — 표본 미달 → 렌더링 금지
   *   { stats, n, key, fallbackLevel, fallbackDesc }
   * ───────────────────────────────────── */
  function getCohortStats(
    serviceId, planId, coverageSignature, purpose,
    cohortStats, conditionCount
  ) {
    // c2 동의 없으면 벤치마크 비활성
    // (呼出 측에서 consent.c2 체크 후 null 전달 가능 — 여기선 데이터로 판단)

    const period = '30d';

    // 폴백 사다리 정의
    const ladder = [
      {
        key: buildCohortKey(serviceId, planId, coverageSignature, period, purpose),
        level: 1,
        desc: `이 앱을 사용하는 ${planId} 구독자 중 비슷한 측정 환경(${coverageSignature})·${purpose || '전체'} 목적 기준`,
        conds: purpose ? 4 : 3,
      },
      {
        key: buildCohortKey(serviceId, planId, coverageSignature, period, null),
        level: 2,
        desc: `이 앱을 사용하는 ${planId} 구독자 중 비슷한 측정 환경(${coverageSignature}) 기준`,
        conds: 3,
      },
      {
        key: buildCohortKey(serviceId, '*', coverageSignature, period, null),
        level: 3,
        desc: `이 앱을 사용하는 ${serviceId} 구독자 중 비슷한 측정 환경(${coverageSignature}) 기준`,
        conds: 2,
      },
    ];

    for (const rung of ladder) {
      const entry = cohortStats.find(c => c.key === rung.key);
      if (!entry) continue;

      const condCount = conditionCount !== undefined ? conditionCount : rung.conds;
      const minN = getMinN('aggregate', condCount);

      if (entry.n < minN) {
        // 표본 미달 — 이 단계 스킵, 다음 단계로
        continue;
      }

      // percentile 표시 가능 여부
      const minNPct = getMinN('percentile', condCount);
      const canShowPercentile = entry.n >= minNPct;

      return {
        stats: entry.stats,
        n: entry.n,
        key: rung.key,
        fallbackLevel: rung.level,
        fallbackDesc: rung.desc,
        canShowPercentile,
      };
    }

    // 모든 단계 미달 → null
    return null;
  }

  /* ─────────────────────────────────────
   * 사용자 percentile 계산
   * 내 일평균 adjusted 분이 코호트에서 상위 X%인지
   * "상위 X%" 표기 통일 (Hard Rule: "상위"만 사용)
   * ───────────────────────────────────── */
  function calcUserPercentile(myDailyAvgMin, cohortResult) {
    if (!cohortResult || !cohortResult.canShowPercentile) return null;

    const stats = cohortResult.stats;
    // 코호트 분포에서 내 값이 몇 번째 백분위인지 추정
    // p25/p50/p75/p90 구간을 이용한 선형 보간
    const breakpoints = [
      { val: 0,          pct: 0   },
      { val: stats.p25,  pct: 25  },
      { val: stats.p50,  pct: 50  },
      { val: stats.p75,  pct: 75  },
      { val: stats.p90,  pct: 90  },
      { val: stats.p90 * 2, pct: 99 },
    ];

    let myPct = 0;
    for (let i = 1; i < breakpoints.length; i++) {
      const prev = breakpoints[i - 1];
      const curr = breakpoints[i];
      if (myDailyAvgMin <= curr.val) {
        const t = (myDailyAvgMin - prev.val) / (curr.val - prev.val || 1);
        myPct = prev.pct + t * (curr.pct - prev.pct);
        break;
      }
      myPct = 99;
    }

    // "상위 X%" = 100 - myPct (많이 쓸수록 상위)
    const topPct = Math.max(1, Math.round(100 - myPct));
    return topPct;
  }

  /* ─────────────────────────────────────
   * Self-benchmark (코호트 미표시 시 항상 계산)
   * ───────────────────────────────────── */
  function calcSelfBenchmark(subscription, serviceSummary, todayStr) {
    const sub = subscription;

    // 월 환산 구독료 (KRW)
    const monthlyKRW = sub.billingCycle === 'yearly'
      ? sub.price / 12
      : sub.price;

    // 시간당 비용
    const totalAdjustedHours = serviceSummary.totalAdjustedSec / 3600;
    const baseline = (CFG.COST_PER_HOUR_BASELINE_BY_CATEGORY &&
                      CFG.COST_PER_HOUR_BASELINE_BY_CATEGORY[subscription.category])
                     || CFG.COST_PER_HOUR_BASELINE;
    const costPerHour = totalAdjustedHours > 0
      ? monthlyKRW / totalAdjustedHours
      : null;

    // 다음 결제일까지 남은 일수
    const todayMs   = new Date(todayStr + 'T00:00:00Z').getTime();
    const billingMs = new Date(sub.nextBillingDate + 'T00:00:00Z').getTime();
    const daysUntilBilling = Math.round((billingMs - todayMs) / 86400000);

    // 직전 30일 대비 증감률은 usage.calcGrowthRate에서 계산
    // (여기서는 구조만 반환)

    return {
      monthlyKRW,
      costPerHour,
      unusedDays: serviceSummary.unusedDays,
      daysSinceLastUse: serviceSummary.daysSinceLastUse,
      lastUsedDate: serviceSummary.lastUsedDate,
      daysUntilBilling,
      totalAdjustedHours: Math.round(totalAdjustedHours * 10) / 10,
    };
  }

  /* ─────────────────────────────────────
   * Public API
   * ───────────────────────────────────── */
  global.AppBenchmark = {
    getCohortStats,
    calcUserPercentile,
    calcSelfBenchmark,
    buildCohortKey,
    getMinN,
    winsorize,
    percentile,
  };

})(window);
