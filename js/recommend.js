/**
 * recommend.js
 * 추천 규칙 엔진 — 근거 문장 동적 생성, 예상 절감액.
 * Provider 패턴: RecommendationEngine.analyze() — 향후 LLM API 교체 지점.
 *
 * Hard Rules:
 *  - "~때문에" 인과 표현 금지 → "~로 관측됩니다" 사용 (Hard Rule 3)
 *  - Confidence Low → 해지 추천 금지 (사양서 4.8)
 *  - MIN_AVAILABLE_WEIGHT 미달 → 판단 보류 (사양서 4.8)
 *  - usage 계열 컴포넌트 0개 → 판단 보류
 *  - 제휴 관계 공시 (사양서 9.5)
 */
(function (global) {
  'use strict';

  const CFG    = global.AppConfig;
  const LABELS = CFG.RECOMMENDATION_LABELS;

  /* ─────────────────────────────────────
   * RecommendationEngine (Provider 패턴)
   * ───────────────────────────────────── */
  const RecommendationEngine = {
    async analyze(portfolio) {
      // 향후 교체: return await fetch('/api/recommend', { method:'POST', body: JSON.stringify(portfolio) }).then(r=>r.json());
      return analyzePortfolio(portfolio);
    },
  };

  /* ─────────────────────────────────────
   * 사용량 계열 컴포넌트 키
   * ───────────────────────────────────── */
  const USAGE_COMPONENT_KEYS = ['usageIntensity', 'relativeUsage', 'usageConsistency'];

  /* ─────────────────────────────────────
   * 단일 서비스 추천 결정
   * ───────────────────────────────────── */
  function getRecommendation(scorecard) {
    const { scoreResult, confidence, coverageTier } = scorecard;

    // Tier B = 수동 입력(self_reported/loose) 데이터 있음 → 분석 허용, 단 정확도 경고 표시
    const isPartialTracking = (coverageTier === 'B');

    // 판단 보류 조건 1: MIN_AVAILABLE_WEIGHT 미달 (scoreResult === null)
    if (!scoreResult) {
      return {
        label: LABELS.HOLD,
        reason: '가중치 합계가 기준치 미만이어서 점수를 산출하지 않았습니다.',
        canRecommendCancel: false,
        isPartialTracking,
      };
    }

    // 판단 보류 조건 2: usage 계열 컴포넌트 하나도 없음
    // Tier B 수동 입력의 경우: usageIntensity/usageConsistency가 계산되므로 이 조건에
    // 걸리지 않지만, 혹시 모두 null이어도 Tier B는 분석을 시도한다 (C와 다름)
    const hasUsageComponent = USAGE_COMPONENT_KEYS.some(
      k => scoreResult.components[k] !== null && scoreResult.components[k] !== undefined
    );
    if (!hasUsageComponent && !isPartialTracking) {
      return {
        label: LABELS.HOLD,
        reason: '사용량 측정 데이터가 없어 판단하지 않습니다.',
        canRecommendCancel: false,
        isPartialTracking,
      };
    }
    // Tier B인데 usage 컴포넌트도 없으면 (세션 데이터 전혀 없는 엣지 케이스) 판단 보류
    if (!hasUsageComponent && isPartialTracking) {
      return {
        label: LABELS.HOLD,
        reason: '사용 시간을 직접 입력하면 분석을 시작할 수 있습니다.',
        canRecommendCancel: false,
        isPartialTracking,
      };
    }

    // 판단 보류 조건 3: Confidence Low
    // Tier B(수동 입력)는 Low confidence여도 분석 허용 — 단 해지 추천은 금지
    if (confidence.grade === 'Low') {
      if (!isPartialTracking) {
        return {
          label: LABELS.HOLD,
          reason: `신뢰도가 낮아(${confidence.grade}) 판단을 보류합니다. 수집기를 연결하면 정확도가 높아집니다.`,
          canRecommendCancel: false,
          isPartialTracking,
        };
      }
      // Tier B + Low confidence: 해지 추천 제외, 나머지 분석은 허용
      const score = scoreResult.score;
      if (score < CFG.SCORE_CANCEL_THRESHOLD) {
        // 해지 검토 대신 다운그레이드 검토로 한 단계 보수적으로 처리
        return {
          label: LABELS.DOWNGRADE,
          canRecommendCancel: false,
          score,
          isPartialTracking,
        };
      }
      if (score < CFG.SCORE_DOWNGRADE_THRESHOLD) {
        return { label: LABELS.DOWNGRADE, canRecommendCancel: false, score, isPartialTracking };
      }
      return { label: LABELS.KEEP, canRecommendCancel: false, score, isPartialTracking };
    }

    const score = scoreResult.score;

    if (score < CFG.SCORE_CANCEL_THRESHOLD) {
      return { label: LABELS.CANCEL, canRecommendCancel: true, score, isPartialTracking };
    }
    if (score < CFG.SCORE_DOWNGRADE_THRESHOLD) {
      return { label: LABELS.DOWNGRADE, canRecommendCancel: false, score, isPartialTracking };
    }
    return { label: LABELS.KEEP, canRecommendCancel: false, score, isPartialTracking };
  }

  /* ─────────────────────────────────────
   * 근거 문장 동적 생성
   * "~때문에" 금지, "~로 관측됩니다" 사용
   * ───────────────────────────────────── */
  function buildReasonSentences(scorecard, recommendation, cohortResult, overlapInfo) {
    const sentences = [];
    const { scoreResult, selfBenchmark, userPercentile, coverageTier } = scorecard;
    const comps = scoreResult ? scoreResult.components : {};

    // 1. 사용량 관련
    if (coverageTier === 'C') {
      sentences.push('사용량이 측정되지 않아 활용도를 확인할 수 없습니다.');
    } else if (coverageTier === 'B') {
      // Tier B: 수동 입력 기반 — 정확도 경고를 근거 문장 첫 번째로 표시
      sentences.push('사용 시간을 직접 입력한 데이터 기반으로 분석했습니다. 자동 추적 대비 정확도가 낮을 수 있습니다.');
      if (selfBenchmark) {
        if (selfBenchmark.unusedDays > 15) {
          sentences.push(`최근 30일 중 ${selfBenchmark.unusedDays}일 미사용으로 관측됩니다.`);
        }
        if (selfBenchmark.daysSinceLastUse !== null && selfBenchmark.daysSinceLastUse > 7) {
          sentences.push(`마지막 사용으로부터 ${selfBenchmark.daysSinceLastUse}일 경과로 관측됩니다.`);
        }
        if (selfBenchmark.costPerHour !== null) {
          sentences.push(`이번 달 시간당 비용은 ₩${Math.round(selfBenchmark.costPerHour).toLocaleString()}으로 관측됩니다.`);
        }
      }
    } else if (selfBenchmark) {
      if (selfBenchmark.unusedDays > 15) {
        sentences.push(`최근 30일 중 ${selfBenchmark.unusedDays}일 미사용으로 관측됩니다.`);
      }
      if (selfBenchmark.daysSinceLastUse !== null && selfBenchmark.daysSinceLastUse > 7) {
        sentences.push(`마지막 사용으로부터 ${selfBenchmark.daysSinceLastUse}일 경과로 관측됩니다.`);
      }
      if (selfBenchmark.costPerHour !== null) {
        sentences.push(`이번 달 시간당 비용은 ₩${Math.round(selfBenchmark.costPerHour).toLocaleString()}으로 관측됩니다.`);
      }
    }

    // 2. 코호트 비교 (표시 가능할 때만)
    if (userPercentile !== null && cohortResult) {
      sentences.push(
        `${cohortResult.fallbackDesc} 상위 ${userPercentile}% 사용량으로 관측됩니다.`
      );
    }

    // 3. 기능 중복
    if (overlapInfo && overlapInfo.length > 0) {
      const names = overlapInfo.map(o => o.serviceName).join(', ');
      sentences.push(`${names}와 기능이 일부 겹치는 것으로 관측됩니다.`);
    }

    // 4. Confidence 관련
    if (scorecard.confidence.grade === 'Medium') {
      sentences.push('수집 데이터가 아직 30일 미만이어서 신뢰도가 중간 수준입니다.');
    }

    // 5. 컴포넌트 개별 설명
    if (comps.featureUniqueness !== null && comps.featureUniqueness < 40) {
      sentences.push('다른 구독과 기능이 많이 겹치는 것으로 관측됩니다.');
    }
    if (comps.functionalImportance !== null && comps.functionalImportance >= 80) {
      sentences.push('업무·학습 중요도를 높게 설정하셨습니다.');
    }
    if (comps.replacementDifficulty !== null && comps.replacementDifficulty >= 80) {
      sentences.push('대체하기 어려운 서비스로 설정되어 있습니다.');
    }

    return sentences;
  }

  /* ─────────────────────────────────────
   * 기능 중복 서비스 목록 조회
   * ───────────────────────────────────── */
  function findOverlappingServices(subscription, subscriptions, aggregated) {
    const result = [];
    const subs = subscriptions.filter(s =>
      s.serviceId !== subscription.serviceId &&
      s.category  === subscription.category
    );
    for (const other of subs) {
      const j = AppScore.calcJaccard(subscription.capabilityTags, other.capabilityTags);
      if (j > 0.2) {
        result.push({
          serviceId:   other.serviceId,
          serviceName: other.serviceName,
          jaccard:     Math.round(j * 100),
        });
      }
    }
    return result;
  }

  /* ─────────────────────────────────────
   * 전체 포트폴리오 분석
   * ───────────────────────────────────── */
  function analyzePortfolio(portfolio) {
    const {
      subscriptions,
      scorecards,      // { [serviceId]: scorecard }
      cohortResults,   // { [serviceId]: cohortResult }
      aggregated,
      catalog,
      changeEvents,
      todayStr,
    } = portfolio;

    const results = [];

    for (const sub of subscriptions) {
      const scorecard    = scorecards[sub.serviceId];
      const cohortResult = cohortResults ? cohortResults[sub.serviceId] : null;
      if (!scorecard) continue;

      const rec         = getRecommendation(scorecard);
      const overlapInfo = findOverlappingServices(sub, subscriptions, aggregated);
      const reasons     = buildReasonSentences(scorecard, rec, cohortResult, overlapInfo);

      // 요금제 전환 제안 (해지·다운그레이드 등급)
      let planSwitchSuggestions = [];
      if (rec.label !== LABELS.KEEP && rec.label !== LABELS.HOLD && catalog) {
        planSwitchSuggestions = buildPlanSwitchSuggestions(sub, catalog, todayStr);
      }

      // 관련 변경 이벤트
      const relatedEvents = (changeEvents || [])
        .filter(e => e.serviceId === sub.serviceId)
        .slice(0, 3);

      results.push({
        serviceId:    sub.serviceId,
        serviceName:  sub.serviceName,
        recommendation: rec,
        reasons,
        overlapInfo,
        planSwitchSuggestions,
        relatedEvents,
        scorecard,
        // 제휴 관계 공시 (사양서 9.5)
        affiliateDisclosure: '제휴 관계 없음',
      });
    }

    // 예상 절감액 집계
    const cancelCandidates = results.filter(r => r.recommendation.label === LABELS.CANCEL);
    const monthlySavings   = cancelCandidates.reduce((sum, r) => {
      const sub = subscriptions.find(s => s.serviceId === r.serviceId);
      return sum + (sub ? AppCatalog.toMonthlyAmount(sub.price, sub.billingCycle) : 0);
    }, 0);

    return {
      items: results,
      summary: {
        totalSubscriptions:  subscriptions.length,
        cancelCount:         cancelCandidates.length,
        downgradeCount:      results.filter(r => r.recommendation.label === LABELS.DOWNGRADE).length,
        holdCount:           results.filter(r => r.recommendation.label === LABELS.HOLD).length,
        keepCount:           results.filter(r => r.recommendation.label === LABELS.KEEP).length,
        monthlySavingsKRW:   Math.round(monthlySavings),
        yearlySavingsKRW:    Math.round(monthlySavings * 12),
      },
    };
  }

  /* ─────────────────────────────────────
   * 요금제 전환 제안 목록 생성
   * ───────────────────────────────────── */
  function buildPlanSwitchSuggestions(subscription, catalog, todayStr) {
    const plans = AppCatalog.getActivePlans(catalog, subscription.serviceId, todayStr);
    const suggestions = [];

    for (const plan of plans) {
      if (plan.planId === subscription.planId) continue;

      const result = AppCatalog.calcPlanSwitchSavings(
        subscription, plan, null, 'KR', todayStr
      );
      if (!result.comparable) continue;

      suggestions.push({
        planId:   plan.planId,
        planName: plan.name,
        switchResult: result,
        // 제휴 관계 공시
        affiliateDisclosure: '제휴 관계 없음',
      });
    }

    return suggestions;
  }

  /* ─────────────────────────────────────
   * Public API
   * ───────────────────────────────────── */
  global.RecommendationEngine = RecommendationEngine;
  global.AppRecommend = {
    getRecommendation,
    buildReasonSentences,
    findOverlappingServices,
    analyzePortfolio,
    buildPlanSwitchSuggestions,
    USAGE_COMPONENT_KEYS,
  };

})(window);
