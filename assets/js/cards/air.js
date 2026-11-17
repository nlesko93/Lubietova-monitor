// Kvalita ovzdušia.
//   1) MERANIE: najbližší verejný senzor v obci (AirGradient / Sensor.Community,
//      načítava GitHub Actions do data/airsensor.json) — má prednosť.
//   2) MODEL: Open-Meteo / CAMS — výpočet na mriežke ~10 km, nie meranie.
//      Lokálny dym z kúrenia v doline nezachytí, preto býva optimistický.
import { getConfig, fetchJSON, loadData, setStatus, showError, every, el, fmtTime, timeAgo } from '../util.js';
import { lineChart } from '../charts.js';

// EAQI pásma pre index; stavové farby idú vždy s textovým popisom.
const EAQI = [
  [20, 'výborná', 'var(--status-good)'],
  [40, 'dobrá', 'var(--status-good)'],
  [60, 'prijateľná', 'var(--status-warning)'],
  [80, 'zhoršená', 'var(--status-serious)'],
  [100, 'zlá', 'var(--status-critical)'],
  [Infinity, 'veľmi zlá', 'var(--status-critical)'],
];
const band = v => EAQI.find(([max]) => v <= max);

// Európsky index podľa koncentrácie PM2.5 (µg/m³) — pásma EEA.
const PM25 = [
  [10, 'dobrá', 'var(--status-good)'],
  [20, 'prijateľná', 'var(--status-good)'],
  [25, 'mierne zhoršená', 'var(--status-warning)'],
  [50, 'zlá', 'var(--status-serious)'],
  [75, 'veľmi zlá', 'var(--status-critical)'],
  [Infinity, 'extrémne zlá', 'var(--status-critical)'],
];
const pmBand = v => PM25.find(([max]) => v <= max);

const tile = (lbl, v, unit = 'µg/m³') => el('div', { class: 'tile' }, [
  el('div', { class: 'label', text: lbl }),
  el('div', { class: 'value', html: `${v != null ? Math.round(v * 10) / 10 : '—'} <span class="unit">${unit}</span>` }),
]);

export async function initAir() {
  const cfg = await getConfig();
  const body = document.getElementById('air-body');
  const url = 'https://air-quality-api.open-meteo.com/v1/air-quality' +
    `?latitude=${cfg.lat}&longitude=${cfg.lon}` +
    '&current=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone,sulphur_dioxide' +
    '&timezone=Europe%2FBratislava';
  const maxKm = cfg.airSensor?.maxKm ?? 3;       // senzor musí byť v obci
  const maxAgeH = cfg.airSensor?.maxAgeH ?? 3;   // a meranie čerstvé

  every(20 * 60 * 1000, async () => {
    const [m, s] = await Promise.allSettled([fetchJSON(url), loadData('airsensor')]);
    const model = m.status === 'fulfilled' ? m.value.current : null;
    const sensor = s.status === 'fulfilled' ? pickSensor(s.value.items || [], cfg, maxKm, maxAgeH) : null;
    if (sensor && s.value.historyId === sensor.id) sensor.history = s.value.history || [];
    if (!model && !sensor) { showError(body, 'air', m.reason || s.reason); return; }
    body.innerHTML = '';
    if (sensor) renderSensor(body, sensor, model);
    else renderModel(body, model, true);
    setStatus('air', sensor ? `meranie · ${timeAgo(sensor.ts)}` : `model CAMS · ${fmtTime(new Date())}`, 'live');
  });
}

// Pripnutý senzor z config.json (airSensor.id / airSensor.name) má prednosť,
// inak najbližší čerstvý senzor v obci.
function pickSensor(items, cfg, maxKm, maxAgeH) {
  const fresh = items.filter(i => i.pm25 != null && i.ts && (Date.now() - new Date(i.ts).getTime()) / 3600e3 < maxAgeH);
  const pin = cfg.airSensor || {};
  return fresh.find(i => (pin.id && i.id === String(pin.id)) || (pin.name && i.name === pin.name)) ||
    fresh.find(i => i.own) || fresh.find(i => i.distKm <= maxKm) || null;
}

