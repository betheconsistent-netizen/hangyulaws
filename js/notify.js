/**
 * notify.js
 * 알림 생성·우선순위·예산·쿨다운·스누즈.
 *
 * 핵심 규칙:
 *  - MAX_PUSH_PER_WEEK = 3 초과 → suppressedReason:'budget'
 *  - auto_detected → 절대 푸시 금지 (suppressedReason:'unverified')
 *  - keepUntil 설정 시 해지 계열 알림 중단 (suppressedReason:'snoozed')
 *  - MIN_SAVING_KRW 미만 → 억제 (suppressedReason:'below_threshold')
 *  - 동일 서비스·유형 쿨다운 COOLDOWN_DAYS (suppressedReason:'cooldown')
 *  - 억제된 알림은 deliveredAt:null + suppressedReason 기록 → 인앱 피드에만
 */
(function (global) {
  'use strict';

  const CFG = global.AppConfig;

  /* ─────────────────────────────────────
   * 우선순위 레벨 (낮을수록 먼저)
   * ───────────────────────────────────── */
  const PRIORITY = {
    billing_deadline:          1,
    trial_ending:              1,
    price_increase_confirmed:  2,
    saving_opportunity:        3,
    overlap_resolved:          4,
    info:                      5,
  };

  /* ─────────────────────────────────────
   * UUID 생성
   * ───────────────────────────────────── */
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /* ─────────────────────────────────────
   * 쿨다운 체크
   * 기존 알림 목록에서 동일 serviceId·type으로
   * COOLDOWN_DAYS 이내 deliveredAt이 있는지 확인
   * ───────────────────────────────────── */
  function isInCooldown(serviceId, type, existingNotifications, todayStr) {
    const cutoffMs = new Date(todayStr + 'T00:00:00Z').getTime()
                     - CFG.COOLDOWN_DAYS * 86400000;
    return existingNotifications.some(n =>
      n.serviceId === serviceId &&
      n.type      === type &&
      n.deliveredAt &&
      new Date(n.deliveredAt).getTime() >= cutoffMs
    );
  }

  /* ─────────────────────────────────────
   * 스누즈 체크
   * subscription.keepUntil이 오늘 이후이면 해지 계열 억제
   * ───────────────────────────────────── */
  const CANCEL_TYPES = new Set(['saving_opportunity', 'overlap_resolved']);

  function isSnoozed(subscription, type, todayStr) {
    if (!subscription || !subscription.keepUntil) return false;
    if (!CANCEL_TYPES.has(type)) return false;
    return subscription.keepUntil >= todayStr;
  }

  /* ─────────────────────────────────────
   * 이번 주(7일 내) 이미 발송된 푸시 수
   * ───────────────────────────────────── */
  function countDeliveredThisWeek(notifications, todayStr) {
    const weekAgoMs = new Date(todayStr + 'T00:00:00Z').getTime() - 7 * 86400000;
    return notifications.filter(n =>
      n.deliveredAt &&
      new Date(n.deliveredAt).getTime() >= weekAgoMs
    ).length;
  }

  /* ─────────────────────────────────────
   * 알림 후보 생성 (억제 전 원본)
   * ───────────────────────────────────── */

  /** 결제 데드라인 알림 */
  function makeBillingDeadlineNotif(subscription, billingCard, todayStr) {
    if (!billingCard.isUrgent) return null;
    return {
      id: uuid(),
      type: 'billing_deadline',
      priority: PRIORITY.billing_deadline,
      serviceId: subscription.serviceId,
      title: `${subscription.serviceName} 결제 ${billingCard.daysUntilBilling}일 전`,
      body: billingCard.message,
      createdAt: todayStr,
      deliveredAt: null,
      suppressedReason: null,
      savingsKRW: 0,
    };
  }

  /** 확정 가격 인상 알림 */
  function makePriceIncreaseNotif(subscription, changeEvent, todayStr) {
    if (!AppChanges.canSendAlert(changeEvent)) return null;
    if (changeEvent.type !== 'price_change') return null;

    const before = changeEvent.before && changeEvent.before.amount
      ? `₩${changeEvent.before.amount.toLocaleString()}`
      : '이전 가격';
    const after = changeEvent.after && changeEvent.after.amount
      ? `₩${changeEvent.after.amount.toLocaleString()}`
      : '변경 가격';
    const diff = changeEvent.after && changeEvent.before
      ? changeEvent.after.amount - changeEvent.before.amount
      : 0;

    return {
      id: uuid(),
      type: 'price_increase_confirmed',
      priority: PRIORITY.price_increase_confirmed,
      serviceId: subscription.serviceId,
      title: `${subscription.serviceName} 가격 변경 확정`,
      body: `${changeEvent.effectiveAt || '일정 미정'}부터 ${before} → ${after}으로 변경됩니다. (출처: ${changeEvent.evidenceUrl})`,
      createdAt: todayStr,
      deliveredAt: null,
      suppressedReason: null,
      savingsKRW: diff > 0 ? diff : 0,
      evidenceUrl: changeEvent.evidenceUrl,
    };
  }

  /** 절감 기회 알림 (해지·다운그레이드 추천) */
  function makeSavingOpportunityNotif(subscription, recommendation, monthlySavings, todayStr) {
    if (monthlySavings < CFG.MIN_SAVING_KRW) return null;

    return {
      id: uuid(),
      type: 'saving_opportunity',
      priority: PRIORITY.saving_opportunity,
      serviceId: subscription.serviceId,
      title: `${subscription.serviceName} ${recommendation.label}`,
      body: recommendation.reasons ? recommendation.reasons.slice(0, 2).join(' ') : '',
      createdAt: todayStr,
      deliveredAt: null,
      suppressedReason: null,
      savingsKRW: Math.round(monthlySavings),
    };
  }

  /** 기능 중복 해소 알림 (28일 3조건 완료 후) */
  function makeOverlapResolvedNotif(subscription, overlapResult, todayStr) {
    if (!overlapResult || overlapResult.type !== 'recommend_cancel') return null;
    return {
      id: uuid(),
      type: 'overlap_resolved',
      priority: PRIORITY.overlap_resolved,
      serviceId: subscription.serviceId,
      title: `${overlapResult.serviceC} 해지 검토 제안`,
      body: overlapResult.message,
      createdAt: todayStr,
      deliveredAt: null,
      suppressedReason: null,
      savingsKRW: 0,
    };
  }

  /* ─────────────────────────────────────
   * 억제 게이트 통과 처리
   * 순서: unverified → snoozed → below_threshold → cooldown → budget
   * ───────────────────────────────────── */
  function applySuppressionGates(
    candidate,
    subscription,
    existingNotifications,
    weeklyDeliveredCount,
    settings,
    todayStr
  ) {
    if (!candidate) return null;

    const notif = Object.assign({}, candidate);

    // 1. auto_detected 이벤트는 절대 푸시 금지 (이미 makePriceIncreaseNotif에서 걸러짐)
    // 여기서는 명시적으로 남겨 둠
    if (notif._isAutoDetected) {
      notif.suppressedReason = 'unverified';
      return notif;
    }

    // 2. 스누즈
    if (isSnoozed(subscription, notif.type, todayStr)) {
      notif.suppressedReason = 'snoozed';
      return notif;
    }

    // 3. 절감액 임계 미달
    if (CANCEL_TYPES.has(notif.type) && notif.savingsKRW < CFG.MIN_SAVING_KRW) {
      notif.suppressedReason = 'below_threshold';
      return notif;
    }

    // 4. 알림 유형별 on/off
    const typeEnabled = settings && settings.notify && settings.notify.types
      ? settings.notify.types[notif.type]
      : true;
    if (typeEnabled === false) {
      notif.suppressedReason = 'below_threshold'; // 설정 off도 threshold로 분류
      return notif;
    }

    // 5. 쿨다운
    if (isInCooldown(notif.serviceId, notif.type, existingNotifications, todayStr)) {
      notif.suppressedReason = 'cooldown';
      return notif;
    }

    // 6. 주간 예산 초과
    const budget = (settings && settings.notify && settings.notify.weeklyBudget)
      ? settings.notify.weeklyBudget
      : CFG.MAX_PUSH_PER_WEEK;
    if (weeklyDeliveredCount >= budget) {
      notif.suppressedReason = 'budget';
      return notif;
    }

    // 모든 게이트 통과 → 발송
    notif.deliveredAt = todayStr + 'T09:00:00Z';
    notif.suppressedReason = null;
    return notif;
  }

  /* ─────────────────────────────────────
   * 전체 알림 배치 생성
   * ───────────────────────────────────── */
  function generateNotifications(params) {
    const {
      subscriptions,
      recommendations,    // analyzePortfolio 결과.items
      changeEvents,
      overlapResults,     // { [serviceId]: buildOverlapRecommendation 결과 }
      existingNotifications,
      settings,
      todayStr,
    } = params;

    const candidates = [];

    for (const sub of subscriptions) {
      // 결제 데드라인
      const billingCard = AppPredict.buildBillingDeadlineCard(sub, todayStr);
      const billingNotif = makeBillingDeadlineNotif(sub, billingCard, todayStr);
      if (billingNotif) candidates.push({ notif: billingNotif, sub });

      // 확정 가격 인상
      const confirmedPriceEvents = (changeEvents || []).filter(
        e => e.serviceId === sub.serviceId &&
             e.type === 'price_change' &&
             AppChanges.canSendAlert(e)
      );
      for (const evt of confirmedPriceEvents) {
        const n = makePriceIncreaseNotif(sub, evt, todayStr);
        if (n) candidates.push({ notif: n, sub });
      }

      // 절감 기회 (해지 검토 등급)
      const recItem = recommendations
        ? recommendations.find(r => r.serviceId === sub.serviceId)
        : null;
      if (recItem && recItem.recommendation.label === CFG.RECOMMENDATION_LABELS.CANCEL) {
        const monthly = AppCatalog.toMonthlyAmount(sub.price, sub.billingCycle);
        const n = makeSavingOpportunityNotif(sub, recItem.recommendation, monthly, todayStr);
        if (n) candidates.push({ notif: n, sub });
      }

      // 기능 중복 해소
      const overlapResult = overlapResults ? overlapResults[sub.serviceId] : null;
      const overlapNotif  = makeOverlapResolvedNotif(sub, overlapResult, todayStr);
      if (overlapNotif) candidates.push({ notif: overlapNotif, sub });
    }

    // 우선순위 정렬
    candidates.sort((a, b) => a.notif.priority - b.notif.priority);

    // 억제 게이트 순차 적용
    let deliveredCount = countDeliveredThisWeek(existingNotifications || [], todayStr);
    const result = [];

    for (const { notif, sub } of candidates) {
      const processed = applySuppressionGates(
        notif, sub,
        [...(existingNotifications || []), ...result],
        deliveredCount,
        settings,
        todayStr
      );
      if (processed) {
        if (processed.deliveredAt) deliveredCount++;
        result.push(processed);
      }
    }

    return result;
  }

  /* ─────────────────────────────────────
   * 알림 피드 분류 (UI 렌더링용)
   * ───────────────────────────────────── */
  function classifyNotifications(notifications) {
    const delivered  = notifications.filter(n => n.deliveredAt && !n.suppressedReason);
    const suppressed = notifications.filter(n => n.suppressedReason);

    // 억제 사유별 그룹
    const suppressedGroups = {};
    for (const n of suppressed) {
      const r = n.suppressedReason;
      if (!suppressedGroups[r]) suppressedGroups[r] = [];
      suppressedGroups[r].push(n);
    }

    return {
      delivered:       delivered.sort((a, b) => a.priority - b.priority),
      suppressed,
      suppressedGroups,
      suppressedReasonLabels: {
        budget:          '주간 예산 초과',
        cooldown:        '쿨다운 (동일 유형 30일 이내)',
        snoozed:         '스누즈 설정됨',
        unverified:      '미확인 이벤트 (자동 감지)',
        below_threshold: '절감액 임계 미달 또는 알림 비활성화',
      },
    };
  }

  /* ─────────────────────────────────────
   * 스누즈 설정 헬퍼
   * ───────────────────────────────────── */
  function snoozeSubscription(subscription, todayStr) {
    const snoozeUntilMs = new Date(todayStr + 'T00:00:00Z').getTime()
                          + CFG.SNOOZE_DAYS * 86400000;
    const snoozeUntil = new Date(snoozeUntilMs).toISOString().slice(0, 10);
    return Object.assign({}, subscription, { keepUntil: snoozeUntil });
  }

  /* ─────────────────────────────────────
   * Public API
   * ───────────────────────────────────── */
  global.AppNotify = {
    generateNotifications,
    classifyNotifications,
    snoozeSubscription,
    makeBillingDeadlineNotif,
    makePriceIncreaseNotif,
    makeSavingOpportunityNotif,
    makeOverlapResolvedNotif,
    applySuppressionGates,
    countDeliveredThisWeek,
    isSnoozed,
    isInCooldown,
    PRIORITY,
  };

})(window);
