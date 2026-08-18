/**
 * store.js
 * localStorage 영속화. 스키마 버전 관리 + 마이그레이션 훅.
 */
(function (global) {
  'use strict';

  const CFG = global.AppConfig;
  const LS_KEY = 'subvalue_app';

  /* ── 기본 빈 상태 ── */
  function emptyState() {
    return {
      schemaVersion: CFG.SCHEMA_VERSION,
      subscriptions: [],
      devices: [],
      sessions: [],
      catalog: { services: [], plans: [] },
      changeEvents: [],
      peerReports: [],
      cohortStats: [],
      notifications: [],
      settings: {
        timezone: CFG.DEFAULT_TIMEZONE,
        consents: { c1: false, c2: false, c3: false },
        notify: {
          weeklyBudget: CFG.MAX_PUSH_PER_WEEK,
          types: {
            billing_deadline: true,
            price_increase_confirmed: true,
            saving_opportunity: true,
            overlap_resolved: true,
          },
        },
        deviceToggles: {},   // deviceId → boolean (시뮬레이션 토글)
      },
      lastSaved: null,
    };
  }

  /* ── 마이그레이션 ── */
  const MIGRATIONS = {
    // 예시: 1 → 2 마이그레이션
    // 2: (state) => { state.newField = 'default'; return state; },
  };

  function migrate(state) {
    let v = state.schemaVersion || 0;
    while (v < CFG.SCHEMA_VERSION) {
      const next = v + 1;
      if (MIGRATIONS[next]) {
        state = MIGRATIONS[next](state);
      }
      state.schemaVersion = next;
      v = next;
    }
    return state;
  }

  /* ── 로드 ── */
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return emptyState();
      let state = JSON.parse(raw);
      state = migrate(state);
      // 누락 키 보충 (부분 저장 대응)
      const base = emptyState();
      return deepMergeDefaults(base, state);
    } catch (e) {
      console.warn('[Store] 로드 실패, 초기 상태로 복원:', e);
      return emptyState();
    }
  }

  /* ── 저장 ── */
  function save(state) {
    try {
      state.lastSaved = new Date().toISOString();
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('[Store] 저장 실패:', e);
    }
  }

  /* ── 초기화 ── */
  function reset() {
    localStorage.removeItem(LS_KEY);
    return emptyState();
  }

  /* ── JSON 내보내기 ── */
  function exportJSON(state) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'subvalue_backup_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── JSON 가져오기 ── */
  function importJSON(jsonString) {
    try {
      let state = JSON.parse(jsonString);
      state = migrate(state);
      const base = emptyState();
      return deepMergeDefaults(base, state);
    } catch (e) {
      throw new Error('JSON 파싱 실패: ' + e.message);
    }
  }

  /* ── 유틸: 기본값으로 빈 키 보충 (덮어쓰기 아님) ── */
  function deepMergeDefaults(base, incoming) {
    const result = Object.assign({}, base);
    for (const key of Object.keys(incoming)) {
      if (
        incoming[key] !== null &&
        typeof incoming[key] === 'object' &&
        !Array.isArray(incoming[key]) &&
        base[key] !== null &&
        typeof base[key] === 'object' &&
        !Array.isArray(base[key])
      ) {
        result[key] = deepMergeDefaults(base[key], incoming[key]);
      } else {
        result[key] = incoming[key];
      }
    }
    return result;
  }

  global.AppStore = { load, save, reset, exportJSON, importJSON, emptyState };

})(window);
