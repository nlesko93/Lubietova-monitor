// Zmluvy obce — Centrálny register zmlúv (crz.gov.sk).
// CRZ má verejné JSON API; presný tvar sa môže líšiť, preto skúšame
// viac endpointov a logujeme, ktorý zabral.
import { getJSON, writeResult, CONFIG } from './lib.mjs';

const NAME = encodeURIComponent(CONFIG.icoSearchName || 'Obec Ľubietová');

const ATTEMPTS = [
  // API v2 (dokumentované na crz.gov.sk/api)
  `https://www.crz.gov.sk/api/v2/zmluvy?dodavatel_nazov=${NAME}&limit=15&order=desc&sort=datum_zverejnenia`,
  `https://www.crz.gov.sk/api/v2/zmluvy?objednavatel_nazov=${NAME}&limit=15&order=desc&sort=datum_zverejnenia`,
  `https://www.crz.gov.sk/export/api/zmluvy?q=${NAME}`,
];

export async function fetchContracts() {
  const collected = [];
  const notes = [];
  for (const url of ATTEMPTS) {
    try {
      const data = await getJSON(url, { retries: 0 });
      const rows = data?.zmluvy || data?.data || data?.items || data?.results ||
        (Array.isArray(data) ? data : []);
      notes.push(`${url.slice(0, 80)} -> ${rows.length}`);
      for (const r of rows) collected.push(normalize(r));
    } catch (e) {
      notes.push(`${url.slice(0, 80)} -> ${e.message}`);
    }
  }
  console.log('  crz diagnostika:', notes.join(' | '));
  const seen = new Set();
  const items = collected
    .filter(c => c.title && !seen.has(c.link || c.title) && (seen.add(c.link || c.title), true))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 15);
  return writeResult('contracts', { items });
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

const num = v => {
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
};
