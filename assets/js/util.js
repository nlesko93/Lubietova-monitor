// Zdieľané pomôcky pre karty dashboardu.

export const TZ = 'Europe/Bratislava';

export async function fetchJSON(url, { timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Statické JSON generované cez GitHub Actions; cache-bust po hodinách.
export function loadData(name) {
  const bust = Math.floor(Date.now() / (30 * 60 * 1000));
  return fetchJSON(`data/${name}.json?v=${bust}`);
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function setStatus(key, text, kind = '') {
  const s = document.querySelector(`[data-status="${key}"]`);
  if (!s) return;
  s.textContent = text;
  s.className = `card-status ${kind}`;
}

export function showError(bodyEl, key, err, note = 'Zdroj je momentálne nedostupný.') {
  console.warn(`[${key}]`, err);
  setStatus(key, 'nedostupné', 'err');
  if (bodyEl && !bodyEl.querySelector(':scope > :not(.placeholder)')) {
    bodyEl.innerHTML = '';
    bodyEl.appendChild(el('p', { class: 'error-note', text: note }));
  }
}

export function fmtTime(d, opts = {}) {
  return new Intl.DateTimeFormat('sk-SK', { hour: '2-digit', minute: '2-digit', timeZone: TZ, ...opts })
    .format(d instanceof Date ? d : new Date(d));
}

export function fmtDate(d, opts = {}) {
  return new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'numeric', timeZone: TZ, ...opts })
    .format(d instanceof Date ? d : new Date(d));
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(s)) return '';
  if (s < 90) return 'pred chvíľou';
  if (s < 3600) return `pred ${Math.round(s / 60)} min`;
  if (s < 86400) return `pred ${Math.round(s / 3600)} h`;
  return `pred ${Math.round(s / 86400)} d`;
}

export function updatedLabel(iso) {
  return iso ? `aktualizované ${timeAgo(iso)}` : '';
}

// Periodické obnovovanie, ktoré sa pozastaví na skrytej karte prehliadača.
export function every(ms, fn) {
  let timer = null;
  const tick = async () => { try { await fn(); } catch (e) { console.warn(e); } };
  const start = () => { if (!timer) { tick(); timer = setInterval(tick, ms); } };
  const stop = () => { clearInterval(timer); timer = null; };
  document.addEventListener('visibilitychange', () => {
    document.hidden ? stop() : start();
  });
  start();
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function compass(deg) {
  const dirs = ['S', 'SSV', 'SV', 'VSV', 'V', 'VJV', 'JV', 'JJV', 'J', 'JJZ', 'JZ', 'ZJZ', 'Z', 'ZSZ', 'SZ', 'SSZ'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

let configPromise = null;
export function getConfig() {
  configPromise ??= fetchJSON('config.json');
  return configPromise;
}
