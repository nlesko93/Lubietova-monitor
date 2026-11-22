// Bohoslužby a farské oznamy — rímskokatolícka farnosť Medzibrod (Ľubietová
// je jej filiálka), web medzibrod.fara.sk (systém Agenda farnosti).
//   rss_kalendar.php — nadchádzajúce bohoslužby: <category> = miesto,
//     <title> „2026-11-22 11:00 - Svätá omša Ľubietová",
//     <description> „Martin Uhrík 2026-11-22 v 11:00 + úmysel"
//   blog — oznamy a pozvánky (odkazy /blog_clanek/<slug>-<id>, dátum za názvom)
// Štruktúra overená v Actions behoch č. 1279–1280.
import { getText, writeResult, xmlBlocks, xmlValue, stripTags, decodeEntities, CONFIG } from './lib.mjs';

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

  // Evanjelický cirkevný zbor (ECAV) — stránka zboru na ecav.sk má pravidelný
  // rozpis („Služby Božie sa konajú každú nedeľu o 9.00 hod. v Ľubietovej…")
  // a kontakty; mimoriadne zmeny zbor dáva na Facebook (len odkaz).
  let ecav = null;
  const ecavUrl = CONFIG.church?.ecavPage;
  if (ecavUrl) {
    try {
      const html = await getText(ecavUrl, { retries: 1 });
      const main = html.slice(Math.max(0, html.search(/id="content"/)));
      // bloky → riadky (stripTags by zlúčil všetko do jedného riadku)
      const lines = stripTags(main.replace(/<\/(p|div|li|tr|h\d|dd|dt)>|<br\s*\/?>/gi, ' ⏎ '))
        .split('⏎').map(l => l.trim()).filter(Boolean);
      const after = re => { const i = lines.findIndex(l => re.test(l)); if (i < 0) return null; const same = lines[i].replace(re, '').trim(); return same || lines[i + 1] || null; };
      const schedule = lines.find(l => /Služby Božie|bohoslužb/i.test(l)) || '';
      const pm = lines.map(l => l.match(/((?:\S+\s+)?farár\S*):\s*([^,]+)/i)).find(Boolean);
      const pastor = pm ? `${pm[1].trim()}: ${pm[2].trim()}` : null;     // napr. „Námestná farárka: Mgr. …"
      const phone = after(/^Telefónne číslo:?/i);
      const email = (main.match(/[\w.]+@ecav\.sk/) || [])[0] || null;
      // pravidlo pre obec: „každú nedeľu o 9.00 hod. v Ľubietovej"
      const rm = schedule.match(/každ\S+ nede\S+ o (\d{1,2})[.:](\d{2})\s*hod\.?\s*v Ľubietov/i);
      ecav = {
        name: 'Evanjelický cirkevný zbor ECAV Ľubietová', url: ecavUrl,
        schedule, pastor, phone, email,
        sunday: rm ? `${rm[1].padStart(2, '0')}:${rm[2]}` : null,
      };
      diag.push(`ECAV: ${schedule ? 'rozpis OK' : 'rozpis nenájdený'}${ecav.sunday ? ', nedeľa ' + ecav.sunday : ''}`);
    } catch (e) { diag.push(`ECAV: ${e.message.slice(0, 100)}`); }
  }

  console.log('  church:', diag.join(' | '));
  if (!services.length && !posts.length && !ecav) throw new Error(`farnosť: nič sa nenačítalo (${diag.join(' | ')})`);
  return writeResult('church', {
    parish: { name: 'Rímskokatolícka farnosť Medzibrod', url: BASE, program: `${BASE}/porad_bohosluzeb` },
    items: services, posts, ecav, _diag: diag,
  });
}
