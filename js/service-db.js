/**
 * service-db.js
 * 구독 서비스 도메인 지식 DB.
 * 서비스명/serviceId 매칭 → capabilityTags, category, 중요도·대체난이도 힌트 자동 제공.
 * 실서비스에서는 서버 카탈로그 API로 교체 가능.
 *
 * 데이터 출처: 각 서비스 공식 홈페이지, 앱스토어 설명 기반 정리.
 * Content was rephrased for compliance with licensing restrictions.
 */
(function (global) {
  'use strict';

  /**
   * serviceId 또는 서비스명 키워드 → 도메인 정보
   * replacementDifficultyHint: 1(대체 쉬움) ~ 5(대체 어려움) — 카테고리·생태계 기반 추정
   * importanceHint: 1(낮음) ~ 5(높음) — 업무 연관성·의존도 기반 추정
   */
  const SERVICE_DB = [
    // ── AI 도구 ──
    { ids: ['chatgpt','gpt','openai'],        name: 'ChatGPT',        category: 'ai',           tags: ['chat','research','image','code','writing','analysis'], importanceHint: 4, replacementHint: 3 },
    { ids: ['claude','anthropic'],             name: 'Claude',          category: 'ai',           tags: ['chat','research','code','writing','analysis'],          importanceHint: 3, replacementHint: 3 },
    { ids: ['perplexity'],                     name: 'Perplexity',      category: 'ai',           tags: ['chat','research','web_search'],                         importanceHint: 3, replacementHint: 2 },
    { ids: ['gemini','bard'],                  name: 'Gemini',          category: 'ai',           tags: ['chat','research','image','code','writing'],             importanceHint: 3, replacementHint: 3 },
    { ids: ['copilot','github_copilot'],       name: 'GitHub Copilot',  category: 'dev',          tags: ['code','ai_autocomplete'],                              importanceHint: 5, replacementHint: 4 },
    { ids: ['midjourney'],                     name: 'Midjourney',      category: 'design',       tags: ['image','ai_image'],                                    importanceHint: 3, replacementHint: 3 },
    { ids: ['stability','stable_diffusion'],   name: 'Stability AI',    category: 'ai',           tags: ['image','ai_image'],                                    importanceHint: 2, replacementHint: 2 },

    // ── 개발 ──
    { ids: ['cursor'],                         name: 'Cursor',          category: 'dev',          tags: ['code','ai_autocomplete','chat'],                        importanceHint: 5, replacementHint: 4 },
    { ids: ['github'],                         name: 'GitHub',          category: 'dev',          tags: ['code','collaboration','version_control'],               importanceHint: 5, replacementHint: 5 },
    { ids: ['jetbrains','intellij'],           name: 'JetBrains',       category: 'dev',          tags: ['code','ide'],                                          importanceHint: 4, replacementHint: 4 },
    { ids: ['vercel'],                         name: 'Vercel',          category: 'dev',          tags: ['code','deployment','hosting'],                          importanceHint: 4, replacementHint: 3 },
    { ids: ['linear'],                         name: 'Linear',          category: 'productivity', tags: ['project','collaboration','dev'],                        importanceHint: 4, replacementHint: 3 },

    // ── 디자인 ──
    { ids: ['figma'],                          name: 'Figma',           category: 'design',       tags: ['design','prototyping','collaboration'],                 importanceHint: 5, replacementHint: 4 },
    { ids: ['adobe','creative_cloud'],         name: 'Adobe CC',        category: 'design',       tags: ['design','image','video','writing'],                     importanceHint: 4, replacementHint: 5 },
    { ids: ['canva'],                          name: 'Canva',           category: 'design',       tags: ['design','image','template'],                           importanceHint: 3, replacementHint: 2 },
    { ids: ['sketch'],                         name: 'Sketch',          category: 'design',       tags: ['design','prototyping'],                                importanceHint: 3, replacementHint: 3 },

    // ── 생산성 ──
    { ids: ['notion'],                         name: 'Notion',          category: 'productivity', tags: ['notes','database','writing','collaboration'],           importanceHint: 4, replacementHint: 3 },
    { ids: ['obsidian'],                       name: 'Obsidian',        category: 'productivity', tags: ['notes','writing','knowledge_base'],                    importanceHint: 3, replacementHint: 3 },
    { ids: ['slack'],                          name: 'Slack',           category: 'productivity', tags: ['collaboration','messaging','team'],                     importanceHint: 5, replacementHint: 4 },
    { ids: ['zoom'],                           name: 'Zoom',            category: 'productivity', tags: ['video_call','collaboration','meeting'],                 importanceHint: 4, replacementHint: 3 },
    { ids: ['microsoft365','office365','ms365'], name: 'Microsoft 365', category: 'productivity', tags: ['writing','spreadsheet','presentation','email'],        importanceHint: 5, replacementHint: 4 },
    { ids: ['google_workspace','gsuite'],      name: 'Google Workspace',category: 'productivity', tags: ['writing','spreadsheet','email','collaboration'],        importanceHint: 5, replacementHint: 4 },
    { ids: ['todoist'],                        name: 'Todoist',         category: 'productivity', tags: ['task','notes'],                                        importanceHint: 3, replacementHint: 2 },

    // ── 영상 스트리밍 ──
    { ids: ['netflix'],                        name: 'Netflix',         category: 'media',        tags: ['video','streaming','original_content'],                importanceHint: 3, replacementHint: 2 },
    { ids: ['disney','disneyplus','disney+'],  name: 'Disney+',         category: 'media',        tags: ['video','streaming','family','original_content'],       importanceHint: 3, replacementHint: 2 },
    { ids: ['wavve'],                          name: 'Wavve',           category: 'media',        tags: ['video','streaming','korean_content'],                  importanceHint: 2, replacementHint: 2 },
    { ids: ['tving'],                          name: 'Tving',           category: 'media',        tags: ['video','streaming','korean_content'],                  importanceHint: 2, replacementHint: 2 },
    { ids: ['watcha'],                         name: 'Watcha',          category: 'media',        tags: ['video','streaming'],                                   importanceHint: 2, replacementHint: 2 },
    { ids: ['coupang_play','coupangplay'],      name: 'Coupang Play',    category: 'media',        tags: ['video','streaming','korean_content'],                  importanceHint: 2, replacementHint: 2 },
    { ids: ['youtube_premium','ytpremium'],    name: 'YouTube Premium', category: 'media',        tags: ['video','streaming','music','no_ads'],                  importanceHint: 4, replacementHint: 3 },
    { ids: ['hulu'],                           name: 'Hulu',            category: 'media',        tags: ['video','streaming'],                                   importanceHint: 2, replacementHint: 2 },
    { ids: ['apple_tv','appletv'],             name: 'Apple TV+',       category: 'media',        tags: ['video','streaming','original_content'],                importanceHint: 2, replacementHint: 2 },

    // ── 음악 ──
    { ids: ['spotify'],                        name: 'Spotify',         category: 'music',        tags: ['music','streaming','podcast'],                         importanceHint: 3, replacementHint: 3 },
    { ids: ['melon'],                          name: 'Melon',           category: 'music',        tags: ['music','streaming','korean_music'],                    importanceHint: 3, replacementHint: 2 },
    { ids: ['genie'],                          name: 'Genie',           category: 'music',        tags: ['music','streaming','korean_music'],                    importanceHint: 2, replacementHint: 2 },
    { ids: ['flo'],                            name: 'FLO',             category: 'music',        tags: ['music','streaming','korean_music'],                    importanceHint: 2, replacementHint: 2 },
    { ids: ['vibe'],                           name: 'Vibe',            category: 'music',        tags: ['music','streaming','korean_music'],                    importanceHint: 2, replacementHint: 2 },
    { ids: ['apple_music','applemusic'],       name: 'Apple Music',     category: 'music',        tags: ['music','streaming'],                                   importanceHint: 3, replacementHint: 3 },

    // ── 게임 ──
    { ids: ['xbox_gamepass','gamepass','xgp'], name: 'Xbox Game Pass',  category: 'game',         tags: ['game','cloud_gaming','streaming'],                     importanceHint: 4, replacementHint: 3 },
    { ids: ['playstation_plus','ps_plus','psplus'], name: 'PlayStation Plus', category: 'game',   tags: ['game','online_multiplayer'],                           importanceHint: 4, replacementHint: 4 },
    { ids: ['nintendo_online'],                name: 'Nintendo Online', category: 'game',         tags: ['game','online_multiplayer'],                           importanceHint: 3, replacementHint: 4 },
    { ids: ['steam'],                          name: 'Steam',           category: 'game',         tags: ['game','pc_gaming'],                                    importanceHint: 4, replacementHint: 4 },
    { ids: ['geforce_now'],                    name: 'GeForce Now',     category: 'game',         tags: ['game','cloud_gaming'],                                 importanceHint: 3, replacementHint: 3 },

    // ── 쇼핑 ──
    { ids: ['coupang_rocket','coupang_wow','coupangwow'], name: 'Coupang Rocket WOW', category: 'shopping', tags: ['shopping','delivery','free_shipping'], importanceHint: 4, replacementHint: 3 },
    { ids: ['naver_plus','naverplus'],         name: 'Naver Plus',      category: 'shopping',     tags: ['shopping','reward','content'],                         importanceHint: 3, replacementHint: 2 },
    { ids: ['amazon_prime','amazonprime'],     name: 'Amazon Prime',    category: 'shopping',     tags: ['shopping','delivery','video','music'],                 importanceHint: 4, replacementHint: 3 },

    // ── 배달·배송 ──
    { ids: ['baemin_club','baeminclub','baemin'], name: '배민클럽',     category: 'delivery',     tags: ['delivery','discount'],                                 importanceHint: 3, replacementHint: 2 },
    { ids: ['yogiyo_club','yogiyo'],           name: '요기요 클럽',     category: 'delivery',     tags: ['delivery','discount'],                                 importanceHint: 2, replacementHint: 2 },

    // ── 클라우드 저장소 ──
    { ids: ['icloud'],                         name: 'iCloud',          category: 'cloud',        tags: ['cloud_storage','backup','sync'],                       importanceHint: 4, replacementHint: 4 },
    { ids: ['google_one','googleone'],         name: 'Google One',      category: 'cloud',        tags: ['cloud_storage','backup'],                              importanceHint: 3, replacementHint: 3 },
    { ids: ['dropbox'],                        name: 'Dropbox',         category: 'cloud',        tags: ['cloud_storage','collaboration','sync'],                importanceHint: 3, replacementHint: 3 },
    { ids: ['onedrive'],                       name: 'OneDrive',        category: 'cloud',        tags: ['cloud_storage','backup','sync'],                       importanceHint: 3, replacementHint: 3 },

    // ── 교육 ──
    { ids: ['coursera'],                       name: 'Coursera',        category: 'education',    tags: ['education','course','certificate'],                    importanceHint: 3, replacementHint: 2 },
    { ids: ['udemy'],                          name: 'Udemy',           category: 'education',    tags: ['education','course'],                                  importanceHint: 3, replacementHint: 2 },
    { ids: ['khanacademy','khan'],             name: 'Khan Academy',    category: 'education',    tags: ['education','course'],                                  importanceHint: 2, replacementHint: 2 },
    { ids: ['ridibooks','ridi'],               name: 'Ridibooks',       category: 'reading',      tags: ['reading','ebook','webtoon'],                           importanceHint: 3, replacementHint: 3 },
    { ids: ['millie','milliebooks'],           name: '밀리의 서재',     category: 'reading',      tags: ['reading','ebook'],                                     importanceHint: 3, replacementHint: 2 },
    { ids: ['naver_webtoon','webtoon'],        name: '네이버 웹툰',     category: 'reading',      tags: ['reading','webtoon'],                                   importanceHint: 3, replacementHint: 3 },

    // ── 피트니스 ──
    { ids: ['apple_fitness','applefitness'],   name: 'Apple Fitness+',  category: 'fitness',      tags: ['fitness','workout','health'],                          importanceHint: 3, replacementHint: 3 },
    { ids: ['strava'],                         name: 'Strava',          category: 'fitness',      tags: ['fitness','running','cycling'],                         importanceHint: 3, replacementHint: 3 },

    // ── 보안 ──
    { ids: ['nordvpn','nord'],                 name: 'NordVPN',         category: 'security',     tags: ['vpn','security','privacy'],                            importanceHint: 3, replacementHint: 3 },
    { ids: ['dashlane','lastpass','onepassword','1password'], name: '패스워드 매니저', category: 'security', tags: ['security','password','privacy'],            importanceHint: 4, replacementHint: 4 },
  ];

  /**
   * 서비스명 또는 serviceId로 도메인 정보 조회
   * @param {string} query — serviceId 또는 서비스명 (대소문자 무관)
   * @returns {Object|null}
   */
  function lookup(query) {
    if (!query) return null;
    const q = query.toLowerCase().replace(/[\s_-]+/g, '_');
    for (const entry of SERVICE_DB) {
      if (entry.ids.some(id => q.includes(id) || id.includes(q))) {
        return entry;
      }
      if (entry.name.toLowerCase().includes(q.replace(/_/g,' '))) {
        return entry;
      }
    }
    return null;
  }

  /**
   * 구독 추가 폼에서 서비스명 입력 시 자동 채움 데이터 반환
   */
  function autofill(serviceName) {
    const entry = lookup(serviceName);
    if (!entry) return null;
    return {
      category:             entry.category,
      capabilityTags:       entry.tags,
      importanceHint:       entry.importanceHint,
      replacementHint:      entry.replacementHint,
      suggestedServiceId:   entry.ids[0],
    };
  }

  global.AppServiceDB = { lookup, autofill, SERVICE_DB };

})(window);
