// Cestovný poriadok — SAD Zvolen / IDS BBSK, prímestská doprava.
// Discovery objavil sekciu „odchody zo zastávok"; hľadáme linku 610
// (Banská Bystrica – Ľubietová) a spôsob, ako získať odchody z obce.
import { getText, writeResult, stripTags } from './lib.mjs';

const PAGES = [
  'https://www.sadzv.sk/cestovne-poriadky/primestska-doprava/',
  'https://www.sadzv.sk/cestovne-poriadky/primestska-doprava/?tab=odchody-zo-zastavok',
  'https://sadzv.sk/cestovne-poriadky/primestska-doprava/',
];

export async function fetchBuses() {
  for (const url of PAGES) {
    try {
      const html = await getText(url, { retries: 0, timeoutMs: 20000 });

      // odkazy súvisiace s linkou 610 / zastávkou / PDF cestovného poriadku
      const links = [...new Set([...html.matchAll(/href="([^"#]+)"/gi)].map(m => m[1]))]
        .map(u => { try { return new URL(u, url).href; } catch { return null; } })
        .filter(Boolean);
      const l610 = links.filter(u => /\b610\b|linka.?610|-610-|_610/i.test(u));
      const pdfs = links.filter(u => /\.pdf/i.test(u) && /610|primest|linka|cp/i.test(u)).slice(0, 8);
      const stopLinks = links.filter(u => /zastavk|odchod|stop|station/i.test(u)).slice(0, 8);

      // wp-json / admin-ajax endpointy (WordPress dátové rozhranie)
      const api = [...new Set([...html.matchAll(/["'](https?:\/\/[^"']*(?:wp-json|admin-ajax|api)[^"']*)["']/gi)].map(m => m[1]))]
        .filter(u => !/oembed/i.test(u)).slice(0, 10);

      console.log(`  buses ${url.slice(0, 70)}: HTML ${html.length} B`);
      console.log(`    linka 610: ${l610.slice(0, 8).join(' , ').slice(0, 500) || '—'}`);
      console.log(`    PDF cp: ${pdfs.join(' , ').slice(0, 500) || '—'}`);
      console.log(`    zastávky/odchody: ${stopLinks.join(' , ').slice(0, 500) || '—'}`);
      console.log(`    api: ${api.join(' , ').slice(0, 500) || '—'}`);

      // kontext okolo "610" a "Ľubietov" priamo v HTML
      for (const kw of ['610', 'ubietov']) {
        const pos = html.search(new RegExp(kw, 'i'));
        if (pos >= 0) {
          console.log(`    HTML okolo "${kw}": ${stripTags(html.slice(Math.max(0, pos - 200), pos + 250)).slice(0, 400)}`);
        }
      }
    } catch (e) {
      console.log(`  buses ${url.slice(0, 70)}: ${e.message.slice(0, 120)}`);
    }
  }
  return writeResult('buses', { items: [], pending: true });
}
