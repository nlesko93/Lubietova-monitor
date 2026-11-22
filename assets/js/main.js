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
import { initToday } from './cards/today.js';
import {
  initNews, initObec, initAlerts, initContracts,
  initFinance, initDemo, initWebcams, initWaste, initElections,
  initOutages, initBuses, initHydro, initTraffic, initBazos, initFootball, initChurch,
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

// --- rýchla navigácia + zbaliteľné sekcie ---
// Sekcie sa dajú zbaliť klikom na nadpis; voľba sa pamätá v prehliadači.
const nav = document.getElementById('section-nav');
const slug = t => t.normalize('NFD').replace(/[^a-zA-Z0-9 ]/g, '').trim().toLowerCase().replace(/\s+/g, '-');
let collapsed = [];
try { collapsed = JSON.parse(localStorage.getItem('collapsedSections') || '[]'); } catch { /* ignore */ }
const setCollapsed = (sec, on) => {
  sec.classList.toggle('collapsed', on);
  sec.querySelector('.theme-title')?.setAttribute('aria-expanded', String(!on));
  collapsed = collapsed.filter(id => id !== sec.id);
  if (on) collapsed.push(sec.id);
  try { localStorage.setItem('collapsedSections', JSON.stringify(collapsed)); } catch { /* ignore */ }
};
const addNav = (target, label) => {
  const a = document.createElement('a');
  a.href = `#${target.id}`;
  a.textContent = label;
  a.addEventListener('click', () => { if (target.classList.contains('collapsed')) setCollapsed(target, false); });
  nav?.appendChild(a);
};
addNav(document.getElementById('today'), '📌 Dnes');
addNav(document.getElementById('card-map'), '🗺️ Mapa');
document.querySelectorAll('main .theme').forEach(sec => {
  const title = sec.querySelector('.theme-title');
  const label = title?.textContent.trim().replace(/\s*\(.*\)$/, '');
  if (!label) return;
  sec.id ||= `sekcia-${slug(sec.getAttribute('aria-label') || label)}`;
  addNav(sec, label);
  title.setAttribute('role', 'button');
  title.tabIndex = 0;
  title.title = 'Zbaliť / rozbaliť sekciu';
  const toggle = () => setCollapsed(sec, !sec.classList.contains('collapsed'));
  title.addEventListener('click', toggle);
  title.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  if (collapsed.includes(sec.id)) setCollapsed(sec, true); else title.setAttribute('aria-expanded', 'true');
});

// --- PWA: service worker + tlačidlo „Nainštalovať" ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e)));
}
const installBtn = document.getElementById('install-btn');
const installHelp = document.getElementById('install-help');
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let installPrompt = null;
// Chrome / Edge / Android: prehliadač ponúkne vlastný dialóg
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  installBtn.hidden = false;
});
window.addEventListener('appinstalled', () => { installBtn.hidden = true; installPrompt = null; });
// iPhone / iPad (Safari) dialóg nemá — ukážeme návod
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (ios && !standalone) installBtn.hidden = false;
installBtn.addEventListener('click', async () => {
  if (installPrompt) {
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') installBtn.hidden = true;
    installPrompt = null;
    return;
  }
  document.getElementById('install-help-text').innerHTML = ios
    ? 'V Safari ťukni na ikonu <b>Zdieľať</b> (štvorček so šípkou) a vyber <b>Pridať na plochu</b>.'
    : 'V menu prehliadača vyber <b>Inštalovať aplikáciu</b> alebo <b>Pridať na plochu</b>.';
  installHelp.showModal();
});

// --- karty: každá beží nezávisle, chyba jednej nezhodí ostatné ---
const cards = [
  initToday, initMap, initWeather, initAir, initPlanes, initSky, initSats, initQuakes,
  initWiki, initNews, initObec, initAlerts, initContracts, initFinance,
  initDemo, initWebcams, initWaste, initElections,
  initOutages, initBuses, initHydro, initGallery, initTraffic, initHours, initBazos, initFootball, initChurch,
];
for (const init of cards) {
  Promise.resolve().then(init).catch(e => console.error(init.name, e));
}
