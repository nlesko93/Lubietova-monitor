// Obloha teraz — astronomy-engine lokálne (slnko, mesiac, planéty) +
// Kp index z NOAA SWPC. Polárny graf zdieľa aj polohy satelitov,
// ktoré dodáva sats.js cez setSatPoints().
import { getConfig, fetchJSON, setStatus, showError, every, el, fmtTime } from '../util.js';
import { skyPolar } from '../charts.js';

const PLANETS = [
  ['Mercury', 'Merkúr'], ['Venus', 'Venuša'], ['Mars', 'Mars'],
  ['Jupiter', 'Jupiter'], ['Saturn', 'Saturn'],
];

let observer = null;
let chartBox = null;
let satPoints = [];
let kpInfo = null;
let cfgRef = null;

export function setSatPoints(points) {
  satPoints = points;
  if (observer) drawChart();
}

export async function initSky() {
  const cfg = cfgRef = await getConfig();
  const body = document.getElementById('sky-body');
  observer = new Astronomy.Observer(cfg.lat, cfg.lon, cfg.elevationM || 0);

  body.innerHTML = '';
  body.append(
    el('div', { id: 'sky-tiles' }),
    el('div', { id: 'sky-chart-box' }),
    el('p', { class: 'chart-caption', text: 'Obloha nad Ľubietovou — stred je zenit, okraj obzor. Body: planéty, Mesiac a satelity práve nad obzorom.' }),
  );
  chartBox = document.getElementById('sky-chart-box');

  // Kp index (polárna žiara) — stačí raz za 30 min.
  every(30 * 60 * 1000, async () => {
    try {
      const rows = await fetchJSON('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
      const last = rows.at(-1);
      kpInfo = { kp: parseFloat(last[1]), time: last[0] };
    } catch (e) {
      console.warn('[sky] Kp nedostupný', e);
      kpInfo = null;
    }
  });

  // Lokálny prepočet každých 30 s (výpočty sú lacné).
  every(30 * 1000, () => {
    renderTiles(document.getElementById('sky-tiles'), cfgRef);
    drawChart();
    setStatus('sky', `lokálny výpočet · ${fmtTime(new Date())}`, 'live');
  });
}

function riseSet(bodyName, date) {
  const rise = Astronomy.SearchRiseSet(bodyName, observer, +1, date, 1);
  const set = Astronomy.SearchRiseSet(bodyName, observer, -1, date, 1);
  return { rise: rise?.date, set: set?.date };
}

function horiz(bodyName, time) {
  const eq = Astronomy.Equator(bodyName, time, observer, true, true);
  return Astronomy.Horizon(time, observer, eq.ra, eq.dec, 'normal');
}

const MOON_PHASES = [
  [22.5, 'nov 🌑'], [67.5, 'dorastajúci kosáčik 🌒'], [112.5, 'prvá štvrť 🌓'],
  [157.5, 'dorastajúci mesiac 🌔'], [202.5, 'spln 🌕'], [247.5, 'cúvajúci mesiac 🌖'],
  [292.5, 'posledná štvrť 🌗'], [337.5, 'cúvajúci kosáčik 🌘'], [360.1, 'nov 🌑'],
];

function renderTiles(box, cfg) {
  const now = new Date();
  const sun = riseSet(Astronomy.Body.Sun, now);
  const moon = riseSet(Astronomy.Body.Moon, now);
  const moonIllum = Astronomy.Illumination(Astronomy.Body.Moon, now);
  const phaseAngle = Astronomy.MoonPhase(now);
  const phase = MOON_PHASES.find(([max]) => phaseAngle < max)[1];
  const sunH = horiz(Astronomy.Body.Sun, now);

  let dayState;
  if (sunH.altitude > 0) dayState = 'deň';
  else if (sunH.altitude > -6) dayState = 'občiansky súmrak';
  else if (sunH.altitude > -12) dayState = 'nautický súmrak';
  else if (sunH.altitude > -18) dayState = 'astronomický súmrak';
  else dayState = 'noc';

  const tile = (label, value, sub = '') => el('div', { class: 'tile' }, [
    el('div', { class: 'label', text: label }),
    el('div', { class: 'value', text: value }),
    sub ? el('div', { class: 'sub', text: sub }) : null,
  ]);

  const tiles = [
    tile('Slnko', `${sun.rise ? fmtTime(sun.rise) : '—'} / ${sun.set ? fmtTime(sun.set) : '—'}`, `${dayState} · výška ${Math.round(sunH.altitude)}°`),
    tile('Mesiac', `${Math.round(moonIllum.phase_fraction * 100)} %`, `${phase} · vych. ${moon.rise ? fmtTime(moon.rise) : '—'}, zap. ${moon.set ? fmtTime(moon.set) : '—'}`),
  ];

  if (kpInfo) {
    const aurora = kpInfo.kp >= 7 ? 'polárna žiara možná aj na Slovensku!' :
      kpInfo.kp >= 5 ? 'geomagnetická búrka — žiara skôr na severe' : 'pokojné geomagnetické pole';
    tiles.push(tile('Kp index', kpInfo.kp.toFixed(1), aurora));
  }

  const visiblePlanets = PLANETS
    .map(([b, name]) => ({ name, h: horiz(Astronomy.Body[b], new Date()) }))
    .filter(p => p.h.altitude > 0);
  tiles.push(tile('Planéty nad obzorom', visiblePlanets.length ? visiblePlanets.map(p => p.name).join(', ') : 'žiadna', ''));

  box.innerHTML = '';
  box.appendChild(el('div', { class: 'tiles', style: 'grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));' }, tiles));
}

function drawChart() {
  if (!chartBox) return;
  const now = new Date();
  const objects = [];

  const sunH = horiz(Astronomy.Body.Sun, now);
  if (sunH.altitude > 0) {
    objects.push({ name: 'Slnko', az: sunH.azimuth, el: sunH.altitude, color: 'var(--series-3)', kind: 'hviezda', big: true, label: true });
  }
  const moonH = horiz(Astronomy.Body.Moon, now);
  if (moonH.altitude > 0) {
    objects.push({ name: 'Mesiac', az: moonH.azimuth, el: moonH.altitude, color: 'var(--text-secondary)', kind: 'mesiac', big: true, label: true });
  }
  for (const [b, name] of PLANETS) {
    const h = horiz(Astronomy.Body[b], now);
    if (h.altitude > 0) {
      objects.push({ name, az: h.azimuth, el: h.altitude, color: 'var(--series-5)', kind: 'planéta', label: true });
    }
  }
  for (const s of satPoints) objects.push(s);
  skyPolar(chartBox, objects);
}
