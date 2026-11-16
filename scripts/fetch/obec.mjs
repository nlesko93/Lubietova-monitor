// Web obce (lubietova.sk, CMS Galileo) — úradná tabuľa, oznamy, podujatia
// a dokumenty obecného zastupiteľstva. Štruktúra overená v Actions behoch
// č. 1235–1236:
//   /zverejnovanie/uradna-tabula/   odkazy <slug>-<id>.html (dátum berieme z RSS)
//   /aktualne/oznamy/               <a class="event-link"> s h3.event-name a „Dátum: d. m. rrrr"
//   /aktualne/kalendar/             to isté, „Kedy: d. m. rrrr …" (väčšinou zber odpadu)
//   /zverejnovanie/uznesenia/, /zverejnovanie/zvukove-zaznamy-a-zapisnice/
import { getText, writeResult, xmlBlocks, xmlValue, stripTags, decodeEntities } from './lib.mjs';

const BASE = 'https://www.lubietova.sk';
const abs = h => decodeEntities(h.startsWith('http') ? h : BASE + (h.startsWith('/') ? h : '/' + h));
const isoDate = s => {
  const m = String(s || '').match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d\d)/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};

export async function fetchObec() {
  const diag = [];
  const page = async path => {
    try {
      const html = await getText(BASE + path, { retries: 1, timeoutMs: 15000 });
      diag.push(`${path} ${Math.round(html.length / 1024)} kB`);
      return html;
    } catch (e) { diag.push(`${path} ${e.message.slice(0, 60)}`); return ''; }
  };

  // RSS: dátumy zverejnenia podľa odkazu
  const rssDates = new Map();
  try {
    const xml = await getText(`${BASE}/api/rss`, { retries: 1 });
    for (const it of xmlBlocks(xml, 'item')) {
      const d = new Date(xmlValue(it, 'pubDate'));
      const link = xmlValue(it, 'link');
      if (link && !isNaN(d)) rssDates.set(link.trim(), d.toISOString().slice(0, 10));
    }
  } catch (e) { diag.push(`rss ${e.message.slice(0, 60)}`); }

  const [tabulaHtml, oznamyHtml, kalendarHtml, uznHtml, zapHtml] = await Promise.all([
    page('/zverejnovanie/uradna-tabula/'), page('/aktualne/oznamy/'), page('/aktualne/kalendar/'),
    page('/zverejnovanie/uznesenia/'), page('/zverejnovanie/zvukove-zaznamy-a-zapisnice/'),
  ]);

  const sections = [
    { key: 'tabula', title: 'Úradná tabuľa', url: `${BASE}/zverejnovanie/uradna-tabula/`,
      items: sectionLinks(tabulaHtml, '/zverejnovanie/uradna-tabula/', rssDates) },
    { key: 'oznamy', title: 'Oznamy', url: `${BASE}/aktualne/oznamy/`, items: events(oznamyHtml) },
    // zber odpadu má vlastnú kartu — v podujatiach ho nezobrazujeme
    { key: 'podujatia', title: 'Podujatia', url: `${BASE}/aktualne/kalendar/`,
      items: events(kalendarHtml).filter(e => !/zber\s.*odpad/i.test(e.title)) },
    { key: 'zastupitelstvo', title: 'Zastupiteľstvo', url: `${BASE}/zverejnovanie/uznesenia/`,
      items: [
        ...documents(uznHtml, '/zverejnovanie/uznesenia/', 'uznesenie'),
        ...documents(zapHtml, '/zverejnovanie/zvukove-zaznamy-a-zapisnice/', 'zápisnica / záznam'),
      ].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 14) },
  ];
  console.log('  obec:', sections.map(s => `${s.key}=${s.items.length}`).join(' '), '|', diag.join(' | '));

  // items = úradná tabuľa + oznamy (kvôli súhrnu behu; karta používa sections)
  const items = [...sections[0].items, ...sections[1].items];
  if (!sections.some(s => s.items.length)) throw new Error(`web obce: nič sa nenačítalo (${diag.join(' | ')})`);
  return writeResult('obec', { items, sections, _diag: diag });
}

// Zoznamy „events" (oznamy, kalendár): <a href class="event-link">…h3.event-name…</a>
function events(html) {
  const out = [];
  for (const m of html.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*class="[^"]*event-link[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const inner = m[2];
    const title = stripTags((inner.match(/<h\d[^>]*event-name[^>]*>([\s\S]*?)<\/h\d>/i) || [])[1] || '');
    if (!title) continue;
    const text = stripTags(inner).replace(title, '').trim();
    const date = isoDate(text);
    const when = (text.match(/Kedy:\s*([^]*?)(?=\s+Kde:|$)/) || [])[1];
    const where = (text.match(/Kde:\s*(.+)$/) || [])[1];
    // perex = text za dátumom (pri oznamoch)
    const perex = when ? '' : text.replace(/^Dátum:\s*\d{1,2}\.\s*\d{1,2}\.\s*20\d\d\s*/, '');
    out.push({
      title, link: abs(m[1]), date,
      meta: (when ? [when.trim(), where?.trim()].filter(Boolean).join(' · ') : perex).slice(0, 160),
    });
  }
  return out.slice(0, 12);
}

// Položky sekcie: odkazy na <sekcia>/<slug>-<id>.html
function sectionLinks(html, path, rssDates) {
  const out = [];
  const seen = new Set();
  const re = new RegExp(`<a\\s[^>]*href="((?:${BASE})?${path}[^"?#]+\\.html)"[^>]*>([\\s\\S]*?)</a>`, 'gi');
  for (const m of html.matchAll(re)) {
    const link = abs(m[1]);
    const title = stripTags((m[2].match(/<h\d[^>]*>([\s\S]*?)<\/h\d>/i) || [])[1] || m[2]);
    if (!title || seen.has(link)) continue;
    seen.add(link);
    // dátum: z textu odkazu, z okolia za odkazom, inak z RSS
    const near = stripTags(html.slice(m.index, m.index + m[0].length + 400));
    out.push({ title: title.replace(/\s*Dátum:.*$/, ''), link, date: isoDate(stripTags(m[2])) || rssDates.get(link) || isoDate(near), meta: '' });
  }
  return out.slice(0, 12);
}

// Dokumenty zastupiteľstva: položky sekcie alebo priamo súbory na stiahnutie.
function documents(html, path, kind) {
  const main = html.slice(Math.max(0, html.search(/class="gcm-main"/)));
  const out = sectionLinks(main, path, new Map()).map(d => ({ ...d, meta: kind }));
  if (out.length) return out;
  const seen = new Set();
  for (const m of main.matchAll(/<a\s[^>]*href="([^"]*(?:e_download\.php|\.pdf|\.docx?|\.mp3)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const link = abs(m[1]);
    let title = stripTags(m[2]);
    if (!title) title = decodeURIComponent((m[1].match(/original=([^&"]+)/) || [])[1] || '').replace(/\.\w{3,4}$/, '');
    if (!title || title.length < 4 || seen.has(link) || /mini\d+sk/.test(m[1])) continue;   // mini* = bannery v bočnom paneli
    seen.add(link);
    const near = stripTags(html.slice(Math.max(0, m.index - 300), m.index + m[0].length + 200));
    out.push({ title, link, date: isoDate(title) || isoDate(near), meta: kind });
  }
  return out.slice(0, 12);
}

export const _test = { events, sectionLinks, documents };
