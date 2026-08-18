/**
 * ui.js — 렌더링, 라우팅, 이벤트 바인딩
 * 전역 상태: window._appState, window._computed
 */
(function (global) {
  'use strict';

  /* ─── 서비스 아이콘 이모지 맵 ─── */
  const SERVICE_ICONS = {
    chatgpt:'🤖', claude:'🧠', perplexity:'🔍', cursor:'⌨️',
    figma:'🎨', notion:'📝', canva:'🖼️', netflix:'🎬', adobe:'📐',
  };
  function svcIcon(id) { return SERVICE_ICONS[id] || '📦'; }

  /* ─── KRW 포맷 ─── */
  function krw(n) { return '₩' + Math.round(n).toLocaleString(); }
  function fmtMin(min) {
    if (min === null || min === undefined) return '측정 안 됨';
    if (min >= 60) return Math.round(min / 60) + 'h ' + (Math.round(min) % 60) + 'm';
    return Math.round(min) + '분';
  }

  /* ─── 뷰 라우터 ─── */
  const VIEWS = {};
  let currentView = 'dashboard';
  let currentParams = null;  // detail 뷰 등에서 params 보존

  function registerView(name, renderFn) { VIEWS[name] = renderFn; }

  function navigate(view, params) {
    currentView = view;
    if (params !== null && params !== undefined) currentParams = params;
    const resolvedParams = (view === 'detail' && !params) ? currentParams : params;
    const container = document.getElementById('view-container');
    if (!container) return;
    container.innerHTML = '';
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === view);
    });
    document.getElementById('header-title').textContent = {
      dashboard: '대시보드', subscriptions: '구독 목록', detail: '서비스 상세',
      insights: '인사이트 & 알림', portfolio: 'AI 포트폴리오 최적화', settings: '설정',
    }[view] || view;

    if (VIEWS[view]) VIEWS[view](container, resolvedParams);
    else container.innerHTML = '<p style="padding:20px;color:var(--c-muted)">준비 중입니다.</p>';
  }

  /* ─── 전체 계산 파이프라인 실행 ─── */
  function runPipeline(state) {
    const TODAY = state.settings.today || AppDemoData.TODAY;
    const { chunks, aggregated } = AppUsage.processUsage(
      state.sessions, state.settings, TODAY);
    const coverageMap = AppCoverage.buildCoverageMap(
      state.subscriptions, chunks, state.devices, state.settings.deviceToggles || {}, TODAY);

    const scorecards = {}, cohortResults = {};
    for (const sub of state.subscriptions) {
      const sig  = coverageMap[sub.serviceId] ? coverageMap[sub.serviceId].signature : 'none';
      const tier = coverageMap[sub.serviceId] ? coverageMap[sub.serviceId].tier : 'C';
      const cr   = (state.settings.consents.c2)
        ? AppBenchmark.getCohortStats(sub.serviceId, sub.planId, sig, sub.purpose, state.cohortStats)
        : null;
      cohortResults[sub.serviceId] = cr;
      const summary = AppUsage.getServiceSummary(aggregated, sub.serviceId, TODAY, 30);
      const plan    = AppCatalog.getPlan(state.catalog, sub.planId);
      scorecards[sub.serviceId] = AppScore.buildScorecard({
        subscription: sub, serviceSummary: summary, coverageTier: tier,
        cohortResult: cr, subscriptions: state.subscriptions, aggregated,
        chunks, catalogPlan: plan, todayStr: TODAY, observedDays: summary.usedDays,
      });
    }

    const overlapResults = {};
    for (const evt of (state.changeEvents || [])) {
      if (evt.type === 'feature_added' && evt.overlapsWithServiceId) {
        const r = AppChanges.buildOverlapRecommendation(evt, aggregated, coverageMap, TODAY);
        if (r) overlapResults[evt.overlapsWithServiceId] = r;
      }
    }

    const analysis = AppRecommend.analyzePortfolio({
      subscriptions: state.subscriptions, scorecards, cohortResults, aggregated,
      catalog: state.catalog, changeEvents: state.changeEvents, todayStr: TODAY,
    });

    const notifications = AppNotify.generateNotifications({
      subscriptions: state.subscriptions, recommendations: analysis.items,
      changeEvents: state.changeEvents, overlapResults,
      existingNotifications: state.notifications || [],
      settings: state.settings, todayStr: TODAY,
    });
    const classified = AppNotify.classifyNotifications(notifications);

    return { TODAY, chunks, aggregated, coverageMap, scorecards, cohortResults,
             overlapResults, analysis, notifications, classified };
  }

  /* ─── 알림 배지 업데이트 ─── */
  function updateNotifBadge(count) {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }

  /* ══════════════════════════════════════════
   * VIEW: DASHBOARD
   * ══════════════════════════════════════════ */
  registerView('dashboard', function (container) {
    const state = global._appState;
    const C     = global._computed;
    if (!state || !C) return;
    const { TODAY, aggregated, coverageMap, analysis, classified } = C;
    const subs  = state.subscriptions;

    // 데모 배너
    if (state.isDemo) {
      const banner = document.createElement('div');
      banner.id = 'demo-banner';
      banner.innerHTML = '<span class="demo-icon">🧪</span><span><strong>[데모 데이터]</strong> 현재 화면은 시뮬레이션 데이터를 기반으로 합니다. 실제 사용량·가격과 다릅니다. 출처: <span class="badge badge-gray text-xs">데모</span></span>';
      container.appendChild(banner);
    }

    // 요약 카드
    const totalMonthly = subs.reduce((s, sub) =>
      s + AppCatalog.toMonthlyAmount(sub.price, sub.billingCycle), 0);
    const covSummary = AppCoverage.getCoverageSummary(coverageMap);

    const summaryGrid = document.createElement('div');
    summaryGrid.className = 'summary-grid';
    summaryGrid.innerHTML = `
      <div class="summary-card">
        <div class="summary-label">월 구독비 합계</div>
        <div class="summary-value">${krw(totalMonthly)}</div>
        <div class="summary-sub">연 환산 ${krw(totalMonthly * 12)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">구독 수</div>
        <div class="summary-value">${subs.length}개</div>
        <div class="summary-sub">활성 구독</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">커버리지</div>
        <div class="summary-value">${covSummary.measured + covSummary.partial}개</div>
        <div class="summary-sub">${subs.length}개 중 측정 중</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">예상 월 절감액</div>
        <div class="summary-value text-green">${krw(analysis.summary.monthlySavingsKRW)}</div>
        <div class="summary-sub">해지 검토 ${analysis.summary.cancelCount}건</div>
      </div>`;
    container.appendChild(summaryGrid);

    // 다가오는 결제
    const billings = AppPredict.getUpcomingBillings(subs, TODAY, 3);
    const billingCard = document.createElement('div');
    billingCard.className = 'card';
    billingCard.innerHTML = `<div class="card-header"><span class="card-title">🗓️ 다가오는 결제</span></div>`;
    const bList = document.createElement('div');
    bList.className = 'billing-list';
    billings.forEach(b => {
      const item = document.createElement('div');
      item.className = 'billing-item';
      item.innerHTML = `
        <span>${svcIcon(b.serviceId)} ${b.serviceName}</span>
        <span class="text-muted text-sm">${b.nextBillingDate || ''}</span>
        <span class="text-sm">${krw(b.monthlyKRW)}/월</span>
        <span class="billing-dday ${b.isUrgent ? 'urgent' : ''}">D${b.daysUntilBilling >= 0 ? '+' + b.daysUntilBilling : b.daysUntilBilling}</span>`;
      bList.appendChild(item);
    });
    billingCard.appendChild(bList);
    container.appendChild(billingCard);

    // 구독 카드 목록 (간략)
    const listCard = document.createElement('div');
    listCard.className = 'card';
    listCard.innerHTML = `<div class="card-header">
      <span class="card-title">📋 구독 현황</span>
      <button class="btn btn-sm btn-secondary" id="btn-goto-subs">전체 보기</button>
    </div>`;
    const subList = document.createElement('div');
    subList.className = 'sub-list';

    subs.slice(0, 5).forEach(sub => {
      const tier    = coverageMap[sub.serviceId] ? coverageMap[sub.serviceId].tier : 'C';
      const summary = AppUsage.getServiceSummary(aggregated, sub.serviceId, TODAY, 30);
      const recItem = analysis.items.find(r => r.serviceId === sub.serviceId);
      const recLbl  = recItem ? recItem.recommendation.label : '-';
      const sc      = C.scorecards[sub.serviceId];
      const score   = sc && sc.scoreResult ? sc.scoreResult.score : null;

      const card = document.createElement('div');
      card.className = 'sub-card';
      card.dataset.serviceId = sub.serviceId;
      card.innerHTML = `
        <div class="sub-icon">${svcIcon(sub.serviceId)}</div>
        <div class="sub-info">
          <div class="sub-name">${sub.serviceName}</div>
          <div class="sub-plan">${sub.planName} · <span class="badge badge-sm coverage-${tier.toLowerCase()}">${AppConfig.COVERAGE_LABELS[tier]}</span></div>
        </div>
        <div class="sub-usage">
          <div class="usage-val">${tier === 'C' ? '측정 안 됨' : fmtMin(summary.avgDailyAdjustedMin)}</div>
          <div class="usage-lbl">일평균 (조정)</div>
        </div>
        <div class="sub-price">
          <div class="price-val">${krw(AppCatalog.toMonthlyAmount(sub.price, sub.billingCycle))}</div>
          <div class="price-lbl">/월</div>
        </div>
        <div class="sub-actions">
          <span class="badge ${recLbl === '유지' ? 'badge-green' : recLbl === '해지 검토' ? 'badge-red' : recLbl === '다운그레이드 검토' ? 'badge-yellow' : 'badge-gray'}">${recLbl}</span>
        </div>`;
      card.addEventListener('click', () => navigate('detail', { serviceId: sub.serviceId }));
      subList.appendChild(card);
    });
    listCard.appendChild(subList);
    container.appendChild(listCard);

    // 인사이트 요약 배너
    const deliveredCount = classified.delivered.length;
    if (deliveredCount > 0) {
      const insightBanner = document.createElement('div');
      insightBanner.className = 'card card-sm';
      insightBanner.style.borderColor = 'var(--c-accent)';
      insightBanner.innerHTML = `<div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:1.2rem">🔔</span>
        <span class="text-sm">신규 인사이트 <strong>${deliveredCount}건</strong></span>
        <button class="btn btn-sm btn-ghost" style="margin-left:auto" onclick="AppUI.navigate('insights')">보기 →</button>
      </div>`;
      container.appendChild(insightBanner);
    }

    container.querySelector('#btn-goto-subs')?.addEventListener('click', () => navigate('subscriptions'));
  });

  /* ══════════════════════════════════════════
   * VIEW: SUBSCRIPTIONS (목록 + CRUD)
   * ══════════════════════════════════════════ */
  registerView('subscriptions', function (container) {
    const state = global._appState;
    const C     = global._computed;
    if (!state || !C) return;
    const { TODAY, aggregated, coverageMap, analysis } = C;

    // 필터 바
    const filterBar = document.createElement('div');
    filterBar.className = 'filter-bar';
    filterBar.innerHTML = `
      <select class="form-select" id="f-category"><option value="">카테고리 전체</option>
        ${['ai','design','productivity','media','dev','other'].map(c=>`<option value="${c}">${c}</option>`).join('')}
      </select>
      <select class="form-select" id="f-rec"><option value="">추천 전체</option>
        ${['유지','해지 검토','다운그레이드 검토','판단 보류'].map(r=>`<option value="${r}">${r}</option>`).join('')}
      </select>
      <select class="form-select" id="f-tier"><option value="">커버리지 전체</option>
        <option value="A">실측</option><option value="B">일부 실측</option><option value="C">미측정</option>
      </select>
      <select class="form-select" id="f-sort">
        <option value="price">가격순</option>
        <option value="score">점수순</option>
        <option value="usage">사용량순</option>
        <option value="billing">결제일순</option>
      </select>
      <button class="btn btn-primary btn-sm" id="btn-add-sub" style="margin-left:auto">+ 구독 추가</button>`;
    container.appendChild(filterBar);

    const listWrap = document.createElement('div');
    listWrap.id = 'sub-list-wrap';
    container.appendChild(listWrap);

    function renderList() {
      const cat  = document.getElementById('f-category')?.value || '';
      const rec  = document.getElementById('f-rec')?.value || '';
      const tier = document.getElementById('f-tier')?.value || '';
      const sort = document.getElementById('f-sort')?.value || 'price';

      let subs = state.subscriptions.slice();
      if (cat)  subs = subs.filter(s => s.category === cat);
      if (tier) subs = subs.filter(s => (coverageMap[s.serviceId]?.tier || 'C') === tier);
      if (rec) {
        subs = subs.filter(s => {
          const ri = analysis.items.find(r => r.serviceId === s.serviceId);
          return ri && ri.recommendation.label === rec;
        });
      }
      subs.sort((a, b) => {
        if (sort === 'price')   return AppCatalog.toMonthlyAmount(b.price, b.billingCycle) - AppCatalog.toMonthlyAmount(a.price, a.billingCycle);
        if (sort === 'score') {
          const sa = C.scorecards[a.serviceId]?.scoreResult?.score ?? -1;
          const sb = C.scorecards[b.serviceId]?.scoreResult?.score ?? -1;
          return sb - sa;
        }
        if (sort === 'usage') {
          const ua = AppUsage.getServiceSummary(aggregated, a.serviceId, TODAY, 30).avgDailyAdjustedMin;
          const ub = AppUsage.getServiceSummary(aggregated, b.serviceId, TODAY, 30).avgDailyAdjustedMin;
          return ub - ua;
        }
        if (sort === 'billing') return a.nextBillingDate.localeCompare(b.nextBillingDate);
        return 0;
      });

      const wrap = document.getElementById('sub-list-wrap');
      wrap.innerHTML = '';
      if (!subs.length) {
        wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>조건에 맞는 구독이 없습니다.</p></div>';
        return;
      }
      const ul = document.createElement('div');
      ul.className = 'sub-list';
      subs.forEach(sub => {
        const t  = coverageMap[sub.serviceId]?.tier || 'C';
        const sm = AppUsage.getServiceSummary(aggregated, sub.serviceId, TODAY, 30);
        const ri = analysis.items.find(r => r.serviceId === sub.serviceId);
        const rl = ri ? ri.recommendation.label : '-';
        const sc = C.scorecards[sub.serviceId];
        const scoreVal = sc?.scoreResult ? sc.scoreResult.score : null;

        const card = document.createElement('div');
        card.className = 'sub-card';
        card.innerHTML = `
          <div class="sub-icon">${svcIcon(sub.serviceId)}</div>
          <div class="sub-info">
            <div class="sub-name">${sub.serviceName}</div>
            <div class="sub-plan">${sub.planName} · <span class="badge coverage-${t.toLowerCase()}">${AppConfig.COVERAGE_LABELS[t]}</span></div>
          </div>
          <div class="sub-usage">
            <div class="usage-val">${t === 'C' ? '측정 안 됨' : fmtMin(sm.avgDailyAdjustedMin)}</div>
            <div class="usage-lbl">일평균</div>
          </div>
          <div class="sub-price">
            <div class="price-val">${krw(AppCatalog.toMonthlyAmount(sub.price, sub.billingCycle))}/월</div>
            <div class="price-lbl">${sub.billingCycle === 'yearly' ? '연간 결제' : '월 결제'}</div>
          </div>
          <div class="sub-actions" style="flex-direction:column;align-items:flex-end;gap:4px">
            <span class="badge ${rl==='유지'?'badge-green':rl==='해지 검토'?'badge-red':rl==='다운그레이드 검토'?'badge-yellow':'badge-gray'}">${rl}</span>
            <div style="display:flex;gap:4px">
              <button class="btn btn-ghost btn-xs btn-snooze" data-id="${sub.id}">😴</button>
              <button class="btn btn-ghost btn-xs btn-edit"   data-id="${sub.id}">✏️</button>
              <button class="btn btn-danger btn-xs btn-del"   data-id="${sub.id}">🗑️</button>
            </div>
          </div>`;
        card.addEventListener('click', e => {
          if (e.target.closest('button')) return;
          navigate('detail', { serviceId: sub.serviceId });
        });
        ul.appendChild(card);
      });
      wrap.appendChild(ul);

      // 이벤트 바인딩
      wrap.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', () => openSubModal(btn.dataset.id)));
      wrap.querySelectorAll('.btn-del').forEach(btn => btn.addEventListener('click', () => deleteSub(btn.dataset.id)));
      wrap.querySelectorAll('.btn-snooze').forEach(btn => btn.addEventListener('click', () => snoozeSub(btn.dataset.id)));
    }

    filterBar.querySelectorAll('select').forEach(s => s.addEventListener('change', renderList));
    filterBar.querySelector('#btn-add-sub').addEventListener('click', () => openSubModal(null));
    renderList();
  });

  /* ══════════════════════════════════════════
   * VIEW: SERVICE DETAIL (§9.3)
   * ══════════════════════════════════════════ */
  registerView('detail', function (container, params) {
    const state = global._appState;
    const C     = global._computed;
    if (!state || !C || !params) return;
    const { serviceId }  = params;
    const { TODAY, aggregated, coverageMap, analysis } = C;
    const sub  = state.subscriptions.find(s => s.serviceId === serviceId);
    if (!sub) { container.innerHTML = '<p class="text-muted" style="padding:20px">구독을 찾을 수 없습니다.</p>'; return; }

    const tier   = coverageMap[serviceId]?.tier || 'C';
    const sc     = C.scorecards[serviceId];
    const cr     = C.cohortResults[serviceId];
    const sm     = AppUsage.getServiceSummary(aggregated, serviceId, TODAY, 30);
    const ri     = analysis.items.find(r => r.serviceId === serviceId);
    const recLbl = ri ? ri.recommendation.label : '-';

    // 상단 헤더
    const hdr = document.createElement('div');
    hdr.className = 'card';
    hdr.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px">
        <div class="sub-icon" style="width:50px;height:50px;font-size:1.6rem">${svcIcon(serviceId)}</div>
        <div>
          <div style="font-size:1.1rem;font-weight:700">${sub.serviceName}</div>
          <div class="text-muted text-sm">${sub.planName} · ${sub.billingCycle === 'yearly' ? '연간' : '월간'} · ${krw(AppCatalog.toMonthlyAmount(sub.price, sub.billingCycle))}/월</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
          <span class="badge ${recLbl==='유지'?'badge-green':recLbl==='해지 검토'?'badge-red':recLbl==='다운그레이드 검토'?'badge-yellow':'badge-gray'}" style="font-size:0.85rem;padding:4px 12px">${recLbl}</span>
          <span class="badge coverage-${tier.toLowerCase()}">${AppConfig.COVERAGE_LABELS[tier]}</span>
        </div>
      </div>`;

    // Self-benchmark
    if (sc?.selfBenchmark) {
      const sb = sc.selfBenchmark;
      hdr.innerHTML += `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div><div class="text-xs text-muted">시간당 비용</div><div class="font-bold">${sb.costPerHour ? krw(sb.costPerHour)+'/h' : '측정 안 됨'}</div></div>
        <div><div class="text-xs text-muted">미사용일</div><div class="font-bold">${tier==='C'?'측정 안 됨':sb.unusedDays+'일'}</div></div>
        <div><div class="text-xs text-muted">마지막 사용</div><div class="font-bold">${sb.lastUsedDate ? sb.daysSinceLastUse+'일 전' : (tier==='C'?'측정 안 됨':'없음')}</div></div>
        <div><div class="text-xs text-muted">결제까지</div><div class="font-bold">D+${sb.daysUntilBilling}</div></div>
      </div>`;
    }
    container.appendChild(hdr);

    // Value Score 카드
    const scoreCard = document.createElement('div');
    scoreCard.className = 'card';
    scoreCard.innerHTML = '<div class="card-header"><span class="card-title">📊 Value Score</span></div>';
    const scoreBody = document.createElement('div');
    scoreBody.className = 'score-display';

    // 도넛
    const ringWrap = document.createElement('div');
    ringWrap.className = 'score-ring-wrap';
    const scoreNum = document.createElement('div');
    scoreNum.className = 'score-number';
    if (sc?.scoreResult) {
      const donut = AppCharts.donutChart(sc.scoreResult.score, { size: 90 });
      ringWrap.appendChild(donut);
      scoreNum.innerHTML = `${sc.scoreResult.score}<span>/100</span>`;
      ringWrap.appendChild(scoreNum);
    } else {
      const donut = AppCharts.donutChart(0, { size: 90, color: '#2e3347' });
      ringWrap.appendChild(donut);
      scoreNum.innerHTML = `<span style="font-size:0.75rem;color:var(--c-muted)">판단<br>보류</span>`;
      ringWrap.appendChild(scoreNum);
    }
    scoreBody.appendChild(ringWrap);

    // 컴포넌트 막대
    const compWrap = document.createElement('div');
    compWrap.className = 'component-bars';
    const COMP_LABELS = {
      usageIntensity: '사용 강도', relativeUsage: '상대 사용량', usageConsistency: '사용 일관성',
      functionalImportance: '기능 중요도', featureUniqueness: '기능 고유성',
      costEfficiency: '비용 효율', replacementDifficulty: '대체 난이도',
    };
    const compItems = Object.entries(COMP_LABELS).map(([key, label]) => ({
      key, label,
      value: sc?.components ? sc.components[key] : null,
      excluded: !sc?.components || sc.components[key] === null || sc.components[key] === undefined,
    }));
    AppCharts.componentBars(compItems, compWrap);
    scoreBody.appendChild(compWrap);
    scoreCard.appendChild(scoreBody);

    // 재정규화 안내
    if (sc?.scoreResult) {
      const excl = sc.scoreResult.excluded;
      if (excl.length > 0) {
        const note = document.createElement('p');
        note.className = 'text-xs text-muted';
        note.style.marginTop = '8px';
        note.textContent = `※ 산출 불가 항목(${excl.map(k=>COMP_LABELS[k]).join(', ')})을 제외하고 가중치를 재정규화했습니다.`;
        scoreCard.appendChild(note);
      }
    } else {
      const note = document.createElement('p');
      note.className = 'text-xs text-muted';
      note.style.marginTop = '8px';
      note.textContent = ri ? ri.recommendation.reason : '데이터가 부족해 점수를 산출하지 않습니다.';
      scoreCard.appendChild(note);
    }
    container.appendChild(scoreCard);

    // Confidence 카드
    if (sc?.confidence) {
      const confCard = document.createElement('div');
      confCard.className = 'card';
      confCard.innerHTML = `<div class="card-header"><span class="card-title">🎯 신뢰도 (Confidence)</span>
        <span class="badge ${sc.confidence.grade==='High'?'badge-green':sc.confidence.grade==='Medium'?'badge-yellow':'badge-gray'}">${sc.confidence.grade}</span>
      </div>
      <div class="confidence-row conf-${sc.confidence.grade}">
        <span class="text-xs text-muted" style="width:100px">종합</span>
        <div class="conf-bar-bg"><div class="conf-bar-fill" style="width:${Math.round(sc.confidence.value*100)}%"></div></div>
        <span class="text-xs">${Math.round(sc.confidence.value*100)}%</span>
      </div>
      <p class="text-xs text-muted" style="margin-top:8px">
        커버리지(${Math.round(sc.confidence.coverageFactor*100)}%) · 관측기간(${Math.round(sc.confidence.daysFactor*100)}%) · 코호트(${Math.round(sc.confidence.cohortFactor*100)}%)
      </p>`;
      container.appendChild(confCard);
    }

    // 벤치마크 카드
    renderBenchmarkCard(container, sc, cr, sm, sub, tier);

    // 변경 이력 타임라인
    renderChangeTimeline(container, state.changeEvents, serviceId);

    // Peer 카드
    renderPeerCard(container, state.peerReports, serviceId);

    // 예측 카드
    renderPredictCards(container, sub, state.catalog, state.changeEvents, TODAY);

    // 추천 근거
    if (ri) renderRecommendCard(container, ri, sub);
  });

  /* ─── 벤치마크 카드 렌더링 ─── */
  function renderBenchmarkCard(container, sc, cohortResult, sm, sub, tier) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card-header"><span class="card-title">📈 사용량 벤치마크</span></div>';

    if (tier === 'C') {
      card.innerHTML += '<p class="text-muted text-sm">미측정 서비스 — 벤치마크를 표시할 수 없습니다.</p>';
    } else if (!cohortResult) {
      // self-benchmark
      card.innerHTML += `<div class="badge badge-gray text-xs" style="margin-bottom:10px">표본 부족 — Self-benchmark로 표시</div>`;
      if (sc?.selfBenchmark) {
        const sb = sc.selfBenchmark;
        card.innerHTML += `<ul class="text-sm" style="list-style:none;padding:0;display:flex;flex-direction:column;gap:6px">
          <li>· 이번 달 총 사용: <strong>${fmtMin(sm.totalAdjustedSec / 60)}</strong></li>
          <li>· 일평균: <strong>${fmtMin(sm.avgDailyAdjustedMin)}</strong></li>
          <li>· 시간당 비용: <strong>${sb.costPerHour ? krw(sb.costPerHour)+'/h' : '-'}</strong> <span class="text-xs text-muted" data-tooltip="금액 대비 활용도">💡</span></li>
          <li>· 미사용일: <strong>${sb.unusedDays}일 / 30일</strong></li>
        </ul>`;
      }
    } else {
      // 코호트 벤치마크
      const { stats, n, fallbackDesc, fallbackLevel, canShowPercentile } = cohortResult;
      card.innerHTML += `<p class="text-xs text-muted" style="margin-bottom:10px">비교 기준: ${fallbackDesc}</p>`;
      const myAvg = sm.avgDailyAdjustedMin;
      const myPct = sc?.userPercentile;
      card.innerHTML += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px">
        <div><div class="text-xs text-muted">내 일평균</div><div class="font-bold">${fmtMin(myAvg)}</div></div>
        <div><div class="text-xs text-muted">코호트 중간값</div><div class="font-bold">${fmtMin(stats.p50)}</div></div>
        ${canShowPercentile && myPct !== null ? `<div><div class="text-xs text-muted">상위</div><div class="font-bold text-accent">${myPct}%</div></div>` : ''}
      </div>`;

      // 이용률 (p75 기준)
      if (sc?.utilization !== null && sc?.utilization !== undefined) {
        const util = sc.utilization;
        card.innerHTML += `<div class="text-sm"><span class="text-muted">금액 대비 활용도 (p75 기준): </span>
          <strong>${Math.round(util * 100)}%</strong>
          <span class="text-xs text-muted"> — p75 적극 활용자 대비 내 위치</span></div>`;
      }

      // quota
      if (sc?.quotaUsage) {
        const q = sc.quotaUsage;
        card.innerHTML += `<div class="text-sm" style="margin-top:6px"><span class="text-muted">Quota 소진율 (${q.unit}): </span>
          <strong>${q.pct}%</strong> (${q.used}/${q.limit})</div>`;
      }
    }
    container.appendChild(card);
  }

  /* ─── 변경 이력 타임라인 ─── */
  function renderChangeTimeline(container, changeEvents, serviceId) {
    const events = AppChanges.getChangeCards(changeEvents, serviceId);
    if (!events.length) return;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card-header"><span class="card-title">🕐 변경 이력</span></div>';
    const tl = document.createElement('div');
    tl.className = 'timeline';
    events.forEach(ev => {
      const item = document.createElement('div');
      item.className = 'timeline-item';
      const dot = document.createElement('div');
      dot.className = 'timeline-dot';
      if (ev.isAutoDetected) dot.style.background = 'var(--c-orange)';
      item.appendChild(dot);
      const date = document.createElement('div');
      date.className = 'timeline-date';
      date.textContent = ev.detectedAt + ' 감지';
      const content = document.createElement('div');
      content.className = 'timeline-content';
      content.innerHTML = `<span class="badge ${ev.isAutoDetected ? 'verify-auto' : 'verify-confirmed'}">${ev.badge}</span>
        <span class="text-sm" style="margin-left:6px">${ev.displayText}</span>
        ${ev.evidenceUrl ? `<a href="${ev.evidenceUrl}" target="_blank" class="text-xs text-accent" style="margin-left:6px">출처 →</a>` : ''}`;
      item.appendChild(date);
      item.appendChild(content);
      tl.appendChild(item);
    });
    card.appendChild(tl);
    container.appendChild(card);
  }

  /* ─── Peer 카드 ─── */
  function renderPeerCard(container, peerReports, serviceId) {
    const cards = AppPeer.getPeerCards(peerReports, serviceId);
    if (!cards.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.innerHTML = '<div class="card-header"><span class="card-title">👥 피어 인텔리전스</span><span class="badge badge-gray text-xs">사용자 설문</span></div>';

    cards.forEach(pc => {
      if (pc.lowResponseWarning) {
        const warn = document.createElement('div');
        warn.className = 'low-response-warn';
        warn.textContent = pc.lowResponseWarning;
        wrap.appendChild(warn);
      }
      if (pc.satisfaction) {
        const sat = document.createElement('p');
        sat.className = 'text-sm';
        sat.style.marginBottom = '10px';
        sat.innerHTML = `만족도: <strong>${pc.satisfaction.displayStr}</strong> <span class="badge badge-gray text-xs">사용자 설문</span>`;
        wrap.appendChild(sat);
      }
      const grid = document.createElement('div');
      grid.className = 'reasons-grid';
      const churnCol = document.createElement('div');
      churnCol.innerHTML = '<div class="reason-col-title">해지 사유</div>';
      pc.churnReasons.slice(0, 4).forEach(r => {
        const el = document.createElement('div');
        el.className = 'reason-item';
        el.innerHTML = `<span>${r.reason}</span>${r.showPct ? `<span class="reason-pct">${r.pct}%</span>` : ''}`;
        churnCol.appendChild(el);
      });
      const keepCol = document.createElement('div');
      keepCol.innerHTML = '<div class="reason-col-title">유지 사유</div>';
      pc.keepReasons.slice(0, 4).forEach(r => {
        const el = document.createElement('div');
        el.className = 'reason-item';
        el.innerHTML = `<span>${r.reason}</span>${r.showPct ? `<span class="reason-pct">${r.pct}%</span>` : ''}`;
        keepCol.appendChild(el);
      });
      grid.appendChild(churnCol);
      grid.appendChild(keepCol);
      wrap.appendChild(grid);
    });
    container.appendChild(wrap);
  }

  /* ─── 예측 카드 ─── */
  function renderPredictCards(container, sub, catalog, changeEvents, todayStr) {
    const cards = AppPredict.buildPredictCards(sub, catalog, changeEvents, todayStr);
    if (!cards.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.innerHTML = '<div class="card-header"><span class="card-title">🔮 예측 & 공지</span></div>';
    cards.forEach(pc => {
      const item = document.createElement('div');
      item.style.cssText = 'padding:10px 0;border-bottom:1px solid var(--c-border);';
      if (pc.type === 'billing_deadline') {
        item.innerHTML = `<span class="badge ${pc.isUrgent?'badge-red':'badge-gray'}">결제 임박</span>
          <span class="text-sm" style="margin-left:8px">${pc.message}</span>`;
      } else if (pc.type === 'confirmed_price_change') {
        item.innerHTML = `<span class="badge verify-confirmed">확정</span>
          <span class="text-sm" style="margin-left:8px">${pc.message}</span>
          <a href="${pc.evidenceUrl}" target="_blank" class="text-xs text-accent" style="margin-left:6px">출처 →</a>`;
      } else if (pc.type === 'pattern_prediction') {
        item.innerHTML = `<span class="badge badge-purple">예측</span>
          <span class="text-sm text-muted" style="margin-left:8px">${pc.patternDesc}</span>`;
      } else if (pc.type === 'roadmap') {
        item.innerHTML = `<span class="badge badge-blue">로드맵</span>
          <span class="text-sm text-muted" style="margin-left:8px">${pc.disclaimer}</span>
          ${pc.sourceUrl ? `<a href="${pc.sourceUrl}" target="_blank" class="text-xs text-accent" style="margin-left:6px">보기 →</a>` : ''}`;
      }
      wrap.appendChild(item);
    });
    container.appendChild(wrap);
  }

  /* ─── 추천 근거 카드 ─── */
  function renderRecommendCard(container, ri, sub) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="card-header"><span class="card-title">💡 추천 근거</span></div>`;
    const ul = document.createElement('ul');
    ul.className = 'rec-reasons';
    ri.reasons.forEach(r => { const li = document.createElement('li'); li.textContent = r; ul.appendChild(li); });
    card.appendChild(ul);
    if (ri.planSwitchSuggestions?.length) {
      ri.planSwitchSuggestions.forEach(s => {
        const p = document.createElement('div');
        p.className = 'text-sm';
        p.style.marginTop = '10px';
        const res = s.switchResult;
        if (!res.hasExpectedMembers && res.breakEvenMembers) {
          p.innerHTML = `<strong>${s.planName}</strong>: ${res.breakEvenMembers}명 이상 이용 시 절감. 손익분기 인원: ${res.breakEvenMembers}명`;
        } else if (res.hasExpectedMembers) {
          p.innerHTML = `<strong>${s.planName}</strong>: 월 ${krw(Math.abs(res.netSavings))} ${res.isLoss?'<span class="text-red">추가 지출</span>':'<span class="text-green">절감</span>'}`;
        }
        card.appendChild(p);
      });
    }
    card.innerHTML += `<p class="affiliate-note">제휴 관계: ${ri.affiliateDisclosure}</p>`;
    container.appendChild(card);
  }

  /* ══════════════════════════════════════════
   * VIEW: INSIGHTS & 알림 센터 (§9.4)
   * ══════════════════════════════════════════ */
  registerView('insights', function (container) {
    const C = global._computed;
    if (!C) return;
    const { classified } = C;
    const ICONS = { billing_deadline:'⏰', price_increase_confirmed:'💰', saving_opportunity:'✂️', overlap_resolved:'🔗', info:'ℹ️' };
    const PCLASS = [null,'p1','p2','p3','p4','p5'];

    function renderGroup(title, items, isSuppressed) {
      if (!items.length) return;
      const g = document.createElement('div');
      g.className = 'notif-group';
      g.innerHTML = `<div class="notif-group-title">${title} (${items.length}건)</div>`;
      items.forEach(n => {
        const el = document.createElement('div');
        el.className = `notif-item ${isSuppressed ? 'suppressed' : ''} ${PCLASS[n.priority]||'p5'}`;
        el.innerHTML = `
          <div class="notif-icon">${ICONS[n.type]||'📌'}</div>
          <div class="notif-body">
            <div class="notif-title">${n.title}</div>
            <div class="notif-text">${n.body}</div>
            <div class="notif-meta">
              <span>${n.createdAt}</span>
              ${n.suppressedReason ? `<span class="suppressed-reason">억제됨: ${classified.suppressedReasonLabels[n.suppressedReason]||n.suppressedReason}</span>` : ''}
              ${n.savingsKRW > 0 ? `<span class="savings-chip">월 ${krw(n.savingsKRW)} 절감</span>` : ''}
            </div>
          </div>
          ${n.serviceId ? `<button class="btn btn-ghost btn-sm" data-sid="${n.serviceId}">→</button>` : ''}`;
        el.querySelector('[data-sid]')?.addEventListener('click', () => navigate('detail', { serviceId: el.querySelector('[data-sid]').dataset.sid }));
        g.appendChild(el);
      });
      container.appendChild(g);
    }

    renderGroup('발송된 알림', classified.delivered, false);
    Object.entries(classified.suppressedGroups).forEach(([reason, items]) => {
      renderGroup(`억제됨 — ${classified.suppressedReasonLabels[reason]||reason}`, items, true);
    });
    if (!classified.delivered.length && !classified.suppressed.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔕</div><p>현재 알림이 없습니다.</p></div>';
    }
  });

  /* ══════════════════════════════════════════
   * VIEW: AI PORTFOLIO (§9.5)
   * ══════════════════════════════════════════ */
  registerView('portfolio', function (container) {
    const state = global._appState;
    const C     = global._computed;
    if (!state || !C) return;
    const { analysis } = C;
    const LABELS = AppConfig.RECOMMENDATION_LABELS;

    const header = document.createElement('div');
    header.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
      <div>
        <h2 style="font-size:1rem;font-weight:700">AI 포트폴리오 최적화</h2>
        <p class="text-muted text-sm">현재 구독 포트폴리오의 가치 분석 결과입니다.</p>
      </div>
      ${analysis.summary.monthlySavingsKRW > 0 ? `
        <div style="text-align:right">
          <div class="text-muted text-xs">예상 절감액</div>
          <div class="text-green font-bold text-xl">${krw(analysis.summary.monthlySavingsKRW)}/월</div>
          <div class="text-muted text-xs">연 ${krw(analysis.summary.yearlySavingsKRW)}</div>
        </div>` : ''}
    </div>`;
    container.appendChild(header);

    const groups = [
      { label: '해지 검토', items: analysis.items.filter(r => r.recommendation.label === LABELS.CANCEL), color:'badge-red' },
      { label: '다운그레이드 검토', items: analysis.items.filter(r => r.recommendation.label === LABELS.DOWNGRADE), color:'badge-yellow' },
      { label: '유지', items: analysis.items.filter(r => r.recommendation.label === LABELS.KEEP), color:'badge-green' },
    ];

    groups.forEach(g => {
      if (!g.items.length) return;
      const sec = document.createElement('div');
      sec.className = 'portfolio-section';
      sec.innerHTML = `<div class="portfolio-section-title"><span class="badge ${g.color}">${g.label}</span><span>${g.items.length}건</span></div>`;
      g.items.forEach(ri => {
        const sub = state.subscriptions.find(s => s.serviceId === ri.serviceId);
        const monthly = sub ? AppCatalog.toMonthlyAmount(sub.price, sub.billingCycle) : 0;
        const c = document.createElement('div');
        c.className = 'rec-card';
        c.innerHTML = `
          <div class="rec-card-header">
            <span style="font-size:1.3rem">${svcIcon(ri.serviceId)}</span>
            <span class="rec-card-name">${ri.serviceName}</span>
            ${monthly > 0 ? `<span class="text-muted text-sm" style="margin-left:auto">${krw(monthly)}/월</span>` : ''}
            ${g.label === '해지 검토' ? `<span class="savings-chip">월 ${krw(monthly)} 절감 가능</span>` : ''}
          </div>
          <ul class="rec-reasons">${ri.reasons.map(r=>`<li>${r}</li>`).join('')}</ul>
          ${ri.planSwitchSuggestions?.length ? ri.planSwitchSuggestions.map(s => {
            const res = s.switchResult;
            if (!res.hasExpectedMembers && res.breakEvenMembers) {
              return `<p class="text-sm" style="margin-top:8px">→ <strong>${s.planName}</strong>: 손익분기 ${res.breakEvenMembers}명 이상 이용 시 절감</p>`;
            }
            return '';
          }).join('') : ''}
          <p class="affiliate-note">${ri.affiliateDisclosure}</p>`;
        c.querySelector('.rec-card-header').addEventListener('click', () => navigate('detail', { serviceId: ri.serviceId }));
        sec.appendChild(c);
      });
      container.appendChild(sec);
    });

    // 판단 보류 섹션
    const holdItems = analysis.items.filter(r => r.recommendation.label === LABELS.HOLD);
    if (holdItems.length) {
      const holdSec = document.createElement('div');
      holdSec.className = 'portfolio-section';
      holdSec.innerHTML = `<div class="portfolio-section-title"><span class="badge badge-gray">판단 보류</span><span>${holdItems.length}건</span></div>`;
      holdItems.forEach(ri => {
        const h = document.createElement('div');
        h.className = 'hold-section';
        h.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <span>${svcIcon(ri.serviceId)}</span><strong>${ri.serviceName}</strong>
        </div>
        <p class="text-sm text-muted">${ri.recommendation.reason || '데이터가 부족해 판단하지 않습니다.'}</p>
        <p class="text-xs text-muted" style="margin-top:6px">💡 수집기를 연결하면 사용량 측정이 가능합니다.</p>`;
        holdSec.appendChild(h);
      });
      container.appendChild(holdSec);
    }
  });

  /* ══════════════════════════════════════════
   * VIEW: SETTINGS (§9.6)
   * ══════════════════════════════════════════ */
  registerView('settings', function (container) {
    const state = global._appState;

    /* ── 기기 연결 시뮬레이션 ── */
    const devSec = document.createElement('div');
    devSec.className = 'settings-section card';
    devSec.innerHTML = '<div class="settings-title">🔌 기기 (수집기) 연결 시뮬레이션</div>';
    state.devices.forEach(d => {
      const row = document.createElement('div');
      row.className = 'device-row';
      const isOn = state.settings.deviceToggles[d.deviceId] !== false;
      row.innerHTML = `
        <span class="device-icon">${d.platform==='android'?'📱':d.platform==='desktop'?'🖥️':'🌐'}</span>
        <div class="flex-1">
          <div class="device-label">${d.label}</div>
          <div class="device-type">${d.collectorType} · ${d.platform}</div>
        </div>
        <label class="toggle"><input type="checkbox" ${isOn?'checked':''} data-device="${d.deviceId}"><span class="toggle-slider"></span></label>`;
      row.querySelector('input').addEventListener('change', e => {
        state.settings.deviceToggles[d.deviceId] = e.target.checked;
        AppStore.save(state);
        refreshApp(); // 즉시 재계산
      });
      devSec.appendChild(row);
    });
    container.appendChild(devSec);

    /* ── 동의 설정 ── */
    const consentSec = document.createElement('div');
    consentSec.className = 'settings-section card';
    consentSec.innerHTML = '<div class="settings-title">🔒 데이터 동의 (기본 off)</div>';
    const consentDefs = [
      { key:'c1', label:'C1: 사용량 수집 및 대시보드 표시', desc:'끄면 모든 측정 기능이 비활성화됩니다.' },
      { key:'c2', label:'C2: 익명 집계 벤치마크 기여', desc:'끄면 벤치마크가 self-benchmark로 대체됩니다.' },
      { key:'c3', label:'C3: 익명 집계 통계 리서치·B2B 활용', desc:'C2 활성화 필요.' },
    ];
    consentDefs.forEach(def => {
      const row = document.createElement('div');
      row.className = 'setting-row';
      const isC23 = def.key === 'c2' || def.key === 'c3';
      const disabled = (def.key === 'c2' || def.key === 'c3') && !state.settings.consents.c1;
      const disabledC3 = def.key === 'c3' && !state.settings.consents.c2;
      row.innerHTML = `
        <div>
          <div class="setting-label">${def.label}</div>
          <div class="setting-desc">${def.desc}</div>
        </div>
        <label class="toggle"><input type="checkbox" data-consent="${def.key}"
          ${state.settings.consents[def.key]?'checked':''} ${(disabled||disabledC3)?'disabled':''}>
          <span class="toggle-slider"></span></label>`;
      row.querySelector('input').addEventListener('change', e => {
        state.settings.consents[def.key] = e.target.checked;
        if (!state.settings.consents.c1) {
          state.settings.consents.c2 = false;
          state.settings.consents.c3 = false;
        }
        if (!state.settings.consents.c2) state.settings.consents.c3 = false;
        AppStore.save(state);
        refreshApp();
        navigate('settings', null);
      });
      consentSec.appendChild(row);
    });
    container.appendChild(consentSec);

    /* ── 알림 설정 ── */
    const notifSec = document.createElement('div');
    notifSec.className = 'settings-section card';
    notifSec.innerHTML = `<div class="settings-title">🔔 알림 설정</div>
      <div class="setting-row">
        <div><div class="setting-label">주간 최대 알림 수</div></div>
        <input type="number" class="form-input" id="weekly-budget" style="width:70px;text-align:center"
          value="${state.settings.notify?.weeklyBudget || AppConfig.MAX_PUSH_PER_WEEK}" min="0" max="10">
      </div>`;
    const typeLabels = { billing_deadline:'결제 임박', price_increase_confirmed:'가격 인상 확정', saving_opportunity:'절감 기회', overlap_resolved:'기능 중복 해소' };
    Object.entries(typeLabels).forEach(([key, label]) => {
      const isOn = state.settings.notify?.types?.[key] !== false;
      const row = document.createElement('div');
      row.className = 'setting-row';
      row.innerHTML = `<div class="setting-label">${label}</div>
        <label class="toggle"><input type="checkbox" data-ntype="${key}" ${isOn?'checked':''}>
          <span class="toggle-slider"></span></label>`;
      row.querySelector('input').addEventListener('change', e => {
        if (!state.settings.notify) state.settings.notify = { weeklyBudget: AppConfig.MAX_PUSH_PER_WEEK, types: {} };
        if (!state.settings.notify.types) state.settings.notify.types = {};
        state.settings.notify.types[key] = e.target.checked;
        AppStore.save(state);
      });
      notifSec.appendChild(row);
    });
    container.appendChild(notifSec);

    notifSec.querySelector('#weekly-budget').addEventListener('change', e => {
      if (!state.settings.notify) state.settings.notify = {};
      state.settings.notify.weeklyBudget = parseInt(e.target.value) || AppConfig.MAX_PUSH_PER_WEEK;
      AppStore.save(state);
    });

    /* ── 데이터 관리 ── */
    const dataSec = document.createElement('div');
    dataSec.className = 'settings-section card';
    dataSec.innerHTML = `<div class="settings-title">💾 데이터 관리</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;padding-top:8px">
        <button class="btn btn-secondary btn-sm" id="btn-load-demo">데모 데이터 불러오기</button>
        <button class="btn btn-secondary btn-sm" id="btn-export">JSON 내보내기</button>
        <button class="btn btn-secondary btn-sm" id="btn-import">JSON 가져오기</button>
        <button class="btn btn-danger btn-sm" id="btn-reset">초기화</button>
      </div>
      <input type="file" id="import-file" accept=".json" style="display:none">`;
    container.appendChild(dataSec);

    dataSec.querySelector('#btn-load-demo').addEventListener('click', () => {
      global._appState = AppDemoData.generateDemoState();
      AppStore.save(global._appState);
      refreshApp();
      navigate('dashboard');
    });
    dataSec.querySelector('#btn-export').addEventListener('click', () => AppStore.exportJSON(state));
    dataSec.querySelector('#btn-import').addEventListener('click', () => dataSec.querySelector('#import-file').click());
    dataSec.querySelector('#import-file').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          global._appState = AppStore.importJSON(ev.target.result);
          AppStore.save(global._appState);
          refreshApp();
          navigate('dashboard');
        } catch (err) { alert('가져오기 실패: ' + err.message); }
      };
      reader.readAsText(file);
    });
    dataSec.querySelector('#btn-reset').addEventListener('click', () => {
      if (confirm('모든 데이터를 초기화합니다. 계속하시겠습니까?')) {
        global._appState = AppStore.reset();
        refreshApp();
        navigate('dashboard');
      }
    });
  });

  /* ══════════════════════════════════════════
   * CRUD 모달 — 구독 추가 / 수정
   * ══════════════════════════════════════════ */
  function openSubModal(subId) {
    const state = global._appState;
    const existing = subId ? state.subscriptions.find(s => s.id === subId) : null;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">${existing ? '구독 수정' : '구독 추가'}</span>
          <button class="modal-close" id="modal-close-btn">✕</button>
        </div>
        <form id="sub-form">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">서비스명 *</label>
              <input class="form-input" name="serviceName" required value="${existing?.serviceName||''}">
            </div>
            <div class="form-group">
              <label class="form-label">요금제명</label>
              <input class="form-input" name="planName" value="${existing?.planName||''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">가격 (KRW) *</label>
              <input class="form-input" name="price" type="number" required value="${existing?.price||''}">
            </div>
            <div class="form-group">
              <label class="form-label">결제 주기</label>
              <select class="form-select" name="billingCycle">
                <option value="monthly" ${existing?.billingCycle==='monthly'?'selected':''}>월간</option>
                <option value="yearly"  ${existing?.billingCycle==='yearly' ?'selected':''}>연간</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">카테고리</label>
              <select class="form-select" name="category">
                ${['ai','design','productivity','media','dev','other'].map(c=>`<option value="${c}" ${existing?.category===c?'selected':''}>${c}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">다음 결제일</label>
              <input class="form-input" name="nextBillingDate" type="date" value="${existing?.nextBillingDate||''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">중요도 (1~5)</label>
              <input class="form-input" name="importance" type="number" min="1" max="5" value="${existing?.importance??''}">
            </div>
            <div class="form-group">
              <label class="form-label">대체 난이도 (1~5)</label>
              <input class="form-input" name="replacementDifficulty" type="number" min="1" max="5" value="${existing?.replacementDifficulty??''}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">목적</label>
            <select class="form-select" name="purpose">
              ${['work','study','personal','side_project'].map(p=>`<option value="${p}" ${existing?.purpose===p?'selected':''}>${p}</option>`).join('')}
            </select>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" id="modal-cancel-btn">취소</button>
            <button type="submit" class="btn btn-primary">${existing ? '저장' : '추가'}</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#modal-close-btn').addEventListener('click',  () => overlay.remove());
    overlay.querySelector('#modal-cancel-btn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#sub-form').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const now = new Date().toISOString().slice(0, 10);
      const data = {
        id:                  existing?.id || ('sub_' + Date.now()),
        serviceId:           existing?.serviceId || fd.get('serviceName').toLowerCase().replace(/\s+/g, '_'),
        planId:              existing?.planId    || (fd.get('serviceName').toLowerCase().replace(/\s+/g, '_') + '_plan'),
        serviceName:         fd.get('serviceName'),
        planName:            fd.get('planName') || 'Standard',
        price:               parseFloat(fd.get('price')) || 0,
        currency:            'KRW',
        taxIncluded:         true,
        billingCycle:        fd.get('billingCycle'),
        nextBillingDate:     fd.get('nextBillingDate') || now,
        committedUntil:      existing?.committedUntil || null,
        seats:               1,
        category:            fd.get('category'),
        capabilityTags:      existing?.capabilityTags || [],
        purpose:             fd.get('purpose'),
        importance:          fd.get('importance') ? parseInt(fd.get('importance')) : null,
        replacementDifficulty: fd.get('replacementDifficulty') ? parseInt(fd.get('replacementDifficulty')) : null,
        collectible:         true,
        keepUntil:           existing?.keepUntil || null,
        createdAt:           existing?.createdAt || now,
        updatedAt:           now,
      };
      if (existing) {
        const idx = state.subscriptions.findIndex(s => s.id === subId);
        if (idx >= 0) state.subscriptions[idx] = data;
      } else {
        state.subscriptions.push(data);
      }
      AppStore.save(state);
      refreshApp();
      navigate('subscriptions');
      overlay.remove();
    });
  }

  function deleteSub(subId) {
    if (!confirm('이 구독을 삭제합니까?')) return;
    const state = global._appState;
    state.subscriptions = state.subscriptions.filter(s => s.id !== subId);
    AppStore.save(state);
    refreshApp();
    navigate('subscriptions');
  }

  function snoozeSub(subId) {
    const state = global._appState;
    const idx = state.subscriptions.findIndex(s => s.id === subId);
    if (idx < 0) return;
    state.subscriptions[idx] = AppNotify.snoozeSubscription(
      state.subscriptions[idx],
      state.settings.today || AppDemoData.TODAY
    );
    AppStore.save(state);
    refreshApp();
    alert('😴 ' + AppConfig.SNOOZE_DAYS + '일간 해지 알림이 중단됩니다.');
  }

  /* ══════════════════════════════════════════
   * 앱 초기화 & refreshApp
   * ══════════════════════════════════════════ */
  function refreshApp() {
    const state = global._appState;
    if (!state) return;
    global._computed = runPipeline(state);
    updateNotifBadge(global._computed.classified.delivered.length);
    navigate(currentView, null);
  }

  function initApp() {
    // 상태 로드
    let state = AppStore.load();
    // 데이터 없으면 데모 데이터 적재
    if (!state.subscriptions.length) {
      state = AppDemoData.generateDemoState();
      AppStore.save(state);
    }
    global._appState = state;
    global._appState.settings.today = AppDemoData.TODAY;

    // 사이드바 토글 (모바일)
    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebar-overlay').classList.toggle('visible');
    });
    document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebar-overlay').classList.remove('visible');
    });

    // 네비게이션 바인딩
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', () => {
        if (el.dataset.view) navigate(el.dataset.view);
      });
    });

    refreshApp();
  }

  /* ══════════════════════════════════════════
   * Public API
   * ══════════════════════════════════════════ */
  global.AppUI = { initApp, navigate, refreshApp };

})(window);
