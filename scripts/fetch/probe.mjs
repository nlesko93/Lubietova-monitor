// DOČASNÁ sonda: kde sú farské oznamy (katolícka farnosť, evanjelický zbor).
import { writeResult, stripTags } from './lib.mjs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const cut = (s, n) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);
const why = e => `${e.message}${e.cause ? ' · ' + (e.cause.code || e.cause.message) : ''}`.slice(0, 120);
const RE = /farsk|farnos|cirkev|kostol|evanj|ecav|omš|bohoslu|katol|rkc|rímsko|fara\b|pastor|kňaz|duchovn/i;

async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'follow', headers: { 'user-agent': UA } });
  return { r, t: await r.text() };
}

export async function fetchProbe() {
  const log = [];
  // 1) web obce — všetky odkazy (aj z mapy webu), ktoré súvisia s cirkvami
  const base = 'https://www.lubietova.sk';
  const seen = new Map();
  for (const path of ['/', '/?mapa-webu=1&lang=sk', '/aktualne/oznamy/', '/obec/', '/zivot-v-obci/']) {
    try {
      const { r, t } = await get(base + path);
      log.push(`obec ${path} → ${r.status} ${t.length} B`);
      for (const m of t.matchAll(/<a\s[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const href = m[1].replace(/&amp;/g, '&'), txt = stripTags(m[2]);
        if (RE.test(href + ' ' + txt)) seen.set(href.startsWith('/') ? base + href : href, txt);
      }
    } catch (e) { log.push(`obec ${path}: ${why(e)}`); }
  }
  log.push(`odkazy o cirkvách (${seen.size}): ${[...seen].map(([h, t]) => `${h.replace(base, '')} „${cut(t, 40)}"`).join(' ; ').slice(0, 1800)}`);
  for (const [h] of [...seen].slice(0, 6)) {
    try {
      const { r, t } = await get(h);
      const main = t.slice(Math.max(0, t.search(/class="gcm-main"/)));
      const files = [...main.matchAll(/href="([^"]*(?:\.pdf|download\.php|e_download\.php)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)].slice(0, 6).map(m => `${cut(stripTags(m[2]), 50)} → ${cut(m[1], 90)}`);
      log.push(`  ${h.replace(base, '')} → ${r.status} · ${cut(stripTags(main), 500)} · súbory: ${files.join(' ; ') || '—'}`);
    } catch (e) { log.push(`  ${h}: ${why(e)}`); }
  }
  // 2) typické adresy zboru / farnosti
  for (const u of ['https://lubietova.ecav.sk/', 'https://www.ecav.sk/cirkevne-zbory', 'https://www.ecav.sk/zbory/lubietova',
    'https://www.farnostlubietova.sk/', 'https://lubietova.fara.sk/', 'https://www.bbdieceza.sk/', 'https://www.bbdieceza.sk/farnosti/']) {
    try {
      const { r, t } = await get(u);
      const hit = t.search(/ubietov/i);
      log.push(`${u} → ${r.status} ${r.url !== u ? '(→ ' + r.url + ')' : ''} ${t.length} B · ${hit >= 0 ? 'Ľubietová: ' + cut(stripTags(t.slice(Math.max(0, hit - 300), hit + 300)), 400) : 'bez zmienky'}`);
      const links = [...t.matchAll(/href="([^"]*ubietov[^"]*)"/gi)].map(m => m[1]);
      if (links.length) log.push(`   odkazy: ${[...new Set(links)].slice(0, 6).join(' , ')}`);
    } catch (e) { log.push(`${u}: ${why(e)}`); }
  }
  return writeResult('_probe', { log });
}
