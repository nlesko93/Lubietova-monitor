// Počasie — Open-Meteo (live z prehliadača, refresh 15 min).
import { getConfig, fetchJSON, setStatus, showError, every, el, fmtTime, compass } from '../util.js';
import { lineChart } from '../charts.js';

const WMO = {
  0: ['jasno', '☀️'], 1: ['prevažne jasno', '🌤️'], 2: ['polooblačno', '⛅'], 3: ['zamračené', '☁️'],
  45: ['hmla', '🌫️'], 48: ['námraza', '🌫️'],
  51: ['mrholenie', '🌦️'], 53: ['mrholenie', '🌦️'], 55: ['silné mrholenie', '🌧️'],
  56: ['mrznúce mrholenie', '🌧️'], 57: ['mrznúce mrholenie', '🌧️'],
  61: ['slabý dážď', '🌧️'], 63: ['dážď', '🌧️'], 65: ['silný dážď', '🌧️'],
  66: ['mrznúci dážď', '🌧️'], 67: ['mrznúci dážď', '🌧️'],
  71: ['slabé sneženie', '🌨️'], 73: ['sneženie', '🌨️'], 75: ['husté sneženie', '❄️'], 77: ['snehové zrná', '❄️'],
  80: ['prehánky', '🌦️'], 81: ['prehánky', '🌧️'], 82: ['silné prehánky', '⛈️'],
  85: ['snehové prehánky', '🌨️'], 86: ['snehové prehánky', '🌨️'],
  95: ['búrka', '⛈️'], 96: ['búrka s krúpami', '⛈️'], 99: ['búrka s krúpami', '⛈️'],
};
const wmo = c => WMO[c] || ['—', '🌡️'];

export async function initWeather() {
  const cfg = await getConfig();
  const body = document.getElementById('weather-body');
  const url = 'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${cfg.lat}&longitude=${cfg.lon}` +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure' +
    '&hourly=temperature_2m,precipitation_probability' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum' +
    '&forecast_days=7&timezone=Europe%2FBratislava';

  every(15 * 60 * 1000, async () => {
    try {
      const d = await fetchJSON(url);
      render(body, d);
      setStatus('weather', `Open-Meteo · ${fmtTime(new Date())}`, 'live');
    } catch (e) {
      showError(body, 'weather', e);
    }
  });
}

function render(body, d) {
  body.innerHTML = '';
  const c = d.current;
  const [desc, icon] = wmo(c.weather_code);

  body.appendChild(el('div', { class: 'hero-row' }, [
    el('span', { class: 'hero-emoji', text: icon }),
    el('span', { class: 'hero-figure', text: `${Math.round(c.temperature_2m)}°` }),
    el('span', { class: 'hero-side', html:
      `${desc}<br>pocitovo ${Math.round(c.apparent_temperature)} °C` }),
  ]));

  body.appendChild(el('div', { class: 'tiles' }, [
    tile('Vietor', `${Math.round(c.wind_speed_10m)}`, 'km/h', `${compass(c.wind_direction_10m)}, nárazy ${Math.round(c.wind_gusts_10m)}`),
    tile('Vlhkosť', `${c.relative_humidity_2m}`, '%'),
    tile('Zrážky', `${c.precipitation}`, 'mm/h'),
    tile('Tlak', `${Math.round(c.surface_pressure)}`, 'hPa'),
  ]));

  // 48-hodinový priebeh teploty
  const now = Date.now();
  const points = d.hourly.time
    .map((t, i) => ({ x: new Date(t), y: d.hourly.temperature_2m[i] }))
    .filter(p => +p.x >= now - 3600e3 && +p.x <= now + 48 * 3600e3);
  const chartBox = el('div');
  body.appendChild(chartBox);
  lineChart(chartBox, [{ name: 'Teplota', color: 'var(--series-1)', points }], {
    height: 150, unit: ' °C',
    xLabel: v => fmtTime(new Date(v)),
    markers: [{ x: now, label: 'teraz' }],
  });
  body.appendChild(el('p', { class: 'chart-caption', text: 'Teplota — nasledujúcich 48 hodín' }));

  const strip = el('div', { class: 'forecast-strip' });
  const dayFmt = new Intl.DateTimeFormat('sk-SK', { weekday: 'short' });
  d.daily.time.forEach((t, i) => {
    const [dDesc, dIcon] = wmo(d.daily.weather_code[i]);
    strip.appendChild(el('div', { class: 'forecast-day', title: `${dDesc}, zrážky ${d.daily.precipitation_sum[i]} mm` }, [
      el('div', { class: 'd', text: i === 0 ? 'dnes' : dayFmt.format(new Date(t)) }),
      el('div', { class: 'i', text: dIcon }),
      el('div', { class: 't', html: `<b>${Math.round(d.daily.temperature_2m_max[i])}°</b> ${Math.round(d.daily.temperature_2m_min[i])}°` }),
    ]));
  });
  body.appendChild(strip);
}

function tile(label, value, unit = '', sub = '') {
  return el('div', { class: 'tile' }, [
    el('div', { class: 'label', text: label }),
    el('div', { class: 'value', html: `${value} <span class="unit">${unit}</span>` }),
    sub ? el('div', { class: 'sub', text: sub }) : null,
  ]);
}
