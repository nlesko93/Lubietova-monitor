// DOČASNÁ sonda: stránka ECAV Ľubietová (bohoslužby).
import { writeResult, stripTags } from './lib.mjs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const cut = (s, n) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);

export async function fetchProbe() {
  const log = [];
  for (const u of ['https://ecav.sk/zapadny-distrikt/zvolensky-seniorat/lubietova']) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(20000), redirect: 'follow', headers: { 'user-agent': UA } });
      const t = await r.text();
      log.push(`=== ${u} → ${r.status} ${r.url} · ${t.length} B`);
      const main = t.slice(Math.max(0, t.search(/<main|id="content"|class="content/i)));
      log.push(`text: ${cut(stripTags(main.replace(/<\/(p|div|li|tr|h\d)>/gi, ' ⏎ ')), 3500)}`);
      const i = t.search(/bohoslu/i);
      log.push(`HTML okolo „bohoslu" @${i}: ${i >= 0 ? cut(t.slice(Math.max(0, i - 600), i + 2600), 3200) : '—'}`);
      const links = [...new Set([...t.matchAll(/href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map(m => `${m[1]} „${cut(stripTags(m[2]), 40)}"`))]
        .filter(l => /lubietov|bohoslu|oznam|kalend|udalost|event|rss|ical|ics/i.test(l));
      log.push(`odkazy: ${links.slice(0, 30).join(' ; ').slice(0, 2000)}`);
      log.push(`rss/ics: ${[...t.matchAll(/<link[^>]*(rss|atom|calendar)[^>]*>/gi)].map(m => m[0]).join(' ') || '—'}`);
    } catch (e) { log.push(`${u}: ${e.message} ${e.cause?.code || ''}`); }
  }
  return writeResult('_probe', { log });
}
