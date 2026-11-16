// Zmluvy obce a jej firiem — Centrálny register zmlúv (crz.gov.sk).
//
// CRZ nemá verejné JSON API, funguje HTML vyhľadávanie. Pre každý subjekt
// z config.contractEntities (obec, Obecné lesy, Obecná píla) hľadáme OBE
// strany zmluvy: subjekt ako objednávateľ aj subjekt ako dodávateľ.
// Rolu pri každej zmluve potom určíme zo stĺpcov Dodávateľ / Objednávateľ.
import { getText, cached, stripTags, CONFIG } from './lib.mjs';

const ENTITIES = CONFIG.contractEntities?.length ? CONFIG.contractEntities : [
  { key: 'obec', short: 'Obec', name: CONFIG.icoSearchName || 'Obec Ľubietová', ico: CONFIG.icoObce || '00313564', match: 'obec\\s+[ľl]ubietov' },
];
const SEARCH = 'https://www.crz.gov.sk/2171273-sk/centralny-register-zmluv/';
// polia formulára CRZ: art_ico = IČO dodávateľa, art_ico1 = IČO objednávateľa
// (overené v Actions behu č. 1232)
const ICO_FIELDS = ['art_ico', 'art_ico1'];
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, 'máj': 5, maj: 5, 'jún': 6, jun: 6, 'júl': 7, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12 };

// Stránkovanie CRZ: &page=N (0 = prvá strana, 20 zmlúv na stranu; overené
// v Actions behu č. 1236). Čítame najviac MAX_PAGES strán na hľadanie alebo
// kým neprejdeme pred 1. január minulého roka — to stačí na ročné súčty.
const MAX_PAGES = 8;
const PAGE_SIZE = 20;

export const fetchContracts = () => cached('contracts', 3, 3, load, prev => (prev.items || []).length > 0);

