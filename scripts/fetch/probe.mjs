// DOČASNÁ sonda (2): tabuľka bohoslužieb, RSS kalendára a blog farnosti Medzibrod.
import { writeResult, stripTags } from './lib.mjs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const cut = (s, n) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);
const get = async u => { const r = await fetch(u, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': UA } }); return [r, await r.text()]; };

export async function fetchProbe() {
  const log = [];
  try {
    const [r, t] = await get('https://medzibrod.fara.sk/porad_bohosluzeb');
    const i = t.search(/PORADIE BOHOSLU/i);
    const tbl = t.slice(i, t.indexOf('</table>', t.indexOf('porad_b_exp', i)) + 8);
    log.push(`tabuľka ${tbl.length} B (HTML, prvých 3500): ${cut(tbl, 3500)}`);
    log.push(`tabuľka text: ${cut(stripTags(tbl.replace(/<\/tr>/gi, ' ⏎ ').replace(/<\/td>/gi, ' | ')), 3000)}`);
    const after = t.slice(t.indexOf('</table>', i));
    log.push(`za tabuľkou: ${cut(stripTags(after), 900)}`);
  } catch (e) { log.push(`porad: ${e.message}`); }
  for (const u of ['https://medzibrod.fara.sk/rss_kalendar.php', 'https://medzibrod.fara.sk/blog.php', 'https://medzibrod.fara.sk/kalendar']) {
    try {
      const [r, t] = await get(u);
      log.push(`=== ${u} → ${r.status} ${r.headers.get('content-type')} ${t.length} B`);
      if (/rss/.test(u)) {
        const items = t.match(/<item[\s>][\s\S]*?<\/item>/g) || [];
        log.push(`  položiek ${items.length}: ${items.slice(0, 6).map(it => cut(it, 450)).join(' ⏎ ')}`);
      } else {
        const body = t.slice(Math.max(0, t.search(/page-heading|<h1/i)));
        log.push(`  ${cut(stripTags(body), 1500)}`);
        const links = [...new Set([...t.matchAll(/href="([^"#]*(?:clanek|blog|akce|udalost)[^"#]*)"[^>]*>([\s\S]*?)<\/a>/gi)].map(m => `${m[1]} „${cut(stripTags(m[2]), 50)}"`))];
        log.push(`  odkazy: ${links.slice(-20).join(' ; ').slice(0, 1500)}`);
      }
    } catch (e) { log.push(`${u}: ${e.message}`); }
  }
  return writeResult('_probe', { log });
}
