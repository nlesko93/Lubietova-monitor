// Správy o Ľubietovej — Google News RSS.
import { getText, writeResult, xmlBlocks, xmlValue, stripTags } from './lib.mjs';

export async function fetchNews() {
  const url = 'https://news.google.com/rss/search?q=%22%C4%BDubietov%C3%A1%22&hl=sk&gl=SK&ceid=SK:sk';
  const xml = await getText(url);
  const items = xmlBlocks(xml, 'item').map(it => ({
    title: stripTags(xmlValue(it, 'title')),
    link: xmlValue(it, 'link'),
    date: xmlValue(it, 'pubDate') ? new Date(xmlValue(it, 'pubDate')).toISOString() : null,
    source: stripTags(xmlValue(it, 'source')),
  })).filter(it => it.title)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 25);
  return writeResult('news', { items });
}
