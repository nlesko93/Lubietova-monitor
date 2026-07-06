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
    const scripts = [...html.matchAll(/src="([^"]+\.js[^"]*)"/gi)].map(m => m[1]);
    console.log(`  buses ubian.sk: HTML ${html.length} B, skripty: ${scripts.slice(0, 6).join(' , ').slice(0, 400)}`);
    for (let s of scripts.slice(0, 3)) {
      if (s.startsWith('/')) s = new URL(s, UBIAN).href;
      if (!s.startsWith('http')) continue;
      try {
        const js = await getText(s, { retries: 0, timeoutMs: 15000 });
        const urls = [...js.matchAll(/["'](https?:\/\/[^"'\s]{8,120})["']/g)].map(m => m[1])
          .filter(u => /api|ubian|transdata|gtfs|vehicle|stop|depart/i.test(u));
        const paths = [...js.matchAll(/["'](\/(?:api|navigation|gtfs)[\w\-/]{2,80})["']/g)].map(m => new URL(m[1], UBIAN).href);
        [...urls, ...paths].forEach(u => found.add(u));
        console.log(`  buses bundle ${s.slice(-40)}: ${js.length} B, api kandidáti: ${[...new Set([...urls, ...paths])].slice(0, 12).join(' , ').slice(0, 700)}`);
      } catch (e) {
        console.log(`  buses bundle ${s.slice(-40)}: ${e.message.slice(0, 80)}`);
      }
    }
  } catch (e) {
    console.log(`  buses ubian.sk: ${e.message.slice(0, 120)}`);
  }
  return [...found].slice(0, 8);
}
