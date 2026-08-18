/**
 * usage.js
 * 세션 정규화, 자정 분할, 중복 제거, raw/adjusted 집계.
 * 순수 함수만 — 부작용 없음.
 */
(function (global) {
  'use strict';

  const CFG = global.AppConfig;

  /* ─────────────────────────────────────
   * 측정 모드 우선순위 (높을수록 우선)
   * ───────────────────────────────────── */
  const MODE_PRIORITY = { strict: 4, loose: 3, inferred: 2, self_reported: 1 };

  /* ─────────────────────────────────────
   * 헬퍼
   * ───────────────────────────────────── */

  /** ISO 문자열 → ms (UTC) */
  function toMs(isoStr) {
    return new Date(isoStr).getTime();
  }

  /** ms → ISO 문자열 */
  function msToIso(ms) {
    return new Date(ms).toISOString();
  }

  /**
   * 주어진 UTC ms 기준 타임존에서의 날짜 'YYYY-MM-DD' 반환
   * tzOffsetMinutes: UTC+9 → 540
   */
  function localDateStr(utcMs, tzOffsetMinutes) {
    const localMs = utcMs + tzOffsetMinutes * 60000;
    const d = new Date(localMs);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * 현지 자정(UTC 기준 ms) 반환
   * 예: 2026-08-18 KST 자정 = 2026-08-17T15:00:00Z
   */
  function localMidnightUtcMs(dateStr, tzOffsetMinutes) {
    // dateStr 'YYYY-MM-DD' 의 현지 자정 = UTC 자정 - tzOffset
    const utcMidnight = new Date(dateStr + 'T00:00:00Z').getTime();
    return utcMidnight - tzOffsetMinutes * 60000;
  }

  /* ─────────────────────────────────────
   * 1. 단일 세션 정규화 + 자정 분할
   *    → 하나의 세션 레코드를 0~N개의 정규화된 청크로 분해
   * ───────────────────────────────────── */
  function normalizeSession(session, tzOffsetMinutes) {
    const startMs = toMs(session.startedAt);
    const endMs   = toMs(session.endedAt);
    const durSec  = (endMs - startMs) / 1000;

    // MIN_SESSION_SEC 미만 폐기
    if (durSec < CFG.MIN_SESSION_SEC) return [];

    // MAX_SESSION_SEC 초과 시 분할 (재귀)
    if (durSec > CFG.MAX_SESSION_SEC) {
      const splitMs = startMs + CFG.MAX_SESSION_SEC * 1000;
      const firstHalf = Object.assign({}, session, {
        endedAt: msToIso(splitMs),
        activeSeconds: CFG.MAX_SESSION_SEC,
      });
      const secondHalf = Object.assign({}, session, {
        eventId: session.eventId + '_split',
        startedAt: msToIso(splitMs),
        activeSeconds: Math.round((endMs - splitMs) / 1000),
      });
      return [
        ...normalizeSession(firstHalf, tzOffsetMinutes),
        ...normalizeSession(secondHalf, tzOffsetMinutes),
      ];
    }

    // 자정 분할 검사
    const startDateStr = localDateStr(startMs, tzOffsetMinutes);
    const endDateStr   = localDateStr(endMs - 1, tzOffsetMinutes); // endMs 1ms 전으로 날짜 확인

    if (startDateStr !== endDateStr) {
      // 현지 기준 startDate 다음 날 자정의 UTC ms
      // = startDateStr의 현지 자정(UTC) + 1일
      const startLocalMidnightUtcMs = localMidnightUtcMs(startDateStr, tzOffsetMinutes);
      const midnightUtcMs = startLocalMidnightUtcMs + 86400000;

      const firstSec  = Math.round((midnightUtcMs - startMs) / 1000);
      const secondSec = Math.round((endMs - midnightUtcMs) / 1000);

      const chunks = [];
      if (firstSec >= CFG.MIN_SESSION_SEC) {
        chunks.push(...normalizeSession(Object.assign({}, session, {
          endedAt: msToIso(midnightUtcMs),
          activeSeconds: firstSec,
        }), tzOffsetMinutes));
      }
      if (secondSec >= CFG.MIN_SESSION_SEC) {
        chunks.push(...normalizeSession(Object.assign({}, session, {
          eventId: session.eventId + '_next',
          startedAt: msToIso(midnightUtcMs),
          activeSeconds: secondSec,
        }), tzOffsetMinutes));
      }
      return chunks;
    }

    // 정상 세션: localDate 태그 붙여 반환
    return [Object.assign({}, session, {
      _localDate: startDateStr,
      activeSeconds: Math.round(durSec),
    })];
  }

  /* ─────────────────────────────────────
   * 2. eventId 중복 제거 (멱등성)
   * ───────────────────────────────────── */
  function deduplicateByEventId(sessions) {
    const seen = new Set();
    const result = [];
    for (const s of sessions) {
      // _split / _next 파생 세션은 원본 eventId 기반으로 중복 체크하지 않음
      const key = s.eventId;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(s);
    }
    return result;
  }

  /* ─────────────────────────────────────
   * 3. 전체 파이프라인: 원시 세션 → 정규화된 청크 목록
   * ───────────────────────────────────── */
  function processAllSessions(rawSessions, tzOffsetMinutes) {
    // 3-1. 중복 eventId 제거 (원시 단계에서 먼저)
    const deduped = deduplicateByEventId(rawSessions);

    // 3-2. 정규화 + 자정 분할
    const chunks = [];
    for (const s of deduped) {
      const tz = s.tzOffsetMinutes !== undefined ? s.tzOffsetMinutes : tzOffsetMinutes;
      const normalized = normalizeSession(s, tz);
      chunks.push(...normalized);
    }

    return chunks;
  }

  /* ─────────────────────────────────────
   * 4. serviceId별 일별 집계
   *    raw: Σ activeSeconds
   *    adjusted: 구간 union 후 총 길이 (겹침 제거)
   * ───────────────────────────────────── */

  /**
   * 구간 배열 [ {start, end, mode} ] → union 길이(초)
   * mode 우선순위 높은 구간이 겹치는 부분을 차지
   * 단순 합산 대신 타임라인을 직접 병합
   */
  function unionIntervals(intervals) {
    if (!intervals.length) return 0;

    // 우선순위 높은 순으로 정렬
    const sorted = intervals.slice().sort((a, b) => {
      const pa = MODE_PRIORITY[a.mode] || 0;
      const pb = MODE_PRIORITY[b.mode] || 0;
      if (pb !== pa) return pb - pa;       // 우선순위 내림차순
      return a.start - b.start;
    });

    // 타임라인 스위프
    const merged = [];
    for (const iv of sorted) {
      const last = merged[merged.length - 1];
      if (!last || iv.start >= last.end) {
        merged.push({ start: iv.start, end: iv.end });
      } else {
        last.end = Math.max(last.end, iv.end);
      }
    }

    return merged.reduce((acc, iv) => acc + (iv.end - iv.start), 0) / 1000;
  }

  /**
   * 정규화된 청크를 serviceId + 날짜로 그룹화해 집계
   * 반환:
   *   {
   *     [serviceId]: {
   *       [dateStr]: {
   *         rawSec: number,
   *         adjustedSec: number,
   *         byDevice: { [deviceId]: { rawSec } },
   *         sessions: chunk[]
   *       }
   *     }
   *   }
   */
  function aggregateByServiceAndDate(chunks) {
    const map = {};

    for (const chunk of chunks) {
      const sId = chunk.serviceId;
      const date = chunk._localDate;
      if (!sId || !date) continue;

      if (!map[sId]) map[sId] = {};
      if (!map[sId][date]) {
        map[sId][date] = { rawSec: 0, adjustedSec: 0, byDevice: {}, sessions: [] };
      }

      const entry = map[sId][date];
      entry.rawSec += chunk.activeSeconds;
      entry.sessions.push(chunk);

      // 기기별 raw
      const dev = chunk.deviceId || 'unknown';
      if (!entry.byDevice[dev]) entry.byDevice[dev] = { rawSec: 0 };
      entry.byDevice[dev].rawSec += chunk.activeSeconds;
    }

    // adjusted 계산 (구간 union)
    for (const sId of Object.keys(map)) {
      for (const date of Object.keys(map[sId])) {
        const entry = map[sId][date];
        const intervals = entry.sessions.map(s => ({
          start: new Date(s.startedAt).getTime(),
          end:   new Date(s.endedAt).getTime(),
          mode:  s.measurementMode || 'loose',
        }));
        entry.adjustedSec = unionIntervals(intervals);
      }
    }

    return map;
  }

  /* ─────────────────────────────────────
   * 5. 서비스별 요약 통계
   *    최근 N일 기준 평균/합계 반환
   * ───────────────────────────────────── */

  /**
   * 날짜 범위 내 모든 날짜 문자열 배열 반환 (오름차순)
   */
  function dateRange(fromDateStr, toDateStr) {
    const dates = [];
    let cur = new Date(fromDateStr + 'T00:00:00Z');
    const end = new Date(toDateStr + 'T00:00:00Z');
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur = new Date(cur.getTime() + 86400000);
    }
    return dates;
  }

  /**
   * serviceId의 최근 days일 집계 요약 반환
   * todayStr: 'YYYY-MM-DD'
   */
  function getServiceSummary(aggregated, serviceId, todayStr, days) {
    const endDate   = todayStr;
    const startDate = new Date(
      new Date(todayStr + 'T00:00:00Z').getTime() - (days - 1) * 86400000
    ).toISOString().slice(0, 10);

    const dates = dateRange(startDate, endDate);
    const serviceData = aggregated[serviceId] || {};

    let totalRawSec = 0;
    let totalAdjustedSec = 0;
    let usedDays = 0;
    const dailyAdjustedSec = {};
    const deviceRaw = {};

    for (const d of dates) {
      const entry = serviceData[d];
      const adjSec = entry ? entry.adjustedSec : 0;
      const rawSec = entry ? entry.rawSec : 0;
      dailyAdjustedSec[d] = adjSec;
      totalRawSec += rawSec;
      totalAdjustedSec += adjSec;
      if (adjSec > 0) usedDays++;

      if (entry) {
        for (const [devId, devData] of Object.entries(entry.byDevice)) {
          deviceRaw[devId] = (deviceRaw[devId] || 0) + devData.rawSec;
        }
      }
    }

    const avgDailyAdjustedSec = days > 0 ? totalAdjustedSec / days : 0;
    const avgDailyAdjustedMin = avgDailyAdjustedSec / 60;

    // 마지막 사용일
    let lastUsedDate = null;
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dailyAdjustedSec[dates[i]] > 0) {
        lastUsedDate = dates[i];
        break;
      }
    }

    // 마지막 사용으로부터 경과일
    let daysSinceLastUse = null;
    if (lastUsedDate) {
      const lastMs  = new Date(lastUsedDate + 'T00:00:00Z').getTime();
      const todayMs = new Date(todayStr    + 'T00:00:00Z').getTime();
      daysSinceLastUse = Math.round((todayMs - lastMs) / 86400000);
    }

    // 미사용일 수
    const unusedDays = days - usedDays;

    return {
      serviceId,
      period: { start: startDate, end: endDate, days },
      totalRawSec,
      totalAdjustedSec,
      avgDailyAdjustedSec,
      avgDailyAdjustedMin,
      usedDays,
      unusedDays,
      lastUsedDate,
      daysSinceLastUse,
      dailyAdjustedSec,    // 날짜 → 조정 초 (스파크라인용)
      deviceRaw,           // 기기별 raw 초
      // raw vs adjusted 비교 메모
      rawGtAdjusted: totalRawSec > totalAdjustedSec,
    };
  }

  /**
   * 직전 기간 대비 증감률 계산
   * prevSummary.avgDailyAdjustedSec 대비 currSummary.avgDailyAdjustedSec
   */
  function calcGrowthRate(currSummary, aggregated, serviceId, todayStr, days) {
    const prevEndDate = new Date(
      new Date(todayStr + 'T00:00:00Z').getTime() - days * 86400000
    ).toISOString().slice(0, 10);
    const prevSummary = getServiceSummary(aggregated, serviceId, prevEndDate, days);

    if (!prevSummary.avgDailyAdjustedSec || prevSummary.avgDailyAdjustedSec === 0) {
      return null; // 이전 기간 데이터 없음
    }

    return (currSummary.avgDailyAdjustedSec - prevSummary.avgDailyAdjustedSec)
           / prevSummary.avgDailyAdjustedSec;
  }

  /* ─────────────────────────────────────
   * 6. 전체 처리 진입점
   * ───────────────────────────────────── */
  /**
   * rawSessions 배열을 받아 모든 집계를 반환
   * settings: { timezone, deviceToggles }
   */
  function processUsage(rawSessions, settings, todayStr) {
    const tz = settings.timezone || CFG.DEFAULT_TIMEZONE;
    const tzOffset = getTzOffsetMinutes(tz);
    const deviceToggles = settings.deviceToggles || {};

    // 활성 기기 필터 (토글 off 기기 제외)
    const activeSessions = rawSessions.filter(s => {
      if (!s.deviceId) return true;
      const toggle = deviceToggles[s.deviceId];
      return toggle === undefined ? true : toggle;
    });

    const chunks = processAllSessions(activeSessions, tzOffset);
    const aggregated = aggregateByServiceAndDate(chunks);

    return { chunks, aggregated, tzOffset };
  }

  /**
   * 타임존 문자열 → UTC 오프셋 분 (간이 구현)
   * 실서비스에서는 Intl.DateTimeFormat 사용 권장
   */
  function getTzOffsetMinutes(tz) {
    const offsets = {
      'Asia/Seoul': 540,
      'Asia/Tokyo': 540,
      'America/New_York': -300,
      'America/Los_Angeles': -480,
      'Europe/London': 0,
      'Europe/Paris': 60,
    };
    return offsets[tz] !== undefined ? offsets[tz] : 540;
  }

  /* ─────────────────────────────────────
   * Public API
   * ───────────────────────────────────── */
  global.AppUsage = {
    processUsage,
    processAllSessions,
    normalizeSession,
    deduplicateByEventId,
    aggregateByServiceAndDate,
    getServiceSummary,
    calcGrowthRate,
    dateRange,
    getTzOffsetMinutes,
    MODE_PRIORITY,
  };

})(window);
