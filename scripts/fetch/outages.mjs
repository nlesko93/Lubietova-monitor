// Plánované odstávky elektriny — Stredoslovenská distribučná (ssd.sk).
// Prvá fáza: diagnostika štruktúry webu (formuláre, API endpointy v JS),
// parser sa doladí podľa logov z Actions.
import { getText, getJSON, writeResult, stripTags, CONFIG } from './lib.mjs';

const CANDIDATE_PAGES = [
  'https://www.ssd.sk/planovane-odstavky?page_id=4958',
  'https://www.ssd.sk/planovane-odstavky/notifikacie-o-planovanych-odstavkach?page_id=5240',
  'https://www.ssd.sk/planovane-odstavky',
];

const CANDIDATE_APIS = [];

export async function fetchOutages() {
  for (const url of CANDIDATE_APIS) {
    try {
      const d = await getJSON(url, { retries: 0, timeoutMs: 15000 });
      const rows = d?.items || d?.data || (Array.isArray(d) ? d : []);
      console.log(`  outages API: ${url.slice(0, 80)} -> ${rows.length} záznamov`);
      if (rows.length) {
        console.log('  outages vzorka:', JSON.stringify(rows[0]).slice(0, 400));
      }
    } catch (e) {
      console.log(`  outages API: ${url.slice(0, 80)} -> ${e.message.slice(0, 120)}`);
    }
  }

  for (const url of CANDIDATE_PAGES) {
    try {
      const html = await getText(url, { retries: 0, timeoutMs: 20000 });
      const forms = [...html.matchAll(/<form[^>]*action="([^"]*)"/gi)].map(m => m[1]);
      const inputs = [...new Set([...html.matchAll(/<(?:input|select)[^>]*\sname="([^"]+)"/gi)].map(m => m[1]))];
      const scripts = [...html.matchAll(/src="([^"]+\.js[^"]*)"/gi)].map(m => m[1]).slice(0, 8);
      const apiHints = [...new Set([...html.matchAll(/["'](\/[\w\-/]*(?:api|odstavk|outage)[\w\-/?.=&]*)["']/gi)].map(m => m[1]))]
        .filter(u => !/\.(jpg|png|css)/i.test(u)).slice(0, 10);
      console.log(`  outages ${url.slice(0, 70)}: HTML ${html.length} B | formy: ${forms.join(',') || '—'} | polia: ${inputs.join(',').slice(0, 300) || '—'} | api hinty: ${apiHints.join(' , ') || '—'}`);
      // tabuľky/zoznamy odstávok na stránke
      const tableRows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].slice(0, 4)
        .map(m => stripTags(m[0]).slice(0, 160));
      if (tableRows.length) console.log('  outages tabuľka:', tableRows.join(' || ').slice(0, 700));
      const odstavkyLinks = [...new Set([...html.matchAll(/href="([^"]*odstavk[^"]*)"/gi)].map(m => m[1]))].slice(0, 10);
      console.log('  outages odkazy:', odstavkyLinks.join(' , ').slice(0, 600) || '—');
      const ajax = [...new Set([...html.matchAll(/(?:ajax|fetch|url:)\s*\(?["']([^"']{8,120})["']/gi)].map(m => m[1]))].slice(0, 8);
      if (ajax.length) console.log('  outages ajax:', ajax.join(' , ').slice(0, 500));
      if (/ľubietov/i.test(html)) {
        const pos = html.search(/ľubietov/i);
        console.log('  outages: stránka spomína Ľubietovú:', stripTags(html.slice(pos - 200, pos + 300)));
      }
    } catch (e) {
      console.log(`  outages ${url.slice(0, 60)}: ${e.message.slice(0, 120)}`);
    }
  }
  return writeResult('outages', { items: [], pending: true });
}
