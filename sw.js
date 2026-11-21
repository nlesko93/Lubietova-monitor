// Service worker — umožní inštaláciu ako aplikácie (PWA) a základnú prácu
// offline. Stratégia: vlastné súbory stránky „najprv sieť, pri výpadku
// cache" — aplikácia tak vždy ukáže najnovšie dáta a verziu, a bez
// internetu aspoň posledný stav. Cudzie API (počasie, lietadlá…) sa
// necachujú, idú priamo.
const CACHE = 'lubietova-v1';
const SHELL = [
  './', 'index.html', 'config.json', 'manifest.webmanifest',
  'assets/css/style.css', 'assets/js/main.js', 'assets/js/util.js', 'assets/js/charts.js',
  'assets/js/cards/air.js', 'assets/js/cards/datacards.js', 'assets/js/cards/gallery.js',
  'assets/js/cards/hours.js', 'assets/js/cards/mapcard.js', 'assets/js/cards/planes.js',
  'assets/js/cards/quakes.js', 'assets/js/cards/sats.js', 'assets/js/cards/sky.js',
  'assets/js/cards/today.js', 'assets/js/cards/weather.js', 'assets/js/cards/wiki.js',
  'assets/vendor/leaflet/leaflet.css', 'assets/vendor/leaflet/leaflet.js',
  'assets/vendor/satellite.min.js', 'assets/vendor/astronomy.browser.min.js',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon.svg',
];

self.addEventListener('install', e => {
  // jednotlivo — chýbajúci súbor nezhodí inštaláciu
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // dáta majú v URL ?v=… (cache-bust) — v cache ich držíme bez parametrov
  const key = url.pathname.includes('/data/') ? url.origin + url.pathname : req;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(key, copy));
      }
      return res;
    }).catch(() => caches.match(key, { ignoreSearch: true })
      .then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
