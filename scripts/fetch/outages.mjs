// Odstávky elektriny — oznamy na úradnej tabuli obce (RSS lubietova.sk).
// SSD aplikácia odstávok nemá verejné API (overené v Actions behoch
// č. 17–23), ale prerušenia distribúcie obec zverejňuje ako oznamy.
import { getText, writeResult, xmlBlocks, xmlValue, stripTags } from './lib.mjs';

const RSS = 'https://www.lubietova.sk/api/rss';
const OUTAGE_MATCH = /prerušen\w* distrib|odstávk\w* elektr|prerušen\w* dodávky elektr|bez elektriny|distribúci\w* elektriny/i;

export async function fetchOutages() {
  const xml = await getText(RSS);
  const blocks = [...xmlBlocks(xml, 'item'), ...xmlBlocks(xml, 'entry')];
  const items = blocks.map(it => ({
    title: stripTags(xmlValue(it, 'title')),
    link: xmlValue(it, 'link') || (it.match(/<link[^>]*href="([^"]*)"/) || [])[1],
    date: parseDate(xmlValue(it, 'pubDate') || xmlValue(it, 'updated') || xmlValue(it, 'published')),
    summary: stripTags(xmlValue(it, 'description') || xmlValue(it, 'summary') || '').slice(0, 200),
  })).filter(it => it.title && (OUTAGE_MATCH.test(it.title) || OUTAGE_MATCH.test(it.summary)))
    .slice(0, 8);
  console.log(`  outages: ${blocks.length} oznamov na tabuli, ${items.length} o odstávkach elektriny`);
  return writeResult('outages', { items });
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}
