/**
 * service-db.js
 * 구독 서비스 도메인 지식 DB.
 * 서비스명/serviceId 매칭 → capabilityTags, category, 중요도·대체난이도 힌트 자동 제공.
 * v1.42: 한글 검색어, 요금제 데이터, 가격 데이터, 자동완성 검색 함수 추가.
 * 실서비스에서는 서버 카탈로그 API로 교체 가능.
 *
 * 데이터 출처: 각 서비스 공식 홈페이지, 앱스토어 설명 기반 정리.
 * Content was rephrased for compliance with licensing restrictions.
 */
(function (global) {
  'use strict';

  /**
   * serviceId 또는 서비스명 키워드 → 도메인 정보
   * koreanKeywords: 한글 검색어 배열 (일치 또는 포함)
   * plans: 요금제 배열 { id, name, priceKRW, billingCycle, description }
   *        priceKRW: 0 이면 무료, null 이면 가격 미확인
   */
  const SERVICE_DB = [
    // ── AI 도구 ──
    {
      ids: ['chatgpt','gpt','openai'],
      name: 'ChatGPT',
      icon: '🤖',
      category: 'ai',
      koreanKeywords: ['챗지피티','챗gpt','오픈ai','오픈에이아이','지피티'],
      tags: ['chat','research','image','code','writing','analysis'],
      importanceHint: 4, replacementHint: 3, hasFreePlan: true,
      plans: [
        { id: 'free',     name: 'Free',     priceKRW: 0,     billingCycle: 'monthly', description: '기본 기능 무료 제공' },
        { id: 'plus',     name: 'Plus',     priceKRW: 24000, billingCycle: 'monthly', description: 'GPT-4o, 우선 액세스' },
        { id: 'pro',      name: 'Pro',      priceKRW: 285000,billingCycle: 'monthly', description: 'o1 pro, 무제한 사용' },
        { id: 'business', name: 'Team',     priceKRW: 38000, billingCycle: 'monthly', description: '팀 협업, 관리자 콘솔' },
      ],
    },
    {
      ids: ['claude','anthropic'],
      name: 'Claude',
      icon: '🧠',
      category: 'ai',
      koreanKeywords: ['클로드','앤스로픽'],
      tags: ['chat','research','code','writing','analysis'],
      importanceHint: 3, replacementHint: 3, hasFreePlan: true,
      plans: [
        { id: 'free',  name: 'Free',  priceKRW: 0,     billingCycle: 'monthly', description: '기본 사용 무료' },
        { id: 'pro',   name: 'Pro',   priceKRW: 28000, billingCycle: 'monthly', description: 'Claude 3, 우선 액세스' },
        { id: 'team',  name: 'Team',  priceKRW: 38000, billingCycle: 'monthly', description: '팀 공유, 관리자 기능' },
      ],
    },
    {
      ids: ['perplexity'],
      name: 'Perplexity',
      icon: '🔍',
      category: 'ai',
      koreanKeywords: ['퍼플렉시티','퍼플렉'],
      tags: ['chat','research','web_search'],
      importanceHint: 3, replacementHint: 2, hasFreePlan: true,
      plans: [
        { id: 'free', name: 'Free',  priceKRW: 0,     billingCycle: 'monthly', description: '기본 검색 무료' },
        { id: 'pro',  name: 'Pro',   priceKRW: 28000, billingCycle: 'monthly', description: 'Pro 검색, 이미지 생성' },
      ],
    },
    {
      ids: ['gemini','bard'],
      name: 'Gemini',
      icon: '✨',
      category: 'ai',
      koreanKeywords: ['제미나이','구글ai','바드'],
      tags: ['chat','research','image','code','writing'],
      importanceHint: 3, replacementHint: 3, hasFreePlan: true,
      plans: [
        { id: 'free',     name: 'Free',           priceKRW: 0,     billingCycle: 'monthly', description: '기본 무료' },
        { id: 'advanced', name: 'Google One AI Premium', priceKRW: 30000, billingCycle: 'monthly', description: 'Gemini Advanced + 2TB 저장공간' },
      ],
    },
    {
      ids: ['copilot','github_copilot'],
      name: 'GitHub Copilot',
      icon: '🤖',
      category: 'dev',
      koreanKeywords: ['깃허브코파일럿','코파일럿','copilot'],
      tags: ['code','ai_autocomplete'],
      importanceHint: 5, replacementHint: 4, hasFreePlan: false,
      plans: [
        { id: 'individual', name: 'Individual', priceKRW: 15000, billingCycle: 'monthly', description: '개인 개발자용' },
        { id: 'business',   name: 'Business',   priceKRW: 28000, billingCycle: 'monthly', description: '기업 관리 기능' },
      ],
    },
    {
      ids: ['midjourney'],
      name: 'Midjourney',
      icon: '🎨',
      category: 'design',
      koreanKeywords: ['미드저니','미드졌니'],
      tags: ['image','ai_image'],
      importanceHint: 3, replacementHint: 3, hasFreePlan: false,
      plans: [
        { id: 'basic',    name: 'Basic',    priceKRW: 15000, billingCycle: 'monthly', description: '월 200장 생성' },
        { id: 'standard', name: 'Standard', priceKRW: 37000, billingCycle: 'monthly', description: '무제한 Relax 모드' },
        { id: 'pro',      name: 'Pro',      priceKRW: 75000, billingCycle: 'monthly', description: '무제한 Fast + Stealth' },
      ],
    },

    // ── 개발 ──
    {
      ids: ['cursor'],
      name: 'Cursor',
      icon: '⌨️',
      category: 'dev',
      koreanKeywords: ['커서','cursor ide','ai코딩'],
      tags: ['code','ai_autocomplete','chat'],
      importanceHint: 5, replacementHint: 4,
      plans: [
        { id: 'free',     name: 'Hobby',    priceKRW: 0,     billingCycle: 'monthly', description: '무료, 제한된 AI' },
        { id: 'pro',      name: 'Pro',      priceKRW: 30000, billingCycle: 'monthly', description: '무제한 AI 자동완성' },
        { id: 'business', name: 'Business', priceKRW: 60000, billingCycle: 'monthly', description: '팀 관리, 청구' },
      ],
    },
    {
      ids: ['github'],
      name: 'GitHub',
      icon: '💻',
      category: 'dev',
      koreanKeywords: ['깃허브','깃헙'],
      tags: ['code','collaboration','version_control'],
      importanceHint: 5, replacementHint: 5, hasFreePlan: true,
      plans: [
        { id: 'free',  name: 'Free',       priceKRW: 0,    billingCycle: 'monthly', description: '공개/비공개 리포' },
        { id: 'pro',   name: 'Pro',        priceKRW: 6000, billingCycle: 'monthly', description: '고급 기능, Insights' },
        { id: 'team',  name: 'Team',       priceKRW: 12000, billingCycle: 'monthly', description: '팀 협업 기능' },
      ],
    },
    {
      ids: ['jetbrains','intellij'],
      name: 'JetBrains',
      icon: '🧩',
      category: 'dev',
      koreanKeywords: ['젯브레인','인텔리제이','jetbrains'],
      tags: ['code','ide'],
      importanceHint: 4, replacementHint: 4, hasFreePlan: false,
      plans: [
        { id: 'individual', name: 'All Products (개인)', priceKRW: 39000, billingCycle: 'monthly', description: '전체 IDE 구독' },
        { id: 'single',     name: 'IntelliJ IDEA',       priceKRW: 25000, billingCycle: 'monthly', description: 'IntelliJ만 단독 구독' },
      ],
    },
    {
      ids: ['vercel'],
      name: 'Vercel',
      icon: '🚀',
      category: 'dev',
      koreanKeywords: ['버셀','버셀호스팅'],
      tags: ['code','deployment','hosting'],
      importanceHint: 4, replacementHint: 3, hasFreePlan: true,
      plans: [
        { id: 'hobby', name: 'Hobby',  priceKRW: 0,     billingCycle: 'monthly', description: '개인 무료 호스팅' },
        { id: 'pro',   name: 'Pro',    priceKRW: 30000, billingCycle: 'monthly', description: '상업적 사용, 팀 기능' },
      ],
    },
    {
      ids: ['linear'],
      name: 'Linear',
      icon: '📐',
      category: 'productivity',
      koreanKeywords: ['리니어','프로젝트관리'],
      tags: ['project','collaboration','dev'],
      importanceHint: 4, replacementHint: 3, hasFreePlan: true,
      plans: [
        { id: 'free',     name: 'Free',     priceKRW: 0,     billingCycle: 'monthly', description: '소규모 팀 무료' },
        { id: 'standard', name: 'Standard', priceKRW: 12000, billingCycle: 'monthly', description: '고급 분석, 우선순위' },
        { id: 'plus',     name: 'Plus',     priceKRW: 22000, billingCycle: 'monthly', description: '고급 워크플로' },
      ],
    },

    // ── 디자인 ──
    {
      ids: ['figma'],
      name: 'Figma',
      icon: '🎨',
      category: 'design',
      koreanKeywords: ['피그마','figma'],
      tags: ['design','prototyping','collaboration'],
      importanceHint: 5, replacementHint: 4, hasFreePlan: true,
      plans: [
        { id: 'free',         name: 'Free',             priceKRW: 0,     billingCycle: 'monthly', description: '3개 프로젝트 무료' },
        { id: 'professional', name: 'Professional',     priceKRW: 18000, billingCycle: 'monthly', description: '무제한 프로젝트' },
        { id: 'organization', name: 'Organization',     priceKRW: 57000, billingCycle: 'monthly', description: '브랜드 관리, SSO' },
      ],
    },
    {
      ids: ['adobe','creative_cloud','adobecc'],
      name: 'Adobe Creative Cloud',
      icon: '📐',
      category: 'design',
      koreanKeywords: ['어도비','어도브','크리에이티브클라우드','포토샵','일러스트레이터'],
      tags: ['design','image','video','writing'],
      importanceHint: 4, replacementHint: 5, hasFreePlan: false,
      plans: [
        { id: 'single_app',  name: '단일 앱',             priceKRW: 33000, billingCycle: 'monthly', description: 'Photoshop 등 1개 앱' },
        { id: 'all_apps',    name: 'Creative Cloud 전체', priceKRW: 74000, billingCycle: 'monthly', description: '전체 앱 무제한' },
        { id: 'photography', name: '사진 작가 플랜',       priceKRW: 14000, billingCycle: 'monthly', description: 'Photoshop + Lightroom' },
      ],
    },
    {
      ids: ['canva'],
      name: 'Canva',
      icon: '🖼️',
      category: 'design',
      koreanKeywords: ['캔바','canva'],
      tags: ['design','image','template'],
      importanceHint: 3, replacementHint: 2, hasFreePlan: true,
      plans: [
        { id: 'free', name: 'Free',  priceKRW: 0,     billingCycle: 'monthly', description: '기본 무료' },
        { id: 'pro',  name: 'Pro',   priceKRW: 17000, billingCycle: 'monthly', description: '프리미엄 템플릿·자산' },
        { id: 'team', name: 'Teams', priceKRW: 22000, billingCycle: 'monthly', description: '팀 브랜드 관리' },
      ],
    },

    // ── 생산성 ──
    {
      ids: ['notion'],
      name: 'Notion',
      icon: '📝',
      category: 'productivity',
      koreanKeywords: ['노션','notion'],
      tags: ['notes','database','writing','collaboration'],
      importanceHint: 4, replacementHint: 3, hasFreePlan: true,
      plans: [
        { id: 'free',     name: 'Free',     priceKRW: 0,     billingCycle: 'monthly', description: '개인 무료' },
        { id: 'plus',     name: 'Plus',     priceKRW: 15000, billingCycle: 'monthly', description: '무제한 블록, 게스트' },
        { id: 'business', name: 'Business', priceKRW: 22000, billingCycle: 'monthly', description: 'SAML SSO, 감사 로그' },
      ],
    },
    {
      ids: ['slack'],
      name: 'Slack',
      icon: '💬',
      category: 'productivity',
      koreanKeywords: ['슬랙','slack'],
      tags: ['collaboration','messaging','team'],
      importanceHint: 5, replacementHint: 4, hasFreePlan: true,
      plans: [
        { id: 'free',  name: 'Free',  priceKRW: 0,    billingCycle: 'monthly', description: '90일 메시지 무료' },
        { id: 'pro',   name: 'Pro',   priceKRW: 9000, billingCycle: 'monthly', description: '무제한 메시지, 앱 연동' },
        { id: 'business', name: 'Business+', priceKRW: 15000, billingCycle: 'monthly', description: 'SSO, 규정 준수' },
      ],
    },
    {
      ids: ['microsoft365','office365','ms365'],
      name: 'Microsoft 365',
      icon: '📊',
      category: 'productivity',
      koreanKeywords: ['마이크로소프트365','ms365','오피스365','워드','엑셀','파워포인트'],
      tags: ['writing','spreadsheet','presentation','email'],
      importanceHint: 5, replacementHint: 4, hasFreePlan: false,
      plans: [
        { id: 'personal', name: 'Personal', priceKRW: 9900,  billingCycle: 'monthly', description: '1인용, 1TB OneDrive' },
        { id: 'family',   name: 'Family',   priceKRW: 14900, billingCycle: 'monthly', description: '최대 6인, 각 1TB' },
        { id: 'business', name: 'Business Basic', priceKRW: 6000, billingCycle: 'monthly', description: '웹용 앱, Teams' },
      ],
    },
    {
      ids: ['zoom'],
      name: 'Zoom',
      icon: '📹',
      category: 'productivity',
      koreanKeywords: ['줌','화상회의','zoom'],
      tags: ['video_call','collaboration','meeting'],
      importanceHint: 4, replacementHint: 3, hasFreePlan: true,
      plans: [
        { id: 'free',  name: 'Basic', priceKRW: 0,     billingCycle: 'monthly', description: '40분 무료 회의' },
        { id: 'pro',   name: 'Pro',   priceKRW: 20000, billingCycle: 'monthly', description: '무제한 회의 시간' },
        { id: 'business', name: 'Business', priceKRW: 28000, billingCycle: 'monthly', description: '소규모 기업용' },
      ],
    },

    // ── 영상 스트리밍 ──
    {
      ids: ['netflix'],
      name: 'Netflix',
      icon: '🎬',
      category: 'media',
      koreanKeywords: ['넷플릭스','넷플','netflix'],
      tags: ['video','streaming','original_content'],
      importanceHint: 3, replacementHint: 2, hasFreePlan: false,
      plans: [
        { id: 'ads',      name: '광고형 스탠다드', priceKRW: 5500,  billingCycle: 'monthly', description: 'FHD, 광고 포함, 동시 2기기' },
        { id: 'standard', name: '스탠다드',        priceKRW: 13500, billingCycle: 'monthly', description: 'FHD, 광고 없음, 동시 2기기' },
        { id: 'premium',  name: '프리미엄',         priceKRW: 17000, billingCycle: 'monthly', description: '4K UHD, 동시 4기기' },
      ],
    },
    {
      ids: ['disney','disneyplus','disney+'],
      name: 'Disney+',
      icon: '🏰',
      category: 'media',
      koreanKeywords: ['디즈니플러스','디즈니+','디즈니','disney+'],
      tags: ['video','streaming','family','original_content'],
      importanceHint: 3, replacementHint: 2, hasFreePlan: false,
      plans: [
        { id: 'standard', name: 'Standard', priceKRW: 9900,  billingCycle: 'monthly', description: '광고 포함' },
        { id: 'premium',  name: 'Premium',  priceKRW: 13900, billingCycle: 'monthly', description: '광고 없음, 4K' },
      ],
    },
    {
      ids: ['wavve'],
      name: 'Wavve',
      icon: '🌊',
      category: 'media',
      koreanKeywords: ['웨이브','wavve'],
      tags: ['video','streaming','korean_content'],
      importanceHint: 2, replacementHint: 2, hasFreePlan: false,
      plans: [
        { id: 'basic',    name: 'BASIC',    priceKRW: 7900,  billingCycle: 'monthly', description: 'SD 화질' },
        { id: 'standard', name: 'STANDARD', priceKRW: 10900, billingCycle: 'monthly', description: 'FHD 화질' },
        { id: 'premium',  name: 'PREMIUM',  priceKRW: 13900, billingCycle: 'monthly', description: '4K, 동시 4기기' },
      ],
    },
    {
      ids: ['tving'],
      name: 'Tving',
      icon: '📺',
      category: 'media',
      koreanKeywords: ['티빙','tving'],
      tags: ['video','streaming','korean_content'],
      importanceHint: 2, replacementHint: 2, hasFreePlan: false,
      plans: [
        { id: 'lite',     name: 'LITE',     priceKRW: 5500,  billingCycle: 'monthly', description: '광고 포함' },
        { id: 'standard', name: 'STANDARD', priceKRW: 10900, billingCycle: 'monthly', description: '광고 없음, FHD' },
        { id: 'premium',  name: 'PREMIUM',  priceKRW: 13900, billingCycle: 'monthly', description: '4K, 최대 4기기' },
      ],
    },
    {
      ids: ['youtube_premium','ytpremium'],
      name: 'YouTube Premium',
      icon: '▶️',
      category: 'media',
      koreanKeywords: ['유튜브프리미엄','유튜브','유튜프','youtube premium'],
      tags: ['video','streaming','music','no_ads'],
      importanceHint: 4, replacementHint: 3, hasFreePlan: true,
      plans: [
        { id: 'individual', name: '개인',     priceKRW: 14900, billingCycle: 'monthly', description: '광고 없음, 오프라인 재생' },
        { id: 'family',     name: '가족',     priceKRW: 22900, billingCycle: 'monthly', description: '최대 6인 가족 공유' },
      ],
    },
    {
      ids: ['watcha'],
      name: 'Watcha',
      icon: '🍿',
      category: 'media',
      koreanKeywords: ['왓챠','watcha'],
      tags: ['video','streaming'],
      importanceHint: 2, replacementHint: 2, hasFreePlan: false,
      plans: [
        { id: 'standard', name: 'Standard', priceKRW: 7900,  billingCycle: 'monthly', description: '기본 스트리밍' },
        { id: 'premium',  name: 'Premium',  priceKRW: 12900, billingCycle: 'monthly', description: '4K UHD, 동시 4기기' },
      ],
    },
    {
      ids: ['coupang_play','coupangplay'],
      name: 'Coupang Play',
      icon: '▶️',
      category: 'media',
      koreanKeywords: ['쿠팡플레이','쿠플'],
      tags: ['video','streaming','korean_content'],
      importanceHint: 2, replacementHint: 2, hasFreePlan: false,
      plans: [
        { id: 'standard', name: 'Standard', priceKRW: 7900, billingCycle: 'monthly', description: '로켓 WOW 회원 포함' },
      ],
    },

    // ── 음악 ──
    {
      ids: ['spotify'],
      name: 'Spotify',
      icon: '🎵',
      category: 'music',
      koreanKeywords: ['스포티파이','spotify'],
      tags: ['music','streaming','podcast'],
      importanceHint: 3, replacementHint: 3, hasFreePlan: true,
      plans: [
        { id: 'free',       name: 'Free',       priceKRW: 0,     billingCycle: 'monthly', description: '광고 포함 무료' },
        { id: 'individual', name: 'Individual', priceKRW: 11990, billingCycle: 'monthly', description: '광고 없음, 오프라인' },
        { id: 'duo',        name: 'Duo',        priceKRW: 14950, billingCycle: 'monthly', description: '2인 공유' },
        { id: 'family',     name: 'Family',     priceKRW: 17990, billingCycle: 'monthly', description: '최대 6인 가족' },
        { id: 'student',    name: 'Student',    priceKRW: 5995,  billingCycle: 'monthly', description: '학생 할인' },
      ],
    },
    {
      ids: ['melon'],
      name: 'Melon',
      icon: '🍈',
      category: 'music',
      koreanKeywords: ['멜론','melon'],
      tags: ['music','streaming','korean_music'],
      importanceHint: 3, replacementHint: 2, hasFreePlan: false,
      plans: [
        { id: 'streaming',   name: '스트리밍 플러스',   priceKRW: 8900,  billingCycle: 'monthly', description: '무제한 스트리밍' },
        { id: 'download',    name: '다운로드',          priceKRW: 10900, billingCycle: 'monthly', description: '스트리밍 + 다운로드' },
        { id: 'student',     name: '학생 할인',          priceKRW: 6900,  billingCycle: 'monthly', description: '학생 전용' },
      ],
    },
    {
      ids: ['apple_music','applemusic'],
      name: 'Apple Music',
      icon: '🎶',
      category: 'music',
      koreanKeywords: ['애플뮤직','apple music'],
      tags: ['music','streaming'],
      importanceHint: 3, replacementHint: 3, hasFreePlan: false,
      plans: [
        { id: 'individual', name: 'Individual', priceKRW: 11000, billingCycle: 'monthly', description: '개인 스트리밍' },
        { id: 'family',     name: 'Family',     priceKRW: 16500, billingCycle: 'monthly', description: '최대 6인' },
        { id: 'student',    name: 'Student',    priceKRW: 5500,  billingCycle: 'monthly', description: '학생 할인' },
      ],
    },
    {
      ids: ['genie'],
      name: 'Genie',
      icon: '🎵',
      category: 'music',
      koreanKeywords: ['지니','genie'],
      tags: ['music','streaming','korean_music'],
      importanceHint: 2, replacementHint: 2, hasFreePlan: false,
      plans: [
        { id: 'streaming', name: '스트리밍', priceKRW: 7900,  billingCycle: 'monthly', description: '무제한 스트리밍' },
        { id: 'download',  name: '다운로드',  priceKRW: 9900,  billingCycle: 'monthly', description: '스트리밍 + 다운로드' },
      ],
    },
    {
      ids: ['flo'],
      name: 'FLO',
      icon: '🎵',
      category: 'music',
      koreanKeywords: ['플로','flo','플로뮤직'],
      tags: ['music','streaming','korean_music'],
      importanceHint: 2, replacementHint: 2, hasFreePlan: false,
      plans: [
        { id: 'standard', name: '스탠다드', priceKRW: 9900, billingCycle: 'monthly', description: '무제한 스트리밍' },
        { id: 'premium',  name: '프리미엄', priceKRW: 13900, billingCycle: 'monthly', description: '고음질 + 다운로드' },
      ],
    },

    // ── 게임 ──
    {
      ids: ['xbox_gamepass','gamepass','xgp'],
      name: 'Xbox Game Pass',
      icon: '🎮',
      category: 'game',
      koreanKeywords: ['엑스박스게임패스','게임패스','xbox'],
      tags: ['game','cloud_gaming','streaming'],
      importanceHint: 4, replacementHint: 3, hasFreePlan: false,
      plans: [
        { id: 'core',     name: 'Core',         priceKRW: 6700,  billingCycle: 'monthly', description: '온라인 멀티플레이어' },
        { id: 'standard', name: 'Standard',     priceKRW: 9900,  billingCycle: 'monthly', description: '게임 라이브러리' },
        { id: 'ultimate', name: 'PC Game Pass', priceKRW: 9900,  billingCycle: 'monthly', description: 'PC + 클라우드' },
      ],
    },
    {
      ids: ['playstation_plus','ps_plus','psplus'],
      name: 'PlayStation Plus',
      icon: '🕹️',
      category: 'game',
      koreanKeywords: ['플레이스테이션플러스','ps플러스','psplus','플스'],
      tags: ['game','online_multiplayer'],
      importanceHint: 4, replacementHint: 4, hasFreePlan: false,
      plans: [
        { id: 'essential', name: 'Essential', priceKRW: 5900,  billingCycle: 'monthly', description: '온라인 멀티플레이어, 무료 게임' },
        { id: 'extra',     name: 'Extra',     priceKRW: 9900,  billingCycle: 'monthly', description: '게임 카탈로그 추가' },
        { id: 'premium',   name: 'Premium',   priceKRW: 11900, billingCycle: 'monthly', description: '클래식 + 클라우드' },
      ],
    },

    // ── 쇼핑 ──
    {
      ids: ['coupang_rocket','coupang_wow','coupangwow'],
      name: 'Coupang Rocket WOW',
      icon: '🛒',
      category: 'shopping',
      koreanKeywords: ['쿠팡wow','쿠팡로켓','쿠팡와우','쿠팡'],
      tags: ['shopping','delivery','free_shipping'],
      importanceHint: 4, replacementHint: 3, hasFreePlan: false,
      plans: [
        { id: 'wow', name: 'Rocket WOW', priceKRW: 7890, billingCycle: 'monthly', description: '무료 배송, 쿠팡플레이 포함' },
      ],
    },
    {
      ids: ['naver_plus','naverplus'],
      name: 'Naver Plus',
      icon: '🟢',
      category: 'shopping',
      koreanKeywords: ['네이버플러스','네이버 플러스 멤버십'],
      tags: ['shopping','reward','content'],
      importanceHint: 3, replacementHint: 2, hasFreePlan: false,
      plans: [
        { id: 'standard', name: '일반 멤버십', priceKRW: 4900, billingCycle: 'monthly', description: '포인트 5% + 콘텐츠' },
      ],
    },

    // ── 배달·배송 ──
    {
      ids: ['baemin_club','baeminclub','baemin'],
      name: '배민클럽',
      icon: '🛵',
      category: 'delivery',
      koreanKeywords: ['배민클럽','배달의민족','배달','배민'],
      tags: ['delivery','discount'],
      importanceHint: 3, replacementHint: 2, hasFreePlan: false,
      plans: [
        { id: 'monthly', name: '월 구독', priceKRW: 3900, billingCycle: 'monthly', description: '배달비 무료쿠폰, 할인' },
      ],
    },
    {
      ids: ['yogiyo_club','yogiyo'],
      name: '요기요 클럽',
      icon: '🍔',
      category: 'delivery',
      koreanKeywords: ['요기요','요기요클럽'],
      tags: ['delivery','discount'],
      importanceHint: 2, replacementHint: 2, hasFreePlan: false,
      plans: [
        { id: 'monthly', name: '클럽 월정액', priceKRW: 2900, billingCycle: 'monthly', description: '할인 쿠폰 + 배달비 혜택' },
      ],
    },

    // ── 클라우드 저장소 ──
    {
      ids: ['icloud'],
      name: 'iCloud+',
      icon: '☁️',
      category: 'cloud',
      koreanKeywords: ['아이클라우드','icloud+','아이클라우드 플러스'],
      tags: ['cloud_storage','backup','sync'],
      importanceHint: 4, replacementHint: 4, hasFreePlan: false,
      plans: [
        { id: '50gb',  name: '50GB',  priceKRW: 1200, billingCycle: 'monthly', description: '50GB 저장공간' },
        { id: '200gb', name: '200GB', priceKRW: 3600, billingCycle: 'monthly', description: '가족 공유 가능' },
        { id: '2tb',   name: '2TB',   priceKRW: 11100,billingCycle: 'monthly', description: '가족 최대 5인 공유' },
      ],
    },
    {
      ids: ['google_one','googleone'],
      name: 'Google One',
      icon: '🗄️',
      category: 'cloud',
      koreanKeywords: ['구글원','google one','구글 클라우드'],
      tags: ['cloud_storage','backup'],
      importanceHint: 3, replacementHint: 3, hasFreePlan: false,
      plans: [
        { id: '100gb', name: '100GB', priceKRW: 2400,  billingCycle: 'monthly', description: 'Gmail, Drive, Photos 공유' },
        { id: '200gb', name: '200GB', priceKRW: 3700,  billingCycle: 'monthly', description: '가족 공유 가능' },
        { id: '2tb',   name: '2TB',   priceKRW: 12000, billingCycle: 'monthly', description: '대용량 가족 공유' },
      ],
    },
    {
      ids: ['dropbox'],
      name: 'Dropbox',
      icon: '📦',
      category: 'cloud',
      koreanKeywords: ['드롭박스','dropbox'],
      tags: ['cloud_storage','collaboration','sync'],
      importanceHint: 3, replacementHint: 3, hasFreePlan: true,
      plans: [
        { id: 'free',       name: 'Free',       priceKRW: 0,     billingCycle: 'monthly', description: '2GB 무료' },
        { id: 'plus',       name: 'Plus',       priceKRW: 16000, billingCycle: 'monthly', description: '2TB 개인' },
        { id: 'essentials', name: 'Essentials', priceKRW: 28000, billingCycle: 'monthly', description: '3TB + 협업' },
      ],
    },

    // ── 교육 ──
    {
      ids: ['coursera'],
      name: 'Coursera',
      icon: '🎓',
      category: 'education',
      koreanKeywords: ['코세라','coursera'],
      tags: ['education','course','certificate'],
      importanceHint: 3, replacementHint: 2, hasFreePlan: true,
      plans: [
        { id: 'free',  name: 'Free',         priceKRW: 0,     billingCycle: 'monthly', description: '강의 청강 무료' },
        { id: 'plus',  name: 'Coursera Plus', priceKRW: 65000, billingCycle: 'monthly', description: '7,000+ 과정 무제한' },
      ],
    },
    {
      ids: ['udemy'],
      name: 'Udemy',
      icon: '📚',
      category: 'education',
      koreanKeywords: ['유데미','udemy'],
      tags: ['education','course'],
      importanceHint: 3, replacementHint: 2, hasFreePlan: true,
      plans: [
        { id: 'personal', name: 'Personal Plan', priceKRW: 23000, billingCycle: 'monthly', description: '월 구독 무제한 수강' },
      ],
    },
    {
      ids: ['ridibooks','ridi'],
      name: 'Ridibooks',
      icon: '📖',
      category: 'reading',
      koreanKeywords: ['리디북스','리디','ridibooks'],
      tags: ['reading','ebook','webtoon'],
      importanceHint: 3, replacementHint: 3, hasFreePlan: false,
      plans: [
        { id: 'select', name: 'RIDI Select', priceKRW: 5500, billingCycle: 'monthly', description: '전자책 월정액' },
      ],
    },
    {
      ids: ['millie','milliebooks'],
      name: '밀리의 서재',
      icon: '📚',
      category: 'reading',
      koreanKeywords: ['밀리의서재','밀리','millie'],
      tags: ['reading','ebook'],
      importanceHint: 3, replacementHint: 2, hasFreePlan: false,
      plans: [
        { id: 'monthly', name: '월 정기구독',  priceKRW: 9900,  billingCycle: 'monthly', description: '전자책·오디오북 무제한' },
        { id: 'yearly',  name: '연간 구독',    priceKRW: 99000, billingCycle: 'yearly',  description: '연간 할인' },
      ],
    },

    // ── 피트니스 ──
    {
      ids: ['apple_fitness','applefitness'],
      name: 'Apple Fitness+',
      icon: '💪',
      category: 'fitness',
      koreanKeywords: ['애플피트니스','apple fitness'],
      tags: ['fitness','workout','health'],
      importanceHint: 3, replacementHint: 3, hasFreePlan: false,
      plans: [
        { id: 'individual', name: '개인',  priceKRW: 9900,  billingCycle: 'monthly', description: '개인 피트니스' },
        { id: 'family',     name: '가족',  priceKRW: 14900, billingCycle: 'monthly', description: '가족 최대 6인' },
      ],
    },
    {
      ids: ['strava'],
      name: 'Strava',
      icon: '🏃',
      category: 'fitness',
      koreanKeywords: ['스트라바','strava'],
      tags: ['fitness','running','cycling'],
      importanceHint: 3, replacementHint: 3, hasFreePlan: true,
      plans: [
        { id: 'free',      name: 'Free',      priceKRW: 0,     billingCycle: 'monthly', description: '기본 추적 무료' },
        { id: 'subscribe', name: 'Subscribe', priceKRW: 9000,  billingCycle: 'monthly', description: '고급 분석, 트레이닝 플랜' },
      ],
    },

    // ── 보안 ──
    {
      ids: ['nordvpn','nord'],
      name: 'NordVPN',
      icon: '🔒',
      category: 'security',
      koreanKeywords: ['노드vpn','노드브이피엔','vpn','nordvpn'],
      tags: ['vpn','security','privacy'],
      importanceHint: 3, replacementHint: 3, hasFreePlan: false,
      plans: [
        { id: 'basic', name: 'Basic', priceKRW: 6000,  billingCycle: 'monthly', description: 'VPN 기본' },
        { id: 'plus',  name: 'Plus',  priceKRW: 9000,  billingCycle: 'monthly', description: 'VPN + 패스워드 매니저' },
        { id: 'prime', name: 'Prime', priceKRW: 15000, billingCycle: 'monthly', description: 'VPN + 보안 + 모니터링' },
      ],
    },
    {
      ids: ['dashlane','lastpass','onepassword','1password'],
      name: '1Password',
      icon: '🔑',
      category: 'security',
      koreanKeywords: ['원패스워드','패스워드매니저','1password','lastpass'],
      tags: ['security','password','privacy'],
      importanceHint: 4, replacementHint: 4, hasFreePlan: false,
      plans: [
        { id: 'individual', name: 'Individual', priceKRW: 5000,  billingCycle: 'monthly', description: '개인 패스워드 관리' },
        { id: 'family',     name: 'Families',   priceKRW: 8000,  billingCycle: 'monthly', description: '최대 5인 가족' },
      ],
    },
  ];

  /* ─────────────────────────────────────
   * 자동완성 검색 함수 (v1.42)
   * 한글/영문/약칭/부분 문자열/대소문자 무시
   * ───────────────────────────────────── */

  /**
   * 쿼리를 정규화: 소문자 변환, 공백·특수문자 정리
   */
  function normalizeQuery(q) {
    return (q || '').toLowerCase().replace(/[\s_\-·]+/g, '');
  }

  /**
   * 자동완성 후보 목록 반환 (최대 maxResults개)
   * @param {string} query — 사용자 입력 문자열
   * @param {number} maxResults — 최대 결과 수 (기본 7)
   * @returns {Array} — SERVICE_DB 엔트리 배열 (정렬: 완전 일치 → 앞부분 일치 → 포함)
   */
  function searchServices(query, maxResults) {
    if (!query || query.trim().length < 1) return [];
    const q = normalizeQuery(query);
    const max = maxResults || 7;

    const exact   = [];
    const prefix  = [];
    const partial = [];

    for (const entry of SERVICE_DB) {
      const nameLower = normalizeQuery(entry.name);
      const idsNorm   = entry.ids.map(normalizeQuery);
      const kwNorm    = (entry.koreanKeywords || []).map(normalizeQuery);
      const allTokens = [nameLower, ...idsNorm, ...kwNorm];

      // 완전 일치 (이름 또는 id)
      if (allTokens.includes(q)) {
        exact.push(entry);
        continue;
      }
      // 앞부분 일치
      if (allTokens.some(t => t.startsWith(q))) {
        prefix.push(entry);
        continue;
      }
      // 부분 포함
      if (allTokens.some(t => t.includes(q))) {
        partial.push(entry);
        continue;
      }
    }

    return [...exact, ...prefix, ...partial].slice(0, max);
  }

  /**
   * 서비스명 또는 serviceId로 도메인 정보 조회 (기존 호환)
   * @param {string} query
   * @returns {Object|null}
   */
  function lookup(query) {
    if (!query) return null;
    const results = searchServices(query, 1);
    return results.length ? results[0] : null;
  }

  /**
   * 구독 추가 폼에서 서비스명 입력 시 자동 채움 데이터 반환 (기존 호환)
   */
  function autofill(serviceName) {
    const entry = lookup(serviceName);
    if (!entry) return null;
    return {
      category:           entry.category,
      capabilityTags:     entry.tags,
      importanceHint:     entry.importanceHint,
      replacementHint:    entry.replacementHint,
      hasFreePlan:        entry.hasFreePlan === true,
      suggestedServiceId: entry.ids[0],
      plans:              entry.plans || [],
      icon:               entry.icon || '📦',
    };
  }

  global.AppServiceDB = { lookup, autofill, searchServices, SERVICE_DB };

})(window);
