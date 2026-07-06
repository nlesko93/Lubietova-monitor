// Odchody autobusov zo zastávok v Ľubietovej — cestovné poriadky (cp.sk).
// Prvá fáza: diagnostika — cp.sk môže scraping blokovať; logujú sa
// štruktúry stránok pre doladenie parsera.
import { getText, writeResult, stripTags, decodeEntities } from './lib.mjs';

const CANDIDATES = [
  'https://cp.hnonline.sk/vlakbus/odchody/?f=%C4%BDubietov%C3%A1&fc=200003',
  'https://cp.hnonline.sk/bus/odchody/?f=%C4%BDubietov%C3%A1',
  'https://cp.hnonline.sk/vlakbus/odchody/?f=%C4%BDubietov%C3%A1',
];

export async function fetchBuses() {
  for (const url of CANDIDATES) {
    try {
      const html = await getText(url, { retries: 0, timeoutMs: 20000, headers: { referer: 'https://cp.hnonline.sk/' } });
      const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
      console.log(`  buses: ${url.slice(0, 80)} -> HTML ${html.length} B, title: ${stripTags(title || '').slice(0, 120)}`);
      const items = parseDepartures(html);
      if (items.length) {
        console.log('  buses vzorka:', JSON.stringify(items[0]));
        return writeResult('buses', { items: items.slice(0, 12), via: url });
      }
      // diagnostika — riadky s časmi
      const timeish = [...html.matchAll(/<tr[\s\S]{0,600}?\d{1,2}:\d{2}[\s\S]{0,300}?<\/tr>/gi)].slice(0, 2);
      console.log('  buses diagnostika:', timeish.map(m => stripTags(m[0]).slice(0, 250)).join(' || ') || stripTags(html).slice(0, 500));
    } catch (e) {
      console.log(`  buses: ${url.slice(0, 80)} -> ${e.message.slice(0, 140)}`);
    }
  }
  return writeResult('buses', { items: [], pending: true });
}

// Odchodová tabuľa: riadky s časom, linkou a smerom.
function parseDepartures(html) {
  const items = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => stripTags(m[1]));
    const time = cells.find(c => /^\d{1,2}:\d{2}$/.test(c));
    if (!time) continue;
    const dest = cells.find(c => c.length > 3 && !/^\d{1,2}:\d{2}$/.test(c) && !/^\d+$/.test(c));
    if (!dest) continue;
    items.push({ time, destination: decodeEntities(dest), line: cells.find(c => /^\d{3,6}$/.test(c)) || '' });
  }
  return items;
}
