/**
 * predict.js
 * 확정 공지 vs 패턴 예측 분리, 결제·환불 데드라인.
 * Provider 패턴: 향후 LLM 예측 API 교체 지점 포함.
 *
 * Hard Rules:
 *  - 확정(official_announced)만 "변경됩니다" 표현 허용
 *  - 미확정 상태에서 "인상됩니다" 단정 금지 (사양서 7.1)
 *  - priceHistory 3회 미만 → 예측 표시 금지 (사양서 7.1)
 *  - hasPublicRoadmap:false → 로드맵 카드 생성 금지 (사양서 7.2)
 *  - 결제·환불 데드라인 우선 구현 (사양서 7.3)
 */
(function (global) {
  'use strict';

  const CFG = global.AppConfig;

  /* ─────────────────────────────────────
   * 1. 결제·환불 데드라인 (가장 확실하고 즉시 유용)
   * ───────────────────────────────────── */

  /**
   * 해지 데드라인 카드
   * "다음 결제 3일 전. 지금 해지하면 이번 주기까지 사용 후 종료됩니다"
   */
  function buildBillingDeadlineCard(subscription, todayStr) {
    const todayMs   = new Date(todayStr + 'T00:00:00Z').getTime();
    const billingMs = new Date(subscription.nextBillingDate + 'T00:00:00Z').getTime();
    const daysLeft  = Math.round((billingMs - todayMs) / 86400000);

    return {
      type: 'billing_deadline',
      serviceId: subscription.serviceId,
      serviceName: subscription.serviceName,
      nextBillingDate: subscription.nextBillingDate,
      daysUntilBilling: daysLeft,
      // D-3 이내이면 알림 발송 대상
      isUrgent: daysLeft >= 0 && daysLeft <= 3,
      isPast: daysLeft < 0,
      message: daysLeft < 0
        ? `이미 결제됨 (${Math.abs(daysLeft)}일 전)`
        : daysLeft === 0
          ? '오늘 결제 예정. 지금 해지하면 다음 주기부터 종료됩니다.'
          : daysLeft <= 3
            ? `D-${daysLeft} 결제 임박. 지금 해지하면 이번 주기까지 사용 후 종료됩니다.`
            : `다음 결제까지 D-${daysLeft}`,
      monthlyKRW: AppCatalog.toMonthlyAmount(subscription.price, subscription.billingCycle),
    };
  }

  /**
   * 무료 체험 자동결제 전환 D-3 알림 (future extension)
   * 현재 데모에서는 trialEndDate 필드 없으므로 구조만 준비
   */
  function buildTrialEndCard(subscription, todayStr) {
    if (!subscription.trialEndDate) return null;
    const todayMs   = new Date(todayStr + 'T00:00:00Z').getTime();
    const trialMs   = new Date(subscription.trialEndDate + 'T00:00:00Z').getTime();
    const daysLeft  = Math.round((trialMs - todayMs) / 86400000);
    if (daysLeft > 3 || daysLeft < 0) return null;

    return {
      type: 'trial_ending',
      serviceId: subscription.serviceId,
      trialEndDate: subscription.trialEndDate,
      daysLeft,
      isUrgent: true,
      message: daysLeft === 0
        ? '오늘 무료 체험 종료, 유료 전환됩니다.'
        : `무료 체험 종료 ${daysLeft}일 전. 자동 유료 전환 예정.`,
    };
  }

  /* ─────────────────────────────────────
   * 2. 확정 공지 카드 (official_announced)
   * ───────────────────────────────────── */
  function buildConfirmedChangeCard(event) {
    if (event.verificationStatus !== 'official_announced') return null;
    if (event.type !== 'price_change') return null;

    const before = event.before && event.before.amount
      ? `₩${event.before.amount.toLocaleString()}`
      : '이전 가격';
    const after  = event.after  && event.after.amount
      ? `₩${event.after.amount.toLocaleString()}`
      : '변경 가격';
    const effectiveStr = event.effectiveAt
      ? `${event.effectiveAt}부터`
      : '일정 미정';

    return {
      type: 'confirmed_price_change',
      badge: CFG.VERIFICATION_LABELS.official_announced,  // '확정'
      serviceId: event.serviceId,
      eventId: event.eventId,
      evidenceUrl: event.evidenceUrl,
      effectiveAt: event.effectiveAt,
      detectedAt: event.detectedAt,
      // 확정 공지만 단정 허용
      message: `${effectiveStr} ${before} → ${after}으로 변경됩니다`,
      before: event.before,
      after:  event.after,
      canAlert: true,
    };
  }

  /* ─────────────────────────────────────
   * 3. 패턴 예측 카드 (priceHistory 기반)
   *    priceHistory 3회 미만 → null 반환 (표시 금지)
   *    "인상됩니다" 단정 절대 금지 — 관측 패턴만 보여줌
   * ───────────────────────────────────── */
  function buildPatternPredictionCard(service, todayStr) {
    const history = service.priceHistory || [];

    // priceHistory 인상 이력이 3회 미만 → 예측 표시 금지
    // "3회"는 priceHistory 기록 건수 기준 (인상 이벤트 횟수가 아님)
    if (history.length < CFG.PRICE_HISTORY_MIN_COUNT) return null;

    // 인상 이력만 추출 (금액 증가한 경우)
    const increases = [];
    for (let i = 1; i < history.length; i++) {
      if (history[i].amount > history[i - 1].amount) {
        increases.push({
          date:   history[i].date,
          before: history[i - 1].amount,
          after:  history[i].amount,
        });
      }
    }

    // 인상 이력이 하나도 없으면 예측 불가
    if (increases.length === 0) return null;

    // 평균 인상 주기 계산 (개월)
    const intervals = [];
    for (let i = 1; i < increases.length; i++) {
      const msA = new Date(increases[i - 1].date + 'T00:00:00Z').getTime();
      const msB = new Date(increases[i].date     + 'T00:00:00Z').getTime();
      intervals.push((msB - msA) / (30 * 86400000));
    }
    const avgIntervalMonths = intervals.length
      ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
      : null;

    // 마지막 인상으로부터 경과 개월
    const lastIncrease = increases[increases.length - 1];
    const lastMs = new Date(lastIncrease.date + 'T00:00:00Z').getTime();
    const todayMs = new Date(todayStr + 'T00:00:00Z').getTime();
    const elapsedMonths = Math.round((todayMs - lastMs) / (30 * 86400000));

    // 평균 인상폭
    const avgIncreaseAmt = Math.round(
      increases.reduce((sum, inc) => sum + (inc.after - inc.before), 0) / increases.length
    );

    // 단정 표현 금지 — 관측된 패턴 그 자체를 표시
    const patternDesc = avgIntervalMonths
      ? `과거 ${increases.length}회 인상 기준 평균 ${avgIntervalMonths}개월 주기로 인상되었고, ` +
        `마지막 인상(₩${lastIncrease.before.toLocaleString()} → ₩${lastIncrease.after.toLocaleString()})으로부터 ${elapsedMonths}개월 경과했습니다.`
      : `${increases.length}회 인상 이력이 있습니다.`;

    return {
      type: 'pattern_prediction',
      badge: '예측',                // '예측' 배지 — '확정' 아님
      serviceId: service.serviceId,
      increases,
      avgIntervalMonths,
      elapsedMonths,
      avgIncreaseAmt,
      patternDesc,
      // "인상됩니다" 금지 — 단정 표현 없음
      canAlert: false,             // 예측은 알림 발송 안 함
    };
  }

  /* ─────────────────────────────────────
   * 4. 로드맵 카드 (사양서 7.2)
   *    hasPublicRoadmap:false → 카드 생성 금지
   * ───────────────────────────────────── */
  function buildRoadmapCard(service) {
    // hasPublicRoadmap false → null (카드 자체 미생성)
    if (!service.hasPublicRoadmap) return null;

    return {
      type: 'roadmap',
      serviceId: service.serviceId,
      // 일정은 "예정일"이 아니라 "벤더가 공개한 일정(변경될 수 있음)"
      disclaimer: '벤더가 공개한 일정으로, 변경될 수 있습니다.',
      sourceUrl: service.officialUrls ? service.officialUrls.changelog : null,
    };
  }

  /* ─────────────────────────────────────
   * 5. 구독별 예측 카드 묶음 생성
   * ───────────────────────────────────── */
  function buildPredictCards(subscription, catalog, changeEvents, todayStr) {
    const cards = [];
    const service = AppCatalog.getService(catalog, subscription.serviceId);

    // 결제 데드라인 (항상)
    const billingCard = buildBillingDeadlineCard(subscription, todayStr);
    if (billingCard) cards.push(billingCard);

    // 무료 체험 종료
    const trialCard = buildTrialEndCard(subscription, todayStr);
    if (trialCard) cards.push(trialCard);

    // 확정 공지 (official_announced 이벤트)
    const confirmedEvents = (changeEvents || []).filter(
      e => e.serviceId === subscription.serviceId &&
           e.verificationStatus === 'official_announced' &&
           e.type === 'price_change'
    );
    confirmedEvents.forEach(e => {
      const card = buildConfirmedChangeCard(e);
      if (card) cards.push(card);
    });

    // 패턴 예측 (priceHistory 3회 이상인 경우만)
    if (service) {
      const patternCard = buildPatternPredictionCard(service, todayStr);
      if (patternCard) cards.push(patternCard);

      // 로드맵 카드
      const roadmapCard = buildRoadmapCard(service);
      if (roadmapCard) cards.push(roadmapCard);
    }

    return cards;
  }

  /* ─────────────────────────────────────
   * 다가오는 결제 목록 (대시보드용, D-day 순)
   * ───────────────────────────────────── */
  function getUpcomingBillings(subscriptions, todayStr, limit) {
    const todayMs = new Date(todayStr + 'T00:00:00Z').getTime();
    return subscriptions
      .map(sub => buildBillingDeadlineCard(sub, todayStr))
      .filter(c => c.daysUntilBilling >= 0)
      .sort((a, b) => a.daysUntilBilling - b.daysUntilBilling)
      .slice(0, limit || 3);
  }

  /* ─────────────────────────────────────
   * Public API
   * ───────────────────────────────────── */
  global.AppPredict = {
    buildBillingDeadlineCard,
    buildTrialEndCard,
    buildConfirmedChangeCard,
    buildPatternPredictionCard,
    buildRoadmapCard,
    buildPredictCards,
    getUpcomingBillings,
  };

})(window);
