// Zmluvy obce — Centrálny register zmlúv (crz.gov.sk).
// API endpointy sa hľadajú postupne; keď žiadny nezaberie, fetcher
// zaloguje obsah dokumentácie /api, aby sa dal endpoint doladiť.
import { getJSON, getText, writeResult, stripTags, decodeEntities, CONFIG } from './lib.mjs';

const NAME = CONFIG.icoSearchName || 'Obec Ľubietová';
const ICO = CONFIG.icoObce || '00313564';
const Q = encodeURIComponent(NAME);

const API_ATTEMPTS = [
  `https://www.crz.gov.sk/api/v2/zmluvy?objednavatel=${Q}&limit=15`,
  `https://www.crz.gov.sk/api/v2/zmluvy?ico=${ICO}&limit=15`,
  `https://www.crz.gov.sk/api/v1/zmluvy?q=${Q}`,
  `https://www.crz.gov.sk/api/zmluvy?q=${Q}`,
];

export async function fetchContracts() {
  const notes = [];

  for (const url of API_ATTEMPTS) {
    try {
      const data = await getJSON(url, { retries: 0, timeoutMs: 15000 });
      const rows = data?.zmluvy || data?.data || data?.items || data?.results ||
        (Array.isArray(data) ? data : []);
      notes.push(`${url.slice(0, 70)} -> ${rows.length} riadkov`);
      if (rows.length) {
        console.log('  crz diagnostika:', notes.join(' | '));
        return writeResult('contracts', { items: normalizeAll(rows), via: url });
      }
    } catch (e) {
      notes.push(`${url.slice(0, 70)} -> ${e.message.slice(0, 120)}`);
    }
  }

  // HTML vyhľadávanie na webe CRZ
  const htmlAttempts = [
    `https://www.crz.gov.sk/zmluvy/?art_ico=${ICO}`,
    `https://www.crz.gov.sk/zmluvy/?art_zs2=${Q}`,
    `https://www.crz.gov.sk/?ID=2171273&art_zs2=${Q}`,
  ];
  for (const url of htmlAttempts) {
    try {
      const html = await getText(url, { retries: 0, timeoutMs: 15000 });
      const items = scrapeSearch(html);
      notes.push(`${url.slice(0, 70)} -> HTML ${html.length} B, ${items.length} zmlúv`);
      if (items.length) {
        console.log('  crz diagnostika:', notes.join(' | '));
        return writeResult('contracts', { items, via: url });
      }
    } catch (e) {
      notes.push(`${url.slice(0, 70)} -> ${e.message.slice(0, 120)}`);
    }
  }

  // Nič nezabralo — zaloguj dokumentáciu API pre ďalšiu iteráciu.
  try {
    const doc = await getText('https://www.crz.gov.sk/api/', { retries: 0 });
    console.log('  crz API docs (výňatok):', stripTags(doc).slice(0, 1500));
  } catch (e) {
    console.log('  crz API docs nedostupné:', e.message.slice(0, 120));
  }
  console.log('  crz diagnostika:', notes.join(' | '));
  return writeResult('contracts', { items: [], note: 'endpoint sa zatiaľ nepodarilo nájsť' });
}

function normalizeAll(rows) {
  const seen = new Set();
  return rows.map(normalize)
    .filter(c => c.title && !seen.has(c.link || c.title) && (seen.add(c.link || c.title), true))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 15);
}

function normalize(r) {
  const id = r.ID || r.id;
  return {
    title: r.nazov || r.predmet || r.nazov_zmluvy || r.title,
    partner: r.dodavatel_nazov || r.dodavatel || r.objednavatel_nazov || r.objednavatel || '',
    value: num(r.suma_celkova ?? r.hodnota_zmluvy ?? r.suma ?? r.cena),
    date: (r.datum_zverejnenia || r.datum_podpisu || r.published || '').slice(0, 10) || null,
    link: id ? `https://www.crz.gov.sk/zmluva/${id}/` : (r.url || r.link || null),
  };
}

// Výsledky HTML vyhľadávania: odkazy na /zmluva/{id}/ alebo detail zmluvy.
function scrapeSearch(html) {
  const items = [];
  const seen = new Set();
  const re = /<a\s[^>]*href="(\/zmluva\/(\d+)[^"]*|[^"]*\/zmluva[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let [, href, , inner] = m;
    const title = stripTags(inner);
    if (!title || title.length < 5 || seen.has(href)) continue;
    seen.add(href);
    if (href.startsWith('/')) href = 'https://www.crz.gov.sk' + href;
    items.push({ title: decodeEntities(title), partner: '', value: null, date: null, link: href });
    if (items.length >= 15) break;
  }
  return items;
}

const num = v => {
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
};