async function load() {
  const diag = [];
  const byLink = new Map();
  const coverage = {};
  const stopBefore = `${new Date().getFullYear() - 1}-01-01`;

  for (const ent of ENTITIES) {
    const re = new RegExp(ent.match || escapeRe(ent.name), 'i');
    coverage[ent.key] = {};
    for (const field of ICO_FIELDS) {
      const role = field === 'art_ico1' ? 'objednavatel' : 'dodavatel';
      let count = 0, oldest = null, complete = false, pages = 0;
      try {
        for (let page = 0; page < MAX_PAGES; page++) {
          const url = `${SEARCH}?${field}=${encodeURIComponent(ent.ico)}${page ? `&page=${page}` : ''}`;
          const html = await getText(url, { retries: 1, timeoutMs: 20000 });
          const rows = parseRows(html).items;
          pages++;
          for (const it of rows) {
            const isSup = re.test(it.supplier), isCli = re.test(it.client);
            // vyhľadávanie podľa IČO môže vrátiť aj cudzie zhody — ber len
            // riadky, kde subjekt naozaj vystupuje
            if (!isSup && !isCli) continue;
            const prev = byLink.get(it.link);
            const roles = prev?.roles || {};
            roles[ent.key] = isSup && isCli ? 'obe' : isCli ? 'objednavatel' : 'dodavatel';
            byLink.set(it.link, { ...it, roles });
            count++;
            if (it.date && (!oldest || it.date < oldest)) oldest = it.date;
          }
          if (rows.length < PAGE_SIZE) { complete = true; break; }   // posledná strana
          if (oldest && oldest < stopBefore) break;                   // máme celý minulý rok
          await new Promise(r => setTimeout(r, 300));                 // šetrne k serveru
        }
        diag.push(`${ent.key}/${role}: ${count} (${pages} str., od ${oldest || '?'}${complete ? ', všetko' : ''})`);
      } catch (e) {
        diag.push(`${ent.key}/${role}: ${count} + chyba ${e.message.slice(0, 80)}`);
      }
      coverage[ent.key][role] = { count, oldest, complete };
    }
  }

  const items = [...byLink.values()].map(it => {
    const keys = Object.keys(it.roles);
    // zmluva medzi dvoma „našimi" subjektmi (napr. obec ↔ obecné lesy)
    const internal = keys.length > 1 || Object.values(it.roles).includes('obe');
    // nájmy hrobových miest sú početná špecifická kategória — dá sa v karte skryť
    const grave = /hrob|cintor/i.test(it.title);
    // do výstupu len to, čo karta potrebuje (zmlúv môžu byť stovky)
    return {
      title: it.title, value: it.value, date: it.date, link: it.link, roles: it.roles,
      entities: keys, internal, grave, partner: partnerOf(it, keys),
    };
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const counts = {};
  for (const ent of ENTITIES) {
    const mine = items.filter(i => i.roles[ent.key]);
    counts[ent.key] = {
      total: mine.length,
      objednavatel: mine.filter(i => i.roles[ent.key] === 'objednavatel').length,
      dodavatel: mine.filter(i => i.roles[ent.key] === 'dodavatel').length,
    };
  }
  console.log('  crz:', diag.join(' | '));
  if (!items.length) throw new Error(`CRZ: žiadne zmluvy (${diag.join(' | ')})`);
  console.log('  crz roly:', JSON.stringify(counts), '· interné:', items.filter(i => i.internal).length, '· hrobové miesta:', items.filter(i => i.grave).length);

  return {
    items,
    entities: ENTITIES.map(e => ({ key: e.key, short: e.short || e.name, name: e.name, ico: e.ico })),
    counts, coverage,
    _diag: diag,
  };
}

// Protistrana z pohľadu „našich" subjektov (bez adresy — len názov).
function partnerOf(it, keys) {
  if (keys.length > 1) return '';   // obe strany sú „naše", vidno ich z odznakov
  const role = it.roles[keys[0]];
  return shortName(role === 'dodavatel' ? it.client : it.supplier);
}

// „NB Consult s.r.o., Horná 14199/101, 974 01 Banská Bystrica" → „NB Consult s.r.o."
// (odreže sa prvá časť za čiarkou, ktorá obsahuje číslo = adresa)
const shortName = s => s.split(/,\s+(?=[^,]*\d)/)[0].trim();

// Tabuľka výsledkov: dátum | názov + číslo | cena | dodávateľ | objednávateľ.
function parseRows(html) {
  const items = [];
  let raw = null;
  for (const tr of html.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || []) {
    const a = tr.match(/<a\s[^>]*href="([^"]*\/zmluva\/(\d+)\/?[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    if (!raw) raw = tr;
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
    if (cells.length < 4) continue;
    const titleIdx = cells.findIndex(c => c.includes(a[0]));
    const title = stripTags(a[3]);
    const number = stripTags(cells[titleIdx].replace(a[0], ''));
    let priceIdx = cells.findIndex((c, i) => i > titleIdx && /€|eur/i.test(c));
    if (priceIdx < 0) priceIdx = titleIdx + 1;
    const supplier = stripTags(cells[priceIdx + 1] ?? '');
    const client = stripTags(cells[priceIdx + 2] ?? '');
    let href = a[1];
    if (href.startsWith('/')) href = 'https://www.crz.gov.sk' + href;
    items.push({
      title, number,
      value: parsePrice(stripTags(cells[priceIdx] ?? '')),
      date: parseDate(stripTags(cells[titleIdx > 0 ? 0 : cells.length - 1] ?? '')),
      supplier, client, link: href,
    });
  }
  return { items, raw };
}

function parsePrice(s) {
  const m = s.replace(/ /g, ' ').match(/-?\d[\d\s]*(?:[.,]\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
}

// „13. November 2026" alebo „13.11.2026" → 2026-11-13
function parseDate(s) {
  let m = s.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = s.match(/(\d{1,2})\.?\s*([A-Za-zÀ-ž]+)\s*(\d{4})/);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (mon) return iso(+m[3], mon, +m[1]);
  }
  return null;
}
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
