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

  /* ─── 커버리지 배지 헬퍼 (진행률 + 툴팁 포함) ─── */
  function coverageBadge(tier) {
    const label = AppConfig.COVERAGE_LABELS[tier];
    const desc  = AppConfig.COVERAGE_DESCRIPTIONS[tier];
    const pct   = tier === 'A' ? 100 : tier === 'B' ? 50 : 0;
    const colorClass = tier === 'A' ? 'coverage-a' : tier === 'B' ? 'coverage-b' : 'coverage-c';
    return `<span class="badge ${colorClass}" data-tooltip="${desc}" style="gap:5px;max-width:none">
      <span style="display:inline-block;width:28px;height:4px;background:var(--c-border);border-radius:2px;vertical-align:middle;overflow:hidden;flex-shrink:0">
        <span style="display:block;height:100%;width:${pct}%;background:${tier==='A'?'var(--c-green)':tier==='B'?'var(--c-yellow)':'var(--c-muted)'};border-radius:2px"></span>
      </span>
      ${label}
    </span>`;
  }
  function krw(n) {
    if (n === 0) return '무료';
    return '₩' + Math.round(n).toLocaleString();
  }
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
      insights: '인사이트 & 알림', portfolio: '구독 최적화 분석', settings: '설정',
      calendar: '결제 캘린더', onboarding: '시작하기',
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

    // 구독이 없으면 온보딩 화면 표시
    if (!subs.length) {
      container.innerHTML = `
        <div style="max-width:480px;margin:80px auto;text-align:center">
          <div style="font-size:3rem;margin-bottom:20px">📊</div>
          <h2 style="font-size:1.4rem;font-weight:800;margin-bottom:12px;letter-spacing:-0.02em">구독 분석을 시작해보세요</h2>
          <p class="text-muted" style="font-size:0.9rem;line-height:1.7;margin-bottom:32px">
            구독 서비스를 직접 추가하거나,<br>
            데모 데이터로 먼저 기능을 체험해보세요.
          </p>
          <div style="display:flex;flex-direction:column;gap:10px;align-items:center">
            <button class="btn btn-primary" style="width:240px;justify-content:center;padding:13px 24px;font-size:0.95rem" id="ob-add">
              + 첫 번째 구독 추가하기
            </button>
            <button class="btn btn-secondary" style="width:240px;justify-content:center;padding:13px 24px;font-size:0.95rem" id="ob-demo">
              🧪 데모 데이터 불러오기
            </button>
          </div>
          <p class="text-xs text-muted" style="margin-top:16px">데모 데이터는 가상의 데이터로 실제 사용량과 다릅니다</p>
        </div>`;
      container.querySelector('#ob-add')?.addEventListener('click', () => { navigate('subscriptions'); setTimeout(() => openSubModal(null), 100); });
      container.querySelector('#ob-demo')?.addEventListener('click', () => {
        global._appState = AppDemoData.generateDemoState();
        AppStore.save(global._appState);
        refreshApp();
      });
      return;
    }
    if (state.isDemo) {
      const banner = document.createElement('div');
      banner.id = 'demo-banner';
      banner.innerHTML = '<span class="demo-icon">🧪</span><span><strong>[데모 데이터]</strong> 현재 화면은 시뮬레이션 데이터를 기반으로 합니다. 실제 사용량·가격과 다릅니다.</span>';
      container.appendChild(banner);
    }

    // 요약 카드
    const totalMonthly = subs.reduce((s, sub) =>
      s + AppCatalog.toMonthlyAmount(sub.price, sub.billingCycle), 0);
    const covSummary = AppCoverage.getCoverageSummary(coverageMap);
    const trackedCount = covSummary.measured + covSummary.partial;

    // 월 구독비 강조 배너 (상단 중앙)
    const heroBanner = document.createElement('div');
    heroBanner.style.cssText = 'text-align:center;padding:24px 20px 20px;background:linear-gradient(135deg,rgba(91,127,255,0.08),rgba(155,125,255,0.06));border:1px solid rgba(91,127,255,0.15);border-radius:var(--r-lg);margin-bottom:18px;';
    heroBanner.innerHTML = `
      <div style="font-size:0.75rem;color:var(--c-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">이번 달 구독 총액</div>
      <div style="font-size:2.6rem;font-weight:900;letter-spacing:-0.04em;background:var(--g-accent);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1">${krw(totalMonthly)}</div>
      <div style="font-size:0.8rem;color:var(--c-muted);margin-top:8px">연간 ${krw(totalMonthly * 12)} · 구독 ${subs.length}개 · 추적 중 ${trackedCount}개</div>
      ${analysis.summary.monthlySavingsKRW > 0 ? `<div style="margin-top:10px;display:inline-flex;align-items:center;gap:6px;background:rgba(46,204,138,0.1);border:1px solid rgba(46,204,138,0.2);border-radius:20px;padding:4px 14px;font-size:0.78rem;color:var(--c-green)">💡 월 ${krw(analysis.summary.monthlySavingsKRW)} 절감 가능</div>` : ''}`;
    container.appendChild(heroBanner);

    const summaryGrid = document.createElement('div');
    summaryGrid.className = 'summary-grid';
    summaryGrid.innerHTML = `
      <div class="summary-card">
        <div class="summary-label">해지 검토</div>
        <div class="summary-value" style="color:var(--c-red)">${analysis.summary.cancelCount}<span style="font-size:0.9rem;font-weight:400;color:var(--c-muted)">개</span></div>
        <div class="summary-sub">절감 가능 ${krw(analysis.summary.monthlySavingsKRW)}/월</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">정상 유지</div>
        <div class="summary-value" style="color:var(--c-green)">${analysis.summary.keepCount}<span style="font-size:0.9rem;font-weight:400;color:var(--c-muted)">개</span></div>
        <div class="summary-sub">잘 활용 중인 서비스</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">데이터 부족</div>
        <div class="summary-value" style="color:var(--c-muted)">${analysis.summary.holdCount}<span style="font-size:0.9rem;font-weight:400;color:var(--c-muted)">개</span></div>
        <div class="summary-sub">수집기 연결 권장</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">추적 중</div>
        <div class="summary-value">${trackedCount}<span style="font-size:0.9rem;font-weight:400;color:var(--c-muted)"> / ${subs.length}</span></div>
        <div class="summary-sub">사용량 측정 중인 서비스</div>
      </div>`;
    container.appendChild(summaryGrid);

    // 2열 레이아웃: 좌(구독 현황) + 우(결제 + 인사이트)
    const twoCol = document.createElement('div');
    twoCol.style.cssText = 'display:grid;grid-template-columns:1fr 320px;gap:16px;align-items:start;';

    // ── 좌: 구독 현황 ──
    const leftCol = document.createElement('div');
    const listCard = document.createElement('div');
    listCard.className = 'card';
    listCard.style.marginBottom = '0';

    // 정렬 옵션 상태 (로컬)
    let dashSort = 'attention'; // 기본: 주의 필요순

    function renderSubList() {
      listCard.innerHTML = `<div class="card-header">
        <span class="card-title">구독 현황</span>
        <div style="display:flex;gap:6px;align-items:center">
          <select id="dash-sort" class="form-select" style="font-size:0.75rem;padding:4px 8px;width:auto">
            <option value="attention" ${dashSort==='attention'?'selected':''}>주의 필요순</option>
            <option value="usage"     ${dashSort==='usage'?'selected':''}>사용량순</option>
            <option value="cost"      ${dashSort==='cost'?'selected':''}>비용순</option>
          </select>
          <button class="btn btn-sm btn-ghost" id="btn-goto-subs">전체 보기 →</button>
        </div>
      </div>`;

      const REC_ORDER = { '해지 검토': 0, '다운그레이드 검토': 1, '판단 보류': 2, '유지': 3 };
      let sorted = subs.slice();
      if (dashSort === 'attention') {
        sorted.sort((a, b) => {
          const ra = analysis.items.find(r => r.serviceId === a.serviceId)?.recommendation.label || '유지';
          const rb = analysis.items.find(r => r.serviceId === b.serviceId)?.recommendation.label || '유지';
          return (REC_ORDER[ra] ?? 4) - (REC_ORDER[rb] ?? 4);
        });
      } else if (dashSort === 'usage') {
        sorted.sort((a, b) => {
          const ua = AppUsage.getServiceSummary(aggregated, a.serviceId, TODAY, 30).avgDailyAdjustedMin;
          const ub = AppUsage.getServiceSummary(aggregated, b.serviceId, TODAY, 30).avgDailyAdjustedMin;
          return ub - ua;
        });
      } else if (dashSort === 'cost') {
        sorted.sort((a, b) =>
          AppCatalog.toMonthlyAmount(b.price, b.billingCycle) -
          AppCatalog.toMonthlyAmount(a.price, a.billingCycle)
        );
      }

      const subList = document.createElement('div');
      subList.className = 'sub-list';

      sorted.slice(0, 6).forEach(sub => {
        const tier    = coverageMap[sub.serviceId] ? coverageMap[sub.serviceId].tier : 'C';
        const summary = AppUsage.getServiceSummary(aggregated, sub.serviceId, TODAY, 30);
        const recItem = analysis.items.find(r => r.serviceId === sub.serviceId);
        const recLbl  = recItem ? recItem.recommendation.label : '-';
        const recColor = recLbl === '유지' ? 'badge-green' : recLbl === '해지 검토' ? 'badge-red' : recLbl === '다운그레이드 검토' ? 'badge-yellow' : 'badge-gray';

        const sparkVals = AppUsage.dateRange(
          new Date(new Date(TODAY+'T00:00:00Z').getTime() - 13*86400000).toISOString().slice(0,10), TODAY
        ).map(d => Math.round((summary.dailyAdjustedSec[d] || 0) / 60));

        const card = document.createElement('div');
        card.className = 'sub-card';
        card.style.gridTemplateColumns = '44px 1fr 70px auto auto';
        card.dataset.serviceId = sub.serviceId;

        const sparkWrap = document.createElement('div');
        sparkWrap.style.cssText = 'width:70px;height:28px;display:flex;align-items:center;';
        if (tier !== 'C') {
          sparkWrap.appendChild(AppCharts.sparkline(sparkVals, { w: 70, h: 28 }));
        } else {
          sparkWrap.innerHTML = '<span style="font-size:0.62rem;color:var(--c-muted)">추적 안 됨</span>';
        }

        card.innerHTML = `
          <div class="sub-icon">${svcIcon(sub.serviceId)}</div>
          <div class="sub-info">
            <div class="sub-name">${sub.serviceName}</div>
            <div class="sub-plan">${sub.planName} · ${coverageBadge(tier)}</div>
          </div>`;
        card.appendChild(sparkWrap);
        const priceDiv = document.createElement('div');
        priceDiv.className = 'sub-price';
        priceDiv.innerHTML = `<div class="price-val">${krw(AppCatalog.toMonthlyAmount(sub.price, sub.billingCycle))}</div><div class="price-lbl">/월</div>`;
        card.appendChild(priceDiv);
        const actDiv = document.createElement('div');
        actDiv.innerHTML = `<span class="badge ${recColor}">${recLbl}</span>`;
        card.appendChild(actDiv);
        card.addEventListener('click', e => { if (!e.target.closest('button,select')) navigate('detail', { serviceId: sub.serviceId }); });
        subList.appendChild(card);
      });

      listCard.appendChild(subList);
      listCard.querySelector('#dash-sort')?.addEventListener('change', e => { dashSort = e.target.value; renderSubList(); });
      listCard.querySelector('#btn-goto-subs')?.addEventListener('click', () => navigate('subscriptions'));
    }

    renderSubList();
    leftCol.appendChild(listCard);

    // ── 우: 결제 + 인사이트 ──
    const rightCol = document.createElement('div');

    const billings = AppPredict.getUpcomingBillings(subs, TODAY, 4);
    const billingCard = document.createElement('div');
    billingCard.className = 'card';
    billingCard.innerHTML = `<div class="card-header"><span class="card-title">🗓️ 다가오는 결제</span>
      <button class="btn btn-ghost btn-xs" onclick="AppUI.navigate('calendar')">캘린더 →</button></div>`;
    const bList = document.createElement('div');
    bList.className = 'billing-list';
    billings.forEach(b => {
      const item = document.createElement('div');
      item.className = 'billing-item';
      const dText = b.daysUntilBilling === 0
        ? '오늘'
        : b.daysUntilBilling > 0
          ? `D-${b.daysUntilBilling}`
          : `D+${Math.abs(b.daysUntilBilling)}`;
      item.innerHTML = `
        <span>${svcIcon(b.serviceId)}</span>
        <span style="flex:1;font-size:0.84rem;font-weight:500">${b.serviceName}</span>
        <span class="text-sm" style="color:var(--c-muted)">${krw(b.monthlyKRW)}</span>
        <span class="billing-dday ${b.isUrgent ? 'urgent' : ''}">${dText}</span>`;
      bList.appendChild(item);
    });
    billingCard.appendChild(bList);
    rightCol.appendChild(billingCard);

    const deliveredCount = classified.delivered.length;
    const suppressedCount = classified.suppressed.length;
    const insightCard = document.createElement('div');
    insightCard.className = 'card';
    insightCard.style.marginBottom = '0';
    insightCard.innerHTML = `<div class="card-header"><span class="card-title">🔔 알림 센터</span></div>
      <div style="display:flex;flex-direction:column;gap:7px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--c-surface2);border-radius:var(--r-sm)">
          <span class="text-sm">발송된 알림</span>
          <span class="font-bold" style="color:var(--c-accent)">${deliveredCount}건</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--c-surface2);border-radius:var(--r-sm)">
          <span class="text-sm text-muted">억제된 알림</span>
          <span class="text-muted">${suppressedCount}건</span>
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" style="width:100%;margin-top:10px;justify-content:center" onclick="AppUI.navigate('insights')">전체 알림 보기</button>`;
    rightCol.appendChild(insightCard);

    twoCol.appendChild(leftCol);
    twoCol.appendChild(rightCol);
    container.appendChild(twoCol);

    // 모바일 1열 대응
    const mq = window.matchMedia('(max-width:700px)');
    const applyLayout = () => { twoCol.style.gridTemplateColumns = mq.matches ? '1fr' : '1fr 320px'; };
    applyLayout();
    mq.addEventListener('change', applyLayout);
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
        ${Object.entries(AppConfig.CATEGORIES).map(([k,v])=>`<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
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
            <div class="sub-plan">${sub.planName} · ${coverageBadge(t)}</div>
          </div>
          <div class="sub-usage">
            <div class="usage-val">${t === 'C' ? (sub.avgDailyMinutes ? `~${sub.avgDailyMinutes}분` : '추적 안 됨') : fmtMin(sm.avgDailyAdjustedMin)}</div>
            <div class="usage-lbl">일평균</div>
          </div>
          <div class="sub-price">
            <div class="price-val">${krw(AppCatalog.toMonthlyAmount(sub.price, sub.billingCycle))}/월</div>
            <div class="price-lbl">${sub.billingCycle === 'yearly' ? '연간 결제' : '월 결제'}</div>
          </div>
          <div class="sub-actions" style="flex-direction:column;align-items:flex-end;gap:4px">
            <span class="badge ${rl==='유지'?'badge-green':rl==='해지 검토'?'badge-red':rl==='다운그레이드 검토'?'badge-yellow':'badge-gray'}">${rl}</span>
            <div style="display:flex;gap:4px">
              <button class="btn btn-ghost btn-xs btn-usage"  data-id="${sub.id}" title="사용 시간 입력">⏱️</button>
              <button class="btn btn-ghost btn-xs btn-snooze" data-id="${sub.id}" title="알림 스누즈">😴</button>
              <button class="btn btn-ghost btn-xs btn-edit"   data-id="${sub.id}" title="수정">✏️</button>
              <button class="btn btn-danger btn-xs btn-del"   data-id="${sub.id}" title="삭제">🗑️</button>
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
      wrap.querySelectorAll('.btn-usage').forEach(btn => btn.addEventListener('click', () => openUsageModal(btn.dataset.id)));
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
          ${coverageBadge(tier)}
        </div>
      </div>`;

    // Self-benchmark
    if (sc?.selfBenchmark) {
      const sb = sc.selfBenchmark;
      hdr.innerHTML += `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding-top:12px;border-top:1px solid var(--c-border)">
        <div><div class="text-xs text-muted">시간당 비용</div><div class="font-bold">${sb.costPerHour ? krw(sb.costPerHour)+'/h' : '측정 안 됨'}</div></div>
        <div><div class="text-xs text-muted">미사용일</div><div class="font-bold">${tier==='C'?'측정 안 됨':sb.unusedDays+'일'}</div></div>
        <div><div class="text-xs text-muted">마지막 사용</div><div class="font-bold">${sb.lastUsedDate ? sb.daysSinceLastUse+'일 전' : (tier==='C'?'측정 안 됨':'없음')}</div></div>
        <div><div class="text-xs text-muted">결제까지</div><div class="font-bold">${sb.daysUntilBilling === 0 ? '오늘' : sb.daysUntilBilling > 0 ? 'D-'+sb.daysUntilBilling : 'D+'+Math.abs(sb.daysUntilBilling)}</div></div>
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
      // 사용자 친화적 판단 보류 메시지
      const holdMsg = coverageTier === 'C'
        ? '이 서비스는 아직 사용 시간 측정이 되지 않아 분석할 수 없어요. 기기를 연결하면 바로 분석이 시작됩니다.'
        : '아직 충분한 데이터가 모이지 않았어요. 조금 더 사용하면 분석이 가능합니다.';
      note.textContent = ri ? ri.recommendation.reason || holdMsg : holdMsg;
      scoreCard.appendChild(note);
    }
    container.appendChild(scoreCard);

    // Confidence 카드
    if (sc?.confidence) {
      const confGradeText = sc.confidence.grade === 'High'
        ? '분석 신뢰도가 높아요'
        : sc.confidence.grade === 'Medium'
          ? '데이터가 더 쌓이면 더 정확해져요'
          : '아직 데이터가 부족해요';
      const confCard = document.createElement('div');
      confCard.className = 'card';
      confCard.innerHTML = `<div class="card-header">
        <span class="card-title">📊 분석 신뢰도</span>
        <span class="badge ${sc.confidence.grade==='High'?'badge-green':sc.confidence.grade==='Medium'?'badge-yellow':'badge-gray'}">${confGradeText}</span>
      </div>
      <div class="confidence-row conf-${sc.confidence.grade}">
        <span class="text-xs text-muted" style="width:80px;flex-shrink:0">신뢰도</span>
        <div class="conf-bar-bg"><div class="conf-bar-fill" style="width:${Math.round(sc.confidence.value*100)}%"></div></div>
        <span class="text-xs" style="flex-shrink:0">${Math.round(sc.confidence.value*100)}%</span>
      </div>`;
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
      card.innerHTML += `<p class="text-xs text-muted" style="margin-bottom:10px">비교 그룹: ${fallbackDesc}</p>`;
      const myAvg = sm.avgDailyAdjustedMin;
      const myPct = sc?.userPercentile;
      // 사용자 친화적 워딩: "상위 X%"가 아니라 "비슷한 사용자 중 상위 X%에 해당해요"
      const topPctText = (canShowPercentile && myPct !== null)
        ? myPct <= 20
          ? `적극 활용 중이에요 (비슷한 사용자 상위 ${myPct}%)`
          : myPct <= 50
            ? `평균보다 많이 사용하고 있어요 (상위 ${myPct}%)`
            : myPct <= 80
              ? `평균 수준으로 사용하고 있어요 (상위 ${myPct}%)`
              : `사용량이 적은 편이에요 (상위 ${myPct}%)`
        : null;
      card.innerHTML += `<div style="display:grid;grid-template-columns:repeat(${topPctText?3:2},1fr);gap:10px;margin-bottom:10px">
        <div><div class="text-xs text-muted">내 일평균 사용</div><div class="font-bold">${fmtMin(myAvg)}</div></div>
        <div><div class="text-xs text-muted">비슷한 사용자 평균</div><div class="font-bold">${fmtMin(stats.p50)}</div></div>
        ${topPctText ? `<div><div class="text-xs text-muted">활용도</div><div class="font-bold text-accent text-xs" style="line-height:1.4">${topPctText}</div></div>` : ''}
      </div>`;

      // 이용률 (p75 기준)
      if (sc?.utilization !== null && sc?.utilization !== undefined) {
        const util = sc.utilization;
        const utilText = util >= 0.8 ? '충분히 활용하고 있어요' : util >= 0.5 ? '적당히 활용 중이에요' : '활용도가 낮은 편이에요';
        card.innerHTML += `<div class="text-sm"><span class="text-muted">활용도: </span>
          <strong>${utilText}</strong>
          <span class="text-xs text-muted"> (적극 사용자 대비 ${Math.round(util * 100)}%)</span></div>`;
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

  /* ─── 신규 서비스 큐레이션 카드 ─── */
  function renderCurationSection(container, subscriptions, catalog) {
    // 현재 구독 카테고리 기반으로 같이 쓸 수 있는 서비스 추천
    const CURATIONS = [
      { serviceId:'notion',     name:'Notion',      icon:'📝', category:'productivity', desc:'문서·데이터베이스 관리에 많이 쓰여요', tags:['notes','database','writing'] },
      { serviceId:'figma',      name:'Figma',        icon:'🎨', category:'design',       desc:'UI 디자인·프로토타이핑 도구예요',       tags:['design','prototyping'] },
      { serviceId:'linear',     name:'Linear',       icon:'📐', category:'productivity', desc:'개발팀 이슈 트래킹에 인기 있어요',     tags:['project','dev'] },
      { serviceId:'github_pro', name:'GitHub Pro',   icon:'💻', category:'dev',          desc:'코딩·오픈소스 작업에 필수예요',         tags:['code','dev'] },
      { serviceId:'spotify',    name:'Spotify',      icon:'🎵', category:'media',         desc:'음악 스트리밍 서비스예요',               tags:['music','streaming'] },
    ];

    const myServiceIds = new Set(subscriptions.map(s => s.serviceId));
    const myCategories = new Set(subscriptions.map(s => s.category));

    // 이미 구독 중이 아닌 서비스 중 내 카테고리와 겹치는 것만
    const suggestions = CURATIONS.filter(c =>
      !myServiceIds.has(c.serviceId) && myCategories.has(c.category)
    );
    if (!suggestions.length) return;

    const sec = document.createElement('div');
    sec.className = 'portfolio-section';
    sec.innerHTML = `<div class="portfolio-section-title">
      <span>💡 비슷한 사용자들이 함께 쓰는 서비스</span>
      <span class="text-xs text-muted" style="margin-left:auto;font-weight:400">큐레이션 · 제휴 관계 없음</span>
    </div>`;

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;';
    suggestions.forEach(s => {
      const card = document.createElement('div');
      card.className = 'card card-sm';
      card.style.cursor = 'default';
      card.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <span style="font-size:1.3rem">${s.icon}</span>
        <strong class="text-sm">${s.name}</strong>
        <span class="badge badge-gray text-xs" style="margin-left:auto">${s.category}</span>
      </div>
      <p class="text-xs text-muted">${s.desc}</p>`;
      grid.appendChild(card);
    });
    sec.appendChild(grid);
    container.appendChild(sec);
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
    card.innerHTML += `${ri.affiliateDisclosure && ri.affiliateDisclosure !== '제휴 관계 없음' ? `<p class="affiliate-note">⚠️ ${ri.affiliateDisclosure}</p>` : ''}`;
    container.appendChild(card);
  }

  /* ══════════════════════════════════════════
   * VIEW: INSIGHTS & 알림 센터 (§9.4)
   * ══════════════════════════════════════════ */
  registerView('insights', function (container) {
    const C = global._computed;
    const state = global._appState;
    if (!C) return;
    const { classified, coverageMap } = C;
    const ICONS = { billing_deadline:'⏰', price_increase_confirmed:'💰', saving_opportunity:'✂️', overlap_resolved:'🔗', info:'ℹ️' };
    const PCLASS = [null,'p1','p2','p3','p4','p5'];

    // 추적 안 됨 서비스 가이드 배너
    const untrackedSubs = (state?.subscriptions || []).filter(s => {
      const tier = coverageMap?.[s.serviceId]?.tier;
      return tier === 'C' && s.collectible !== false;
    });
    if (untrackedSubs.length > 0) {
      const guideBanner = document.createElement('div');
      guideBanner.style.cssText = 'background:rgba(91,127,255,0.08);border:1px solid rgba(91,127,255,0.2);border-radius:var(--r-md);padding:14px 16px;margin-bottom:18px;';
      guideBanner.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:1.2rem">📡</span>
          <strong style="font-size:0.9rem">사용 시간 추적을 시작해보세요</strong>
        </div>
        <p class="text-sm text-muted" style="margin-bottom:10px">
          <strong style="color:var(--c-text)">${untrackedSubs.length}개 서비스</strong>가 아직 추적되지 않고 있어요.
          추적이 시작되면 실제 사용 패턴을 바탕으로 더 정확한 분석이 가능합니다.
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
          ${untrackedSubs.slice(0,5).map(s => `<span class="badge badge-gray">${svcIcon(s.serviceId)} ${s.serviceName}</span>`).join('')}
        </div>
        <div style="font-size:0.8rem;color:var(--c-muted);line-height:1.6">
          <div>1️⃣ <strong>브라우저 확장</strong> — Chrome/Edge 확장을 설치하면 웹 서비스 자동 추적</div>
          <div>2️⃣ <strong>앱 연결</strong> — 모바일·데스크탑 앱에서 기기 연결 설정</div>
          <div>3️⃣ <strong>직접 입력</strong> — 사용 시간을 직접 기록하는 방식도 지원 예정</div>
        </div>
        <button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="AppUI.navigate('settings')">⚙️ 기기 설정으로 이동</button>`;
      container.appendChild(guideBanner);
    }

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

    // ── 프리미엄 여부 확인 (현재 데모: 항상 미구독) ──
    const isPremium = state.settings?.premium === true;

    if (!isPremium) {
      renderPortfolioLocked(container, state, C);
      return;
    }
    renderPortfolioFull(container, state, C);
  });

  /* ── 잠금 화면: 도메인 지식 기반 티저 ── */
  function renderPortfolioLocked(container, state, C) {
    const { analysis } = C;
    const subs = state.subscriptions;

    // 구독 포트폴리오 기반 인사이트 티저 생성 (실제 계산은 하되 블러 처리)
    const insights = [];

    // 1. 기능 중복 감지
    const aiSubs = subs.filter(s => s.category === 'ai');
    if (aiSubs.length >= 2) {
      insights.push({
        icon: '🔁',
        title: 'AI 구독 중복 감지',
        teaser: `${aiSubs.map(s=>s.serviceName).slice(0,2).join(', ')} 등 ${aiSubs.length}개의 AI 도구를 구독 중입니다. 기능 겹침을 분석해 드릴 수 있어요.`,
        blur: true,
        detail: `월 최대 ₩${Math.round(aiSubs.slice(1).reduce((s,sub)=>s+AppCatalog.toMonthlyAmount(sub.price,sub.billingCycle),0)).toLocaleString()} 절감 가능`,
      });
    }

    // 2. 저활용 고가 서비스
    const cancelItems = analysis.items.filter(r => r.recommendation.label === '해지 검토');
    if (cancelItems.length > 0) {
      insights.push({
        icon: '✂️',
        title: `${cancelItems.length}개 서비스 해지 검토`,
        teaser: `분석 결과 활용도가 낮은 구독이 발견되었습니다.`,
        blur: true,
        detail: `월 ${Math.round(analysis.summary.monthlySavingsKRW).toLocaleString()}원 / 연 ${Math.round(analysis.summary.monthlySavingsKRW*12).toLocaleString()}원 절감 가능`,
      });
    }

    // 3. 카테고리별 포트폴리오 구성
    const categories = [...new Set(subs.map(s => s.category))];
    insights.push({
      icon: '📊',
      title: '카테고리별 지출 분석',
      teaser: `${categories.length}개 카테고리에 걸쳐 구독 중입니다. 카테고리별 ROI를 분석해 드릴게요.`,
      blur: true,
      detail: `${categories.map(c => AppConfig.CATEGORIES[c]?.label || c).join(' · ')}`,
    });

    // 4. 요금제 전환 기회 (service-db 기반)
    const upgradeable = subs.filter(s => {
      const db = AppServiceDB.lookup(s.serviceId);
      return db && db.replacementHint <= 2;
    });
    if (upgradeable.length > 0) {
      insights.push({
        icon: '🔄',
        title: '요금제 전환 기회',
        teaser: `${upgradeable.length}개 서비스에서 더 적합한 요금제가 있을 수 있어요.`,
        blur: true,
        detail: '패밀리 플랜, 연간 플랜 절감 기회 포함',
      });
    }

    container.innerHTML = '';

    // 헤더
    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;padding:32px 20px 24px;';
    header.innerHTML = `
      <div style="font-size:2rem;margin-bottom:12px">🔒</div>
      <h2 style="font-size:1.25rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:8px">구독 최적화 분석</h2>
      <p class="text-muted text-sm" style="max-width:420px;margin:0 auto">
        내 구독 포트폴리오를 AI 도메인 지식과 결합해<br>
        최적화 인사이트를 제공합니다.
      </p>`;
    container.appendChild(header);

    // 티저 카드들 (블러 처리)
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-bottom:28px;';
    insights.forEach((ins, i) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.position = 'relative';
      card.style.overflow = 'hidden';
      card.innerHTML = `
        <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px">
          <span style="font-size:1.4rem;flex-shrink:0">${ins.icon}</span>
          <div>
            <div style="font-size:0.88rem;font-weight:700;margin-bottom:4px">${ins.title}</div>
            <div class="text-sm text-muted">${ins.teaser}</div>
          </div>
        </div>
        <div style="filter:blur(5px);background:rgba(91,127,255,0.08);border-radius:var(--r-sm);padding:8px 12px;font-size:0.82rem;font-weight:600;color:var(--c-accent);pointer-events:none">
          ${ins.detail}
        </div>
        ${i === 0 ? '<div style="position:absolute;top:10px;right:10px"><span class="badge badge-purple">인기</span></div>' : ''}`;
      grid.appendChild(card);
    });
    container.appendChild(grid);

    // 잠금 CTA
    const cta = document.createElement('div');
    cta.style.cssText = 'text-align:center;background:linear-gradient(135deg,rgba(91,127,255,0.1),rgba(155,125,255,0.07));border:1px solid rgba(91,127,255,0.2);border-radius:var(--r-lg);padding:36px 28px;';
    cta.innerHTML = `
      <div style="font-size:1.6rem;margin-bottom:12px">✨</div>
      <h3 style="font-size:1.1rem;font-weight:800;margin-bottom:8px">전체 분석 리포트 받기</h3>
      <p class="text-muted text-sm" style="max-width:380px;margin:0 auto 20px">
        ${subs.length}개 구독의 상세 분석 · 절감 기회 · 추천 포트폴리오를<br>
        도메인 전문 지식과 함께 제공합니다.
      </p>
      <div style="display:flex;align-items:baseline;justify-content:center;gap:8px;margin-bottom:20px">
        <span style="font-size:1.8rem;font-weight:900;background:var(--g-accent);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">월 990원</span>
        <span class="text-muted text-sm">/ 언제든지 해지 가능</span>
      </div>
      <button class="btn btn-primary" style="padding:13px 32px;font-size:0.95rem;font-weight:700;box-shadow:0 8px 24px rgba(91,127,255,0.3)" id="btn-premium-unlock">
        분석 리포트 잠금 해제하기 →
      </button>
      <p class="text-xs text-muted" style="margin-top:12px">
        현재 데모 버전입니다 · 결제 기능은 준비 중입니다
      </p>`;
    container.appendChild(cta);

    // 잠금 해제 버튼 — cta 내부에서 직접 바인딩
    cta.querySelector('#btn-premium-unlock').addEventListener('click', () => {
      if (!global._appState) return;
      global._appState.settings.premium = true;
      container.innerHTML = '';
      renderPortfolioFull(container, global._appState, global._computed);
    });
  }

  /* ── 포트폴리오 전체 뷰 (프리미엄 전용) ── */
  function renderPortfolioFull(container, state, C) {
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
          ${ri.affiliateDisclosure && ri.affiliateDisclosure !== '제휴 관계 없음' ? `<p class="affiliate-note">⚠️ ${ri.affiliateDisclosure}</p>` : ''}`;
        c.querySelector('.rec-card-header').addEventListener('click', () => navigate('detail', { serviceId: ri.serviceId }));
        sec.appendChild(c);
      });
      container.appendChild(sec);
    });

    // 신규 서비스 큐레이션 (비슷한 구독을 쓰는 사람들이 함께 쓰는 서비스)
    renderCurationSection(container, state.subscriptions, state.catalog);

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
        <p class="text-sm text-muted">${
          ri.scorecard?.coverageTier === 'C'
            ? '아직 사용 시간이 추적되지 않아 분석을 시작할 수 없어요.'
            : '사용 데이터가 아직 부족해요. 조금 더 써보면 분석이 가능합니다.'
        }</p>
        <p class="text-xs text-muted" style="margin-top:6px">
          <button class="btn btn-ghost btn-xs" onclick="AppUI.navigate('settings')">⚙️ 기기 연결 설정 →</button>
        </p>`;
        holdSec.appendChild(h);
      });
      container.appendChild(holdSec);
    }
  }  // end renderPortfolioFull

  /* ══════════════════════════════════════════
   * VIEW: SETTINGS (§9.6)
   * ══════════════════════════════════════════ */
  registerView('settings', function (container) {
    const state = global._appState;

    /* ── 트래킹 연결 가이드 (최상단) ── */
    const trackSec = document.createElement('div');
    trackSec.className = 'settings-section card';
    trackSec.innerHTML = `
      <div class="settings-title">📡 사용 시간 추적 연결하기</div>
      <p class="text-sm text-muted" style="margin-bottom:16px;line-height:1.7">
        구독 서비스를 얼마나 사용하는지 자동으로 측정하려면 아래 방법 중 하나를 선택하세요.<br>
        연결하지 않아도 앱은 사용할 수 있지만, <strong style="color:var(--c-text)">정확한 Value Score 산출은 추적이 필요합니다.</strong>
      </p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-bottom:20px">
        <div style="background:var(--c-surface2);border:1px solid var(--c-border);border-radius:var(--r-md);padding:16px">
          <div style="font-size:1.4rem;margin-bottom:8px">🌐</div>
          <div style="font-size:0.88rem;font-weight:700;margin-bottom:5px">브라우저 확장 <span style="font-size:0.65rem;background:rgba(245,166,35,0.15);color:var(--c-yellow);border:1px solid rgba(245,166,35,0.3);padding:1px 7px;border-radius:10px">준비 중</span></div>
          <div class="text-xs text-muted" style="line-height:1.6">Chrome/Edge 확장을 설치하면 웹 기반 서비스(ChatGPT, Notion 등)의 활성 탭 시간을 자동으로 측정합니다.</div>
        </div>
        <div style="background:var(--c-surface2);border:1px solid var(--c-border);border-radius:var(--r-md);padding:16px">
          <div style="font-size:1.4rem;margin-bottom:8px">📱</div>
          <div style="font-size:0.88rem;font-weight:700;margin-bottom:5px">모바일 앱 <span style="font-size:0.65rem;background:rgba(245,166,35,0.15);color:var(--c-yellow);border:1px solid rgba(245,166,35,0.3);padding:1px 7px;border-radius:10px">준비 중</span></div>
          <div class="text-xs text-muted" style="line-height:1.6">iOS/Android 앱을 통해 Netflix, Spotify 등 모바일 앱 사용 시간을 추적합니다.</div>
        </div>
        <div style="background:var(--c-surface2);border:1px solid rgba(46,204,138,0.3);border-radius:var(--r-md);padding:16px">
          <div style="font-size:1.4rem;margin-bottom:8px">✏️</div>
          <div style="font-size:0.88rem;font-weight:700;margin-bottom:5px">수동 입력 <span style="font-size:0.65rem;background:rgba(46,204,138,0.15);color:var(--c-green);border:1px solid rgba(46,204,138,0.3);padding:1px 7px;border-radius:10px">지금 가능</span></div>
          <div class="text-xs text-muted" style="line-height:1.6;margin-bottom:10px">구독 목록에서 오늘 사용한 시간을 직접 입력합니다. 자동 추적보다 정확도는 낮지만 바로 사용 가능합니다.</div>
          <button class="btn btn-secondary btn-sm" onclick="AppUI.navigate('subscriptions')">구독 목록으로 이동 →</button>
        </div>
      </div>
      <div style="background:rgba(91,127,255,0.06);border:1px solid rgba(91,127,255,0.15);border-radius:var(--r-sm);padding:10px 14px;font-size:0.78rem;color:var(--c-muted);line-height:1.6">
        💡 <strong style="color:var(--c-text)">지금 당장은?</strong>
        구독을 추가한 뒤 며칠간 수동으로 사용 시간을 기록하면, 2주 이상 쌓였을 때 Value Score가 자동으로 계산됩니다.
      </div>`;
    container.appendChild(trackSec);

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
    consentSec.innerHTML = '<div class="settings-title">🔒 개인정보 및 데이터 설정 <span class="text-xs text-muted" style="font-weight:400">(기본 꺼짐)</span></div>';
    const consentDefs = [
      {
        key: 'c1',
        label: '사용 시간 추적',
        desc: '각 구독 서비스를 얼마나 사용하는지 측정해요. 꺼두면 사용량 기반 분석이 모두 비활성화됩니다.',
      },
      {
        key: 'c2',
        label: '익명 비교 데이터 참여',
        desc: '내 사용 패턴을 익명으로 제공해 "비슷한 사용자와 비교" 기능을 쓸 수 있어요. 개인 정보는 포함되지 않습니다.',
      },
      {
        key: 'c3',
        label: '서비스 개선 데이터 제공',
        desc: '익명 통계가 서비스 리서치·개선에 활용될 수 있어요. 위 항목을 켜야 선택 가능합니다.',
      },
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
        <div>
          <div class="setting-label">주간 최대 알림 수</div>
          <div class="setting-desc">이 수를 초과하면 덜 중요한 알림은 앱 안에서만 보여요. 결제 임박 알림은 항상 표시됩니다.</div>
        </div>
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

  /* ─── 수동 사용 시간 입력 모달 ─── */
  function openUsageModal(subId) {
    const state = global._appState;
    const sub = state.subscriptions.find(s => s.id === subId);
    if (!sub) return;
    const TODAY = state.settings.today || AppDemoData.TODAY;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <span class="modal-title">${svcIcon(sub.serviceId)} ${sub.serviceName} — 사용 시간 입력</span>
          <button class="modal-close" id="uc-close">✕</button>
        </div>

        <!-- 모드 탭 -->
        <div style="display:flex;gap:6px;margin-bottom:16px;background:var(--c-surface2);padding:4px;border-radius:var(--r-sm)">
          <button class="uc-tab active-tab" data-mode="today"
            style="flex:1;padding:7px;border-radius:var(--r-xs);font-size:0.82rem;font-weight:600;background:var(--c-accent);color:#fff;border:none;cursor:pointer">
            오늘 사용 기록
          </button>
          <button class="uc-tab" data-mode="daily"
            style="flex:1;padding:7px;border-radius:var(--r-xs);font-size:0.82rem;font-weight:500;background:none;color:var(--c-muted);border:none;cursor:pointer">
            하루 평균 설정
          </button>
        </div>

        <!-- 오늘 모드 -->
        <div id="uc-mode-today">
          <p class="text-sm text-muted" style="margin-bottom:14px;line-height:1.6">
            오늘 이 서비스를 얼마나 사용하셨나요?
          </p>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <div class="form-group" style="flex:1;margin:0">
              <label class="form-label">시간 (h)</label>
              <input class="form-input" id="uc-hours" type="number" min="0" max="23" value="0" style="text-align:center">
            </div>
            <div style="padding-top:20px;color:var(--c-muted);font-weight:700">:</div>
            <div class="form-group" style="flex:1;margin:0">
              <label class="form-label">분 (m)</label>
              <input class="form-input" id="uc-mins" type="number" min="0" max="59" value="0" style="text-align:center">
            </div>
          </div>
          <div id="uc-preview" class="text-xs text-muted" style="margin-bottom:4px;min-height:16px"></div>
        </div>

        <!-- 하루 평균 모드 -->
        <div id="uc-mode-daily" style="display:none">
          <p class="text-sm text-muted" style="margin-bottom:14px;line-height:1.6">
            이 서비스를 하루에 평균 몇 분 정도 사용하시나요?<br>
            <span style="font-size:0.75rem">설정하면 오늘부터 이 값으로 기록됩니다.</span>
          </p>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <div class="form-group" style="flex:1;margin:0">
              <label class="form-label">하루 평균 사용 시간</label>
              <input class="form-input" id="uc-daily-mins" type="number" min="1" max="1440"
                style="text-align:center;font-size:1rem;font-weight:700">
            </div>
            <div style="padding-top:20px;color:var(--c-muted);font-size:0.8rem">분/일</div>
          </div>
          <div id="uc-daily-preview" class="text-xs text-muted" style="margin-bottom:4px;min-height:16px"></div>
        </div>

        <div class="form-actions" style="margin-top:14px">
          <button class="btn btn-secondary" id="uc-cancel">취소</button>
          <button class="btn btn-primary" id="uc-save">저장</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    let currentMode = 'today';

    // 탭 전환
    overlay.querySelectorAll('.uc-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        currentMode = tab.dataset.mode;
        overlay.querySelectorAll('.uc-tab').forEach(t => {
          t.style.background = t.dataset.mode === currentMode ? 'var(--c-accent)' : 'none';
          t.style.color = t.dataset.mode === currentMode ? '#fff' : 'var(--c-muted)';
          t.style.fontWeight = t.dataset.mode === currentMode ? '600' : '500';
        });
        overlay.querySelector('#uc-mode-today').style.display = currentMode === 'today' ? 'block' : 'none';
        overlay.querySelector('#uc-mode-daily').style.display = currentMode === 'daily' ? 'block' : 'none';
      });
    });

    const hoursInput = overlay.querySelector('#uc-hours');
    const minsInput    = overlay.querySelector('#uc-mins');
    const preview      = overlay.querySelector('#uc-preview');
    const dailyInput   = overlay.querySelector('#uc-daily-mins');
    const dailyPreview = overlay.querySelector('#uc-daily-preview');

    // 초기값 명시적 세팅 (innerHTML 변수 주입 없이 DOM 직접 세팅)
    hoursInput.value = '0';
    minsInput.value  = '0';
    dailyInput.value = String(sub.avgDailyMinutes || 30);

    function updatePreview() {
      const h = parseInt(hoursInput.value) || 0;
      const m = parseInt(minsInput.value) || 0;
      const total = h * 60 + m;
      if (total > 0 && sub.price > 0) {
        const monthly = AppCatalog.toMonthlyAmount(sub.price, sub.billingCycle);
        const costPerHour = (monthly / (total / 60)).toFixed(0);
        preview.textContent = `총 ${total}분 · 시간당 ₩${parseInt(costPerHour).toLocaleString()}`;
      } else {
        preview.textContent = total > 0 ? `총 ${total}분` : '';
      }
    }
    function updateDailyPreview() {
      const m = parseInt(dailyInput.value) || 0;
      if (m > 0 && sub.price > 0) {
        const monthly = AppCatalog.toMonthlyAmount(sub.price, sub.billingCycle);
        const costPerHour = (monthly / (m / 60)).toFixed(0);
        dailyPreview.textContent = `월 ${m * 30}분 · 시간당 ₩${parseInt(costPerHour).toLocaleString()}`;
      } else {
        dailyPreview.textContent = m > 0 ? `월 약 ${m * 30}분` : '';
      }
    }

    hoursInput.addEventListener('input', updatePreview);
    minsInput.addEventListener('input', updatePreview);
    dailyInput.addEventListener('input', updateDailyPreview);
    updateDailyPreview();

    overlay.querySelector('#uc-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#uc-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#uc-save').addEventListener('click', () => {
      if (currentMode === 'daily') {
        // 하루 평균 저장: subscription에 avgDailyMinutes 설정
        const dailyMins = parseInt(dailyInput.value) || 0;
        if (dailyMins <= 0) { alert('분을 입력해주세요.'); return; }
        const idx = state.subscriptions.findIndex(s => s.id === subId);
        if (idx >= 0) {
          state.subscriptions[idx].avgDailyMinutes = dailyMins;
          // 오늘 세션도 함께 생성
          const totalSec = dailyMins * 60;
          const startedAt = TODAY + 'T09:00:00Z';
          const endedAt = new Date(new Date(startedAt).getTime() + totalSec * 1000).toISOString().slice(0,16) + ':00Z';
          if (!state.sessions) state.sessions = [];
          state.sessions = state.sessions.filter(s =>
            !(s.serviceId === sub.serviceId && s.measurementMode === 'self_reported' && s.startedAt.startsWith(TODAY))
          );
          state.sessions.push({
            eventId: 'daily_' + sub.serviceId + '_' + Date.now(),
            serviceId: sub.serviceId, planId: sub.planId,
            deviceId: 'manual', platform: 'web_ext',
            startedAt, endedAt, tzOffsetMinutes: 540,
            activeSeconds: totalSec, measurementMode: 'self_reported', confidence: 0.5,
          });
        }
        AppStore.save(state);
        refreshApp();
        overlay.remove();
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:var(--c-surface);border:1px solid var(--c-green);border-radius:var(--r-md);padding:10px 20px;font-size:0.85rem;box-shadow:var(--shadow-md);z-index:9999;color:var(--c-green)';
        toast.textContent = `✅ ${sub.serviceName} 하루 평균 ${dailyMins}분으로 설정됨`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
        return;
      }

      // 오늘 모드
      const h = parseInt(hoursInput.value) || 0;
      const m = parseInt(minsInput.value) || 0;
      const totalSec = (h * 3600) + (m * 60);
      if (totalSec <= 0) { alert('사용 시간을 입력해주세요.'); return; }

      const startedAt = TODAY + 'T09:00:00Z';
      const endedAt   = new Date(new Date(startedAt).getTime() + totalSec * 1000).toISOString().slice(0,16) + ':00Z';
      const session = {
        eventId: 'manual_' + sub.serviceId + '_' + Date.now(),
        serviceId: sub.serviceId, planId: sub.planId,
        deviceId: 'manual', platform: 'web_ext',
        startedAt, endedAt, tzOffsetMinutes: 540,
        activeSeconds: totalSec, measurementMode: 'self_reported', confidence: 0.5,
      };
      if (!state.sessions) state.sessions = [];
      state.sessions = state.sessions.filter(s =>
        !(s.serviceId === sub.serviceId && s.measurementMode === 'self_reported' && s.startedAt.startsWith(TODAY))
      );
      state.sessions.push(session);
      AppStore.save(state);
      refreshApp();
      overlay.remove();
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:var(--c-surface);border:1px solid var(--c-green);border-radius:var(--r-md);padding:10px 20px;font-size:0.85rem;box-shadow:var(--shadow-md);z-index:9999;color:var(--c-green)';
      toast.textContent = `✅ ${sub.serviceName} ${h}시간 ${m}분 기록 완료`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    });
  }

  /* ─── OCR 결과 → 폼 자동 채우기 ─── */
  function applyOCRResult(overlay, result) {
    if (result.serviceName) {
      const nameInput = overlay.querySelector('[name="serviceName"]');
      if (nameInput) nameInput.value = result.serviceName;
    }
    if (result.price) {
      const priceInput = overlay.querySelector('[name="price"]');
      if (priceInput) priceInput.value = result.price;
    }
    if (result.billingCycle) {
      const cycleSelect = overlay.querySelector('[name="billingCycle"]');
      if (cycleSelect) cycleSelect.value = result.billingCycle;
    }
    if (result.nextBillingDate) {
      const dateInput = overlay.querySelector('[name="nextBillingDate"]');
      if (dateInput) dateInput.value = result.nextBillingDate;
    }
    if (result.category) {
      const catSelect = overlay.querySelector('[name="category"]');
      if (catSelect) catSelect.value = result.category;
    }
    // 신뢰도 안내
    const confPct = Math.round((result.confidence || 0) * 100);
    const note = overlay.querySelector('#ocr-note') || document.createElement('p');
    note.id = 'ocr-note';
    note.className = 'text-xs text-muted';
    note.style.marginBottom = '10px';
    note.textContent = `자동으로 채워진 항목을 확인해 주세요 (인식 정확도: ${confPct}%)`;
    overlay.querySelector('form')?.prepend(note);
  }

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
        ${!existing ? `<div style="background:var(--c-surface2);border:1px dashed var(--c-border);border-radius:var(--r-sm);padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
          <span style="font-size:1.1rem">📷</span>
          <div style="flex:1">
            <div class="text-sm font-bold">구독 화면에서 자동 불러오기</div>
            <div class="text-xs text-muted">결제 문자, 앱 구독 화면 캡처를 올리면 자동으로 채워줘요 (JPG·PNG·WEBP·HEIC)</div>
          </div>
          <label class="btn btn-secondary btn-sm" style="cursor:pointer">
            사진 올리기
            <input type="file" id="ocr-upload" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" style="display:none">
          </label>
        </div>` : ''}
        <form id="sub-form">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">서비스명 *</label>
              <input class="form-input" name="serviceName" required value="${existing?.serviceName||''}" placeholder="예: Netflix, Spotify" id="svc-name-input">
            </div>
            <div class="form-group">
              <label class="form-label">요금제명</label>
              <input class="form-input" name="planName" value="${existing?.planName||''}" placeholder="예: 스탠다드, Pro">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">가격 *</label>
              <div style="display:flex;gap:6px">
                <input class="form-input" name="priceRaw" type="number" required
                  value="${existing?.currency==='USD' ? (existing.price/1500).toFixed(2) : (existing?.price||'')}"
                  placeholder="금액 (0 = 무료)" style="flex:1" id="price-raw-input" min="0">
                <select class="form-select" name="currency" id="currency-select" style="width:80px">
                  <option value="KRW" ${(!existing||existing.currency==='KRW')?'selected':''}>KRW</option>
                  <option value="USD" ${existing?.currency==='USD'?'selected':''}>USD</option>
                </select>
              </div>
              <div id="price-preview" class="text-xs text-muted" style="margin-top:4px"></div>
              <label style="display:flex;align-items:center;gap:6px;margin-top:6px;cursor:pointer;font-size:0.78rem;color:var(--c-muted)">
                <input type="checkbox" id="free-plan-check" ${existing?.price===0?'checked':''}>
                무료 플랜으로 등록 (가격 0원)
              </label>
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
                ${Object.entries(AppConfig.CATEGORIES).map(([k,v])=>`<option value="${k}" ${existing?.category===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
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
              <option value="work"         ${existing?.purpose==='work'        ?'selected':''}>💼 업무</option>
              <option value="study"        ${existing?.purpose==='study'       ?'selected':''}>📚 학습</option>
              <option value="personal"     ${existing?.purpose==='personal'    ?'selected':''}>🏠 개인</option>
              <option value="side_project" ${existing?.purpose==='side_project'?'selected':''}>🚀 사이드 프로젝트</option>
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

    // OCR 이미지 업로드
    overlay.querySelector('#ocr-upload')?.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const allowed = ['image/jpeg','image/png','image/webp','image/heic','image/heif'];
      if (!allowed.includes(file.type) && !file.name.match(/\.(jpe?g|png|webp|heic|heif)$/i)) {
        alert('JPG, PNG, WEBP, HEIC 파일만 업로드할 수 있습니다.');
        return;
      }
      const result = await SubscriptionOCRProvider.extractFromImage(file);
      applyOCRResult(overlay, result);
    });

    // 통화 환산 미리보기 (1 USD = 1500 KRW)
    const USD_RATE = 1500;
    function updatePricePreview() {
      const raw = parseFloat(overlay.querySelector('#price-raw-input')?.value) || 0;
      const cur = overlay.querySelector('#currency-select')?.value;
      const preview = overlay.querySelector('#price-preview');
      const isFree = overlay.querySelector('#free-plan-check')?.checked;
      if (!preview) return;
      if (isFree) { preview.textContent = '무료 플랜 — 가격 분석에서 제외됩니다'; preview.style.color = 'var(--c-green)'; return; }
      if (!raw) { preview.textContent = ''; return; }
      if (cur === 'USD') {
        preview.textContent = `= ₩${Math.round(raw * USD_RATE).toLocaleString()} (1달러 = 1,500원 기준)`;
      } else {
        preview.textContent = `≈ $${(raw / USD_RATE).toFixed(2)}`;
      }
      preview.style.color = '';
    }
    // 무료 플랜 체크 시 가격 입력 비활성화
    overlay.querySelector('#free-plan-check')?.addEventListener('change', e => {
      const priceInput = overlay.querySelector('#price-raw-input');
      const currSelect = overlay.querySelector('#currency-select');
      if (e.target.checked) {
        priceInput.value = '0'; priceInput.disabled = true; currSelect.disabled = true;
      } else {
        priceInput.value = ''; priceInput.disabled = false; currSelect.disabled = false;
      }
      updatePricePreview();
    });
    // 초기 상태 적용
    if (existing?.price === 0) {
      overlay.querySelector('#price-raw-input').disabled = true;
      overlay.querySelector('#currency-select').disabled = true;
    }
    overlay.querySelector('#price-raw-input')?.addEventListener('input', updatePricePreview);
    overlay.querySelector('#currency-select')?.addEventListener('change', updatePricePreview);
    updatePricePreview();

    // 서비스명 자동완성 (service-db)
    overlay.querySelector('#svc-name-input')?.addEventListener('blur', e => {
      if (existing) return; // 수정 시에는 건드리지 않음
      const hint = AppServiceDB.autofill(e.target.value);
      if (!hint) return;
      const catSelect = overlay.querySelector('[name="category"]');
      if (catSelect && !catSelect.value) catSelect.value = hint.category;
      // 카테고리 자동 채움 안내
      const note = overlay.querySelector('#autofill-note') || document.createElement('p');
      note.id = 'autofill-note';
      note.className = 'text-xs text-muted';
      note.style.marginBottom = '8px';
      note.textContent = `카테고리가 "${AppConfig.CATEGORIES[hint.category]?.label || hint.category}"로 자동 설정되었습니다.`;
      overlay.querySelector('form')?.prepend(note);
    });

    overlay.querySelector('#sub-form').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const now = new Date().toISOString().slice(0, 10);
      const USD_RATE = 1500;
      const isFree   = overlay.querySelector('#free-plan-check')?.checked;
      const rawPrice = isFree ? 0 : (parseFloat(fd.get('priceRaw')) || 0);
      const currency = fd.get('currency') || 'KRW';
      const priceKRW = isFree ? 0 : (currency === 'USD' ? Math.round(rawPrice * USD_RATE) : Math.round(rawPrice));
      const data = {
        id:                  existing?.id || ('sub_' + Date.now()),
        serviceId:           existing?.serviceId || fd.get('serviceName').toLowerCase().replace(/\s+/g, '_'),
        planId:              existing?.planId    || (fd.get('serviceName').toLowerCase().replace(/\s+/g, '_') + '_plan'),
        serviceName:         fd.get('serviceName'),
        planName:            fd.get('planName') || 'Standard',
        price:               priceKRW,
        currency:            'KRW',   // 내부는 항상 KRW로 통일
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
   * VIEW: ONBOARDING — 첫 방문 서비스 선택
   * ══════════════════════════════════════════ */
  registerView('onboarding', function (container) {
    const USD_RATE = 1500;

    const QUICK_SERVICES = [
      { serviceId:'chatgpt',         name:'ChatGPT',          icon:'🤖', category:'ai',           defaultPrice:24000, currency:'KRW', hasFreePlan:true  },
      { serviceId:'claude',          name:'Claude',            icon:'🧠', category:'ai',           defaultPrice:28000, currency:'KRW', hasFreePlan:true  },
      { serviceId:'perplexity',      name:'Perplexity',        icon:'🔍', category:'ai',           defaultPrice:20000, currency:'KRW', hasFreePlan:true  },
      { serviceId:'gemini',          name:'Gemini',            icon:'✨', category:'ai',           defaultPrice:20,    currency:'USD', hasFreePlan:true  },
      { serviceId:'cursor',          name:'Cursor',            icon:'⌨️', category:'dev',          defaultPrice:20,    currency:'USD', hasFreePlan:true  },
      { serviceId:'github',          name:'GitHub Pro',        icon:'💻', category:'dev',          defaultPrice:4,     currency:'USD', hasFreePlan:true  },
      { serviceId:'figma',           name:'Figma',             icon:'🎨', category:'design',       defaultPrice:15,    currency:'USD', hasFreePlan:true  },
      { serviceId:'canva',           name:'Canva',             icon:'🖼️', category:'design',       defaultPrice:17000, currency:'KRW', hasFreePlan:true  },
      { serviceId:'adobe',           name:'Adobe CC',          icon:'📐', category:'design',       defaultPrice:74000, currency:'KRW', hasFreePlan:false },
      { serviceId:'notion',          name:'Notion',            icon:'📝', category:'productivity', defaultPrice:15000, currency:'KRW', hasFreePlan:true  },
      { serviceId:'slack',           name:'Slack',             icon:'💬', category:'productivity', defaultPrice:6,     currency:'USD', hasFreePlan:true  },
      { serviceId:'microsoft365',    name:'MS 365',            icon:'📊', category:'productivity', defaultPrice:9900,  currency:'KRW', hasFreePlan:false },
      { serviceId:'netflix',         name:'Netflix',           icon:'🎬', category:'media',        defaultPrice:17000, currency:'KRW', hasFreePlan:false },
      { serviceId:'youtube_premium', name:'YouTube Premium',   icon:'▶️', category:'media',        defaultPrice:14900, currency:'KRW', hasFreePlan:true  },
      { serviceId:'disney',          name:'Disney+',           icon:'🏰', category:'media',        defaultPrice:9900,  currency:'KRW', hasFreePlan:false },
      { serviceId:'spotify',         name:'Spotify',           icon:'🎵', category:'music',        defaultPrice:11990, currency:'KRW', hasFreePlan:true  },
      { serviceId:'melon',           name:'Melon',             icon:'🍈', category:'music',        defaultPrice:11000, currency:'KRW', hasFreePlan:false },
      { serviceId:'apple_music',     name:'Apple Music',       icon:'🎶', category:'music',        defaultPrice:11000, currency:'KRW', hasFreePlan:false },
      { serviceId:'xbox_gamepass',   name:'Xbox Game Pass',    icon:'🎮', category:'game',         defaultPrice:9900,  currency:'KRW', hasFreePlan:false },
      { serviceId:'playstation_plus',name:'PS Plus',           icon:'🕹️', category:'game',        defaultPrice:9900,  currency:'KRW', hasFreePlan:false },
      { serviceId:'coupang_wow',     name:'쿠팡 WOW',           icon:'🛒', category:'shopping',    defaultPrice:7890,  currency:'KRW', hasFreePlan:false },
      { serviceId:'baemin_club',     name:'배민클럽',             icon:'🛵', category:'delivery',   defaultPrice:3900,  currency:'KRW', hasFreePlan:false },
      { serviceId:'icloud',          name:'iCloud+',           icon:'☁️', category:'cloud',        defaultPrice:1200,  currency:'KRW', hasFreePlan:false },
      { serviceId:'google_one',      name:'Google One',        icon:'🗄️', category:'cloud',        defaultPrice:2400,  currency:'KRW', hasFreePlan:false },
    ];

    // ── 선택 상태 (Set으로 관리 → 중복 원천 차단) ──
    const selectedSet = new Set(); // serviceId 집합

    // ── Step 1: 서비스 선택 ──
    function showStep1() {
      container.innerHTML = '';

      const wrap = document.createElement('div');
      wrap.style.cssText = 'max-width:640px;margin:0 auto;padding:20px 0';
      container.appendChild(wrap);

      // 헤더
      const hdr = document.createElement('div');
      hdr.style.cssText = 'text-align:center;margin-bottom:24px';
      hdr.innerHTML = `
        <div style="font-size:2rem;margin-bottom:10px">👋</div>
        <h2 style="font-size:1.25rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:8px">지금 이런 거 이용하고 계신가요?</h2>
        <p class="text-muted text-sm">구독 중인 서비스를 골라주세요. 나중에 언제든 추가·수정할 수 있어요.</p>`;
      wrap.appendChild(hdr);

      // 그리드
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:24px';
      wrap.appendChild(grid);

      QUICK_SERVICES.forEach(svc => {
        const card = document.createElement('div');
        card.dataset.sid = svc.serviceId;
        card.style.cssText = 'background:var(--c-surface);border:2px solid var(--c-border);border-radius:var(--r-md);padding:14px 10px;text-align:center;cursor:pointer;transition:all 0.15s;user-select:none;';
        card.innerHTML = `
          <div style="font-size:1.6rem;margin-bottom:6px">${svc.icon}</div>
          <div style="font-size:0.78rem;font-weight:600;line-height:1.3">${svc.name}</div>
          <div style="font-size:0.65rem;color:var(--c-muted);margin-top:3px">${AppConfig.CATEGORIES[svc.category]?.label || svc.category}</div>`;

        function applyStyle() {
          const sel = selectedSet.has(svc.serviceId);
          card.style.borderColor = sel ? 'var(--c-accent)' : 'var(--c-border)';
          card.style.background  = sel ? 'rgba(91,127,255,0.1)' : 'var(--c-surface)';
          nextBtn.disabled = selectedSet.size === 0;
        }

        card.addEventListener('click', () => {
          if (selectedSet.has(svc.serviceId)) selectedSet.delete(svc.serviceId);
          else selectedSet.add(svc.serviceId);
          applyStyle();
        });

        grid.appendChild(card);
        // applyStyle은 nextBtn 생성 후 호출해야 하므로 나중에 일괄 처리
      });

      // 버튼 영역
      const btnWrap = document.createElement('div');
      btnWrap.style.cssText = 'text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px';
      btnWrap.innerHTML = `
        <button class="btn btn-primary" id="ob-next" style="width:220px;justify-content:center;padding:12px 24px" disabled>선택 완료 →</button>
        <button class="btn btn-ghost btn-sm" id="ob-skip">이 목록에 없어요, 직접 추가할게요</button>
        <button class="btn btn-ghost btn-sm" id="ob-demo">🧪 데모 데이터로 둘러보기</button>`;
      wrap.appendChild(btnWrap);

      const nextBtn = btnWrap.querySelector('#ob-next');

      // 카드 스타일 초기화 (nextBtn 생성 후)
      grid.querySelectorAll('[data-sid]').forEach(card => {
        const sid = card.dataset.sid;
        const sel = selectedSet.has(sid);
        card.style.borderColor = sel ? 'var(--c-accent)' : 'var(--c-border)';
        card.style.background  = sel ? 'rgba(91,127,255,0.1)' : 'var(--c-surface)';
      });
      nextBtn.disabled = selectedSet.size === 0;

      // 이벤트
      nextBtn.addEventListener('click', () => showStep2());
      btnWrap.querySelector('#ob-skip').addEventListener('click', () => {
        navigate('subscriptions');
        setTimeout(() => openSubModal(null), 100);
      });
      btnWrap.querySelector('#ob-demo').addEventListener('click', () => {
        global._appState = AppDemoData.generateDemoState();
        AppStore.save(global._appState);
        refreshApp();
        navigate('dashboard');
      });
    }

    // ── Step 2: 요금 확인 ──
    function showStep2() {
      // selectedSet에서 실제 svc 객체 목록 복원
      const selected = QUICK_SERVICES.filter(s => selectedSet.has(s.serviceId));

      container.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'max-width:560px;margin:0 auto;padding:20px 0';
      container.appendChild(wrap);

      // 헤더
      const hdr = document.createElement('div');
      hdr.style.cssText = 'text-align:center;margin-bottom:24px';
      hdr.innerHTML = `
        <h2 style="font-size:1.2rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:8px">선택한 서비스의 요금을 확인해주세요</h2>
        <p class="text-muted text-sm">기본 요금이 자동으로 채워졌어요. 무료 플랜이라면 체크해 주세요.</p>`;
      wrap.appendChild(hdr);

      // 서비스 목록
      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:20px';
      wrap.appendChild(list);

      // 가격 상태: { serviceId → { isFree, price } }
      const priceState = {};

      selected.forEach(svc => {
        const defaultKRW = svc.currency === 'USD'
          ? Math.round(svc.defaultPrice * USD_RATE)
          : svc.defaultPrice;
        const dbInfo = AppServiceDB?.autofill(svc.serviceId) || {};
        const hasFreePlan = svc.hasFreePlan === true;  // QUICK_SERVICES에서 직접

        priceState[svc.serviceId] = { isFree: false, price: defaultKRW };

        const row = document.createElement('div');
        row.style.cssText = 'background:var(--c-surface);border:1.5px solid var(--c-border);border-radius:var(--r-md);padding:12px 14px;transition:border-color 0.15s';

        // 서비스명 행
        const nameRow = document.createElement('div');
        nameRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px';
        nameRow.innerHTML = `
          <span style="font-size:1.3rem;flex-shrink:0">${svc.icon}</span>
          <span style="font-weight:700;font-size:0.9rem;flex:1">${svc.name}</span>
          ${hasFreePlan ? `<label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:0.74rem;color:var(--c-muted);white-space:nowrap">
            <input type="checkbox" class="free-chk" style="accent-color:var(--c-green)"> 무료 플랜
          </label>` : ''}`;
        row.appendChild(nameRow);

        // 가격 입력 행
        const priceWrap = document.createElement('div');
        priceWrap.className = 'price-wrap';
        priceWrap.style.cssText = 'display:flex;align-items:center;gap:8px';
        priceWrap.innerHTML = `
          <div style="flex:1;display:flex;align-items:center;gap:4px;background:var(--c-surface2);border-radius:var(--r-sm);padding:4px 10px">
            <span style="font-size:0.8rem;color:var(--c-muted)">₩</span>
            <input type="number" class="price-inp" value="${defaultKRW}" min="0"
              style="flex:1;background:none;border:none;outline:none;font-size:0.9rem;font-weight:600;color:var(--c-text);text-align:right;padding:4px 2px">
          </div>
          <span style="font-size:0.75rem;color:var(--c-muted);white-space:nowrap">원/월</span>`;
        row.appendChild(priceWrap);

        // 무료 배지 (숨김)
        const freeBadge = document.createElement('div');
        freeBadge.className = 'free-badge';
        freeBadge.style.cssText = 'display:none;align-items:center;gap:8px;padding:4px 0';
        freeBadge.innerHTML = `<span class="badge badge-green">무료 플랜</span><span style="font-size:0.74rem;color:var(--c-muted)">가격 분석에서 제외됩니다</span>`;
        row.appendChild(freeBadge);

        list.appendChild(row);

        // 무료 체크박스
        const chk = row.querySelector('.free-chk');
        if (chk) {
          chk.addEventListener('change', () => {
            priceState[svc.serviceId].isFree = chk.checked;
            const inp = row.querySelector('.price-inp');
            if (chk.checked) {
              priceWrap.style.display = 'none';
              freeBadge.style.display = 'flex';
              inp.value = '0';
              row.style.borderColor = 'rgba(46,204,138,0.4)';
            } else {
              priceWrap.style.display = 'flex';
              freeBadge.style.display = 'none';
              inp.value = String(defaultKRW);
              row.style.borderColor = 'var(--c-border)';
            }
          });
        }
      });

      // 안내
      const hint = document.createElement('div');
      hint.style.cssText = 'background:var(--c-surface2);border:1px dashed var(--c-border);border-radius:var(--r-md);padding:11px 14px;margin-bottom:20px;font-size:0.8rem;color:var(--c-muted)';
      hint.innerHTML = '💡 추가로 구독 중인 서비스가 있다면 나중에 <strong style="color:var(--c-text)">구독 목록 → 구독 추가</strong>에서 더 넣을 수 있어요.';
      wrap.appendChild(hint);

      // 버튼
      const btnWrap = document.createElement('div');
      btnWrap.style.cssText = 'display:flex;gap:10px;justify-content:center';
      btnWrap.innerHTML = `
        <button class="btn btn-ghost btn-sm" id="ob2-back">← 다시 선택</button>
        <button class="btn btn-primary" id="ob2-finish" style="padding:12px 28px;justify-content:center">분석 시작하기 🚀</button>`;
      wrap.appendChild(btnWrap);

      btnWrap.querySelector('#ob2-back').addEventListener('click', () => showStep1());

      btnWrap.querySelector('#ob2-finish').addEventListener('click', () => {
        const state = global._appState;
        const today = AppDemoData.TODAY;
        const nextDate = new Date(new Date(today+'T00:00:00Z').getTime() + 30*86400000).toISOString().slice(0,10);

        selected.forEach(svc => {
          const ps = priceState[svc.serviceId];
          const inp = list.querySelector(`[value]`); // fallback
          // 해당 서비스의 가격 입력 필드 정확히 찾기
          const rows = list.children;
          let price = ps.isFree ? 0 : (ps.price);
          // price-inp에서 실제 입력값 가져오기
          for (const row of rows) {
            const inp2 = row.querySelector('.price-inp');
            if (inp2 && !ps.isFree) {
              // 어떤 row인지 svc와 매칭 — 순서 기반
              break;
            }
          }
          // 정확한 방법: index 기반
          const idx = selected.indexOf(svc);
          const rowEl = list.children[idx];
          if (rowEl) {
            const inp3 = rowEl.querySelector('.price-inp');
            if (inp3 && !ps.isFree) price = parseInt(inp3.value) || 0;
          }

          const dbInfo = AppServiceDB?.autofill(svc.serviceId) || {};
          state.subscriptions.push({
            id: 'sub_' + svc.serviceId + '_' + Date.now(),
            serviceId:   svc.serviceId,
            planId:      svc.serviceId + '_plan',
            serviceName: svc.name,
            planName:    ps.isFree ? '무료' : '기본',
            price,
            currency:    'KRW',
            taxIncluded: true,
            billingCycle: 'monthly',
            nextBillingDate: nextDate,
            committedUntil: null,
            seats: 1,
            category:    svc.category,
            capabilityTags: dbInfo.capabilityTags || [],
            purpose:    'personal',
            importance: null,
            replacementDifficulty: null,
            collectible: true,
            keepUntil:  null,
            createdAt:  today,
            updatedAt:  today,
          });
        });
        AppStore.save(state);
        refreshApp();
        navigate('dashboard');
      });
    }

    showStep1();
  });

  /* ══════════════════════════════════════════
   * VIEW: CALENDAR — 결제 캘린더
   * ══════════════════════════════════════════ */
  registerView('calendar', function (container) {
    const state = global._appState;
    const C     = global._computed;
    if (!state) return;
    const TODAY = (C && C.TODAY) || AppDemoData.TODAY;

    let viewYear  = parseInt(TODAY.slice(0, 4));
    let viewMonth = parseInt(TODAY.slice(5, 7));
    const todayDay = parseInt(TODAY.slice(8, 10));

    const CAT_COLORS = {
      ai:           '#6c8fff', dev: '#2dd4bf', design: '#a78bfa',
      productivity: '#34d399', media: '#f87171', music: '#f59e0b',
      game: '#ec4899', shopping: '#10b981', delivery: '#f97316',
      cloud: '#60a5fa', education: '#8b5cf6', fitness: '#14b8a6',
      reading: '#fb923c', security: '#6366f1', finance: '#22c55e',
      other: '#fbbf24',
    };
    const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
    const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

    function renderCalendar() {
      container.innerHTML = '';

      // ── 구독 결제일 맵 생성 ──
      const billingMap = {}; // day → [sub, ...]
      state.subscriptions.forEach(sub => {
        if (!sub.nextBillingDate) return;
        const subDay = parseInt(sub.nextBillingDate.slice(8, 10));
        const daysInMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();
        const day = Math.min(subDay, daysInMonth);
        if (!billingMap[day]) billingMap[day] = [];
        billingMap[day].push(sub);
      });

      // ── 헤더 ──
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;';
      header.innerHTML = `
        <button class="btn btn-secondary btn-sm" id="cal-prev">← 이전</button>
        <span style="font-size:1.1rem;font-weight:800;letter-spacing:-0.02em">${viewYear}년 ${MONTH_NAMES[viewMonth-1]}</span>
        <button class="btn btn-secondary btn-sm" id="cal-next">다음 →</button>`;
      container.appendChild(header);
      header.querySelector('#cal-prev').addEventListener('click', () => {
        viewMonth--; if (viewMonth < 1) { viewMonth = 12; viewYear--; }
        renderCalendar();
      });
      header.querySelector('#cal-next').addEventListener('click', () => {
        viewMonth++; if (viewMonth > 12) { viewMonth = 1; viewYear++; }
        renderCalendar();
      });

      // ── 캘린더 카드 ──
      const calCard = document.createElement('div');
      calCard.className = 'card';
      calCard.style.padding = '16px';

      // 요일 헤더
      const dayHeader = document.createElement('div');
      dayHeader.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:6px;';
      DAY_LABELS.forEach((d, i) => {
        const cell = document.createElement('div');
        cell.style.cssText = `text-align:center;font-size:0.72rem;font-weight:700;padding:6px 0;color:${i===0?'var(--c-red)':i===6?'var(--c-accent)':'var(--c-muted)'};`;
        cell.textContent = d;
        dayHeader.appendChild(cell);
      });
      calCard.appendChild(dayHeader);

      // 날짜 그리드
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:3px;';

      const firstDay = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).getUTCDay();
      const daysInMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();
      const isCurrentMonth = (viewYear === parseInt(TODAY.slice(0,4)) && viewMonth === parseInt(TODAY.slice(5,7)));

      // 빈 칸
      for (let i = 0; i < firstDay; i++) {
        const blank = document.createElement('div');
        grid.appendChild(blank);
      }

      // 날짜 셀
      for (let day = 1; day <= daysInMonth; day++) {
        const subs = billingMap[day] || [];
        const isToday = isCurrentMonth && day === todayDay;
        const hasBilling = subs.length > 0;

        const cell = document.createElement('div');
        cell.style.cssText = `
          min-height:60px;border-radius:8px;padding:4px;
          border:1px solid ${hasBilling ? 'rgba(91,127,255,0.25)' : 'var(--c-border)'};
          background:${isToday ? 'rgba(91,127,255,0.08)' : hasBilling ? 'rgba(91,127,255,0.04)' : 'var(--c-surface2)'};
          cursor:${hasBilling ? 'pointer' : 'default'};
          transition:all 0.12s;
          position:relative;`;

        const dayNum = document.createElement('div');
        dayNum.style.cssText = `
          font-size:0.78rem;font-weight:${isToday||hasBilling?'800':'400'};
          color:${isToday?'var(--c-accent)':hasBilling?'var(--c-text)':'var(--c-text2)'};
          text-align:center;margin-bottom:3px;
          ${isToday?'background:var(--c-accent);color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 3px;':''}`;
        dayNum.textContent = day;
        cell.appendChild(dayNum);

        // 결제 서비스 아이콘들
        if (hasBilling) {
          const iconsWrap = document.createElement('div');
          iconsWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:2px;justify-content:center;';
          subs.slice(0, 3).forEach(sub => {
            const dot = document.createElement('div');
            const color = CAT_COLORS[sub.category] || CAT_COLORS.other;
            dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0;`;
            dot.title = sub.serviceName;
            iconsWrap.appendChild(dot);
          });
          if (subs.length > 3) {
            const more = document.createElement('span');
            more.style.cssText = 'font-size:0.55rem;color:var(--c-muted);line-height:6px;';
            more.textContent = '+' + (subs.length - 3);
            iconsWrap.appendChild(more);
          }
          cell.appendChild(iconsWrap);

          // 결제 금액 합계 표시
          const total = subs.reduce((s, sub) => s + AppCatalog.toMonthlyAmount(sub.price, sub.billingCycle), 0);
          if (total > 0) {
            const amtDiv = document.createElement('div');
            amtDiv.style.cssText = 'font-size:0.58rem;color:var(--c-accent);text-align:center;margin-top:2px;font-weight:600;';
            amtDiv.textContent = total >= 10000 ? '₩' + Math.round(total/1000) + 'k' : '₩' + total.toLocaleString();
            cell.appendChild(amtDiv);
          }

          // 클릭 시 해당 날짜 상세 팝업
          cell.addEventListener('click', () => showDayDetail(day, subs, container));
          cell.addEventListener('mouseenter', () => { cell.style.borderColor = 'var(--c-accent)'; });
          cell.addEventListener('mouseleave', () => { cell.style.borderColor = hasBilling ? 'rgba(91,127,255,0.25)' : 'var(--c-border)'; });
        }

        grid.appendChild(cell);
      }
      calCard.appendChild(grid);
      container.appendChild(calCard);

      // ── 결제 목록 ──
      const allBillings = Object.entries(billingMap)
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
        .flatMap(([day, subs]) => subs.map(sub => ({ day: parseInt(day), sub })));

      if (allBillings.length > 0) {
        const listCard = document.createElement('div');
        listCard.className = 'card';
        listCard.innerHTML = '<div class="card-header"><span class="card-title">📋 이번 달 결제 목록</span></div>';
        const list = document.createElement('div');
        list.className = 'billing-list';
        let total = 0;
        allBillings.forEach(({ day, sub }) => {
          const monthly = AppCatalog.toMonthlyAmount(sub.price, sub.billingCycle);
          if (!sub.price || sub.price > 0) total += monthly;
          const color = CAT_COLORS[sub.category] || CAT_COLORS.other;
          const row = document.createElement('div');
          row.className = 'billing-item';
          row.style.cursor = 'pointer';
          row.innerHTML = `
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></span>
            <span style="font-size:1rem;flex-shrink:0">${svcIcon(sub.serviceId)}</span>
            <span style="flex:1;font-weight:500;font-size:0.88rem">${sub.serviceName}</span>
            <span class="text-muted text-sm">${viewMonth}월 ${day}일</span>
            <span class="font-bold">${sub.price === 0 ? '<span class="badge badge-green" style="font-size:0.7rem">무료</span>' : krw(monthly)}</span>`;
          row.addEventListener('click', () => navigate('detail', { serviceId: sub.serviceId }));
          list.appendChild(row);
        });
        listCard.appendChild(list);
        if (total > 0) {
          const totalRow = document.createElement('div');
          totalRow.style.cssText = 'display:flex;justify-content:space-between;padding:10px 14px;border-top:1px solid var(--c-border);font-weight:700;margin-top:4px;';
          totalRow.innerHTML = `<span>이번 달 합계</span><span style="color:var(--c-green)">${krw(total)}</span>`;
          listCard.appendChild(totalRow);
        }
        container.appendChild(listCard);
      } else {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = '<div class="empty-icon">📅</div><p>이번 달 등록된 결제 일정이 없습니다.<br>구독을 추가하면 자동으로 표시됩니다.</p>';
        container.appendChild(empty);
      }

      // ── 범례 ──
      const legend = document.createElement('div');
      legend.className = 'card card-sm';
      legend.innerHTML = `<div class="text-xs text-muted" style="margin-bottom:8px;font-weight:600">카테고리</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          ${Object.entries(AppConfig.CATEGORIES).map(([k, v]) =>
            `<span style="display:inline-flex;align-items:center;gap:5px;font-size:0.74rem">
              <span style="width:8px;height:8px;border-radius:50%;background:${CAT_COLORS[k]||'#8892a4'};flex-shrink:0"></span>${v.label}
            </span>`).join('')}
        </div>`;
      container.appendChild(legend);
    }

    // ── 날짜 클릭 시 상세 ──
    function showDayDetail(day, subs, container) {
      // 기존 팝업 제거
      document.querySelector('.cal-day-popup')?.remove();
      const popup = document.createElement('div');
      popup.className = 'cal-day-popup';
      popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;';
      popup.innerHTML = `
        <div style="background:var(--c-surface);border:1px solid var(--c-border);border-radius:var(--r-lg);padding:20px;min-width:280px;max-width:400px;width:100%;box-shadow:var(--shadow-lg)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <strong>${viewMonth}월 ${day}일 결제</strong>
            <button style="background:none;border:none;cursor:pointer;color:var(--c-muted);font-size:1.1rem" id="popup-close">✕</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${subs.map(sub => `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--c-surface2);border-radius:var(--r-sm);cursor:pointer" data-sid="${sub.serviceId}">
                <span style="font-size:1.2rem">${svcIcon(sub.serviceId)}</span>
                <div style="flex:1">
                  <div style="font-size:0.88rem;font-weight:600">${sub.serviceName}</div>
                  <div style="font-size:0.72rem;color:var(--c-muted)">${sub.planName}</div>
                </div>
                <span style="font-weight:700;font-size:0.88rem">${sub.price===0?'<span class="badge badge-green">무료</span>':krw(AppCatalog.toMonthlyAmount(sub.price,sub.billingCycle))}</span>
              </div>`).join('')}
          </div>
        </div>`;
      document.body.appendChild(popup);
      popup.querySelector('#popup-close').addEventListener('click', () => popup.remove());
      popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
      popup.querySelectorAll('[data-sid]').forEach(el => {
        el.addEventListener('click', () => {
          popup.remove();
          navigate('detail', { serviceId: el.dataset.sid });
        });
      });
    }

    renderCalendar();
  });

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
    // ?fresh=1 또는 sessionStorage 'subvalue_fresh' 플래그 → 온보딩 강제 진입
    const urlParams = new URLSearchParams(window.location.search);
    const isFresh   = urlParams.get('fresh') === '1' || sessionStorage.getItem('subvalue_fresh') === '1';
    if (isFresh) {
      localStorage.removeItem('subvalue_app');
      sessionStorage.removeItem('subvalue_fresh');
      history.replaceState(null, '', window.location.pathname);
    }
    let state = AppStore.load();
    // 구독이 없으면 온보딩 뷰로 시작
    const startView = (!state.subscriptions || state.subscriptions.length === 0)
      ? 'onboarding' : 'dashboard';
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
    // 구독이 없으면 온보딩으로
    if (startView === 'onboarding') navigate('onboarding');
  }

  /* ══════════════════════════════════════════
   * Public API
   * ══════════════════════════════════════════ */
  global.AppUI = { initApp, navigate, refreshApp };

})(window);
