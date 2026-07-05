// Aktuality a úradná tabuľa z webu obce (lubietova.sk).
// Stratégia: najprv skúsi bežné RSS cesty, potom tolerantný HTML parser.
import { get, getText, writeResult, xmlBlocks, xmlValue, stripTags, decodeEntities } from './lib.mjs';

const BASE = 'https://www.lubietova.sk';

const RSS_CANDIDATES = [
  `${BASE}/rss`, `${BASE}/rss.xml`, `${BASE}/feed`, `${BASE}/feed/`,
  `${BASE}/aktuality/rss`, `${BASE}/api/rss`, `${BASE}/rss/aktuality`,
];

const SECTION_PAGES = [
  { url: `${BASE}/`, section: 'aktuality' },
  { url: `${BASE}/aktuality`, section: 'aktuality' },
  { url: `${BASE}/uradna-tabula`, section: 'úradná tabuľa' },
  { url: `${BASE}/samosprava/uradna-tabula`, section: 'úradná tabuľa' },
];

export async function fetchObec() {
  // 1) RSS
  for (const rssUrl of RSS_CANDIDATES) {
    try {
      const xml = await getText(rssUrl, { retries: 0, timeoutMs: 10000 });
      if (!/<(rss|feed)[\s>]/i.test(xml)) continue;
      const blocks = [...xmlBlocks(xml, 'item'), ...xmlBlocks(xml, 'entry')];
      const items = blocks.map(it => ({
        title: stripTags(xmlValue(it, 'title')),
        link: xmlValue(it, 'link') || (it.match(/<link[^>]*href="([^"]*)"/) || [])[1],
        date: parseDate(xmlValue(it, 'pubDate') || xmlValue(it, 'updated') || xmlValue(it, 'published')),
        section: 'aktuality',
      })).filter(i => i.title).slice(0, 20);
      if (items.length) {
        console.log(`  obec: RSS na ${rssUrl}`);
        return writeResult('obec', { items, via: rssUrl });
      }
    } catch { /* skúsi ďalšiu cestu */ }
  }

  // 2) HTML — pozbiera odkazy, ktoré vyzerajú ako články/oznamy
  const seen = new Set();
  const items = [];
  const diagnostics = [];
  for (const page of SECTION_PAGES) {
    try {
      const html = await getText(page.url, { retries: 0, timeoutMs: 15000 });
      diagnostics.push(`${page.url} -> ${html.length} B`);
      for (const it of extractLinks(html, page.section)) {
        if (seen.has(it.link) || seen.has(it.title)) continue;
        seen.add(it.link); seen.add(it.title);
        items.push(it);
      }
    } catch (e) {
      diagnostics.push(`${page.url} -> ${e.message}`);
    }
  }
  console.log('  obec diagnostika:', diagnostics.join(' | '));
  return writeResult('obec', { items: items.slice(0, 20), via: 'html' });
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}

// Heuristika: <a href> smerujúce na články (aktuality/oznamy/úradná tabuľa…)
// s rozumne dlhým textom.
function extractLinks(html, section) {
  const out = [];
  const re = /<a\s[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const wanted = /aktualit|oznam|urad|tabul|clanok|article|novink|news|zapisnic|vyhlask|zverejn/i;
  let m;
  while ((m = re.exec(html))) {
    let [, href, inner] = m;
    const title = stripTags(inner);
    if (title.length < 18 || title.length > 220) continue;
    if (!wanted.test(href) && !wanted.test(title)) continue;
    if (/prihlas|cookie|mapa-stranok|facebook|instagram/i.test(href)) continue;
    if (href.startsWith('/')) href = BASE + href;
    if (!href.startsWith('http')) continue;
    out.push({ title: decodeEntities(title), link: href, date: null, section });
    if (out.length >= 15) break;
  }
  return out;
}
