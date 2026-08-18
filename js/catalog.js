/**
 * catalog.js
 * 서비스/요금제 카탈로그 조회, 가격 정규화(지역·통화·세금).
 * Provider 패턴: CatalogProvider.fetchCatalog() — 향후 서버 API 교체 지점.
 */
(function (global) {
  'use strict';

  /* ─────────────────────────────────────
   * CatalogProvider
   * 현재: demo-data 기반 / 향후: 카탈로그 API
   * ───────────────────────────────────── */
  const CatalogProvider = {
    async fetchCatalog() {
      // 향후 교체: return await fetch('/api/catalog').then(r => r.json());
      const state = global._appState;
      return state ? state.catalog : { services: [], plans: [] };
    },
  };

  /* ─────────────────────────────────────
   * 가격 정규화
   * 같은 지역·통화·세금포함 여부 기준끼리만 비교
   * 환율 변환 비교 금지 (사양서 5.3)
   * ───────────────────────────────────── */

  /**
   * 요금제의 특정 지역 가격 반환
   * 반환: { amount, currency, taxIncluded } or null
   */
  function getPlanPrice(plan, region) {
    if (!plan || !plan.priceByRegion) return null;
    return plan.priceByRegion[region] || null;
  }

  /**
   * 월 환산 금액 계산
   * billingCycle: 'monthly' | 'yearly'
   * amount: 결제 금액
   */
  function toMonthlyAmount(amount, billingCycle) {
    if (billingCycle === 'yearly') return amount / 12;
    return amount;
  }

  /**
   * 두 요금제 가격 비교 가능 여부 확인
   * 같은 통화 + 같은 세금포함 여부여야 비교 가능
   */
  function isPriceComparable(priceA, priceB) {
    if (!priceA || !priceB) return false;
    return priceA.currency === priceB.currency &&
           priceA.taxIncluded === priceB.taxIncluded;
  }

  /* ─────────────────────────────────────
   * 카탈로그 조회 헬퍼
   * ───────────────────────────────────── */

  function getService(catalog, serviceId) {
    return catalog.services.find(s => s.serviceId === serviceId) || null;
  }

  function getPlan(catalog, planId) {
    return catalog.plans.find(p => p.planId === planId) || null;
  }

  function getPlansForService(catalog, serviceId) {
    return catalog.plans.filter(p => p.serviceId === serviceId);
  }

  /**
   * 현재 활성 요금제 목록 (effectiveTo가 null이거나 오늘 이후)
   */
  function getActivePlans(catalog, serviceId, todayStr) {
    return getPlansForService(catalog, serviceId).filter(p => {
      if (!p.effectiveTo) return true;
      return p.effectiveTo >= todayStr;
    });
  }

  /* ─────────────────────────────────────
   * 요금제 전환 절감액 계산 (사양서 5.3 엄격 적용)
   *
   * currentSub: Subscription
   * targetPlan: CatalogPlan
   * expectedMembers: 사용자 입력 (기본 null)
   * region: 'KR'
   * ───────────────────────────────────── */
  function calcPlanSwitchSavings(currentSub, targetPlan, expectedMembers, region, todayStr) {
    const region_ = region || 'KR';

    // 현재 월 비용
    const currentMonthly = toMonthlyAmount(currentSub.price, currentSub.billingCycle);

    // 대상 요금제 지역 가격
    const targetPrice = getPlanPrice(targetPlan, region_);
    if (!targetPrice) {
      return { error: '대상 요금제 가격 정보 없음', comparable: false };
    }

    // 통화·세금 비교 가능 여부 — 불가능하면 계산 자체를 하지 않음
    const currentPriceInfo = {
      currency: currentSub.currency,
      taxIncluded: currentSub.taxIncluded,
    };
    if (!isPriceComparable(currentPriceInfo, targetPrice)) {
      return {
        error: '통화 또는 세금 포함 여부가 달라 직접 비교 불가',
        comparable: false,
      };
    }

    const targetMonthlyFull = toMonthlyAmount(targetPrice.amount, 'monthly');

    // expectedMembers 미입력 → 손익분기 인원 제시
    if (!expectedMembers || expectedMembers < 1) {
      const breakEvenMembers = Math.ceil(targetMonthlyFull / currentMonthly);
      const exceedsSeatMax = targetPlan.seatMax && breakEvenMembers > targetPlan.seatMax;

      return {
        comparable: true,
        hasExpectedMembers: false,
        breakEvenMembers,
        exceedsSeatMax,
        seatMax: targetPlan.seatMax,
        targetMonthlyFull,
        currentMonthly,
        message: exceedsSeatMax
          ? `이 요금제(최대 ${targetPlan.seatMax}명)로는 절감 불가`
          : `${breakEvenMembers}명 이상 함께 쓰면 1인당 월 ${Math.round(targetMonthlyFull / breakEvenMembers - currentMonthly * -1).toLocaleString()}원 절감`,
        // 확인 항목
        checkItems: buildSwitchCheckItems(currentSub, targetPlan, todayStr),
      };
    }

    // expectedMembers 입력됨 → 절감액 계산
    const myShare = targetMonthlyFull / expectedMembers;

    // 전환 비용 계산
    const switchCost = calcSwitchCost(currentSub, todayStr);
    const switchCostMonthly = switchCost.total / 12; // 연간 손실을 월 환산

    const netSavings = currentMonthly - myShare - switchCostMonthly;

    return {
      comparable: true,
      hasExpectedMembers: true,
      expectedMembers,
      currentMonthly,
      targetMonthlyFull,
      myShare: Math.round(myShare),
      netSavings: Math.round(netSavings),
      netSavingsYearly: Math.round(netSavings * 12),
      isLoss: netSavings < 0,       // expectedMembers=1 이면 보통 손해
      switchCost,
      checkItems: buildSwitchCheckItems(currentSub, targetPlan, todayStr),
    };
  }

  /**
   * 전환 비용 계산
   * - 연간 선결제 잔여분 손실
   * - 약정 위약금 (committedUntil 기반)
   */
  function calcSwitchCost(sub, todayStr) {
    const todayMs   = new Date(todayStr + 'T00:00:00Z').getTime();
    let yearlyLoss  = 0;
    let penaltyLoss = 0;

    // 연간 선결제 잔여분
    if (sub.billingCycle === 'yearly') {
      const nextBillingMs = new Date(sub.nextBillingDate + 'T00:00:00Z').getTime();
      const remainDays = Math.max(0, Math.round((nextBillingMs - todayMs) / 86400000));
      yearlyLoss = Math.round((sub.price / 365) * remainDays);
    }

    // 약정 위약금
    if (sub.committedUntil) {
      const committedMs = new Date(sub.committedUntil + 'T00:00:00Z').getTime();
      if (committedMs > todayMs) {
        const remainMonths = Math.ceil((committedMs - todayMs) / (30 * 86400000));
        const monthlyKRW   = toMonthlyAmount(sub.price, sub.billingCycle);
        penaltyLoss = Math.round(monthlyKRW * remainMonths * 0.2); // 20% 위약금 (근사)
      }
    }

    return {
      yearlyLoss,
      penaltyLoss,
      total: yearlyLoss + penaltyLoss,
    };
  }

  /**
   * 요금제 전환 시 확인 항목 생성
   */
  function buildSwitchCheckItems(currentSub, targetPlan, todayStr) {
    const items = [];

    if (currentSub.committedUntil) {
      const todayMs     = new Date(todayStr + 'T00:00:00Z').getTime();
      const committedMs = new Date(currentSub.committedUntil + 'T00:00:00Z').getTime();
      if (committedMs > todayMs) {
        const days = Math.round((committedMs - todayMs) / 86400000);
        items.push(`약정 잔여 ${days}일 — 조기 해지 위약금 발생 가능`);
      }
    }

    if (targetPlan.seatMax) {
      items.push(`동시 이용 최대 ${targetPlan.seatMax}명`);
    }

    if (currentSub.billingCycle === 'yearly') {
      items.push('연간 선결제 잔여분 환불 정책 확인 필요');
    }

    items.push('지역 제한 여부 확인 권장');

    return items;
  }

  /* ─────────────────────────────────────
   * Public API
   * ───────────────────────────────────── */
  global.CatalogProvider = CatalogProvider;
  global.AppCatalog = {
    getService,
    getPlan,
    getPlansForService,
    getActivePlans,
    getPlanPrice,
    toMonthlyAmount,
    isPriceComparable,
    calcPlanSwitchSavings,
    calcSwitchCost,
  };

})(window);
