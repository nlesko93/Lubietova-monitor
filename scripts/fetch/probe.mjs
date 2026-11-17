// DOČASNÁ sonda: Rajče blokuje IP GitHub Actions (ECONNRESET) — skúsime
// sprostredkovateľov a zistíme štruktúru profilu a albumov.
import { writeResult, stripTags } from './lib.mjs';

const cut = (s, n) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);
const why = e => `${e.message}${e.cause ? ' · ' + (e.cause.code || e.cause.message) : ''}`.slice(0, 160);
const TARGET = 'https://orchideakvet.rajce.idnes.cz/';
const PROXIES = [
  ['allorigins', u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`],
  ['codetabs', u => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`],
  ['corsproxy', u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`],
  ['jina', u => `https://r.jina.ai/${u}`],
];

export async function fetchProbe() {
  const log = [];
  let html = '', via = null;
  for (const [name, wrap] of PROXIES) {
    try {
      const r = await fetch(wrap(TARGET), { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'Mozilla/5.0 LubietovaMonitor' } });
      const t = await r.text();
      log.push(`${name}: ${r.status} · ${t.length} B · CORS ${r.headers.get('access-control-allow-origin') || '—'} · ${cut(t.slice(0, 160), 160)}`);
      if (r.ok && t.length > 2000 && !html) { html = t; via = name; }
    } catch (e) { log.push(`${name}: ${why(e)}`); }
  }
  if (html) {
    log.push(`použitý ${via}`);
    log.push(`rss: ${[...html.matchAll(/<link[^>]*(?:rss|atom)[^>]*>/gi)].map(m => m[0]).join(' ').slice(0, 300) || '—'}`);
    const links = [...new Set([...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]))];
    const albums = links.filter(h => /orchideakvet\.rajce\.idnes\.cz\/[^/?#"]+\/?$/.test(h) || /^\/[^/?#]+\/?$/.test(h));
    log.push(`odkazy ${links.length}, albumy (${albums.length}): ${albums.slice(0, 30).join(' , ').slice(0, 1600)}`);
    const i = html.search(/album/i);
    log.push(`HTML okolo „album": ${cut(html.slice(Math.max(0, i - 300), i + 2200), 2400)}`);
    const imgs = [...new Set([...html.matchAll(/(https?:)?\/\/[^"' )]+\.(?:jpe?g|png|webp)/gi)].map(m => m[0]))];
    log.push(`obrázky (${imgs.length}): ${imgs.slice(0, 5).join(' , ')}`);
    const pick = albums.find(h => /ubietov/i.test(h)) || albums[1] || albums[0];
    if (pick) {
      const url = pick.startsWith('http') ? pick : TARGET.replace(/\/$/, '') + pick;
      const wrap = PROXIES.find(p => p[0] === via)[1];
      try {
        const a = await (await fetch(wrap(url), { signal: AbortSignal.timeout(30000) })).text();
        log.push(`album ${url} · ${a.length} B · title ${cut(stripTags((a.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]), 120)}`);
        log.push(`album meta: ${[...a.matchAll(/<meta[^>]+(?:og:|description)[^>]*>/gi)].map(m => cut(m[0], 160)).slice(0, 6).join(' ; ')}`);
        const aimgs = [...new Set([...a.matchAll(/(https?:)?\/\/[^"' )]+\.(?:jpe?g|png|webp)/gi)].map(m => m[0]))];
        log.push(`fotky v albume (${aimgs.length}): ${aimgs.slice(0, 6).join(' , ')}`);
        const j = a.search(/photos\s*[=:]|var\s+photos|"photos"|photoID/i);
        log.push(`JS s fotkami: ${j >= 0 ? cut(a.slice(j - 100, j + 800), 900) : '—'}`);
      } catch (e) { log.push(`album: ${why(e)}`); }
    }
  }
  return writeResult('_probe', { log });
}
