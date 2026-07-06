// Odchody autobusov + potenciálne živé polohy — Ubian (TransData).
// cp.sk scraping blokuje (403), Ubian je discovery-first: z JS bundle
// webu sa vytiahnu API endpointy a otestujú sa aj CORS hlavičky
// (rozhodujú, či prehliadač môže kresliť polohy autobusov na mapu naživo).
import { get, getText, writeResult, CONFIG } from './lib.mjs';

const UBIAN = 'https://www.ubian.sk/';

export async function fetchBuses() {
  const apiUrls = await discoverUbianApis();

  // kandidátne endpointy: objavené + rozumné odhady
  const candidates = [...new Set([
    ...apiUrls,
    'https://www.ubian.sk/api/stops?query=%C4%BDubietov%C3%A1',
    'https://www.ubian.sk/navigation/stations?searchText=%C4%BDubietov%C3%A1',
  ])].slice(0, 10);

  for (const url of candidates) {
    try {
      const res = await get(url, {
        retries: 0, timeoutMs: 12000,
        headers: { origin: 'https://nlesko93.github.io', accept: 'application/json' },
      });
      const cors = res.headers.get('access-control-allow-origin');
      const type = res.headers.get('content-type') || '';
      const body = (await res.text()).slice(0, 300).replace(/\s+/g, ' ');
      console.log(`  buses probe: ${url.slice(0, 90)} -> ${type} | CORS: ${cors || '—'} | ${body}`);
    } catch (e) {
      console.log(`  buses probe: ${url.slice(0, 90)} -> ${e.message.slice(0, 100)}`);
    }
  }
  return writeResult('buses', { items: [], pending: true });
}

// Stiahne homepage + hlavný JS bundle a vytiahne z neho URL API volaní.
async function discoverUbianApis() {
  const found = new Set();
  try {
    const html = await getText(UBIAN, { retries: 0, timeoutMs: 15000 });
    const scripts = [...html.matchAll(/src="([^"]+\.js[^"]*)"/gi)].map(m => m[1])
      .filter(s => !/vendor|jquery|bootstrap|mustache|cookie/i.test(s));
    console.log(`  buses ubian.sk: HTML ${html.length} B, app skripty: ${scripts.slice(0, 8).join(' , ').slice(0, 500)}`);
    // AJAX volania priamo v HTML (server-rendered web)
    const inline = [...new Set([...html.matchAll(/(?:url\s*:\s*|fetch\(|\.get\(|\.post\()["']([^"']{5,120})["']/gi)].map(m => m[1]))];
    if (inline.length) console.log('  buses inline ajax:', inline.slice(0, 12).join(' , ').slice(0, 600));
    inline.filter(u => /api|search|stop|depart|vehicle/i.test(u))
      .forEach(u => { try { found.add(new URL(u, UBIAN).href); } catch { /* */ } });
    // sondy na weby dopravcov (mapa spojov / GPS)
    for (const site of ['https://www.sadzv.sk/', 'https://mapa.ubian.sk/']) {
      try {
        const h = await getText(site, { retries: 0, timeoutMs: 12000 });
        const hints = [...new Set([...h.matchAll(/["'((]\s*(https?:\/\/[^"'\s)]{10,110}|\/[\w\-/.]*(?:api|gps|mapa|vehicle|poloh)[\w\-/.?=&]*)["')]/gi)]
          .map(m => m[1]).filter(u => /api|gps|mapa|vehicle|poloh|json/i.test(u)))];
        console.log(`  buses ${site}: HTML ${h.length} B, hinty: ${hints.slice(0, 10).join(' , ').slice(0, 500) || '—'}`);
      } catch (e) {
        console.log(`  buses ${site}: ${e.message.slice(0, 100)}`);
      }
    }
    for (let s of scripts.slice(0, 4)) {
      if (s.startsWith('/')) s = new URL(s, UBIAN).href;
      if (!s.startsWith('http')) continue;
      try {
        const js = await getText(s, { retries: 0, timeoutMs: 15000 });
        const urls = [...js.matchAll(/["'](https?:\/\/[^"'\s]{8,120})["']/g)].map(m => m[1])
          .filter(u => /api|ubian|transdata|gtfs|vehicle|stop|depart/i.test(u));
        // relatívne endpointy volané cez $.ajax/fetch v bundle
        const paths = [...js.matchAll(/["'](\/[A-Za-z][\w\-/]{3,70})["']/g)].map(m => m[1])
          .filter(p => /search|depart|stop|station|vehicle|poloh|gps|ajax|get|load/i.test(p))
          .map(p => new URL(p, UBIAN).href);
        [...urls, ...paths].forEach(u => found.add(u));
        console.log(`  buses bundle ${s.slice(-40)}: ${js.length} B, api kandidáti: ${[...new Set([...urls, ...paths])].slice(0, 15).join(' , ').slice(0, 800)}`);
      } catch (e) {
        console.log(`  buses bundle ${s.slice(-40)}: ${e.message.slice(0, 80)}`);
      }
    }
  } catch (e) {
    console.log(`  buses ubian.sk: ${e.message.slice(0, 120)}`);
  }
  return [...found].slice(0, 8);
}
