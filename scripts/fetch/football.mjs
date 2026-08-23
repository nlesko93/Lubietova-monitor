// Futbal — FK Baník Ľubietová z Futbalnetu (SPORTNET, sportnet.sme.sk).
// Stránky sú Next.js: dáta bývajú v <script id="__NEXT_DATA__">. Najprv
// DIAGNOSTIKA štruktúry, potom sa doplní parsovanie tabuľky a výsledkov.
import { get, writeResult, CONFIG } from './lib.mjs';

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function nextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// rekurzívne nájde kľúče v objekte (na odhalenie, kde sú standings/matches)
function findKeys(obj, wanted, depth = 0, hits = []) {
  if (!obj || typeof obj !== 'object' || depth > 6) return hits;
  for (const k of Object.keys(obj)) {
    if (wanted.test(k)) hits.push(k);
    findKeys(obj[k], wanted, depth + 1, hits);
  }
  return hits;
}

export async function fetchFootball() {
  const f = CONFIG.football || {};
  const pages = {
    vysledky: (f.links || []).find(l => /vysledky/i.test(l.url))?.url,
    tabulka: (f.links || []).find(l => /\/s\//i.test(l.url) && !/vysledky/i.test(l.url))?.url,
  };

  const diag = {};
  for (const [key, url] of Object.entries(pages)) {
    if (!url) { diag[key] = 'bez URL'; continue; }
    try {
      const html = await (await get(url, { timeoutMs: 25000, retries: 1, headers: { 'user-agent': UA, accept: 'text/html' } })).text();
      const nd = nextData(html);
      const pp = nd?.props?.pageProps;
      const dehydr = pp?.dehydratedState || pp?.reactQueryState;
      diag[key] = {
        htmlKb: Math.round(html.length / 1024),
        hasNext: !!nd,
        ppKeys: pp ? Object.keys(pp).slice(0, 20) : null,
        interesting: nd ? [...new Set(findKeys(nd, /standing|table|tabul|match|zapas|result|vysledk|competition|team|round/i))].slice(0, 20) : [],
        queries: dehydr?.queries ? dehydr.queries.length : null,
        sample: JSON.stringify(pp || {}).slice(0, 400),
      };
    } catch (e) {
      diag[key] = { error: e.message.slice(0, 160) };
    }
  }

  console.log('  football diag:', JSON.stringify(diag).slice(0, 500));
  return writeResult('football', { items: [], _diag: diag });
}
