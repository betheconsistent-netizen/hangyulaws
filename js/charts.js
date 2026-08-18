/**
 * charts.js
 * 인라인 SVG 차트: 막대, 스파크라인, 도넛, 컴포넌트 분해.
 * 외부 라이브러리 없음 — 순수 SVG 생성.
 */
(function (global) {
  'use strict';

  /* ─────────────────────────────────────
   * 유틸
   * ───────────────────────────────────── */
  function svgEl(tag, attrs, children) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (children) children.forEach(c => c && el.appendChild(c));
    return el;
  }

  function fmt(n) {
    if (n === null || n === undefined || isNaN(n)) return '-';
    if (n >= 3600) return Math.round(n / 3600) + 'h';
    if (n >= 60)   return Math.round(n / 60) + 'm';
    return n + 's';
  }

  /* ─────────────────────────────────────
   * 1. 스파크라인 (일별 사용량)
   *    values: number[] (30개)
   *    w, h: 픽셀
   * ───────────────────────────────────── */
  function sparkline(values, opts) {
    const { w = 120, h = 32, color = '#6c8fff', today = null } = opts || {};
    const n = values.length;
    if (!n) return svgEl('svg', { width: w, height: h });

    const max = Math.max(...values, 1);
    const pad = 2;

    const svg = svgEl('svg', {
      width: w, height: h,
      viewBox: `0 0 ${w} ${h}`,
      preserveAspectRatio: 'none',
      style: 'display:block;',
    });

    // 영역 채우기
    const step = (w - pad * 2) / Math.max(n - 1, 1);
    const pts  = values.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v / max) * (h - pad * 2));
      return [x, y];
    });

    const areaPath = [
      `M ${pts[0][0]} ${h}`,
      ...pts.map(p => `L ${p[0]} ${p[1]}`),
      `L ${pts[pts.length - 1][0]} ${h}`,
      'Z',
    ].join(' ');

    svg.appendChild(svgEl('defs', null, [
      (function () {
        const grad = svgEl('linearGradient', {
          id: 'sg-' + Math.random().toString(36).slice(2),
          x1: '0', y1: '0', x2: '0', y2: '1',
        });
        const s1 = svgEl('stop', { offset: '0%',   'stop-color': color, 'stop-opacity': '0.3' });
        const s2 = svgEl('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0.02' });
        grad.appendChild(s1); grad.appendChild(s2);
        return grad;
      })(),
    ]));

    const gradId = svg.querySelector('linearGradient').id;
    svg.appendChild(svgEl('path', { d: areaPath, fill: `url(#${gradId})` }));

    // 라인
    const linePath = pts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
    svg.appendChild(svgEl('path', { d: linePath, fill: 'none', stroke: color, 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));

    // 오늘 표시 점
    if (today !== null && today >= 0 && today < n) {
      const [tx, ty] = pts[today];
      svg.appendChild(svgEl('circle', { cx: tx, cy: ty, r: '3', fill: color }));
    }

    return svg;
  }

  /* ─────────────────────────────────────
   * 2. 막대 차트 (주간/월간 비교)
   *    bars: [{ label, value, color? }]
   * ───────────────────────────────────── */
  function barChart(bars, opts) {
    const { w = 300, h = 160, color = '#6c8fff', unit = 'm' } = opts || {};
    if (!bars || !bars.length) return svgEl('svg', { width: w, height: h });

    const max = Math.max(...bars.map(b => b.value), 1);
    const barW = Math.floor((w - 20) / bars.length) - 4;
    const gap  = Math.floor((w - 20) / bars.length);
    const padT = 14, padB = 26, padL = 10;
    const plotH = h - padT - padB;

    const svg = svgEl('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, style: 'display:block;' });

    bars.forEach((b, i) => {
      const bh  = Math.max(2, (b.value / max) * plotH);
      const x   = padL + i * gap + (gap - barW) / 2;
      const y   = padT + plotH - bh;
      const col = b.color || color;

      svg.appendChild(svgEl('rect', {
        x, y, width: barW, height: bh,
        fill: col, rx: '3', opacity: '0.85',
      }));

      // 값 레이블
      if (b.value > 0) {
        const txt = svgEl('text', {
          x: x + barW / 2, y: y - 3,
          'text-anchor': 'middle',
          'font-size': '9',
          fill: '#8892a4',
        });
        txt.textContent = b.value + unit;
        svg.appendChild(txt);
      }

      // X 레이블
      const lbl = svgEl('text', {
        x: x + barW / 2, y: h - 8,
        'text-anchor': 'middle',
        'font-size': '9',
        fill: '#8892a4',
      });
      lbl.textContent = b.label;
      svg.appendChild(lbl);
    });

    return svg;
  }

  /* ─────────────────────────────────────
   * 3. 도넛 차트 (Value Score 시각화)
   *    score: 0~100
   *    size: px
   * ───────────────────────────────────── */
  function donutChart(score, opts) {
    const { size = 90, color, label = '' } = opts || {};
    const r   = size / 2 - 8;
    const cx  = size / 2;
    const cy  = size / 2;
    const circ = 2 * Math.PI * r;
    const dash = (score / 100) * circ;
    const gap  = circ - dash;

    const c = color || scoreColor(score);

    const svg = svgEl('svg', {
      width: size, height: size,
      viewBox: `0 0 ${size} ${size}`,
      style: 'display:block;',
    });

    // 배경 링
    svg.appendChild(svgEl('circle', {
      cx, cy, r,
      fill: 'none',
      stroke: '#2e3347',
      'stroke-width': '7',
    }));

    // 진행 링
    if (score > 0) {
      svg.appendChild(svgEl('circle', {
        cx, cy, r,
        fill: 'none',
        stroke: c,
        'stroke-width': '7',
        'stroke-dasharray': `${dash} ${gap}`,
        'stroke-linecap': 'round',
        transform: `rotate(-90 ${cx} ${cy})`,
        style: 'transition: stroke-dasharray 0.6s ease',
      }));
    }

    return svg;
  }

  /* ─────────────────────────────────────
   * 4. 컴포넌트 분해 막대 (Value Score 7개)
   *    items: [{ key, label, value, excluded }]
   * ───────────────────────────────────── */
  function componentBars(items, container) {
    container.innerHTML = '';
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'comp-row';

      const lbl = document.createElement('div');
      lbl.className = 'comp-label truncate';
      lbl.textContent = item.label;
      lbl.title = item.label;

      const barBg = document.createElement('div');
      barBg.className = 'comp-bar-bg';
      const barFill = document.createElement('div');
      barFill.className = 'comp-bar-fill' + (item.excluded ? ' na' : '');
      barFill.style.width = item.excluded ? '100%' : (item.value || 0) + '%';
      barBg.appendChild(barFill);

      const val = document.createElement('div');
      if (item.excluded) {
        val.className = 'comp-na';
        val.textContent = '산출 불가';
      } else {
        val.className = 'comp-val';
        val.textContent = Math.round(item.value || 0);
      }

      row.appendChild(lbl);
      row.appendChild(barBg);
      row.appendChild(val);
      container.appendChild(row);
    });
  }

  /* ─────────────────────────────────────
   * 5. 일별 사용량 막대 (대시보드 카드)
   *    dailySec: { 'YYYY-MM-DD': sec }
   *    days: 최근 N일
   * ───────────────────────────────────── */
  function dailyBarChart(dailySec, todayStr, days, opts) {
    const { w = 200, h = 50, color = '#6c8fff' } = opts || {};
    const dates = AppUsage.dateRange(
      new Date(new Date(todayStr + 'T00:00:00Z').getTime() - (days - 1) * 86400000)
        .toISOString().slice(0, 10),
      todayStr
    );
    const values = dates.map(d => Math.round((dailySec[d] || 0) / 60));
    return sparkline(values, { w, h, color, today: dates.length - 1 });
  }

  /* ─────────────────────────────────────
   * 점수 색상
   * ───────────────────────────────────── */
  function scoreColor(score) {
    if (score === null || score === undefined) return '#8892a4';
    if (score >= 55) return '#34d399';
    if (score >= 35) return '#fbbf24';
    return '#f87171';
  }

  /* ─────────────────────────────────────
   * Public API
   * ───────────────────────────────────── */
  global.AppCharts = {
    sparkline,
    barChart,
    donutChart,
    componentBars,
    dailyBarChart,
    scoreColor,
  };

})(window);
