/**
 * changes.js
 * 변경 이벤트 처리, Verification Gate, 기능 중복 2단계 관찰 로직.
 * Provider 패턴: ChangeFeedProvider.fetchChanges() — 향후 피드 API 교체 지점.
 *
 * Hard Rule 4: auto_detected → 알림 발송 금지, '확인 필요' 배지만.
 * Hard Rule 3: "~때문에" 인과 표현 금지.
 * Hard Rule 1: 관찰 미완료 → 추천 생성 금지.
 */
(function (global) {
  'use strict';

  const CFG = global.AppConfig;

  /* ─────────────────────────────────────
   * ChangeFeedProvider
   * 현재: 앱 상태 기반 / 향후: 변경 피드 API
   * ───────────────────────────────────── */
  const ChangeFeedProvider = {
    async fetchChanges({ since } = {}) {
      // 향후 교체: return await fetch(`/api/changes?since=${since}`).then(r => r.json());
      const state = global._appState;
      if (!state) return [];
      let events = state.changeEvents || [];
      if (since) {
        events = events.filter(e => e.detectedAt >= since);
      }
      return events;
    },
  };

  /* ─────────────────────────────────────
   * Verification Gate (사양서 5.2)
   * official_announced | human_verified → 사실 표시 + 알림 가능
   * auto_detected                       → 알림 금지, '확인 필요' 배지만
   * ───────────────────────────────────── */
  function canSendAlert(event) {
    return event.verificationStatus === 'official_announced' ||
           event.verificationStatus === 'human_verified';
  }

  function getVerificationBadge(event) {
    return CFG.VERIFICATION_LABELS[event.verificationStatus] || '알 수 없음';
  }

  /* ─────────────────────────────────────
   * 서비스별 변경 이벤트 필터
   * ───────────────────────────────────── */
  function getEventsForService(changeEvents, serviceId) {
    return changeEvents
      .filter(e => e.serviceId === serviceId)
      .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)); // 최신순
  }

  /* ─────────────────────────────────────
   * 기능 중복 2단계 관찰 로직 (사양서 5.4)
   *
   * 입력:
   *   featureEvent: type==='feature_added' ChangeEvent
   *   aggregated:   AppUsage.aggregateByServiceAndDate 결과
   *   todayStr:     'YYYY-MM-DD'
   *
   * 반환:
   *   { stage, recommendation, observeRemainingDays, conditionsMet }
   *   stage: 'info_only' | 'recommend_cancel' | 'observe_period'
   * ───────────────────────────────────── */
  function evaluateFeatureOverlap(featureEvent, aggregated, todayStr) {
    if (featureEvent.type !== 'feature_added') return null;

    const detectedAt  = featureEvent.detectedAt;
    const serviceB    = featureEvent.serviceId;         // 기능 추가된 서비스
    const serviceC    = featureEvent.overlapsWithServiceId; // 중복 가능 서비스
    if (!serviceC) return null;

    // 감지 후 경과일
    const detectedMs = new Date(detectedAt + 'T00:00:00Z').getTime();
    const todayMs    = new Date(todayStr    + 'T00:00:00Z').getTime();
    const elapsedDays = Math.round((todayMs - detectedMs) / 86400000);

    // 관찰 기간 미완료 (OBSERVE_DAYS = 28일)
    if (elapsedDays < CFG.OBSERVE_DAYS) {
      return {
        stage: 'info_only',
        observeRemainingDays: CFG.OBSERVE_DAYS - elapsedDays,
        elapsedDays,
        serviceB,
        serviceC,
        // 알림 없음, 정보 카드만
        message: `${serviceB}에 ${serviceC}와 겹칠 수 있는 기능이 추가되었습니다. (${elapsedDays}일 관찰 중, ${CFG.OBSERVE_DAYS - elapsedDays}일 후 재평가)`,
      };
    }

    // 28일 경과 → 3조건 평가
    // 기준선: 감지 이전 30일 vs 감지 이후 경과일
    const baselineStart = new Date(detectedMs - 30 * 86400000).toISOString().slice(0, 10);
    const baselineEnd   = detectedAt;
    const observeEnd    = todayStr;

    const avgB_before = calcAvgDailyMin(aggregated, serviceB, baselineStart, detectedAt);
    const avgB_after  = calcAvgDailyMin(aggregated, serviceB, detectedAt,    observeEnd);
    const avgC_before = calcAvgDailyMin(aggregated, serviceC, baselineStart, detectedAt);
    const avgC_after  = calcAvgDailyMin(aggregated, serviceC, detectedAt,    observeEnd);

    // 조건 A: B 사용량 +20% 이상 증가
    const condA = avgB_before > 0
      ? (avgB_after - avgB_before) / avgB_before >= CFG.OVERLAP_USAGE_INCREASE
      : avgB_after > 0;

    // 조건 B: C 사용량 -30% 이상 감소
    const condB = avgC_before > 0
      ? (avgC_before - avgC_after) / avgC_before >= CFG.OVERLAP_USAGE_DECREASE
      : false;

    // 조건 C: C의 coverageTier가 A 또는 B (실측 중)
    // → 호출 측에서 coverageMap 전달 시 확인; 여기서는 파라미터로 받지 않으므로 기본 true
    // (실제로는 buildOverlapRecommendation에서 coverageMap과 함께 처리)
    const condsMet = { A: condA, B: condB };

    return {
      stage: condA && condB ? 'recommend_cancel' : 'observe_period',
      elapsedDays,
      conditionsMet: condsMet,
      serviceB,
      serviceC,
      avgB_before: Math.round(avgB_before * 10) / 10,
      avgB_after:  Math.round(avgB_after  * 10) / 10,
      avgC_before: Math.round(avgC_before * 10) / 10,
      avgC_after:  Math.round(avgC_after  * 10) / 10,
    };
  }

  /**
   * feature_added 이벤트 + coverageMap을 함께 받아
   * 최종 중복 해소 추천 여부를 결정
   */
  function buildOverlapRecommendation(featureEvent, aggregated, coverageMap, todayStr) {
    const result = evaluateFeatureOverlap(featureEvent, aggregated, todayStr);
    if (!result) return null;

    if (result.stage === 'info_only') {
      return { type: 'info_card', ...result };
    }

    const serviceC = featureEvent.overlapsWithServiceId;
    // 조건 C: coverageTier A 또는 B
    const tierC = coverageMap[serviceC] ? coverageMap[serviceC].tier : 'C';
    const condC = tierC === 'A' || tierC === 'B';

    if (result.conditionsMet.A && result.conditionsMet.B && condC) {
      return {
        type: 'recommend_cancel',
        ...result,
        conditionsMet: { ...result.conditionsMet, C: condC },
        // Hard Rule 3: "~때문에" 금지
        message: `${serviceC}의 사용량이 ${result.serviceB}로 이동한 것으로 관측됩니다.`,
        recommendation: `${serviceC} 해지 검토`,
      };
    }

    return {
      type: 'observe_incomplete',
      ...result,
      conditionsMet: { ...result.conditionsMet, C: condC },
      message: `${result.serviceB} 기능 추가 후 ${result.elapsedDays}일 경과. 3가지 조건 중 일부 미충족.`,
    };
  }

  /* ─────────────────────────────────────
   * 일평균 adjusted 분 계산 (기간 기반)
   * ───────────────────────────────────── */
  function calcAvgDailyMin(aggregated, serviceId, fromDate, toDate) {
    const serviceData = aggregated[serviceId] || {};
    const dates = AppUsage.dateRange(fromDate, toDate);
    if (!dates.length) return 0;

    let totalSec = 0;
    for (const d of dates) {
      totalSec += (serviceData[d] ? serviceData[d].adjustedSec : 0);
    }
    return (totalSec / 60) / dates.length;
  }

  /* ─────────────────────────────────────
   * 가격 변경 이벤트 렌더링 데이터 생성
   * ───────────────────────────────────── */
  function buildPriceChangeCard(event) {
    const badge = getVerificationBadge(event);
    const canAlert = canSendAlert(event);

    let displayText = '';
    if (event.type === 'price_change' && event.before && event.after) {
      const before = event.before.amount ? `₩${event.before.amount.toLocaleString()}` : '이전 가격';
      const after  = event.after.amount  ? `₩${event.after.amount.toLocaleString()}`  : '변경 가격';

      if (event.verificationStatus === 'official_announced') {
        // 확정 공지만 단정 표현 허용
        const effectiveAt = event.effectiveAt
          ? `${event.effectiveAt} 부터`
          : '일정 미정';
        displayText = `${effectiveAt} ${before} → ${after}으로 변경 예정`;
      } else {
        // auto_detected: 단정 금지
        displayText = `${before} → ${after} 변경이 감지되었습니다 (미확인)`;
      }
    }

    return {
      eventId: event.eventId,
      type: event.type,
      serviceId: event.serviceId,
      badge,
      canAlert,
      isAutoDetected: event.verificationStatus === 'auto_detected',
      detectedAt: event.detectedAt,
      effectiveAt: event.effectiveAt,
      evidenceUrl: event.evidenceUrl,
      displayText,
      before: event.before,
      after: event.after,
    };
  }

  /* ─────────────────────────────────────
   * 구독별 활성 변경 이벤트 카드 목록
   * ───────────────────────────────────── */
  function getChangeCards(changeEvents, serviceId) {
    return getEventsForService(changeEvents, serviceId)
      .map(buildPriceChangeCard);
  }

  /* ─────────────────────────────────────
   * Public API
   * ───────────────────────────────────── */
  global.ChangeFeedProvider = ChangeFeedProvider;
  global.AppChanges = {
    canSendAlert,
    getVerificationBadge,
    getEventsForService,
    evaluateFeatureOverlap,
    buildOverlapRecommendation,
    buildPriceChangeCard,
    getChangeCards,
    calcAvgDailyMin,
  };

})(window);
