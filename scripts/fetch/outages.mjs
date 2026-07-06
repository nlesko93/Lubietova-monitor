// Plánované odstávky elektriny — Stredoslovenská distribučná (ssd.sk).
// Prvá fáza: diagnostika štruktúry webu (formuláre, API endpointy v JS),
// parser sa doladí podľa logov z Actions.
import { getText, getJSON, writeResult, stripTags, CONFIG } from './lib.mjs';

const CANDIDATE_PAGES = [
  'https://www.ssd.sk/planovane-odstavky?page_id=4958',
  'https://www.ssd.sk/planovane-odstavky/notifikacie-o-planovanych-odstavkach?page_id=5240',
  'https://www.ssd.sk/planovane-odstavky',
];

// aplikačný skript stránky odstávok (Buxus CMS) — obsahuje API volania
const APP_SCRIPTS = ['https://www.ssd.sk/buxus/docs/js/new-app.js'];

const CANDIDATE_APIS = [];

export async function fetchOutages() {
  for (const url of APP_SCRIPTS) {
    try {
      const js = await getText(url, { retries: 0, timeoutMs: 15000 });
      const urls = [...new Set([...js.matchAll(/["'](\/[\w\-/.]*(?:odstavk|outage|ajax|api|buxus\/gen)[\w\-/.?=&]*)["']|["'](https?:\/\/[^"']{10,110})["']/gi)]
        .map(m => m[1] || m[2]).filter(u => /odstavk|outage|api|ajax/i.test(u)))];
      console.log(`  outages app.js: ${js.length} B, volania: ${urls.slice(0, 12).join(' , ').slice(0, 700) || '—'}`);
    } catch (e) {
      console.log(`  outages app.js: ${e.message.slice(0, 100)}`);
    }
  }
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
      // externé odkazy (aplikácia odstávok býva na inej doméne/portáli)
      const external = [...new Set([...html.matchAll(/href="(https?:\/\/[^"]+)"/gi)].map(m => m[1]))]
        .filter(u => !/facebook|instagram|linkedin|youtube|cookiebot|google|bootstrap/i.test(u)).slice(0, 15);
      console.log('  outages externé:', external.join(' , ').slice(0, 800) || '—');
      // iframe (aplikácia môže byť vložená)
      const iframes = [...html.matchAll(/<iframe[^>]*src="([^"]+)"/gi)].map(m => m[1]);
      if (iframes.length) console.log('  outages iframe:', iframes.join(' , ').slice(0, 400));
      // surové HTML okolo textu "Aplikácia" — odhalí href/onclick odkazu na appku
      const appPos = html.indexOf('Aplikácia');
      if (appPos > 0) {
        console.log('  outages HTML okolo "Aplikácia":',
          html.slice(Math.max(0, appPos - 500), appPos + 600).replace(/\s+/g, ' ').slice(0, 1000));
      }
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
