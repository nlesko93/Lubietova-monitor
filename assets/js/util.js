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
  if (kind !== 'err') markUnavailable(key, false);
}

export function showError(bodyEl, key, err, note = 'Zdroj je momentálne nedostupný.') {
  console.warn(`[${key}]`, err);
  setStatus(key, 'nedostupné', 'err');
  // karta, ktorá už niečo zobrazila, ostáva (prechodný výpadok obnovy);
  // prázdna karta sa presunie do súhrnného riadku „nedostupné zdroje"
  if (bodyEl && !bodyEl.querySelector(':scope > :not(.placeholder):not(.error-note)')) {
    bodyEl.innerHTML = '';
    bodyEl.appendChild(el('p', { class: 'error-note', text: note }));
    markUnavailable(key, true);
  }
}

// --- nedostupné zdroje: namiesto prázdnych kariet jeden súhrnný riadok ---
const unavailable = new Map();   // key -> názov karty
function markUnavailable(key, on) {
  const card = document.querySelector(`[data-status="${key}"]`)?.closest('.card');
  if (!card || card.id === 'card-map') return;
  if (on === card.classList.contains('is-unavailable')) return;
  card.classList.toggle('is-unavailable', on);
  if (on) unavailable.set(key, card.querySelector('h2')?.textContent.trim() || key);
  else unavailable.delete(key);
  renderUnavailable();
}

function renderUnavailable() {
  const box = document.getElementById('unavailable');
  if (!box) return;
  box.hidden = unavailable.size === 0;
  if (box.hidden) { document.body.classList.remove('show-unavailable'); return; }
  const shown = document.body.classList.contains('show-unavailable');
  box.innerHTML = '';
  box.appendChild(el('span', { text: `⚠ Momentálne nedostupné zdroje (${unavailable.size}): ${[...unavailable.values()].join(' · ')}` }));
  const btn = el('button', { class: 'linklike', type: 'button', text: shown ? 'skryť karty' : 'zobraziť karty' });
  btn.addEventListener('click', () => {
    document.body.classList.toggle('show-unavailable');
    renderUnavailable();
  });
  box.appendChild(btn);
}

// Stav čerstvosti dát z Actions: [text, trieda]. Po prekročení limitu
// (predvolene 3 h) sa karta označí ako „staré dáta".
export function freshness(iso, maxAgeH = 3) {
  if (!iso) return ['', ''];
  const ageH = (Date.now() - new Date(iso).getTime()) / 3600e3;
  return ageH > maxAgeH
    ? [`⚠ staré dáta · ${timeAgo(iso)}`, 'stale']
    : [`aktualizované ${timeAgo(iso)}`, ''];
}

export function fmtTime(d, opts = {}) {
  return new Intl.DateTimeFormat('sk-SK', { hour: '2-digit', minute: '2-digit', timeZone: TZ, ...opts })
    .format(d instanceof Date ? d : new Date(d));
}

export function fmtDate(d, opts = {}) {
  return new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'numeric', timeZone: TZ, ...opts })
    .format(d instanceof Date ? d : new Date(d));
}

// Dnešný dátum v čase obce (RRRR-MM-DD) a počet dní od dneška po daný dátum.
export function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}
export function daysFromToday(isoDate) {
  return Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${todayIso()}T00:00:00Z`)) / 86400e3);
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(s)) return '';
  if (s < 0) return 'teraz';                       // článok datovaný do budúcnosti
  if (s < 90) return 'pred chvíľou';
  if (s < 3600) return `pred ${Math.floor(s / 60)} min`;
  if (s < 86400) return `pred ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);                 // celé uplynulé dni (nie zaokrúhlené)
  if (d === 1) return 'včera';
  return `pred ${d} d`;
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
