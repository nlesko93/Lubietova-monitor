// Správy o Ľubietovej — Google News RSS, záloha Bing News RSS.
// Google pri častých požiadavkách z IP adries GitHub Actions vracia HTTP 429,
// preto sa správy ťahajú najviac raz za hodinu (lib.cached) a pri zlyhaní
// sa skúsi druhý zdroj.
import { getText, cached, xmlBlocks, xmlValue, stripTags } from './lib.mjs';

const Q = encodeURIComponent('"Ľubietová"');
const SOURCES = [
  ['Google News', `https://news.google.com/rss/search?q=${Q}&hl=sk&gl=SK&ceid=SK:sk`],
  ['Bing News', `https://www.bing.com/news/search?q=${Q}&format=rss&setlang=sk&cc=SK`],
];

export const fetchNews = () => cached('news', 1, 1, load, prev => (prev.items || []).length > 0);

async function load() {
  let lastErr;
  for (const [via, url] of SOURCES) {
    try {
      const xml = await getText(url, { retries: 0, headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' } });
      const items = xmlBlocks(xml, 'item').map(it => ({
        title: stripTags(xmlValue(it, 'title')),
        link: xmlValue(it, 'link'),
        date: xmlValue(it, 'pubDate') ? new Date(xmlValue(it, 'pubDate')).toISOString() : null,
        source: stripTags(xmlValue(it, 'source') || xmlValue(it, 'News:Source') || ''),
      })).filter(it => it.title)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, 25);
      console.log(`  news: ${via} → ${items.length} správ`);
      if (items.length) return { items, via };
      lastErr = new Error(`${via}: 0 správ`);
    } catch (e) {
      lastErr = e;
      console.log(`  news: ${via} zlyhal — ${e.message.slice(0, 100)}`);
    }
  }
  throw lastErr;
}
