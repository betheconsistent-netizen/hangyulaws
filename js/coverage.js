/**
 * coverage.js
 * coverageTier (A/B/C) 및 coverageSignature 산출.
 * Hard Rule 1: Tier C 서비스의 사용량은 '측정 안 됨' — 0분 아님.
 */
(function (global) {
  'use strict';

  const CFG = global.AppConfig;

  /* ─────────────────────────────────────
   * coverageSignature
   * 활성(토글 on) 기기의 collectorType 정렬 후 '+' 결합
   * 없으면 'none'
   * ───────────────────────────────────── */
  function getCoverageSignature(devices, deviceToggles) {
    const activeTypes = devices
      .filter(d => {
        const toggle = deviceToggles[d.deviceId];
        const active = toggle === undefined ? true : toggle;
        return active && d.collectorType && d.collectorType !== 'none';
      })
      .map(d => d.collectorType)
      .sort();

    // 중복 제거
    const unique = [...new Set(activeTypes)];
    return unique.length > 0 ? unique.join('+') : 'none';
  }

  /* ─────────────────────────────────────
   * 서비스별 coverageTier 결정
   *
   * A: 최근 COVERAGE_STRICT_DAYS 내 strict 세션 존재
   * B: loose/inferred 세션만 존재 (strict 없음)
   * C: 세션 없음 OR collectible === false
   * ───────────────────────────────────── */
  function getServiceCoverageTier(subscription, chunks, todayStr) {
    // collectible false → 즉시 Tier C
    if (subscription.collectible === false) return 'C';

    const serviceId = subscription.serviceId;
    const cutoffMs  = new Date(todayStr + 'T00:00:00Z').getTime()
                      - CFG.COVERAGE_STRICT_DAYS * 86400000;

    let hasStrict = false;
    let hasAny    = false;

    for (const chunk of chunks) {
      if (chunk.serviceId !== serviceId) continue;
      hasAny = true;
      if (
        chunk.measurementMode === 'strict' &&
        new Date(chunk.startedAt).getTime() >= cutoffMs
      ) {
        hasStrict = true;
        break;
      }
    }

    if (!hasAny) return 'C';
    if (hasStrict) return 'A';
    return 'B';
  }

  /* ─────────────────────────────────────
   * 플랫폼 그룹 분류 (기기별 분해 UI용)
   * ───────────────────────────────────── */
  const PLATFORM_GROUP = {
    web_ext: 'desktop',
    desktop: 'desktop',
    android: 'mobile',
    ios:     'mobile',
  };

  function getPlatformGroup(platform) {
    return PLATFORM_GROUP[platform] || 'other';
  }

  /* ─────────────────────────────────────
   * 전체 구독 목록에 대한 커버리지 맵 반환
   * {
   *   [serviceId]: {
   *     tier: 'A'|'B'|'C',
   *     signature: string,
   *     label: string,       // '실측' | '일부 실측' | '미측정'
   *     collectible: boolean
   *   }
   * }
   * ───────────────────────────────────── */
  function buildCoverageMap(subscriptions, chunks, devices, deviceToggles, todayStr) {
    const signature = getCoverageSignature(devices, deviceToggles);
    const map = {};

    for (const sub of subscriptions) {
      const tier = getServiceCoverageTier(sub, chunks, todayStr);
      map[sub.serviceId] = {
        tier,
        signature,
        label: CFG.COVERAGE_LABELS[tier],
        collectible: sub.collectible !== false,
      };
    }

    return map;
  }

  /* ─────────────────────────────────────
   * 대시보드 커버리지 요약
   * "12개 중 7개 실측 중" 형태로 반환
   * ───────────────────────────────────── */
  function getCoverageSummary(coverageMap) {
    const total = Object.keys(coverageMap).length;
    const measured = Object.values(coverageMap).filter(c => c.tier === 'A').length;
    const partial  = Object.values(coverageMap).filter(c => c.tier === 'B').length;
    const none     = Object.values(coverageMap).filter(c => c.tier === 'C').length;
    return { total, measured, partial, none };
  }

  /* ─────────────────────────────────────
   * Public API
   * ───────────────────────────────────── */
  global.AppCoverage = {
    getCoverageSignature,
    getServiceCoverageTier,
    buildCoverageMap,
    getCoverageSummary,
    getPlatformGroup,
  };

})(window);
