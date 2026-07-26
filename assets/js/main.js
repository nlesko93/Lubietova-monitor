// Ľubietová Monitor — orchestrácia dashboardu.
import { TZ, fmtTime } from './util.js';
import { initMap } from './cards/mapcard.js';
import { initWeather } from './cards/weather.js';
import { initAir } from './cards/air.js';
import { initPlanes } from './cards/planes.js';
import { initSky } from './cards/sky.js';
import { initSats } from './cards/sats.js';
import { initQuakes } from './cards/quakes.js';
import { initWiki } from './cards/wiki.js';
import { initGallery } from './cards/gallery.js';
import { initHours } from './cards/hours.js';
import {
  initNews, initObec, initAlerts, initContracts,
  initFinance, initDemo, initWebcams, initWaste, initElections,
  initOutages, initBuses, initHydro, initTraffic,
} from './cards/datacards.js';

// --- téma ---
const root = document.documentElement;
const savedTheme = localStorage.getItem('theme');
if (savedTheme) root.dataset.theme = savedTheme;
else if (window.matchMedia('(prefers-color-scheme: dark)').matches) root.dataset.theme = 'dark';
else root.dataset.theme = 'light';
document.getElementById('theme-toggle').addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', root.dataset.theme);
});

// --- hodiny (čas v Ľubietovej) ---
const clockEl = document.getElementById('clock');
const clockFmt = new Intl.DateTimeFormat('sk-SK', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ,
});
setInterval(() => { clockEl.textContent = clockFmt.format(new Date()); }, 1000);
clockEl.textContent = clockFmt.format(new Date());

// --- východ/západ slnka v hlavičke ---
try {
  const obs = new Astronomy.Observer(48.7478, 19.3625, 495);
  const rise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, +1, new Date(), 1);
  const set = Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, -1, new Date(), 1);
  document.getElementById('topbar-sun').textContent =
    `☀ ${rise ? fmtTime(rise.date) : '—'} → ${set ? fmtTime(set.date) : '—'}`;
} catch (e) { console.warn(e); }

// --- karty: každá beží nezávisle, chyba jednej nezhodí ostatné ---
const cards = [
  initMap, initWeather, initAir, initPlanes, initSky, initSats, initQuakes,
  initWiki, initNews, initObec, initAlerts, initContracts, initFinance,
  initDemo, initWebcams, initWaste, initElections,
  initOutages, initBuses, initHydro, initGallery, initTraffic, initHours,
];
for (const init of cards) {
  Promise.resolve().then(init).catch(e => console.error(init.name, e));
}
