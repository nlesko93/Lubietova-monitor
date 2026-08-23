// Futbal — FK Baník Ľubietová z Futbalnetu (SPORTNET).
// sportnet.sme.sk je klientsky renderované (dáta cez API). DIAGNOSTIKA:
// nájdi v HTML API host a súťažné/klubové ID, aby sa dalo volať priamo API.
import { get, writeResult, CONFIG } from './lib.mjs';

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const uniq = arr => [...new Set(arr)];

export async function fetchFootball() {
  const f = CONFIG.football || {};
  const pages = {
    vysledky: (f.links || []).find(l => /vysledky/i.test(l.url))?.url,
    tabulka: (f.links || []).find(l => /\/s\//i.test(l.url) && !/vysledky/i.test(l.url))?.url,
    klub: (f.links || []).find(l => /\/k\//i.test(l.url) && !/vysledky/i.test(l.url))?.url,
  };

  const diag = {};
  for (const [key, url] of Object.entries(pages)) {
    if (!url) { diag[key] = 'bez URL'; continue; }
    try {
      const html = await (await get(url, { timeoutMs: 30000, retries: 0, headers: { 'user-agent': UA, accept: 'text/html' } })).text();
      const hosts = uniq((html.match(/https?:\/\/[a-z0-9.-]*sportnet[a-z0-9.-]*/gi) || [])).slice(0, 8);
      const apis = uniq((html.match(/https?:\/\/[a-z0-9.-]*\/(?:api|v1|v2)\/[a-z0-9/_-]{0,40}/gi) || [])).slice(0, 8);
      const ids = uniq((html.match(/\b[0-9a-f]{24}\b/g) || [])).slice(0, 10);
      const keys = uniq((html.match(/"(competitionId|appSpace|__issfId|clubId|teamId|_id|seasonId|partId|competition|club)"/gi) || [])).slice(0, 12);
      const jsonScripts = (html.match(/<script[^>]*type="application\/json"[^>]*>/gi) || []).length;
      const nextish = /__NEXT_DATA__|__NUXT__|__INITIAL_STATE__|window\.__/.test(html);
      diag[key] = { htmlKb: Math.round(html.length / 1024), hosts, apis, idsCount: (html.match(/\b[0-9a-f]{24}\b/g) || []).length, ids, keys, jsonScripts, nextish };
    } catch (e) {
      diag[key] = { error: e.message.slice(0, 120) };
    }
  }

  console.log('  football diag:', JSON.stringify(diag).slice(0, 800));
  return writeResult('football', { items: [], _diag: diag });
}
