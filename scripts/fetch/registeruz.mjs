// Hospodárenie obce a jej firiem — Register účtovných závierok
// (registeruz.sk, verejné API). Pre každý subjekt z config.contractEntities:
//   - zoznam účtovných závierok,
//   - z výkazov posledných rokov: výnosy / čistý obrat, výsledok hospodárenia
//     po zdanení a majetok spolu (netto).
// Štruktúra výkazov a šablón overená v Actions behu č. 1235:
//   Úč POD (firmy):  „Výkaz ziskov a strát" — Čistý obrat, VH po zdanení (2 stĺpce: bežné, minulé)
//   Úč ROPO (obec):  „Náklady" / „Výnosy" — účtová trieda 5 / 6 spolu, VH po zdanení
//                    (4 stĺpce: hlavná činnosť, podnikateľská, spolu, minulé obdobie)
//   Súvaha: „SPOLU MAJETOK" (4 stĺpce: brutto, korekcia, netto, minulé obdobie)
// Zdroj sa mení raz za rok → cez lib.cached() sa ťahá len raz denne.
import { getJSON, cached, CONFIG } from './lib.mjs';

const RUZ = 'https://www.registeruz.sk/cruz-public/api';
const YEARS = 8;          // za koľko posledných rokov čítať výkazy
const ENTITIES = CONFIG.contractEntities?.length ? CONFIG.contractEntities
  : [{ key: 'obec', short: 'Obec', name: CONFIG.icoSearchName, ico: CONFIG.icoObce }];

const templates = new Map();
const template = id => {
  if (!templates.has(id)) templates.set(id, getJSON(`${RUZ}/sablona?id=${id}`).catch(() => null));
  return templates.get(id);
};

// obmedzená súbežnosť, aby sme API nezahltili
async function pool(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const k = i++; out[k] = await fn(list[k]).catch(() => null); }
  }));
  return out;
}

const rok = z => String(z.obdobieDo || z.obdobieOd || '').slice(0, 4);
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null; };

// Čo hľadať v riadkoch šablón: [kľúč, regex na text riadku, regex na názov tabuľky]
const WANTED = [
  ['revenue', /^čistý obrat/i, /ziskov a strát/i],
  ['revenue', /účtová trieda 6.*(spolu|súčet)/i, /výnosy/i],
  ['profit', /výsledok hospodárenia (za účtovné obdobie )?po zdanení/i, /ziskov a strát|výnosy/i],
  ['assets', /^spolu majetok/i, /aktív/i],
];

async function figures(z) {
  const out = {};
  const vykazy = await pool(z.idUctovnychVykazov || [], 3, id => getJSON(`${RUZ}/uctovny-vykaz?id=${id}`));
  for (const v of vykazy) {
    const tabs = v?.obsah?.tabulky || [];
    if (!tabs.length || !v.idSablony) continue;
    const sb = await template(v.idSablony);
    (sb?.tabulky || []).forEach((t, ti) => {
      const cols = t.pocetDatovychStlpcov || 1;
      const data = tabs[ti]?.data || [];
      const tname = t.nazov?.sk || '';
      (t.riadky || []).forEach((r, ri) => {
        const txt = r.text?.sk || '';
        for (const [key, reRow, reTab] of WANTED) {
          if (out[key] != null || !reTab.test(tname) || !reRow.test(txt)) continue;
          // 4 stĺpce → „spolu"/netto je tretí; 2 stĺpce → bežné obdobie je prvý
          out[key] = num(data[ri * cols + (cols >= 4 ? 2 : 0)]);
        }
      });
    });
  }
  return out;
}

async function entityFinance(ent) {
  const list = await getJSON(`${RUZ}/uctovne-jednotky?zmenene-od=2000-01-01&ico=${ent.ico}&max-zaznamov=10`);
  const ujId = list?.id?.[0];
  if (!ujId) throw new Error(`RegisterUZ nepozná IČO ${ent.ico}`);
  const uj = await getJSON(`${RUZ}/uctovna-jednotka?id=${ujId}`);

  // VŠETKY závierky (poradie ID v API nie je stabilné ani chronologické —
  // orezanie na „posledných N ID" preto občas vynechalo najnovší rok)
  const ids = uj.idUctovnychZavierok || [];
  const zavierky = (await pool(ids, 5, id => getJSON(`${RUZ}/uctovna-zavierka?id=${id}`))).filter(Boolean);
  zavierky.sort((a, b) => rok(b).localeCompare(rok(a)) || Number(!!a.konsolidovana) - Number(!!b.konsolidovana));

  const link = `https://www.registeruz.sk/cruz-public/domain/accountingentity/show/${ujId}`;
  const items = zavierky.slice(0, 12).map(z => ({
    title: `Účtovná závierka ${rok(z)}${z.konsolidovana ? ' (konsolidovaná)' : ''}`,
    type: z.typ || '',
    period: [z.obdobieOd, z.obdobieDo].filter(Boolean).join(' – '),
    link,
  }));

  // čísla z individuálnych (nekonsolidovaných) závierok, jedna na rok
  const perYear = new Map();
  for (const z of zavierky) if (!z.konsolidovana && !perYear.has(rok(z))) perYear.set(rok(z), z);
  const picked = [...perYear.values()].slice(0, YEARS);
  const figs = await pool(picked, 2, figures);
  const series = picked.map((z, i) => ({ year: +rok(z), ...(figs[i] || {}) }))
    .filter(s => s.revenue != null || s.profit != null || s.assets != null)
    .sort((a, b) => a.year - b.year);

  console.log(`  registeruz ${ent.key}: ${ids.length} závierok (načítaných ${zavierky.length}), čísla za roky ${series.map(s => `${s.year}[V:${s.revenue ?? '–'} VH:${s.profit ?? '–'}]`).join(' ')}`);
  return {
    key: ent.key, short: ent.short || ent.name, name: uj.nazovUJ || ent.name, ico: ent.ico,
    kind: ent.key === 'obec' ? 'ropo' : 'pod',
    link, items, series,
  };
}

export function fetchFinance() {
  return cached('finance', 24, 2, async () => {
    const entities = [];
    for (const ent of ENTITIES) {
      try { entities.push(await entityFinance(ent)); }
      catch (e) { console.log(`  registeruz ${ent.key}: ${e.message.slice(0, 160)}`); }
    }
    if (!entities.length) throw new Error('RegisterUZ: nepodarilo sa načítať žiadny subjekt');
    // items = závierky obce (kvôli súhrnu behu a spätnej kompatibilite)
    return { entities, items: entities[0].items };
  }, prev => (prev.entities || []).length === ENTITIES.length);
}
