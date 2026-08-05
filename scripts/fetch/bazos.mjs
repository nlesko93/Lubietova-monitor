// Inzeráty z Bazoš.sk s PSČ obce (976 55). Vyhľadávanie cez www.bazos.sk
// (všetky rubriky) podľa lokality = PSČ; výsledky filtrujeme na dané PSČ.
// Beží hodinovo v Actions (Bazoš je serverovo renderované HTML).
import { get, writeResult, stripTags, CONFIG } from './lib.mjs';

const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Dátum pridania inzerátu = najnovší dátum v bloku, ktorý nie je v budúcnosti
// (Bazoš pri TOP inzerátoch uvádza aj budúci dátum „platí do…").
function bestDate(block) {
  const today = new Date(); today.setHours(23, 59, 59, 999);
  const dates = [...block.matchAll(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/g)]
    .map(m => ({ str: `${m[1]}.${m[2]}.${m[3]}`, d: new Date(+m[3], +m[2] - 1, +m[1]) }))
    .filter(x => !isNaN(x.d) && x.d <= today)
    .sort((a, b) => b.d - a.d);
  return dates[0]?.str || null;
}

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
    // nadpis je v <h2 class=nadpis><a>…</a>; prvý <a> obaľuje obrázok (prázdny
    // text) → vezmeme prvý odkaz na /inzerat/ s neprázdnym textom.
    let link = null, title = null;
    for (const m of b.matchAll(/<a[^>]+href="([^"]*\/inzerat\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const t = stripTags(m[2]);
      if (t) { link = m[1].startsWith('http') ? m[1] : 'https://www.bazos.sk' + m[1]; title = t; break; }
    }
    if (!title) continue;

    const price = stripTags((b.match(/inzeratycena[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '');
    const location = stripTags((b.match(/inzeratylok[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '');
    const desc = stripTags((b.match(/class="popis"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '').slice(0, 160);
    let img = (b.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || null;
    if (img && img.startsWith('//')) img = 'https:' + img;
    const date = bestDate(b);

    // len inzeráty s naším PSČ (vyhľadávanie podľa lokality môže vrátiť okolie)
    if (!pscRe.test(location) && !pscRe.test(b)) continue;

    items.push({ title, link, price, location, desc, img, date });
  }

  const lokSample = blocks.slice(0, 6)
    .map(b => stripTags((b.match(/inzeratylok[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '—').slice(0, 30))
    .join(' | ');
  console.log(`  bazos: ${items.length} inzerátov s PSČ ${psc}`);
  return writeResult('bazos', {
    items: items.slice(0, 30),
    _status: res.status,
    _htmlKb: Math.round(html.length / 1024),
    _blocks: blocks.length,
    _lok: lokSample,
    _sample: (blocks[0] || '').slice(0, 500).replace(/\s+/g, ' '),
  });
}
