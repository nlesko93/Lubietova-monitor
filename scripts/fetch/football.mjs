// JEDNORAZOVÁ SONDA: nájdi v HTML Futbalnetu vložiteľný widget (widget.sportnet.sk)
// alebo súťažné/klubové API URL (api.sportnet.online/v1/competitions|organizations),
// aby sa dala živá tabuľka vložiť ako iframe. Po vyriešení sa fetcher odstráni.
import { get, writeResult, CONFIG } from './lib.mjs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const uniq = a => [...new Set(a)];

export async function fetchFootball() {
  const f = CONFIG.football || {};
  const pages = {
    tabulka: (f.links || []).find(l => /\/s\//i.test(l.url) && !/vysledky/i.test(l.url))?.url,
    klub: (f.links || []).find(l => /\/k\//i.test(l.url) && !/vysledky/i.test(l.url))?.url,
  };
  const diag = {};
  for (const [key, url] of Object.entries(pages)) {
    if (!url) { diag[key] = 'bez URL'; continue; }
    try {
      const html = await (await get(url, { timeoutMs: 30000, retries: 0, headers: { 'user-agent': UA, accept: 'text/html' } })).text();
      diag[key] = {
        widget: uniq(html.match(/https?:\/\/widget\.sportnet\.sk[^"'<> )]*/gi) || []).slice(0, 10),
        comp: uniq(html.match(/api\.sportnet\.online\/v1\/(?:competitions|organizations|clubs|teams)\/[a-z0-9/_-]{0,60}/gi) || []).slice(0, 10),
        iframe: uniq(html.match(/<iframe[^>]+src="[^"]*"/gi) || []).slice(0, 5),
        embedWords: uniq(html.match(/"(competitionId|__issfId|appSpace|widgetId|embedUrl)"\s*:\s*"[^"]{0,40}"/gi) || []).slice(0, 10),
      };
    } catch (e) { diag[key] = { error: e.message.slice(0, 120) }; }
  }
  console.log('  football probe:', JSON.stringify(diag).slice(0, 900));
  return writeResult('football', { items: [], _diag: diag });
}