function renderSensor(body, s, model) {
  const [, label, color] = pmBand(s.pm25);
  body.appendChild(el('div', { class: 'hero-row' }, [
    el('span', { class: 'hero-figure', text: String(Math.round(s.pm25)) }),
    el('span', { class: 'hero-side' }, [
      el('span', { text: 'µg/m³ PM2.5 · ' }),
      el('span', { class: 'badge', style: `--badge-color:${color}`, text: label }),
    ]),
  ]));
  body.appendChild(el('div', { class: 'tiles' }, [
    tile('PM2.5', s.pm25), tile('PM10', s.pm10), s.pm1 != null ? tile('PM1', s.pm1) : null,
    s.temp != null ? tile('Teplota', s.temp, '°C') : null,
    s.rh != null ? tile('Vlhkosť', s.rh, '%') : null,
  ].filter(Boolean)));
  body.appendChild(el('p', { class: 'chart-caption', html:
    `<b>Merané v obci</b> — senzor ${s.source} „${escapeText(s.name)}"` +
    (s.lat != null ? ` (${s.distKm} km od stredu obce), <a href="${s.url}" target="_blank" rel="noopener">mapa senzorov →</a>` : '') }));
  // história merania — posledných 72 h
  const since = Date.now() - 72 * 3600e3;
  const pts = (s.history || []).map(h => ({ x: new Date(h.t), y: h.pm25 })).filter(p => +p.x >= since);
  if (pts.length >= 4) {
    const box = el('div');
    body.appendChild(box);
    const dayFmt = new Intl.DateTimeFormat('sk-SK', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bratislava' });
    lineChart(box, [{ name: 'PM2.5', color: 'var(--series-5)', points: pts }], {
      height: 140, unit: ' µg/m³', xLabel: v => dayFmt.format(new Date(v)),
    });
    const hours = Math.round((+pts.at(-1).x - +pts[0].x) / 3600e3);
    body.appendChild(el('p', { class: 'chart-caption', text:
      `PM2.5 — posledných ${hours >= 48 ? Math.round(hours / 24) + ' dní' : hours + ' h'} (${pts.length} meraní)` }));
  } else {
    body.appendChild(el('p', { class: 'chart-caption', text: 'História sa začína skladať — graf sa zobrazí po niekoľkých aktualizáciách.' }));
  }
  if (model) {
    const diff = model.pm2_5 != null ? s.pm25 - model.pm2_5 : null;
    body.appendChild(el('details', { class: 'more-rows' }, [
      el('summary', { text: `Porovnanie s modelom CAMS (PM2.5 ${model.pm2_5 != null ? Math.round(model.pm2_5 * 10) / 10 : '—'} µg/m³)` }),
      (() => { const box = el('div'); renderModel(box, model, false); return box; })(),
      el('p', { class: 'chart-caption', text:
        'Model je výpočet na mriežke asi 10 km, nie meranie.' +
        (diff != null && Math.abs(diff) >= 5 ? ` Teraz sa od merania líši o ${Math.round(Math.abs(diff))} µg/m³ — lokálny dym z kúrenia v doline model nevidí.` : '') }),
    ]));
  }
}

function renderModel(body, c, standalone) {
  const aqi = c.european_aqi;
  const [, label, color] = band(aqi ?? 999);
  body.appendChild(el('div', { class: 'hero-row' }, [
    el('span', { class: standalone ? 'hero-figure' : 'hero-figure hero-small', text: aqi != null ? String(Math.round(aqi)) : '—' }),
    el('span', { class: 'hero-side' }, [
      el('span', { class: 'badge', style: `--badge-color:${color}`, text: `${label} — európsky index EAQI` }),
    ]),
  ]));
  body.appendChild(el('div', { class: 'tiles' }, [
    tile('PM2.5', c.pm2_5), tile('PM10', c.pm10),
    tile('O₃', c.ozone), tile('NO₂', c.nitrogen_dioxide), tile('SO₂', c.sulphur_dioxide),
  ]));
  if (standalone) {
    body.appendChild(el('p', { class: 'chart-caption', text:
      'Model CAMS (Open-Meteo) — výpočet na mriežke asi 10 km, nie meranie v obci. ' +
      'Lokálny dym z kúrenia nezachytí. Verejne zdieľaný senzor priamo v obci zatiaľ nie je dostupný.' }));
  }
}

const escapeText = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
