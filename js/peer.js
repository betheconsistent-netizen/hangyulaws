/**
 * peer.js
 * 피어 설문 집계, 응답률 게이트, 세그먼트 큐레이션.
 * Provider 패턴: PeerProvider.fetchReports() — 향후 집계 API 교체 지점.
 *
 * Hard Rule 관련:
 *  - 응답률 < 20% → % 표시 금지 (Hard Rule 2, 사양서 6.2)
 *  - 만족도는 "4.2 / 5.0 (N=312)" 형식, % 변환 금지 (사양서 6.4)
 *  - 해지·유지 사유 같은 위계 표시 (사양서 6.3)
 *  - 순위 표현에 산정 기준·표본·기간 병기 (Hard Rule 7)
 *  - 출처 배지: '사용자 설문' (Hard Rule 5)
 */
(function (global) {
  'use strict';

  const CFG = global.AppConfig;

  /* ─────────────────────────────────────
   * PeerProvider
   * 현재: 앱 상태 기반 / 향후: 집계 API
   * ───────────────────────────────────── */
  const PeerProvider = {
    async fetchReports(serviceId) {
      // 향후 교체: return await fetch(`/api/peer?serviceId=${serviceId}`).then(r=>r.json());
      const state = global._appState;
      if (!state) return [];
      const reports = state.peerReports || [];
      return serviceId
        ? reports.filter(r => r.serviceId === serviceId)
        : reports;
    },
  };

  /* ─────────────────────────────────────
   * 응답률 계산 및 게이트
   * ───────────────────────────────────── */
  function calcResponseRate(report) {
    if (!report.totalChurned || report.totalChurned === 0) return null;
    return report.respondents / report.totalChurned;
  }

  function canShowPercentage(report) {
    const rate = calcResponseRate(report);
    if (rate === null) return false;
    return rate >= CFG.PEER_RESPONSE_RATE_MIN;
  }

  /* ─────────────────────────────────────
   * 최소 표본 게이트 (§4.4 규칙 그대로 적용)
   * ───────────────────────────────────── */
  function meetsMinSample(report, conditionCount) {
    const conds = conditionCount || (report.segment ? 2 : 1);
    const minN  = CFG.MIN_N_AGGREGATE * (conds >= 3 ? CFG.MULTI_CONDITION_MULTIPLIER : 1);
    return report.respondents >= minN;
  }

  /* ─────────────────────────────────────
   * 해지 사유 렌더링 데이터
   * 응답률 게이트에 따라 % 표시 여부 결정
   * ───────────────────────────────────── */
  function buildChurnReasons(report) {
    if (!report.churnReasons || !report.churnReasons.length) return [];
    const showPct = canShowPercentage(report);
    const total   = report.respondents;
    const rate    = calcResponseRate(report);
    const ratePct = rate !== null ? Math.round(rate * 100) : null;

    return report.churnReasons.map(r => ({
      reason: r.reason,
      count: r.count,
      // % 표기는 응답률 ≥ 20%일 때만
      pct: showPct ? Math.round((r.count / total) * 100) : null,
      showPct,
      // 표시 문구: "업데이트 부족 — 응답자 312명 중 78% (해지자 1,204명 중 26% 응답)"
      displayStr: showPct
        ? `${r.reason} — 응답자 ${total.toLocaleString()}명 중 ${Math.round((r.count/total)*100)}%`
          + (ratePct !== null ? ` (해지자 ${report.totalChurned.toLocaleString()}명 중 ${ratePct}% 응답)` : '')
        : `${r.reason} (응답자 ${total.toLocaleString()}명, 응답률 ${ratePct !== null ? ratePct + '%' : '미확인'} — % 표시 기준 미충족)`,
      source: CFG.SOURCE_LABELS.user_survey,
    }));
  }

  /* ─────────────────────────────────────
   * 유지 사유 렌더링 데이터 (해지 사유와 동일 위계)
   * ───────────────────────────────────── */
  function buildKeepReasons(report) {
    if (!report.keepReasons || !report.keepReasons.length) return [];
    const showPct = canShowPercentage(report);
    const total   = report.respondents;

    return report.keepReasons.map(r => ({
      reason: r.reason,
      count: r.count,
      pct: showPct ? Math.round((r.count / total) * 100) : null,
      showPct,
      displayStr: showPct
        ? `${r.reason} — 응답자 ${total.toLocaleString()}명 중 ${Math.round((r.count/total)*100)}%`
        : `${r.reason} (응답자 ${total.toLocaleString()}명 — % 표시 기준 미충족)`,
      source: CFG.SOURCE_LABELS.user_survey,
    }));
  }

  /* ─────────────────────────────────────
   * 만족도 표기 (사양서 6.4)
   * "4.2 / 5.0 (N=312)" 형식 — % 변환 절대 금지
   * ───────────────────────────────────── */
  function formatSatisfaction(satisfaction) {
    if (!satisfaction) return null;
    const { mean, scale, n } = satisfaction;
    return {
      displayStr: `${mean.toFixed(1)} / ${scale}.0 (N=${n.toLocaleString()})`,
      mean,
      scale,
      n,
      source: CFG.SOURCE_LABELS.user_survey,
    };
  }

  /* ─────────────────────────────────────
   * 세그먼트 레이블 (사양서 6.5)
   * "추천"이 아니라 "참고 조합"으로 표기
   * 순위 표현에 산정 기준·표본·기간 병기
   * ───────────────────────────────────── */
  function buildSegmentLabel(report) {
    if (!report.segment) return '전체 응답자';
    const parts = [];
    if (report.segment.occupation) parts.push(report.segment.occupation);
    if (report.segment.purpose)    parts.push(purposeLabel(report.segment.purpose));
    return parts.join(' · ') || '전체 응답자';
  }

  function purposeLabel(p) {
    const MAP = { work: '업무', study: '학습', personal: '개인', side_project: '사이드프로젝트' };
    return MAP[p] || p;
  }

  /**
   * 만족도 순위 표현 시 병기 문자열 생성 (Hard Rule 7)
   * "만족도 1위 — 직장인·업무 응답자 412명, 2026년 7월, 5점 척도 평균"
   */
  function buildRankAnnotation(report, rank) {
    if (!report.satisfaction) return '';
    const seg = buildSegmentLabel(report);
    const n   = report.respondents;
    const period = report.periodStart && report.periodEnd
      ? `${report.periodStart.slice(0, 7)} ~ ${report.periodEnd.slice(0, 7)}`
      : '기간 미상';
    return `만족도 ${rank}위 — ${seg} 응답자 ${n.toLocaleString()}명, ${period}, ${report.satisfaction.scale}점 척도 평균`;
  }

  /* ─────────────────────────────────────
   * 서비스별 피어 카드 전체 조립
   * ───────────────────────────────────── */
  function buildPeerCard(report) {
    if (!meetsMinSample(report)) {
      // 표본 미달 → 블록 렌더링 금지
      return null;
    }

    const responseRate = calcResponseRate(report);
    const showPct      = canShowPercentage(report);

    return {
      serviceId:       report.serviceId,
      planId:          report.planId,
      segmentLabel:    buildSegmentLabel(report),
      respondents:     report.respondents,
      totalChurned:    report.totalChurned,
      responseRate:    responseRate,
      responseRatePct: responseRate !== null ? Math.round(responseRate * 100) : null,
      showPct,
      // 응답률 < 20% 경고 메시지
      lowResponseWarning: !showPct
        ? `응답률 ${responseRate !== null ? Math.round(responseRate*100) : '?'}% — 백분율 표시 기준(${CFG.PEER_RESPONSE_RATE_MIN*100}%) 미충족. 순위만 표시합니다.`
        : null,
      churnReasons:    buildChurnReasons(report),
      keepReasons:     buildKeepReasons(report),
      satisfaction:    formatSatisfaction(report.satisfaction),
      periodStart:     report.periodStart,
      periodEnd:       report.periodEnd,
      source:          CFG.SOURCE_LABELS.user_survey,
      // 실측 지표와 다른 시각적 위계를 위한 플래그
      isSurveyData:    true,
    };
  }

  /**
   * 서비스의 모든 피어 카드 목록 반환
   * null(표본 미달)인 항목은 필터링
   */
  function getPeerCards(peerReports, serviceId) {
    return peerReports
      .filter(r => r.serviceId === serviceId)
      .map(buildPeerCard)
      .filter(c => c !== null);
  }

  /* ─────────────────────────────────────
   * Public API
   * ───────────────────────────────────── */
  global.PeerProvider = PeerProvider;
  global.AppPeer = {
    calcResponseRate,
    canShowPercentage,
    meetsMinSample,
    buildChurnReasons,
    buildKeepReasons,
    formatSatisfaction,
    buildSegmentLabel,
    buildRankAnnotation,
    buildPeerCard,
    getPeerCards,
  };

})(window);
