// Vodné stavy — SHMÚ (tabuľky operatívnych hydrologických údajov).
// Parsuje HTML tabuľku staníc; vyberá stanice na Hrone v okolí obce.
import { getText, writeResult, stripTags } from './lib.mjs';

const PAGES = [
  'https://www.shmu.sk/sk/?page=1&id=hydro_vod_all',
  'https://www.shmu.sk/sk/?page=1&id=hydro_vod_all&kraj=BC',
];

const STATION_MATCH = /banská bystrica|šalková|lučatín|medzibrod|brusno|slovenská ľupča/i;

export async function fetchHydro() {
  let lastErr;
  for (const url of PAGES) {
    try {
      const html = await getText(url, { retries: 1, timeoutMs: 25000 });
      const rows = parseTables(html);
      console.log(`  hydro: ${url.slice(0, 70)} -> ${rows.length} riadkov tabuľky`);
      if (!rows.length) {
        console.log('  hydro diagnostika (výňatok):', stripTags(html).slice(0, 600));
        continue;
      }
      console.log('  hydro hlavička+vzorka:', rows.slice(0, 3).map(r => r.join('§')).join(' || ').slice(0, 600));
      const hits = rows.filter(r => r.some(c => STATION_MATCH.test(c)));
      console.log(`  hydro: ${hits.length} staníc v okolí:`, hits.slice(0, 5).map(r => r.join('§')).join(' || ').slice(0, 600));
      const items = hits.map(parseStation).filter(Boolean).slice(0, 5);
      if (items.length) return writeResult('hydro', { items, via: url });
    } catch (e) {
      lastErr = e;
      console.log(`  hydro: ${url.slice(0, 70)} -> ${e.message.slice(0, 140)}`);
    }
  }
  if (lastErr) throw lastErr;
  return writeResult('hydro', { items: [], pending: true });
}

// Všetky <tr> vo všetkých tabuľkách → polia buniek (text).
function parseTables(html) {
  const rows = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(m => stripTags(m[1]));
    if (cells.length >= 3) rows.push(cells);
  }
  return rows;
}

// Heuristika stĺpcov: [stanica, tok, ..., dátum/čas, stav cm, prietok]
function parseStation(cells) {
  const num = s => {
    const n = parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  };
  const station = cells.find(c => STATION_MATCH.test(c));
  const numbers = cells.map(num).filter(v => v != null);
  const time = cells.find(c => /\d{1,2}[.:]\d{2}/.test(c) && /\d{4}|\d{1,2}\./.test(c));
  if (!station || !numbers.length) return null;
  return {
    station,
    river: cells[1] && cells[1] !== station ? cells[1] : '',
    time: time || null,
    levelCm: numbers[0] ?? null,
    flow: numbers[1] ?? null,
    raw: cells.join(' | ').slice(0, 200),
  };
}
