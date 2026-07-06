// Cestovný poriadok linky 610 (IDS BBSK, Banská Bystrica – Ľubietová).
// Živé polohy nie sú verejne dostupné (cp.sk 403, Ubian privátne API),
// ale cestovné poriadky IDS BBSK/SAD Zvolen zverejňuje — discovery
// hľadá GTFS alebo PDF linky 610.
import { getText, writeResult } from './lib.mjs';

const PAGES = [
  'https://www.idsbbsk.sk/',
  'https://www.idsbbsk.sk/cestovne-poriadky/',
  'https://idsbbsk.sk/cestovne-poriadky/',
  'https://www.sadzv.sk/cestovne-poriadky/',
  'https://www.sadzv.sk/',
];

export async function fetchBuses() {
  for (const url of PAGES) {
    try {
      const html = await getText(url, { retries: 0, timeoutMs: 20000 });
      const links = [...new Set([...html.matchAll(/href="([^"#]+)"/gi)].map(m => m[1]))]
        .map(u => { try { return new URL(u, url).href; } catch { return null; } })
        .filter(Boolean);
      const interesting = links.filter(u =>
        /610|poriadk|gtfs|\.zip|\.pdf|linka|linky/i.test(u) && !/facebook|instagram|\.(png|jpg|css|js)/i.test(u));
      console.log(`  buses ${url.slice(0, 55)}: ${links.length} odkazov, zaujímavé: ${interesting.slice(0, 25).join(' , ').slice(0, 1200) || '—'}`);
    } catch (e) {
      console.log(`  buses ${url.slice(0, 55)}: ${e.message.slice(0, 120)}`);
    }
  }
  return writeResult('buses', { items: [], pending: true });
}
