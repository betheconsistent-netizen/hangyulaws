/**
 * demo-data.js
 * 데모용 구독·기기·세션·카탈로그·변경이벤트·피어설문 데이터 생성기.
 * 13종 검증 케이스를 모두 포함.
 */
(function (global) {
  'use strict';

  /* ─────────────────────────────────────────
   * 헬퍼
   * ───────────────────────────────────────── */
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /** YYYY-MM-DD → Date (UTC 자정) */
  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  /** Date → YYYY-MM-DD */
  function fmtDate(d) {
    return d.toISOString().slice(0, 10);
  }

  /** 오늘 기준 n일 후 날짜 문자열 */
  function addDays(dateStr, n) {
    const d = parseDate(dateStr);
    d.setUTCDate(d.getUTCDate() + n);
    return fmtDate(d);
  }

  /** 오늘 날짜 (YYYY-MM-DD) — 고정 기준일: 2026-08-18 */
  const TODAY = '2026-08-18';
  const TODAY_MS = parseDate(TODAY).getTime();

  /** 기준일로부터 n일 전 날짜 문자열 */
  function daysAgo(n) {
    return fmtDate(new Date(TODAY_MS - n * 86400000));
  }

  /** ISO UTC 문자열 생성 (날짜 + 시·분) */
  function isoUTC(dateStr, hh, mm) {
    return `${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`;
  }

  /* ─────────────────────────────────────────
   * 1. CATALOG — CatalogService + CatalogPlan
   * ───────────────────────────────────────── */
  const CATALOG_SERVICES = [
    {
      serviceId: 'chatgpt',
      name: 'ChatGPT',
      vendor: 'OpenAI',
      category: 'ai',
      officialUrls: {
        pricing:   'https://openai.com/pricing',
        changelog: 'https://help.openai.com/en/articles/6825453',
        blog:      'https://openai.com/blog',
      },
      hasPublicRoadmap: false,
      // 케이스 12: 인상 이력 2건 → 예측 카드 미표시
      priceHistory: [
        { date: '2023-02-01', planId: 'chatgpt_plus', amount: 20000 },
        { date: '2024-05-01', planId: 'chatgpt_plus', amount: 24000 },
      ],
    },
    {
      serviceId: 'claude',
      name: 'Claude',
      vendor: 'Anthropic',
      category: 'ai',
      officialUrls: {
        pricing:   'https://www.anthropic.com/pricing',
        changelog: 'https://www.anthropic.com/news',
        blog:      'https://www.anthropic.com/news',
      },
      hasPublicRoadmap: false,
      // 인상 이력 3건 → 예측 표시 가능
      priceHistory: [
        { date: '2023-07-01', planId: 'claude_pro', amount: 22000 },
        { date: '2024-03-01', planId: 'claude_pro', amount: 25000 },
        { date: '2025-01-01', planId: 'claude_pro', amount: 28000 },
      ],
    },
    {
      serviceId: 'perplexity',
      name: 'Perplexity',
      vendor: 'Perplexity AI',
      category: 'ai',
      officialUrls: {
        pricing:   'https://www.perplexity.ai/pro',
        changelog: 'https://www.perplexity.ai/changelog',
        blog:      'https://www.perplexity.ai/blog',
      },
      hasPublicRoadmap: false,
      priceHistory: [
        { date: '2024-01-01', planId: 'perplexity_pro', amount: 20000 },
      ],
    },
    {
      serviceId: 'cursor',
      name: 'Cursor',
      vendor: 'Anysphere',
      category: 'dev',
      officialUrls: {
        pricing:   'https://cursor.com/pricing',
        changelog: 'https://cursor.com/changelog',
        blog:      'https://cursor.com/blog',
      },
      hasPublicRoadmap: true,
      priceHistory: [
        { date: '2024-06-01', planId: 'cursor_pro', amount: 22000 },
        { date: '2025-03-01', planId: 'cursor_pro', amount: 24000 },
        { date: '2026-01-01', planId: 'cursor_pro', amount: 27000 },
      ],
    },
    {
      serviceId: 'figma',
      name: 'Figma',
      vendor: 'Figma Inc.',
      category: 'design',
      officialUrls: {
        pricing:   'https://www.figma.com/pricing/',
        changelog: 'https://www.figma.com/release-notes/',
        blog:      'https://www.figma.com/blog/',
      },
      hasPublicRoadmap: false,
      priceHistory: [
        { date: '2023-09-01', planId: 'figma_pro', amount: 18000 },
        { date: '2025-02-01', planId: 'figma_pro', amount: 21000 },
        { date: '2026-02-01', planId: 'figma_pro', amount: 24000 },
      ],
    },
    {
      serviceId: 'notion',
      name: 'Notion',
      vendor: 'Notion Labs',
      category: 'productivity',
      officialUrls: {
        pricing:   'https://www.notion.so/pricing',
        changelog: 'https://www.notion.so/releases',
        blog:      'https://www.notion.so/blog',
      },
      hasPublicRoadmap: false,
      priceHistory: [
        { date: '2023-05-01', planId: 'notion_plus', amount: 11000 },
        { date: '2025-06-01', planId: 'notion_plus', amount: 13000 },
        { date: '2026-06-01', planId: 'notion_plus', amount: 15000 },
      ],
    },
    {
      serviceId: 'canva',
      name: 'Canva',
      vendor: 'Canva Pty Ltd',
      category: 'design',
      officialUrls: {
        pricing:   'https://www.canva.com/pricing/',
        changelog: 'https://www.canva.com/newsroom/',
        blog:      'https://www.canva.com/learn/',
      },
      hasPublicRoadmap: false,
      priceHistory: [
        { date: '2023-10-01', planId: 'canva_pro', amount: 14000 },
        { date: '2025-10-01', planId: 'canva_pro', amount: 17000 },
      ],
    },
    {
      serviceId: 'netflix',
      name: 'Netflix',
      vendor: 'Netflix Inc.',
      category: 'media',
      officialUrls: {
        pricing:   'https://www.netflix.com/kr/signup/planform',
        changelog: null,
        blog:      'https://about.netflix.com/ko',
      },
      hasPublicRoadmap: false,
      priceHistory: [
        { date: '2023-11-01', planId: 'netflix_standard', amount: 13500 },
        { date: '2024-11-01', planId: 'netflix_standard', amount: 15500 },
        { date: '2025-11-01', planId: 'netflix_standard', amount: 17000 },
      ],
    },
    {
      serviceId: 'adobe',
      name: 'Adobe CC',
      vendor: 'Adobe Inc.',
      category: 'design',
      officialUrls: {
        pricing:   'https://www.adobe.com/kr/creativecloud/plans.html',
        changelog: 'https://helpx.adobe.com/creative-cloud/release-note/cc-release-notes.html',
        blog:      'https://blog.adobe.com/',
      },
      hasPublicRoadmap: false,
      priceHistory: [
        { date: '2024-01-01', planId: 'adobe_cc_all', amount: 62000 },
        { date: '2025-01-01', planId: 'adobe_cc_all', amount: 68000 },
        { date: '2026-01-01', planId: 'adobe_cc_all', amount: 74000 },
      ],
    },
  ];

  const CATALOG_PLANS = [
    {
      planId: 'chatgpt_plus',
      serviceId: 'chatgpt',
      name: 'Plus',
      priceByRegion: { KR: { amount: 24000, currency: 'KRW', taxIncluded: true } },
      billingCycles: ['monthly'],
      seatMin: 1, seatMax: 1,
      capabilityTags: ['chat', 'research', 'image', 'code', 'writing'],
      quota: { unit: 'messages_per_day', limit: 80 },
      effectiveFrom: '2024-05-01', effectiveTo: null,
      sourceUrl: 'https://openai.com/pricing',
    },
    // ChatGPT Family 플랜 (케이스 9: 패밀리 플랜 신설)
    {
      planId: 'chatgpt_family',
      serviceId: 'chatgpt',
      name: 'Family',
      priceByRegion: { KR: { amount: 48000, currency: 'KRW', taxIncluded: true } },
      billingCycles: ['monthly'],
      seatMin: 2, seatMax: 5,
      capabilityTags: ['chat', 'research', 'image', 'code', 'writing'],
      quota: { unit: 'messages_per_day_per_seat', limit: 60 },
      effectiveFrom: '2026-07-01', effectiveTo: null,
      sourceUrl: 'https://openai.com/pricing',
    },
    {
      planId: 'claude_pro',
      serviceId: 'claude',
      name: 'Pro',
      priceByRegion: { KR: { amount: 28000, currency: 'KRW', taxIncluded: true } },
      billingCycles: ['monthly'],
      seatMin: 1, seatMax: 1,
      capabilityTags: ['chat', 'research', 'code', 'writing', 'analysis'],
      quota: null,
      effectiveFrom: '2025-01-01', effectiveTo: null,
      sourceUrl: 'https://www.anthropic.com/pricing',
    },
    {
      planId: 'perplexity_pro',
      serviceId: 'perplexity',
      name: 'Pro',
      priceByRegion: { KR: { amount: 20000, currency: 'KRW', taxIncluded: true } },
      billingCycles: ['monthly'],
      seatMin: 1, seatMax: 1,
      capabilityTags: ['chat', 'research', 'web_search'],
      quota: { unit: 'pro_searches_per_day', limit: 600 },
      effectiveFrom: '2024-01-01', effectiveTo: null,
      sourceUrl: 'https://www.perplexity.ai/pro',
    },
    {
      planId: 'cursor_pro',
      serviceId: 'cursor',
      name: 'Pro',
      priceByRegion: { KR: { amount: 27000, currency: 'KRW', taxIncluded: true } },
      billingCycles: ['monthly'],
      seatMin: 1, seatMax: 1,
      capabilityTags: ['code', 'ai_autocomplete', 'chat'],
      quota: { unit: 'requests_per_month', limit: 500 },
      effectiveFrom: '2026-01-01', effectiveTo: null,
      sourceUrl: 'https://cursor.com/pricing',
    },
    {
      planId: 'figma_pro',
      serviceId: 'figma',
      name: 'Professional',
      priceByRegion: { KR: { amount: 24000, currency: 'KRW', taxIncluded: true } },
      billingCycles: ['monthly'],
      seatMin: 1, seatMax: null,
      capabilityTags: ['design', 'prototyping', 'collaboration'],
      quota: null,
      effectiveFrom: '2026-02-01', effectiveTo: null,
      sourceUrl: 'https://www.figma.com/pricing/',
    },
    {
      planId: 'notion_plus',
      serviceId: 'notion',
      name: 'Plus',
      priceByRegion: { KR: { amount: 15000, currency: 'KRW', taxIncluded: true } },
      billingCycles: ['monthly'],
      seatMin: 1, seatMax: null,
      capabilityTags: ['notes', 'database', 'writing', 'collaboration'],
      quota: null,
      effectiveFrom: '2026-06-01', effectiveTo: null,
      sourceUrl: 'https://www.notion.so/pricing',
    },
    {
      planId: 'canva_pro',
      serviceId: 'canva',
      name: 'Pro',
      priceByRegion: { KR: { amount: 17000, currency: 'KRW', taxIncluded: true } },
      billingCycles: ['monthly'],
      seatMin: 1, seatMax: 1,
      capabilityTags: ['design', 'image', 'writing', 'template'],
      quota: null,
      effectiveFrom: '2025-10-01', effectiveTo: null,
      sourceUrl: 'https://www.canva.com/pricing/',
    },
    {
      planId: 'netflix_standard',
      serviceId: 'netflix',
      name: '스탠다드',
      priceByRegion: { KR: { amount: 17000, currency: 'KRW', taxIncluded: true } },
      billingCycles: ['monthly'],
      seatMin: 1, seatMax: 2,
      capabilityTags: ['video', 'streaming'],
      quota: null,
      effectiveFrom: '2025-11-01', effectiveTo: null,
      sourceUrl: 'https://www.netflix.com/kr/signup/planform',
    },
    // 케이스 1: Adobe CC — collectible:false
    {
      planId: 'adobe_cc_all',
      serviceId: 'adobe',
      name: 'All Apps',
      priceByRegion: { KR: { amount: 74000, currency: 'KRW', taxIncluded: true } },
      billingCycles: ['monthly', 'yearly'],
      seatMin: 1, seatMax: 1,
      capabilityTags: ['design', 'image', 'video', 'writing'],
      quota: null,
      effectiveFrom: '2026-01-01', effectiveTo: null,
      sourceUrl: 'https://www.adobe.com/kr/creativecloud/plans.html',
    },
  ];

  /* ─────────────────────────────────────────
   * 2. DEVICES
   * ───────────────────────────────────────── */
  const DEVICES = [
    {
      deviceId: 'dev_chrome_pc',
      label: 'Chrome (맥북)',
      platform: 'web_ext',
      collectorType: 'ext',
      connectedAt: daysAgo(45),
    },
    {
      deviceId: 'dev_android',
      label: 'Galaxy S24',
      platform: 'android',
      collectorType: 'android',
      connectedAt: daysAgo(30),
    },
    {
      deviceId: 'dev_desktop_app',
      label: 'Cursor 데스크탑',
      platform: 'desktop',
      collectorType: 'desktop',
      connectedAt: daysAgo(60),
    },
  ];

  /* ─────────────────────────────────────────
   * 3. SUBSCRIPTIONS
   * ───────────────────────────────────────── */
  const SUBSCRIPTIONS = [
    // 케이스 6: 고사용 → 유지
    {
      id: 'sub_chatgpt',
      serviceId: 'chatgpt',
      planId: 'chatgpt_plus',
      serviceName: 'ChatGPT',
      planName: 'Plus',
      price: 24000,
      currency: 'KRW',
      taxIncluded: true,
      billingCycle: 'monthly',
      nextBillingDate: addDays(TODAY, 7),  // D+7
      committedUntil: null,
      seats: 1,
      category: 'ai',
      capabilityTags: ['chat', 'research', 'image', 'code', 'writing'],
      purpose: 'work',
      importance: 5,
      replacementDifficulty: 4,
      collectible: true,
      keepUntil: null,
      createdAt: daysAgo(90),
      updatedAt: daysAgo(2),
    },
    // 케이스 5: 저사용 고가 → 해지 검토 후보
    {
      id: 'sub_claude',
      serviceId: 'claude',
      planId: 'claude_pro',
      serviceName: 'Claude',
      planName: 'Pro',
      price: 28000,
      currency: 'KRW',
      taxIncluded: true,
      billingCycle: 'monthly',
      nextBillingDate: addDays(TODAY, 3),  // D+3 (결제 임박)
      committedUntil: null,
      seats: 1,
      category: 'ai',
      capabilityTags: ['chat', 'research', 'code', 'writing', 'analysis'],
      purpose: 'work',
      importance: 3,
      replacementDifficulty: 2,
      collectible: true,
      keepUntil: null,
      createdAt: daysAgo(60),
      updatedAt: daysAgo(1),
    },
    // 케이스 4: ChatGPT와 capabilityTags 겹침 (chat, research)
    {
      id: 'sub_perplexity',
      serviceId: 'perplexity',
      planId: 'perplexity_pro',
      serviceName: 'Perplexity',
      planName: 'Pro',
      price: 20000,
      currency: 'KRW',
      taxIncluded: true,
      billingCycle: 'monthly',
      nextBillingDate: addDays(TODAY, 14),
      committedUntil: null,
      seats: 1,
      category: 'ai',
      capabilityTags: ['chat', 'research', 'web_search'],
      purpose: 'work',
      importance: 3,
      replacementDifficulty: 2,
      collectible: true,
      keepUntil: null,
      createdAt: daysAgo(45),
      updatedAt: daysAgo(5),
    },
    // 케이스 6 보완: Cursor — 고사용
    {
      id: 'sub_cursor',
      serviceId: 'cursor',
      planId: 'cursor_pro',
      serviceName: 'Cursor',
      planName: 'Pro',
      price: 27000,
      currency: 'KRW',
      taxIncluded: true,
      billingCycle: 'monthly',
      nextBillingDate: addDays(TODAY, 21),
      committedUntil: null,
      seats: 1,
      category: 'dev',
      capabilityTags: ['code', 'ai_autocomplete', 'chat'],
      purpose: 'work',
      importance: 5,
      replacementDifficulty: 5,
      collectible: true,
      keepUntil: null,
      createdAt: daysAgo(120),
      updatedAt: daysAgo(3),
    },
    {
      id: 'sub_figma',
      serviceId: 'figma',
      planId: 'figma_pro',
      serviceName: 'Figma',
      planName: 'Professional',
      price: 24000,
      currency: 'KRW',
      taxIncluded: true,
      billingCycle: 'monthly',
      nextBillingDate: addDays(TODAY, 10),
      committedUntil: null,
      seats: 1,
      category: 'design',
      capabilityTags: ['design', 'prototyping', 'collaboration'],
      purpose: 'work',
      importance: 4,
      replacementDifficulty: 4,
      collectible: true,
      keepUntil: null,
      createdAt: daysAgo(180),
      updatedAt: daysAgo(10),
    },
    {
      id: 'sub_notion',
      serviceId: 'notion',
      planId: 'notion_plus',
      serviceName: 'Notion',
      planName: 'Plus',
      price: 15000,
      currency: 'KRW',
      taxIncluded: true,
      billingCycle: 'monthly',
      nextBillingDate: addDays(TODAY, 18),
      committedUntil: null,
      seats: 1,
      category: 'productivity',
      capabilityTags: ['notes', 'database', 'writing', 'collaboration'],
      purpose: 'work',
      importance: 4,
      replacementDifficulty: 3,
      collectible: true,
      keepUntil: null,
      createdAt: daysAgo(200),
      updatedAt: daysAgo(7),
    },
    {
      id: 'sub_canva',
      serviceId: 'canva',
      planId: 'canva_pro',
      serviceName: 'Canva',
      planName: 'Pro',
      price: 17000,
      currency: 'KRW',
      taxIncluded: true,
      billingCycle: 'monthly',
      nextBillingDate: addDays(TODAY, 25),
      committedUntil: null,
      seats: 1,
      category: 'design',
      capabilityTags: ['design', 'image', 'writing', 'template'],
      purpose: 'personal',
      importance: 2,
      replacementDifficulty: 2,
      collectible: true,
      keepUntil: null,
      createdAt: daysAgo(150),
      updatedAt: daysAgo(20),
    },
    // 연간 결제 — 월 환산 테스트
    {
      id: 'sub_netflix',
      serviceId: 'netflix',
      planId: 'netflix_standard',
      serviceName: 'Netflix',
      planName: '스탠다드',
      price: 204000,   // 연간 선결제 (17000 × 12)
      currency: 'KRW',
      taxIncluded: true,
      billingCycle: 'yearly',
      nextBillingDate: addDays(TODAY, 180),
      committedUntil: addDays(TODAY, 180),
      seats: 1,
      category: 'media',
      capabilityTags: ['video', 'streaming'],
      purpose: 'personal',
      importance: 3,
      replacementDifficulty: 1,
      collectible: true,
      keepUntil: null,
      createdAt: daysAgo(185),
      updatedAt: daysAgo(185),
    },
    // 케이스 1: Adobe CC — collectible:false, 세션 없음 → 판단 보류
    {
      id: 'sub_adobe',
      serviceId: 'adobe',
      planId: 'adobe_cc_all',
      serviceName: 'Adobe CC',
      planName: 'All Apps',
      price: 74000,
      currency: 'KRW',
      taxIncluded: true,
      billingCycle: 'monthly',
      nextBillingDate: addDays(TODAY, 5),
      committedUntil: null,
      seats: 1,
      category: 'design',
      capabilityTags: ['design', 'image', 'video', 'writing'],
      purpose: 'work',
      importance: null,   // 사용자가 입력하지 않음
      replacementDifficulty: null,
      collectible: false,  // ★ 핵심: 수집기 측정 불가
      keepUntil: null,
      createdAt: daysAgo(365),
      updatedAt: daysAgo(30),
    },
  ];

  /* ─────────────────────────────────────────
   * 4. SESSIONS 생성 (30일치)
   * ───────────────────────────────────────── */

  /**
   * 단일 세션 레코드 생성
   */
  function makeSession(overrides) {
    return Object.assign({
      eventId: uuid(),
      serviceId: '',
      planId: '',
      deviceId: 'dev_chrome_pc',
      platform: 'web_ext',
      startedAt: '',
      endedAt: '',
      tzOffsetMinutes: 540,   // KST = UTC+9
      activeSeconds: 0,
      measurementMode: 'strict',
      confidence: 1.0,
    }, overrides);
  }

  const SESSIONS = [];

  /**
   * 요일별 사용 패턴 팩터 (0=일요일)
   * 주말(0,6)은 감소
   */
  const DAY_FACTOR = [0.5, 1.0, 1.0, 1.0, 0.9, 0.8, 0.4];

  /** 날짜 문자열로부터 요일 팩터 반환 */
  function dayFactor(dateStr) {
    const d = parseDate(dateStr);
    return DAY_FACTOR[d.getUTCDay()];
  }

  /** base±variance 범위에서 랜덤 초 반환 */
  function randSec(base, variance) {
    return Math.max(30, Math.round(base + (Math.random() - 0.5) * 2 * variance));
  }

  /* ── ChatGPT: 고사용 (케이스 6) ── */
  for (let i = 0; i < 30; i++) {
    const dateStr = daysAgo(30 - i);
    const factor = dayFactor(dateStr);
    if (factor < 0.45) continue;  // 일요일 휴식

    const sessions = Math.round(factor * 3);
    for (let s = 0; s < sessions; s++) {
      const hh = 9 + s * 3 + Math.floor(Math.random() * 2);
      const mm = Math.floor(Math.random() * 60);
      const durationSec = randSec(1800, 600) * factor;
      const startedAt = isoUTC(dateStr, hh, mm);
      const endMs = parseDate(dateStr).getTime() + hh * 3600000 + mm * 60000 + durationSec * 1000;
      const endedAt = new Date(endMs).toISOString().slice(0, 16) + ':00Z';
      SESSIONS.push(makeSession({
        serviceId: 'chatgpt', planId: 'chatgpt_plus',
        deviceId: 'dev_chrome_pc', platform: 'web_ext',
        startedAt, endedAt,
        activeSeconds: Math.round(durationSec),
        measurementMode: 'strict', confidence: 1.0,
      }));
    }
  }

  /* ── Claude: 저사용 (케이스 5 — 고가 저사용) ── */
  for (let i = 0; i < 30; i++) {
    const dateStr = daysAgo(30 - i);
    // 7일 중 2일만 사용, 세션당 10분
    if (i % 5 !== 0) continue;
    const hh = 14;
    const mm = 30;
    const durationSec = randSec(600, 200);
    const startedAt = isoUTC(dateStr, hh, mm);
    const endMs = parseDate(dateStr).getTime() + hh * 3600000 + mm * 60000 + durationSec * 1000;
    const endedAt = new Date(endMs).toISOString().slice(0, 16) + ':00Z';
    SESSIONS.push(makeSession({
      serviceId: 'claude', planId: 'claude_pro',
      deviceId: 'dev_chrome_pc', platform: 'web_ext',
      startedAt, endedAt,
      activeSeconds: durationSec,
      measurementMode: 'loose', confidence: 0.7,
    }));
  }

  /* ── Perplexity: 중간 사용 (케이스 4: ChatGPT와 같은 시간대 세션 → 케이스 2) ── */
  for (let i = 0; i < 30; i++) {
    const dateStr = daysAgo(30 - i);
    const factor = dayFactor(dateStr);
    if (factor < 0.7) continue;

    // PC 세션
    const hh = 10;
    const mm = 0;
    const durationSec = randSec(900, 300);
    const startedAt = isoUTC(dateStr, hh, mm);
    const endMs = parseDate(dateStr).getTime() + hh * 3600000 + mm * 60000 + durationSec * 1000;
    const endedAt = new Date(endMs).toISOString().slice(0, 16) + ':00Z';
    SESSIONS.push(makeSession({
      serviceId: 'perplexity', planId: 'perplexity_pro',
      deviceId: 'dev_chrome_pc', platform: 'web_ext',
      startedAt, endedAt,
      activeSeconds: durationSec,
      measurementMode: 'strict', confidence: 1.0,
    }));

    // 케이스 2: 같은 시간대 모바일 세션 (raw > adjusted 검증)
    const mobDuration = randSec(600, 200);
    SESSIONS.push(makeSession({
      serviceId: 'perplexity', planId: 'perplexity_pro',
      deviceId: 'dev_android', platform: 'android',
      startedAt,  // 동일 시작시각 → 겹침 발생
      endedAt: new Date(parseDate(dateStr).getTime() + hh * 3600000 + mm * 60000 + mobDuration * 1000).toISOString().slice(0, 16) + ':00Z',
      activeSeconds: mobDuration,
      measurementMode: 'loose', confidence: 0.8,
    }));
  }

  /* ── Cursor: 고사용 (케이스 6) ── */
  for (let i = 0; i < 30; i++) {
    const dateStr = daysAgo(30 - i);
    const factor = dayFactor(dateStr);
    if (factor < 0.35) continue;

    const hh = 9 + Math.floor(Math.random() * 4);
    const mm = Math.floor(Math.random() * 60);
    const durationSec = randSec(3600, 900) * factor;
    const startedAt = isoUTC(dateStr, hh, mm);
    const endMs = parseDate(dateStr).getTime() + hh * 3600000 + mm * 60000 + durationSec * 1000;
    const endedAt = new Date(endMs).toISOString().slice(0, 16) + ':00Z';
    SESSIONS.push(makeSession({
      serviceId: 'cursor', planId: 'cursor_pro',
      deviceId: 'dev_desktop_app', platform: 'desktop',
      startedAt, endedAt,
      activeSeconds: Math.round(durationSec),
      measurementMode: 'strict', confidence: 1.0,
    }));
  }

  /* ── Figma: 중간 사용 ── */
  for (let i = 0; i < 30; i++) {
    const dateStr = daysAgo(30 - i);
    const factor = dayFactor(dateStr);
    if (factor < 0.7) continue;

    const hh = 13;
    const mm = 0;
    const durationSec = randSec(1800, 600);
    const startedAt = isoUTC(dateStr, hh, mm);
    const endMs = parseDate(dateStr).getTime() + hh * 3600000 + mm * 60000 + durationSec * 1000;
    const endedAt = new Date(endMs).toISOString().slice(0, 16) + ':00Z';
    SESSIONS.push(makeSession({
      serviceId: 'figma', planId: 'figma_pro',
      deviceId: 'dev_chrome_pc', platform: 'web_ext',
      startedAt, endedAt,
      activeSeconds: durationSec,
      measurementMode: 'strict', confidence: 1.0,
    }));
  }

  /* ── Notion: 양호한 사용 ── */
  for (let i = 0; i < 30; i++) {
    const dateStr = daysAgo(30 - i);
    const factor = dayFactor(dateStr);
    if (factor < 0.5) continue;

    const hh = 8;
    const mm = 30;
    const durationSec = randSec(1200, 400);
    const startedAt = isoUTC(dateStr, hh, mm);
    const endMs = parseDate(dateStr).getTime() + hh * 3600000 + mm * 60000 + durationSec * 1000;
    const endedAt = new Date(endMs).toISOString().slice(0, 16) + ':00Z';
    SESSIONS.push(makeSession({
      serviceId: 'notion', planId: 'notion_plus',
      deviceId: 'dev_chrome_pc', platform: 'web_ext',
      startedAt, endedAt,
      activeSeconds: durationSec,
      measurementMode: 'strict', confidence: 1.0,
    }));
  }

  /* ── Canva: 낮은 사용 (케이스 5 보조) ── */
  for (let i = 0; i < 30; i++) {
    const dateStr = daysAgo(30 - i);
    if (i % 7 !== 0) continue;  // 주 1회
    const hh = 16;
    const mm = 0;
    const durationSec = randSec(900, 200);
    const startedAt = isoUTC(dateStr, hh, mm);
    const endMs = parseDate(dateStr).getTime() + hh * 3600000 + mm * 60000 + durationSec * 1000;
    const endedAt = new Date(endMs).toISOString().slice(0, 16) + ':00Z';
    SESSIONS.push(makeSession({
      serviceId: 'canva', planId: 'canva_pro',
      deviceId: 'dev_chrome_pc', platform: 'web_ext',
      startedAt, endedAt,
      activeSeconds: durationSec,
      measurementMode: 'strict', confidence: 1.0,
    }));
  }

  /* ── Netflix: 저녁 사용 패턴 ── */
  for (let i = 0; i < 30; i++) {
    const dateStr = daysAgo(30 - i);
    const factor = dayFactor(dateStr);
    // 주말 더 많이
    const useToday = factor < 0.5 ? Math.random() < 0.8 : Math.random() < 0.4;
    if (!useToday) continue;

    const hh = 20 + Math.floor(Math.random() * 3);
    const mm = Math.floor(Math.random() * 30);
    const durationSec = randSec(3600, 900);
    const startedAt = isoUTC(dateStr, hh, mm);
    const endMs = parseDate(dateStr).getTime() + hh * 3600000 + mm * 60000 + durationSec * 1000;
    const endedAt = new Date(endMs).toISOString().slice(0, 16) + ':00Z';
    SESSIONS.push(makeSession({
      serviceId: 'netflix', planId: 'netflix_standard',
      deviceId: 'dev_android', platform: 'android',
      startedAt, endedAt,
      activeSeconds: durationSec,
      measurementMode: 'loose', confidence: 0.8,
    }));
  }

  /* Adobe CC — 세션 없음 (collectible:false) ★ 케이스 1 */

  /* ── 케이스 자정 분할: KST 22:30 ~ 00:30 (UTC 13:30 ~ 15:30) — 자정 넘김 ── */
  // KST(+9) 기준: 22:30 시작 → 자정 넘어 다음 날 00:30 종료
  // UTC로는 당일 13:30 ~ 당일 15:30 이지만, KST로는 날짜가 바뀜
  SESSIONS.push(makeSession({
    eventId: 'midnight-split-test-session',
    serviceId: 'chatgpt', planId: 'chatgpt_plus',
    deviceId: 'dev_chrome_pc', platform: 'web_ext',
    startedAt: daysAgo(2) + 'T13:30:00Z',  // KST 22:30
    endedAt:   daysAgo(2) + 'T15:30:00Z',  // KST 00:30 다음날
    activeSeconds: 7200,   // 2h — KST 자정 분할로 2일로 나뉨
    measurementMode: 'strict', confidence: 1.0,
  }));

  /* ── 케이스 중복 eventId ── */
  const dupSession = makeSession({
    eventId: 'dup-event-id-12345',
    serviceId: 'notion', planId: 'notion_plus',
    deviceId: 'dev_chrome_pc', platform: 'web_ext',
    startedAt: isoUTC(daysAgo(5), 9, 0),
    endedAt:   isoUTC(daysAgo(5), 9, 30),
    activeSeconds: 1800,
    measurementMode: 'strict', confidence: 1.0,
  });
  SESSIONS.push(dupSession);
  SESSIONS.push(Object.assign({}, dupSession));  // 동일 eventId 중복

  /* ─────────────────────────────────────────
   * 5. CHANGE EVENTS
   * ───────────────────────────────────────── */
  const CHANGE_EVENTS = [
    // 케이스 7: auto_detected — 알림 없음, "확인 필요" 배지만
    {
      eventId: 'ce_perplexity_price_auto',
      serviceId: 'perplexity',
      planId: 'perplexity_pro',
      type: 'price_change',
      detectedAt: daysAgo(3),
      effectiveAt: null,
      before: { amount: 20000, currency: 'KRW' },
      after:  { amount: 23000, currency: 'KRW' },
      evidenceUrl: 'https://www.perplexity.ai/pro',
      verificationStatus: 'auto_detected',
      confidence: 0.7,
    },
    // 케이스 8: official_announced — 확정 배지 + 알림 발송
    {
      eventId: 'ce_claude_price_official',
      serviceId: 'claude',
      planId: 'claude_pro',
      type: 'price_change',
      detectedAt: daysAgo(10),
      effectiveAt: addDays(TODAY, 30),
      before: { amount: 28000, currency: 'KRW' },
      after:  { amount: 33000, currency: 'KRW' },
      evidenceUrl: 'https://www.anthropic.com/pricing',
      verificationStatus: 'official_announced',
      confidence: 1.0,
    },
    // 케이스 9: 패밀리 플랜 신설 (plan_added)
    {
      eventId: 'ce_chatgpt_family_added',
      serviceId: 'chatgpt',
      planId: 'chatgpt_family',
      type: 'plan_added',
      detectedAt: daysAgo(20),
      effectiveAt: daysAgo(15),
      before: null,
      after: { planId: 'chatgpt_family', name: 'Family', amount: 48000, seatMax: 5 },
      evidenceUrl: 'https://openai.com/pricing',
      verificationStatus: 'official_announced',
      confidence: 1.0,
    },
    // 케이스 10a: feature_added 10일차 — 관찰 미완 → 정보 카드만
    {
      eventId: 'ce_notion_ai_feature_early',
      serviceId: 'notion',
      planId: 'notion_plus',
      type: 'feature_added',
      detectedAt: daysAgo(10),
      effectiveAt: daysAgo(10),
      before: { features: [] },
      after:  { features: ['ai_writing', 'ai_summarize'] },
      // 이 기능은 canva와 겹칠 수 있는 writing 태그
      overlapsWithServiceId: 'canva',
      evidenceUrl: 'https://www.notion.so/releases',
      verificationStatus: 'official_announced',
      confidence: 1.0,
    },
    // 케이스 10b: feature_added 35일차 + 3조건 충족 → 해지 검토 추천 생성
    // Cursor에 chat/code AI 기능 추가 → Claude 사용량 감소 관찰
    {
      eventId: 'ce_cursor_ai_chat_added',
      serviceId: 'cursor',
      planId: 'cursor_pro',
      type: 'feature_added',
      detectedAt: daysAgo(35),
      effectiveAt: daysAgo(35),
      before: { features: ['code', 'ai_autocomplete'] },
      after:  { features: ['code', 'ai_autocomplete', 'chat', 'research'] },
      overlapsWithServiceId: 'claude',
      evidenceUrl: 'https://cursor.com/changelog',
      verificationStatus: 'official_announced',
      confidence: 1.0,
    },
    // Cursor 가격 인상 (공식 발표, 이력 3건 → 예측 가능)
    {
      eventId: 'ce_cursor_price_2026',
      serviceId: 'cursor',
      planId: 'cursor_pro',
      type: 'price_change',
      detectedAt: daysAgo(60),
      effectiveAt: daysAgo(60),
      before: { amount: 24000, currency: 'KRW' },
      after:  { amount: 27000, currency: 'KRW' },
      evidenceUrl: 'https://cursor.com/pricing',
      verificationStatus: 'official_announced',
      confidence: 1.0,
    },
  ];

  /* ─────────────────────────────────────────
   * 6. PEER REPORTS
   * ───────────────────────────────────────── */
  const PEER_REPORTS = [
    // ChatGPT — 충분한 표본
    {
      serviceId: 'chatgpt',
      planId: 'chatgpt_plus',
      segment: { occupation: '직장인', purpose: 'work' },
      churnReasons: [
        { reason: '가격 대비 가치 불만', count: 120 },
        { reason: '기능 업데이트 부족', count: 78 },
        { reason: '대체 서비스 발견', count: 65 },
      ],
      keepReasons: [
        { reason: '업무 생산성 향상', count: 245 },
        { reason: '플러그인·연동 편리', count: 180 },
        { reason: 'GPT-4o 품질', count: 156 },
      ],
      respondents: 412,
      totalChurned: 1580,
      satisfaction: { mean: 4.2, scale: 5, n: 412 },
      periodStart: '2026-01-01',
      periodEnd: '2026-07-31',
    },
    // Claude — 충분한 표본
    {
      serviceId: 'claude',
      planId: 'claude_pro',
      segment: { occupation: '직장인', purpose: 'work' },
      churnReasons: [
        { reason: '사용 빈도 낮음', count: 95 },
        { reason: 'ChatGPT로 대체', count: 87 },
      ],
      keepReasons: [
        { reason: '긴 컨텍스트 창', count: 142 },
        { reason: '코딩 품질', count: 98 },
      ],
      respondents: 312,
      totalChurned: 1204,
      satisfaction: { mean: 4.0, scale: 5, n: 312 },
      periodStart: '2026-01-01',
      periodEnd: '2026-07-31',
    },
    // 케이스 11: 응답률 낮은 PeerReport (15% → % 표시 억제)
    {
      serviceId: 'canva',
      planId: 'canva_pro',
      segment: null,
      churnReasons: [
        { reason: '무료 기능으로 충분', count: 42 },
        { reason: '사용 빈도 낮음', count: 38 },
      ],
      keepReasons: [
        { reason: '템플릿 다양성', count: 35 },
        { reason: '소셜미디어 제작 편의', count: 28 },
      ],
      respondents: 80,      // 응답자
      totalChurned: 533,    // 응답률 = 80/533 ≈ 0.15 (15%) → % 표시 억제
      satisfaction: { mean: 3.6, scale: 5, n: 80 },
      periodStart: '2026-01-01',
      periodEnd: '2026-07-31',
    },
    // Cursor — 충분한 표본
    {
      serviceId: 'cursor',
      planId: 'cursor_pro',
      segment: { occupation: '개발자', purpose: 'work' },
      churnReasons: [
        { reason: '가격 부담', count: 55 },
        { reason: '대안 IDE 플러그인으로 대체', count: 40 },
      ],
      keepReasons: [
        { reason: 'AI 코드 완성 품질', count: 280 },
        { reason: '워크플로우 통합', count: 210 },
        { reason: '탭 완성 속도', count: 175 },
      ],
      respondents: 520,
      totalChurned: 890,
      satisfaction: { mean: 4.5, scale: 5, n: 520 },
      periodStart: '2026-01-01',
      periodEnd: '2026-07-31',
    },
    // Netflix
    {
      serviceId: 'netflix',
      planId: 'netflix_standard',
      segment: null,
      churnReasons: [
        { reason: '콘텐츠 다양성 부족', count: 310 },
        { reason: '가격 인상', count: 280 },
      ],
      keepReasons: [
        { reason: '오리지널 콘텐츠', count: 420 },
        { reason: '가족 시청', count: 380 },
      ],
      respondents: 850,
      totalChurned: 2100,
      satisfaction: { mean: 3.8, scale: 5, n: 850 },
      periodStart: '2026-01-01',
      periodEnd: '2026-07-31',
    },
  ];

  /* ─────────────────────────────────────────
   * 7. 코호트 통계 (케이스 3: 표본 부족 포함)
   *    benchmark.js에서 사용할 mock 데이터
   * ───────────────────────────────────────── */
  // 데모에서 실제 기기 signature = 'android+desktop+ext' (3기기 모두 토글 on)
  // benchmark.js의 폴백 사다리: service+plan+coverage+purpose → service+plan+coverage → service+coverage
  const COHORT_STATS = [
    // ChatGPT — level1(purpose=work), level2(no purpose) 둘 다 준비
    {
      key: 'chatgpt|chatgpt_plus|android+desktop+ext|30d|work',
      n: 312,
      stats: { mean: 52.3, median: 45.0, p25: 22.0, p50: 45.0, p75: 75.0, p90: 110.0 },
    },
    {
      key: 'chatgpt|chatgpt_plus|android+desktop+ext|30d',
      n: 480,
      stats: { mean: 48.0, median: 42.0, p25: 20.0, p50: 42.0, p75: 70.0, p90: 105.0 },
    },
    // Claude — 충분한 표본
    {
      key: 'claude|claude_pro|android+desktop+ext|30d|work',
      n: 280,
      stats: { mean: 38.5, median: 32.0, p25: 15.0, p50: 32.0, p75: 55.0, p90: 85.0 },
    },
    {
      key: 'claude|claude_pro|android+desktop+ext|30d',
      n: 390,
      stats: { mean: 35.0, median: 30.0, p25: 14.0, p50: 30.0, p75: 52.0, p90: 80.0 },
    },
    // Perplexity — 충분한 표본
    {
      key: 'perplexity|perplexity_pro|android+desktop+ext|30d|work',
      n: 210,
      stats: { mean: 28.2, median: 22.0, p25: 10.0, p50: 22.0, p75: 40.0, p90: 65.0 },
    },
    // Cursor — 충분한 표본
    {
      key: 'cursor|cursor_pro|android+desktop+ext|30d|work',
      n: 380,
      stats: { mean: 195.0, median: 180.0, p25: 110.0, p50: 180.0, p75: 240.0, p90: 310.0 },
    },
    // 케이스 3: Canva — 표본 부족 (N=35 < MIN_N_AGGREGATE=50) — 모든 폴백도 부족
    {
      key: 'canva|canva_pro|android+desktop+ext|30d|personal',
      n: 35,   // ★ 최소 표본 미달
      stats: { mean: 18.0, median: 15.0, p25: 8.0, p50: 15.0, p75: 25.0, p90: 38.0 },
    },
    {
      key: 'canva|canva_pro|android+desktop+ext|30d',
      n: 40,   // ★ 폴백도 미달
      stats: { mean: 17.0, median: 14.0, p25: 7.0, p50: 14.0, p75: 23.0, p90: 36.0 },
    },
    {
      key: 'canva|*|android+desktop+ext|30d',
      n: 42,   // ★ 마지막 폴백도 미달 → 완전 미표시
      stats: { mean: 16.0, median: 13.0, p25: 6.0, p50: 13.0, p75: 22.0, p90: 34.0 },
    },
    // Figma
    {
      key: 'figma|figma_pro|android+desktop+ext|30d|work',
      n: 195,
      stats: { mean: 55.0, median: 48.0, p25: 25.0, p50: 48.0, p75: 78.0, p90: 115.0 },
    },
    // Notion
    {
      key: 'notion|notion_plus|android+desktop+ext|30d|work',
      n: 290,
      stats: { mean: 32.0, median: 28.0, p25: 14.0, p50: 28.0, p75: 48.0, p90: 72.0 },
    },
    // Netflix
    {
      key: 'netflix|netflix_standard|android+desktop+ext|30d|personal',
      n: 520,
      stats: { mean: 62.0, median: 55.0, p25: 30.0, p50: 55.0, p75: 90.0, p90: 130.0 },
    },
    // Adobe CC — collectible:false → 코호트 없음 (Tier C) — 의도적 미포함
  ];

  /* ─────────────────────────────────────────
   * 8. 알림 예산 초과 시나리오를 위한 추가 알림 후보
   *    (케이스 13): notify.js에서 처리
   * ───────────────────────────────────────── */
  // notify.js가 생성할 때 자동으로 MAX_PUSH_PER_WEEK 초과 여부를 판단

  /* ─────────────────────────────────────────
   * 9. PUBLIC API
   * ───────────────────────────────────────── */
  /**
   * 현재 날짜(TODAY) 기준의 완전한 데모 스테이트를 반환
   */
  function generateDemoState() {
    const base = global.AppStore.emptyState();
    base.subscriptions = SUBSCRIPTIONS.map(s => Object.assign({}, s));
    base.devices = DEVICES.map(d => Object.assign({}, d));
    base.sessions = SESSIONS.map(s => Object.assign({}, s));
    base.catalog = {
      services: CATALOG_SERVICES.map(s => Object.assign({}, s)),
      plans: CATALOG_PLANS.map(p => Object.assign({}, p)),
    };
    base.changeEvents = CHANGE_EVENTS.map(e => Object.assign({}, e));
    base.peerReports = PEER_REPORTS.map(r => Object.assign({}, r));
    base.cohortStats = COHORT_STATS.map(c => Object.assign({}, c));
    base.isDemo = true;
    base.settings.consents = { c1: true, c2: true, c3: false };
    // 기기 토글: 기본 전부 활성
    base.settings.deviceToggles = {};
    DEVICES.forEach(d => { base.settings.deviceToggles[d.deviceId] = true; });
    return base;
  }

  global.AppDemoData = {
    generateDemoState,
    TODAY,
    CATALOG_SERVICES,
    CATALOG_PLANS,
    SUBSCRIPTIONS,
    DEVICES,
    SESSIONS,
    CHANGE_EVENTS,
    PEER_REPORTS,
    COHORT_STATS,
  };

})(window);
