// Bohoslužby a farské oznamy — rímskokatolícka farnosť Medzibrod (Ľubietová
// je jej filiálka), web medzibrod.fara.sk (systém Agenda farnosti).
//   rss_kalendar.php — nadchádzajúce bohoslužby: <category> = miesto,
//     <title> „2026-11-22 11:00 - Svätá omša Ľubietová",
//     <description> „Martin Uhrík 2026-11-22 v 11:00 + úmysel"
//   blog — oznamy a pozvánky (odkazy /blog_clanek/<slug>-<id>, dátum za názvom)
// Štruktúra overená v Actions behoch č. 1279–1280.
import { getText, writeResult, xmlBlocks, xmlValue, stripTags, decodeEntities } from './lib.mjs';

const BASE = 'https://medzibrod.fara.sk';

export async function fetchChurch() {
  const diag = [];
  let services = [];
  try {
    const xml = await getText(`${BASE}/rss_kalendar.php`, { retries: 1 });
    services = xmlBlocks(xml, 'item').map(it => {
      const title = stripTags(xmlValue(it, 'title'));
      const desc = stripTags(xmlValue(it, 'description'));
      const place = stripTags(xmlValue(it, 'category'));
      const m = title.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(.+)$/);
      if (!m) return null;
      let kind = m[3].trim();
      if (place && kind.endsWith(place)) kind = kind.slice(0, -place.length).trim();
      const d = desc.match(/^(.*?)\s*\d{4}-\d{2}-\d{2}\s+v\s+\d{1,2}:\d{2}\s*(.*)$/);
      return {
        date: m[1], time: m[2].padStart(5, '0'), kind: kind.replace(/[,\s]+$/, ''), place,
        priest: d ? d[1].trim() : '', intention: d ? d[2].trim() : '',
        link: xmlValue(it, 'link') || null,
      };
    }).filter(Boolean).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    diag.push(`kalendár: ${services.length} bohoslužieb (${[...new Set(services.map(s => s.place))].join(', ')})`);
  } catch (e) { diag.push(`kalendár: ${e.message.slice(0, 100)}`); }

  let posts = [];
  try {
    const html = await getText(`${BASE}/blog`, { retries: 1 });
    const seen = new Set();
    for (const m of html.matchAll(/<a\s[^>]*href="((?:https:\/\/medzibrod\.fara\.sk)?\/blog_clanek\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const title = stripTags(m[2]);
      if (!title || /čítať ďalej/i.test(title)) continue;
      const link = decodeEntities(m[1].startsWith('http') ? m[1] : BASE + m[1]);
      if (seen.has(link)) continue;
      seen.add(link);
      // za názvom nasleduje dátum (d.m.rrrr) a perex až po „Čítať ďalej"
      const after = stripTags(html.slice(m.index + m[0].length, m.index + m[0].length + 2500));
      const dm = after.match(/^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      const perex = after.replace(/^\s*\d{1,2}\.\d{1,2}\.\d{4}\s*/, '').split(/Čítať ďalej/i)[0].trim();
      posts.push({
        title, link,
        date: dm ? `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : null,
        perex: perex.slice(0, 220),
        lubietova: /ubietov/i.test(title + ' ' + perex),
      });
    }
    posts = posts.slice(0, 12);
    diag.push(`blog: ${posts.length} oznamov`);
  } catch (e) { diag.push(`blog: ${e.message.slice(0, 100)}`); }

  console.log('  church:', diag.join(' | '));
  if (!services.length && !posts.length) throw new Error(`farnosť: nič sa nenačítalo (${diag.join(' | ')})`);
  return writeResult('church', {
    parish: { name: 'Rímskokatolícka farnosť Medzibrod', url: BASE, program: `${BASE}/porad_bohosluzeb` },
    items: services, posts, _diag: diag,
  });
}
