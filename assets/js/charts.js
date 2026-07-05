// Ručné SVG grafy podľa dataviz pravidiel: 2px čiary, hairline mriežka,
// hover vrstva s tooltipom, text vždy v textových tokenoch.

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

let tooltipNode = null;
export function showTooltip(html, x, y) {
  if (!tooltipNode) {
    tooltipNode = document.createElement('div');
    tooltipNode.className = 'viz-tooltip';
    document.body.appendChild(tooltipNode);
  }
  tooltipNode.innerHTML = html;
  tooltipNode.style.display = 'block';
  const r = tooltipNode.getBoundingClientRect();
  const left = Math.min(x + 14, window.innerWidth - r.width - 8);
  const top = Math.min(y + 14, window.innerHeight - r.height - 8);
  tooltipNode.style.left = `${Math.max(4, left)}px`;
  tooltipNode.style.top = `${Math.max(4, top)}px`;
}
export function hideTooltip() {
  if (tooltipNode) tooltipNode.style.display = 'none';
}

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= count) || mag * 10;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
}

/**
 * Čiarový graf časového radu s crosshair tooltipom.
 * series: [{ name, color, points: [{x: Date|number, y: number}] }]
 */
export function lineChart(container, series, {
  width = 640, height = 200, unit = '', fill = true,
  xLabel = v => String(v), yFmt = v => String(Math.round(v * 10) / 10),
  markers = [],
} = {}) {
  container.innerHTML = '';
  const pad = { l: 38, r: 12, t: 10, b: 22 };
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const all = series.flatMap(s => s.points);
  if (!all.length) return;
  const xs = all.map(p => +p.x), ys = all.map(p => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  const yPadding = (yMax - yMin || 1) * 0.12;
  yMin -= yPadding; yMax += yPadding;
  const X = v => pad.l + ((v - xMin) / (xMax - xMin || 1)) * iw;
  const Y = v => pad.t + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img' });

  for (const t of niceTicks(yMin, yMax)) {
    svg.appendChild(svgEl('line', {
      x1: pad.l, x2: pad.l + iw, y1: Y(t), y2: Y(t),
      stroke: 'var(--grid)', 'stroke-width': 1,
    }));
    const lbl = svgEl('text', {
      x: pad.l - 6, y: Y(t) + 3, 'text-anchor': 'end',
      fill: 'var(--text-muted)', 'font-size': 10, style: 'font-variant-numeric: tabular-nums',
    });
    lbl.textContent = yFmt(t);
    svg.appendChild(lbl);
  }

  const xTickCount = Math.min(6, all.length);
  for (let i = 0; i <= xTickCount; i++) {
    const v = xMin + ((xMax - xMin) * i) / xTickCount;
    const lbl = svgEl('text', {
      x: X(v), y: height - 6, 'text-anchor': 'middle',
      fill: 'var(--text-muted)', 'font-size': 10,
    });
    lbl.textContent = xLabel(v);
    svg.appendChild(lbl);
  }

  for (const s of series) {
    const pts = s.points.map(p => `${X(+p.x).toFixed(1)},${Y(p.y).toFixed(1)}`);
    if (fill) {
      const area = svgEl('path', {
        d: `M${pts.join('L')}L${X(+s.points.at(-1).x)},${pad.t + ih}L${X(+s.points[0].x)},${pad.t + ih}Z`,
        fill: s.color, opacity: 0.1,
      });
      svg.appendChild(area);
    }
    svg.appendChild(svgEl('path', {
      d: `M${pts.join('L')}`,
      fill: 'none', stroke: s.color, 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
  }

  for (const m of markers) {
    svg.appendChild(svgEl('line', {
      x1: X(+m.x), x2: X(+m.x), y1: pad.t, y2: pad.t + ih,
      stroke: 'var(--baseline)', 'stroke-width': 1, 'stroke-dasharray': '0',
    }));
    const lbl = svgEl('text', {
      x: X(+m.x) + 4, y: pad.t + 10, fill: 'var(--text-muted)', 'font-size': 10,
    });
    lbl.textContent = m.label;
    svg.appendChild(lbl);
  }

  // hover vrstva: crosshair + bod + tooltip
  const cross = svgEl('line', { y1: pad.t, y2: pad.t + ih, stroke: 'var(--baseline)', 'stroke-width': 1, visibility: 'hidden' });
  svg.appendChild(cross);
  const dots = series.map(s => {
    const d = svgEl('circle', { r: 4.5, fill: s.color, stroke: 'var(--surface-1)', 'stroke-width': 2, visibility: 'hidden' });
    svg.appendChild(d);
    return d;
  });
  const hit = svgEl('rect', { x: pad.l, y: pad.t, width: iw, height: ih, fill: 'transparent' });
  svg.appendChild(hit);

  const base = series[0].points;
  hit.addEventListener('pointermove', ev => {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * width;
    const xv = xMin + ((px - pad.l) / iw) * (xMax - xMin);
    let idx = 0, best = Infinity;
    base.forEach((p, i) => {
      const d = Math.abs(+p.x - xv);
      if (d < best) { best = d; idx = i; }
    });
    const cx = X(+base[idx].x);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    const rows = series.map((s, i) => {
      const p = s.points[idx];
      if (!p) { dots[i].setAttribute('visibility', 'hidden'); return ''; }
      dots[i].setAttribute('cx', X(+p.x)); dots[i].setAttribute('cy', Y(p.y));
      dots[i].setAttribute('visibility', 'visible');
      return `<div class="tt-row">${s.name}: <b>${yFmt(p.y)}${unit}</b></div>`;
    }).join('');
    showTooltip(`<div class="tt-title">${xLabel(+base[idx].x)}</div>${rows}`, ev.clientX, ev.clientY);
  });
  hit.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    dots.forEach(d => d.setAttribute('visibility', 'hidden'));
    hideTooltip();
  });

  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  wrap.appendChild(svg);
  container.appendChild(wrap);
  return svg;
}

/**
 * Stĺpcový graf (roky × hodnota) s hover tooltipom.
 * data: [{label, value, color?, tooltip?}]
 */
export function barChart(container, data, {
  width = 640, height = 180, color = 'var(--series-1)',
  yFmt = v => v.toLocaleString('sk-SK'),
} = {}) {
  container.innerHTML = '';
  if (!data.length) return;
  const pad = { l: 46, r: 8, t: 8, b: 22 };
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const yMax = Math.max(...data.map(d => d.value)) * 1.08 || 1;
  const yMin = 0;
  const Y = v => pad.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const band = iw / data.length;
  const bw = Math.min(24, band - 2);

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img' });
  for (const t of niceTicks(yMin, yMax, 3)) {
    svg.appendChild(svgEl('line', { x1: pad.l, x2: pad.l + iw, y1: Y(t), y2: Y(t), stroke: 'var(--grid)', 'stroke-width': 1 }));
    const lbl = svgEl('text', { x: pad.l - 6, y: Y(t) + 3, 'text-anchor': 'end', fill: 'var(--text-muted)', 'font-size': 10, style: 'font-variant-numeric: tabular-nums' });
    lbl.textContent = yFmt(t);
    svg.appendChild(lbl);
  }
  const labelStep = Math.ceil(data.length / 8);
  data.forEach((d, i) => {
    const x = pad.l + i * band + (band - bw) / 2;
    const y = Y(d.value), h = Math.max(1, pad.t + ih - y);
    const r = Math.min(4, bw / 2, h);
    // 4px zaoblený dátový koniec, rovná základňa
    const bar = svgEl('path', {
      d: `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y + h} Z`,
      fill: d.color || color,
    });
    bar.addEventListener('pointermove', ev =>
      showTooltip(d.tooltip || `<div class="tt-title">${d.label}</div><div class="tt-row"><b>${yFmt(d.value)}</b></div>`, ev.clientX, ev.clientY));
    bar.addEventListener('pointerleave', hideTooltip);
    svg.appendChild(bar);
    if (i % labelStep === 0) {
      const lbl = svgEl('text', { x: x + bw / 2, y: height - 6, 'text-anchor': 'middle', fill: 'var(--text-muted)', 'font-size': 10 });
      lbl.textContent = d.label;
      svg.appendChild(lbl);
    }
  });
  svg.appendChild(svgEl('line', { x1: pad.l, x2: pad.l + iw, y1: Y(0), y2: Y(0), stroke: 'var(--baseline)', 'stroke-width': 1 }));

  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  wrap.appendChild(svg);
  container.appendChild(wrap);
  return svg;
}

/**
 * Polárny graf oblohy: azimut po obvode (S hore), elevácia od obzoru (okraj)
 * po zenit (stred). objects: [{name, az, el, color, kind, big?}]
 */
export function skyPolar(container, objects, { size = 320 } = {}) {
  let svg = container.querySelector('svg[data-sky]');
  const c = size / 2, rMax = c - 18;
  const pos = o => {
    const r = rMax * (1 - Math.max(0, Math.min(90, o.el)) / 90);
    const a = ((o.az - 90) * Math.PI) / 180;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  if (!svg) {
    svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, role: 'img', 'data-sky': '1' });
    for (const elv of [0, 30, 60]) {
      svg.appendChild(svgEl('circle', {
        cx: c, cy: c, r: rMax * (1 - elv / 90),
        fill: elv === 0 ? 'var(--surface-2)' : 'none',
        stroke: 'var(--grid)', 'stroke-width': 1,
      }));
    }
    svg.appendChild(svgEl('line', { x1: c, y1: c - rMax, x2: c, y2: c + rMax, stroke: 'var(--grid)', 'stroke-width': 1 }));
    svg.appendChild(svgEl('line', { x1: c - rMax, y1: c, x2: c + rMax, y2: c, stroke: 'var(--grid)', 'stroke-width': 1 }));
    const compassPts = [['S', c, 12], ['J', c, size - 4], ['V', size - 8, c + 3], ['Z', 8, c + 3]];
    for (const [t, x, y] of compassPts) {
      const lbl = svgEl('text', { x, y, 'text-anchor': 'middle', fill: 'var(--text-muted)', 'font-size': 11 });
      lbl.textContent = t;
      svg.appendChild(lbl);
    }
    svg.appendChild(svgEl('g', { 'data-layer': 'objects' }));
    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap sky-chart';
    wrap.appendChild(svg);
    container.appendChild(wrap);
  }
  const layer = svg.querySelector('[data-layer="objects"]');
  layer.innerHTML = '';
  for (const o of objects) {
    if (o.el <= 0) continue;
    const [x, y] = pos(o);
    const g = svgEl('g', { style: 'cursor: default' });
    const r = o.big ? 7 : 4.5;
    g.appendChild(svgEl('circle', {
      cx: x, cy: y, r,
      fill: o.color, stroke: 'var(--surface-1)', 'stroke-width': 2,
    }));
    if (o.label) {
      const lbl = svgEl('text', { x: x + r + 3, y: y + 3, fill: 'var(--text-secondary)', 'font-size': 10 });
      lbl.textContent = o.name;
      g.appendChild(lbl);
    }
    g.addEventListener('pointermove', ev => showTooltip(
      `<div class="tt-title">${o.name}</div><div class="tt-row">${o.kind || ''}</div>` +
      `<div class="tt-row">azimut ${Math.round(o.az)}° · výška ${Math.round(o.el)}°</div>` +
      (o.extra ? `<div class="tt-row">${o.extra}</div>` : ''),
      ev.clientX, ev.clientY));
    g.addEventListener('pointerleave', hideTooltip);
    layer.appendChild(g);
  }
}
