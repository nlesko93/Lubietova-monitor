// Plánované odstávky elektriny — Stredoslovenská distribučná (ssd.sk).
// Prvá fáza: diagnostika štruktúry webu (formuláre, API endpointy v JS),
// parser sa doladí podľa logov z Actions.
import { getText, getJSON, writeResult, stripTags, CONFIG } from './lib.mjs';

const CANDIDATE_PAGES = [
  'https://www.ssd.sk/planovane-odstavky',
  'https://www.ssd.sk/planovane-odstavky-elektriny',
  'https://www.ssd.sk/aktualne-odstavky',
];

// odhady API endpointov (SSD portál býva na online.ssd.sk)
const CANDIDATE_APIS = [
  `https://online.ssd.sk/api/odstavky?obec=${encodeURIComponent(CONFIG.obec)}`,
  `https://www.ssd.sk/api/planovane-odstavky?obec=${encodeURIComponent(CONFIG.obec)}`,
];

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
      const apiHints = [...new Set([...html.matchAll(/["'](\/[\w\-/]*(?:api|odstavk|outage)[\w\-/?.=&]*)["']/gi)].map(m => m[1]))].slice(0, 10);
      console.log(`  outages ${url.slice(0, 60)}: HTML ${html.length} B | formy: ${forms.join(',') || '—'} | polia: ${inputs.join(',').slice(0, 300) || '—'} | api hinty: ${apiHints.join(' , ') || '—'}`);
      console.log(`  outages skripty: ${scripts.join(' , ').slice(0, 500)}`);
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
