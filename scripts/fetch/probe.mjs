// DOČASNÁ sonda: štruktúra profilu na Rajče (albumy, fotky, RSS, hotlink).
import { writeResult, stripTags } from './lib.mjs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const cut = (s, n) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);
const BASE = 'https://orchideakvet.rajce.idnes.cz';

async function get(url, headers = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'follow', headers: { 'user-agent': UA, ...headers } });
  return { res, text: /image|octet/.test(res.headers.get('content-type') || '') ? '' : await res.text() };
}

export async function fetchProbe() {
  const log = [];
  try {
    const { res, text } = await get(BASE + '/');
    log.push(`profil ${res.status} ${res.url} · ${text.length} B · ${res.headers.get('content-type')}`);
    log.push(`rss/atom: ${[...text.matchAll(/<link[^>]*(?:rss|atom)[^>]*>/gi)].map(m => m[0]).join(' ').slice(0, 400) || '—'}`);
    const links = [...new Set([...text.matchAll(/href="([^"]+)"/g)].map(m => m[1]))];
    const albums = links.filter(h => /rajce\.idnes\.cz\/[^/?#"]+\/?$/.test(h) || /^\/[^/?#]+\/?$/.test(h)).slice(0, 40);
    log.push(`odkazy ${links.length}, kandidáti na albumy (${albums.length}): ${albums.join(' , ').slice(0, 1500)}`);
    const i = text.search(/album/i);
    log.push(`HTML okolo „album": ${cut(text.slice(Math.max(0, i - 200), i + 1600), 1800)}`);
    const ld = text.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
    log.push(`ld+json: ${cut(ld?.[1], 600) || '—'}`);
    const imgs = [...new Set([...text.matchAll(/(https?:)?\/\/[^"' )]+\.(?:jpe?g|png|webp)/gi)].map(m => m[0]))];
    log.push(`obrázky na profile (${imgs.length}): ${imgs.slice(0, 6).join(' , ')}`);

    // prvý album, ktorý vyzerá ako Ľubietová, inak prvý album
    const pick = albums.find(h => /ubietov/i.test(h)) || albums.find(h => !/rajce\.idnes\.cz\/?$/.test(h) && !/^\/$/.test(h));
    if (pick) {
      const url = pick.startsWith('http') ? pick : BASE + pick;
      const a = await get(url);
      log.push(`album ${a.res.status} ${url} · ${a.text.length} B · title: ${cut(stripTags((a.text.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]), 150)}`);
      log.push(`album meta: ${[...a.text.matchAll(/<meta[^>]+(?:og:|description|date)[^>]*>/gi)].map(m => cut(m[0], 160)).slice(0, 8).join(' ; ')}`);
      const aimgs = [...new Set([...a.text.matchAll(/(https?:)?\/\/[^"' )]+\.(?:jpe?g|png|webp)/gi)].map(m => m[0]))];
      log.push(`fotky v albume (${aimgs.length}): ${aimgs.slice(0, 8).join(' , ')}`);
      const j = a.text.search(/photoID|photos\s*[=:]|var\s+photos|"photos"/i);
      log.push(`JS s fotkami: ${j >= 0 ? cut(a.text.slice(j - 100, j + 900), 1000) : '—'}`);
      const img = aimgs.find(u => /thumb|images|_/.test(u)) || aimgs[0];
      if (img) {
        const u = img.startsWith('//') ? 'https:' + img : img;
        for (const [n, h] of [['bez referer', {}], ['referer github.io', { referer: 'https://nlesko93.github.io/' }]]) {
          const r = await fetch(u, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': UA, ...h } });
          log.push(`obrázok ${n}: ${r.status} ${r.headers.get('content-type')} ${r.headers.get('content-length')} B · CORS ${r.headers.get('access-control-allow-origin') || '—'}`);
        }
      }
    }
  } catch (e) { log.push(`chyba: ${e.message.slice(0, 200)}`); }
  return writeResult('_probe', { log });
}
