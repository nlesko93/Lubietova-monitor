// Inzeráty z Bazoš.sk s PSČ obce (976 55). Vyhľadávanie cez www.bazos.sk
// (všetky rubriky) podľa lokality = PSČ; výsledky filtrujeme na dané PSČ.
// Beží hodinovo v Actions (Bazoš je serverovo renderované HTML).
import { get, writeResult, stripTags, CONFIG } from './lib.mjs';

const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function fetchBazos() {
  const cfg = CONFIG.bazos || {};
  const psc = String(cfg.psc || '97655').replace(/\s/g, '');
  const radius = cfg.radiusKm ?? 0;
  const url = `https://www.bazos.sk/search.php?hledat=&rubriky=www&hlokalita=${psc}` +
    `&humkreie=${radius}&cenaod=&cenado=&Submit=H%C4%BEada%C5%A5&kitx=ano`;

  const res = await get(url, { timeoutMs: 25000, retries: 1, headers: { 'user-agent': BROWSER_UA, accept: 'text/html' } });
  const html = await res.text();
  console.log(`  bazos: ${url}`);
  console.log(`  bazos: HTML ${Math.round(html.length / 1024)} kB, status ${res.status}`);

  // PSČ ako 976 55 aj 97655
  const pscRe = new RegExp(psc.replace(/^(\d{3})(\d{2})$/, '$1\\s*$2'));

  const blocks = html.split(/<div class="inzeraty[ "]/i).slice(1);
  console.log(`  bazos: ${blocks.length} blokov inzerátov`);
  if (blocks[0]) console.log(`  bazos vzorka: ${blocks[0].slice(0, 700).replace(/\s+/g, ' ')}`);

  const items = [];
  for (const b of blocks) {
    const a = b.match(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const href = a[1];
    if (!/\/inzerat\//.test(href)) continue;
    const link = href.startsWith('http') ? href : 'https://www.bazos.sk' + href;
    const title = stripTags(a[2]);
    if (!title) continue;

    const price = stripTags((b.match(/inzeratycena[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '');
    const location = stripTags((b.match(/inzeratylok[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '');
    const desc = stripTags((b.match(/class="popis"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '').slice(0, 160);
    let img = (b.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || null;
    if (img && img.startsWith('//')) img = 'https:' + img;
    const date = (b.match(/(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/) || [])[1]?.replace(/\s+/g, '') || null;

    // len inzeráty s naším PSČ (radius môže vrátiť aj okolie)
    if (!pscRe.test(location) && !pscRe.test(b.slice(0, 2000))) continue;

    items.push({ title, link, price, location, desc, img, date });
  }

  console.log(`  bazos: ${items.length} inzerátov s PSČ ${psc}`);
  return writeResult('bazos', { items: items.slice(0, 30) });
}
