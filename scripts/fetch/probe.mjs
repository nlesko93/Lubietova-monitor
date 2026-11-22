// DOČASNÁ sonda: štruktúra stránky farnosti Medzibrod (poriadok bohoslužieb, oznamy).
import { writeResult, stripTags } from './lib.mjs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const cut = (s, n) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);

export async function fetchProbe() {
  const log = [];
  for (const u of ['https://medzibrod.fara.sk/porad_bohosluzeb', 'https://medzibrod.fara.sk/', 'https://medzibrod.fara.sk/oznamy']) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(20000), redirect: 'follow', headers: { 'user-agent': UA } });
      const t = await r.text();
      log.push(`=== ${u} → ${r.status} ${r.url} · ${t.length} B · ${r.headers.get('content-type')}`);
      const links = [...new Set([...t.matchAll(/href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map(m => `${m[1]} „${cut(stripTags(m[2]), 40)}"`))];
      log.push(`odkazy (${links.length}): ${links.slice(0, 60).join(' ; ').slice(0, 2500)}`);
      const i = t.search(/ubietov/i);
      log.push(`Ľubietová @${i}: ${i >= 0 ? cut(t.slice(Math.max(0, i - 1200), i + 1500), 2700) : '—'}`);
      if (u.includes('porad')) {
        const body = t.slice(Math.max(0, t.search(/<body/i)));
        log.push(`text: ${cut(stripTags(body), 3000)}`);
      }
    } catch (e) { log.push(`${u}: ${e.message} ${e.cause?.code || ''}`); }
  }
  return writeResult('_probe', { log });
}
