// Kvalita ovzdušia — Open-Meteo Air Quality (európsky index EAQI).
import { getConfig, fetchJSON, setStatus, showError, every, el, fmtTime } from '../util.js';

// EAQI pásma; stavové farby sú vyhradené a idú vždy s textovým popisom.
const EAQI = [
  [20, 'výborná', 'var(--status-good)'],
  [40, 'dobrá', 'var(--status-good)'],
  [60, 'prijateľná', 'var(--status-warning)'],
  [80, 'zhoršená', 'var(--status-serious)'],
  [100, 'zlá', 'var(--status-critical)'],
  [Infinity, 'veľmi zlá', 'var(--status-critical)'],
];
const band = v => EAQI.find(([max]) => v <= max);

export async function initAir() {
  const cfg = await getConfig();
  const body = document.getElementById('air-body');
  const url = 'https://air-quality-api.open-meteo.com/v1/air-quality' +
    `?latitude=${cfg.lat}&longitude=${cfg.lon}` +
    '&current=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone,sulphur_dioxide' +
    '&timezone=Europe%2FBratislava';

  every(20 * 60 * 1000, async () => {
    try {
      const d = await fetchJSON(url);
      render(body, d.current);
      setStatus('air', `Open-Meteo/CAMS · ${fmtTime(new Date())}`, 'live');
    } catch (e) {
      showError(body, 'air', e);
    }
  });
}

function render(body, c) {
  body.innerHTML = '';
  const aqi = c.european_aqi;
  const [, label, color] = band(aqi ?? 999);

  body.appendChild(el('div', { class: 'hero-row' }, [
    el('span', { class: 'hero-figure', text: aqi != null ? String(Math.round(aqi)) : '—' }),
    el('span', { class: 'hero-side' }, [
      el('span', { class: 'badge', style: `--badge-color:${color}`, text: `${label} — európsky index EAQI` }),
    ]),
  ]));

  const t = (lbl, v, unit = 'µg/m³') => el('div', { class: 'tile' }, [
    el('div', { class: 'label', text: lbl }),
    el('div', { class: 'value', html: `${v != null ? Math.round(v * 10) / 10 : '—'} <span class="unit">${unit}</span>` }),
  ]);
  body.appendChild(el('div', { class: 'tiles' }, [
    t('PM2.5', c.pm2_5), t('PM10', c.pm10),
    t('O₃', c.ozone), t('NO₂', c.nitrogen_dioxide), t('SO₂', c.sulphur_dioxide),
  ]));
}
