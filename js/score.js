/**
 * score.js
 * Value Score 7개 컴포넌트 계산, 결측 재정규화, Confidence, Utilization.
 *
 * 핵심 안전장치:
 *  - coverageTier C → 사용량 관련 4개 컴포넌트 제외
 *  - MIN_AVAILABLE_WEIGHT < 0.40 → 점수 미산출, '판단 보류'
 *  - importance/replacementDifficulty null → 해당 컴포넌트 제외
 *  - 코호트 미표시 → relativeUsage 제외
 */
(function (global) {
  'use strict';

  const CFG = global.AppConfig;
  const W   = CFG.WEIGHTS;

  /* ─────────────────────────────────────
   * overlapScore 계산
   * jaccard(A.capabilityTags, B.capabilityTags)
   *   × min(1, 동시 활성 사용일 수 / 30)
   * ───────────────────────────────────── */
  function calcJaccard(tagsA, tagsB) {
    if (!tagsA || !tagsB || !tagsA.length || !tagsB.length) return 0;
    const setA = new Set(tagsA);
    const setB = new Set(tagsB);
    let inter = 0;
    for (const t of setA) { if (setB.has(t)) inter++; }
    const union = setA.size + setB.size - inter;
    return union > 0 ? inter / union : 0;
  }

  /**
   * 두 서비스의 동시 사용일 수 계산
   * aggregated: { [serviceId]: { [date]: { adjustedSec } } }
   */
  function calcConcurrentDays(serviceIdA, serviceIdB, aggregated) {
    const daysA = Object.keys(aggregated[serviceIdA] || {});
    const daysB = new Set(Object.keys(aggregated[serviceIdB] || {}));
    return daysA.filter(d => daysB.has(d) &&
      aggregated[serviceIdA][d].adjustedSec > 0 &&
      aggregated[serviceIdB][d].adjustedSec > 0
    ).length;
  }

  /**
   * 구독 목록에서 같은 카테고리 내 최대 overlapScore 반환
   */
  function calcOverlapScore(subscription, subscriptions, aggregated) {
    const subs = subscriptions.filter(s =>
      s.serviceId !== subscription.serviceId &&
      s.category  === subscription.category
    );

    let maxScore = 0;
    for (const other of subs) {
      const jaccard = calcJaccard(subscription.capabilityTags, other.capabilityTags);
      if (jaccard === 0) continue;

      const concurrentDays = calcConcurrentDays(
        subscription.serviceId, other.serviceId, aggregated
      );
      const coUsageRatio = Math.min(1, concurrentDays / 30);
      const score = jaccard * coUsageRatio;
      if (score > maxScore) maxScore = score;
    }

    return maxScore; // 0~1
  }

  /* ─────────────────────────────────────
   * 7개 컴포넌트 계산
   * 각 0~100으로 정규화
   * 산출 불가 → null 반환
   * ───────────────────────────────────── */
  function calcComponents(params) {
    const {
      subscription,
      serviceSummary,   // AppUsage.getServiceSummary 결과
      coverageTier,
      cohortResult,     // AppBenchmark.getCohortStats 결과 (null 가능)
      subscriptions,
      aggregated,
    } = params;

    const sub = subscription;
    const components = {};

    // ── 1. usageIntensity ──
    // coverageTier C 이면 제외
    if (coverageTier !== 'C' && serviceSummary) {
      const dailyMin = serviceSummary.avgDailyAdjustedMin;
      components.usageIntensity = Math.min(100,
        (dailyMin / CFG.TARGET_DAILY_MIN) * 100
      );
    } else {
      components.usageIntensity = null;
    }

    // ── 2. relativeUsage ──
    // 코호트 미표시이면 제외
    if (coverageTier !== 'C' && cohortResult && serviceSummary) {
      const myDailyMin = serviceSummary.avgDailyAdjustedMin;
      const medianMin  = cohortResult.stats.p50;
      components.relativeUsage = medianMin > 0
        ? Math.min(100, (myDailyMin / medianMin) * 50)
        : null;
    } else {
      components.relativeUsage = null;
    }

    // ── 3. usageConsistency ──
    // coverageTier C 이면 제외
    if (coverageTier !== 'C' && serviceSummary) {
      components.usageConsistency =
        (serviceSummary.usedDays / serviceSummary.period.days) * 100;
    } else {
      components.usageConsistency = null;
    }

    // ── 4. functionalImportance ──
    // 자동 계산: 실사용량(일관성 + 강도)으로 중요도 추론
    // 사용자 입력값(importance)이 있으면 우선 사용, 없으면 자동 산출
    if (sub.importance !== null && sub.importance !== undefined) {
      components.functionalImportance = sub.importance * 20; // 1~5 → 20~100
    } else if (coverageTier !== 'C' && serviceSummary) {
      // 실사용량 기반 자동 추론:
      // - 사용 일관성(usedDays/30)과 강도(avgDailyAdjustedMin)를 조합
      // - 30일 중 20일 이상 + 일평균 30분 이상이면 높은 중요도로 추론
      const consistencyScore = serviceSummary.usedDays / serviceSummary.period.days; // 0~1
      const intensityScore   = Math.min(1, serviceSummary.avgDailyAdjustedMin / CFG.TARGET_DAILY_MIN);
      const autoImportance   = Math.round((consistencyScore * 0.6 + intensityScore * 0.4) * 100);
      components.functionalImportance = autoImportance;
    } else {
      components.functionalImportance = null;
    }

    // ── 5. featureUniqueness ──
    // overlapScore는 사용량 없어도 tag 기반으로 계산 가능
    // 단, aggregated가 없으면 동시 사용일이 0으로 처리됨 (보수적)
    const overlapScore = calcOverlapScore(sub, subscriptions, aggregated || {});
    components.featureUniqueness = 100 - overlapScore * 100;

    // ── 6. costEfficiency ──
    // coverageTier C → 사용량 없으므로 제외 (시간당 비용 산출 불가)
    if (coverageTier !== 'C' && serviceSummary && serviceSummary.totalAdjustedSec > 0) {
      const monthlyKRW = sub.billingCycle === 'yearly' ? sub.price / 12 : sub.price;
      const hours = serviceSummary.totalAdjustedSec / 3600;
      const costPerHour = hours > 0 ? monthlyKRW / hours : null;
      if (costPerHour !== null) {
        // 카테고리별 기준값 적용 (없으면 기본값)
        const baseline = (CFG.COST_PER_HOUR_BASELINE_BY_CATEGORY &&
                          CFG.COST_PER_HOUR_BASELINE_BY_CATEGORY[sub.category])
                         || CFG.COST_PER_HOUR_BASELINE;
        components.costEfficiency = Math.min(100,
          (baseline / costPerHour) * 50
        );
      } else {
        components.costEfficiency = null;
      }
    } else {
      components.costEfficiency = null;
    }

    // ── 7. replacementDifficulty ──
    // 자동 계산: 같은 카테고리 내 대체 가능한 서비스 수 + 사용량 기반 추론
    // 사용자 입력값이 있으면 우선 사용, 없으면 자동 산출
    if (sub.replacementDifficulty !== null && sub.replacementDifficulty !== undefined) {
      components.replacementDifficulty = sub.replacementDifficulty * 20;
    } else {
      // 자동 추론:
      // - 같은 카테고리 내 구독 중 capabilityTags 겹침이 높을수록 대체 쉬움 → 난이도 낮음
      // - AI 도메인(category==='ai')은 서로 대체 가능성이 높아 기본 난이도 낮게 출발
      // - 사용 일관성이 높을수록(자주 씀) 대체하기 어렵다고 판단
      const sameCatSubs = subscriptions.filter(
        s => s.serviceId !== sub.serviceId && s.category === sub.category
      );
      // 최대 Jaccard 겹침 (겹침이 클수록 대체 쉬움)
      const maxJaccard = sameCatSubs.length > 0
        ? Math.max(...sameCatSubs.map(s => calcJaccard(sub.capabilityTags, s.capabilityTags)))
        : 0;
      // 사용 일관성 (높을수록 의존도 높음 → 대체 어려움)
      const consistency = (coverageTier !== 'C' && serviceSummary)
        ? serviceSummary.usedDays / serviceSummary.period.days
        : 0.5; // 미측정 시 중간값

      // 대체 난이도 = 의존도 높음(+) - 대체재 겹침(-)
      // AI 카테고리는 겹침이 많아 기본 상한을 0.7로 제한
      const categoryPenalty = sub.category === 'ai' ? 0.2 : 0;
      const autoScore = Math.max(0, Math.min(1,
        consistency * 0.7 - maxJaccard * 0.5 - categoryPenalty + 0.3
      ));
      components.replacementDifficulty = Math.round(autoScore * 100);
    }

    return components;
  }

  /* ─────────────────────────────────────
   * Value Score 계산 (결측 재정규화)
   *
   * 반환:
   *   null → 판단 보류 (MIN_AVAILABLE_WEIGHT 미달)
   *   { score, components, availableWeight, excluded }
   * ───────────────────────────────────── */
  function calcValueScore(components) {
    const keys = Object.keys(W);
    let weightedSum = 0;
    let availableWeight = 0;
    const excluded = [];

    for (const key of keys) {
      const val = components[key];
      if (val === null || val === undefined) {
        excluded.push(key);
        continue;
      }
      weightedSum    += val * W[key];
      availableWeight += W[key];
    }

    // 재정규화 하한 가드
    if (availableWeight < CFG.MIN_AVAILABLE_WEIGHT) {
      return null; // 판단 보류
    }

    const score = weightedSum / availableWeight;

    return {
      score: Math.round(score * 10) / 10,
      components,
      availableWeight: Math.round(availableWeight * 100) / 100,
      excluded,
    };
  }

  /* ─────────────────────────────────────
   * Confidence 계산
   * ───────────────────────────────────── */
  function calcConfidence(coverageTier, observedDays, cohortResult) {
    const CW = CFG.CONFIDENCE_WEIGHTS;

    const coverageFactor = CFG.COVERAGE_FACTORS[coverageTier] || 0;
    const daysFactor     = Math.min(observedDays / CFG.CONFIDENCE_MIN_DAYS, 1);
    const cohortN        = cohortResult ? cohortResult.n : 0;
    const cohortFactor   = cohortResult
      ? Math.min(cohortN / CFG.MIN_N_PERCENTILE, 1)
      : 0.3;

    const confidence =
      CW.coverage * coverageFactor +
      CW.days     * daysFactor     +
      CW.cohort   * cohortFactor;

    let grade;
    if (confidence >= CFG.CONFIDENCE_THRESHOLDS.HIGH)   grade = 'High';
    else if (confidence >= CFG.CONFIDENCE_THRESHOLDS.MEDIUM) grade = 'Medium';
    else grade = 'Low';

    return {
      value: Math.round(confidence * 100) / 100,
      grade,
      coverageFactor, daysFactor, cohortFactor,
    };
  }

  /* ─────────────────────────────────────
   * Utilization 계산
   * 분모: 코호트 p75 (적극 활용 사용자 기준)
   * 코호트 미달 시 null → 시간당 비용으로 대체 (UI에서 처리)
   * ───────────────────────────────────── */
  function calcUtilization(serviceSummary, cohortResult) {
    if (!serviceSummary || !cohortResult) return null;

    const myDailyMin  = serviceSummary.avgDailyAdjustedMin;
    const p75DailyMin = cohortResult.stats.p75;

    if (p75DailyMin <= 0) return null;

    return Math.round((myDailyMin / p75DailyMin) * 100) / 100; // 소수점 2자리
  }

  /**
   * Quota 소진율 계산 (요금제에 quota가 있을 때)
   * plan.quota: { unit, limit }
   * usedCount: 해당 기간 사용 횟수 (현재는 세션 수로 근사)
   */
  function calcQuotaUsage(plan, chunks, serviceId, period) {
    if (!plan || !plan.quota) return null;

    // 세션 수를 사용량으로 근사 (실제 API 연동 시 교체)
    const sessionCount = chunks.filter(c => c.serviceId === serviceId).length;
    const limit = plan.quota.limit;

    return {
      used: sessionCount,
      limit,
      unit: plan.quota.unit,
      ratio: Math.min(1, sessionCount / limit),
      pct: Math.min(100, Math.round((sessionCount / limit) * 100)),
    };
  }

  /* ─────────────────────────────────────
   * 전체 서비스 스코어카드 생성
   * ───────────────────────────────────── */
  function buildScorecard(params) {
    const {
      subscription,
      serviceSummary,
      coverageTier,
      cohortResult,
      subscriptions,
      aggregated,
      chunks,
      catalogPlan,
      todayStr,
      observedDays,
    } = params;

    // 컴포넌트 계산
    const components = calcComponents({
      subscription,
      serviceSummary,
      coverageTier,
      cohortResult,
      subscriptions,
      aggregated,
    });

    // Value Score (결측 재정규화)
    const scoreResult = calcValueScore(components);

    // Confidence
    const confidence = calcConfidence(
      coverageTier,
      observedDays || (serviceSummary ? serviceSummary.usedDays : 0),
      cohortResult
    );

    // Utilization
    const utilization = calcUtilization(serviceSummary, cohortResult);

    // Quota 소진율
    const quotaUsage = catalogPlan && catalogPlan.quota
      ? calcQuotaUsage(catalogPlan, chunks, subscription.serviceId, 30)
      : null;

    // Self-benchmark (항상 계산)
    const selfBenchmark = serviceSummary
      ? AppBenchmark.calcSelfBenchmark(subscription, serviceSummary, todayStr)
      : null;

    // Percentile (코호트 표시 가능 시)
    const userPercentile = serviceSummary && cohortResult
      ? AppBenchmark.calcUserPercentile(
          serviceSummary.avgDailyAdjustedMin,
          cohortResult
        )
      : null;

    return {
      serviceId: subscription.serviceId,
      scoreResult,      // null → 판단 보류
      components,
      confidence,
      utilization,
      quotaUsage,
      selfBenchmark,
      cohortResult,
      userPercentile,
      coverageTier,
    };
  }

  /* ─────────────────────────────────────
   * Public API
   * ───────────────────────────────────── */
  global.AppScore = {
    calcComponents,
    calcValueScore,
    calcConfidence,
    calcUtilization,
    calcQuotaUsage,
    calcOverlapScore,
    calcJaccard,
    buildScorecard,
  };

})(window);
