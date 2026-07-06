// Počet obyvateľov obce — ŠÚ SR DataCube API (data.statistics.sk).
// Kód obce sa hľadá v číselníku dimenzie kocky om7101rr.
import { getJSON, writeResult, CONFIG } from './lib.mjs';

const API = 'https://data.statistics.sk/api/v2';
const CUBE = 'om7101rr'; // stav trvale bývajúceho obyvateľstva podľa obcí

export async function fetchDemographics() {
  // 1) nájdi kód obce v číselníku dimenzie
  const dims = [`${CUBE}_obc`, 'nuts15', 'obc'];
  let obecCode = null, dimUsed = null;
  for (const dim of dims) {
    try {
      const d = await getJSON(`${API}/dimension/${CUBE}/${dim}?lang=sk`, { retries: 2 });
      const entries = d?.category?.label ? Object.entries(d.category.label) : [];
      const hit = entries.find(([, label]) => norm(label) === norm(CONFIG.obec)) ||
        entries.find(([, label]) => norm(label).includes(norm(CONFIG.obec)));
      if (hit) { obecCode = hit[0]; dimUsed = dim; break; }
      console.log(`  statistics: dimenzia ${dim} má ${entries.length} položiek, obec nenájdená`);
    } catch (e) { console.warn(`  statistics dim ${dim}: ${e.message}`); }
  }
  if (!obecCode) throw new Error('kód obce sa v číselníku nenašiel');
  console.log(`  statistics: ${CONFIG.obec} = ${obecCode} (dim ${dimUsed})`);

  // 2) časový rad — kocka má 4 dimenzie (obec, rok, ďalšia, ukazovateľ);
  //    "all" pre všetky okrem obce a v parseri sa vyberie riadok "spolu".
  const attempts = [
    `${API}/dataset/${CUBE}/${obecCode}/all/all/all?lang=sk&type=json`,
    `${API}/dataset/${CUBE}/${obecCode}/all/all?lang=sk&type=json`,
  ];

  let lastErr, population = null;
  for (const url of attempts) {
    try {
      const cube = await getJSON(url, { retries: 0 });
      const items = parseJsonStat(cube);
      if (items.length) { population = { items, via: url }; break; }
      console.warn(`  statistics: ${url} vrátila 0 hodnôt, dims=${(cube.id || []).join(',')}`);
      lastErr = new Error('kocka nevrátila použiteľné hodnoty');
    } catch (e) {
      lastErr = e;
      console.warn(`  statistics dataset: ${e.message.slice(0, 220)}`);
    }
  }
  if (!population) throw lastErr;

  // 3) ďalšie obecné kocky (pohyb obyvateľstva, vek…) — všeobecným
  //    mechanizmom; zoznam kandidátov sa dolaďuje podľa logov discovery.
  const extra = [];
  for (const { cube, pick } of EXTRA_CUBES) {
    try {
      const series = await fetchCubeSeries(cube, obecCode, pick);
      if (series) extra.push(series);
    } catch (e) {
      console.log(`  statistics kocka ${cube}: ${e.message.slice(0, 160)}`);
    }
  }
  return writeResult('demographics', { items: population.items, obecCode, via: population.via, extra });
}

// Obecné kocky overené v Actions behu č. 13 + filter zaujímavých sérií.
const EXTRA_CUBES = [
  { cube: 'om7103rr', pick: /^(živonarodení|zomretí|prisťahovaní|vysťahovaní)\b/i },
  { cube: 'om7014rr', pick: /^hustota/i },
];

// Stiahne kocku pre obec: počet dimenzií zistí z chybovej hlášky
// ("Expected = N"), séria sa rozloží podľa ukazovateľovej dimenzie.
async function fetchCubeSeries(cube, obecCode, pick) {
  let nDims = 3;
  for (let attempt = 0; attempt < 3; attempt++) {
    const url = `${API}/dataset/${cube}/${obecCode}${'/all'.repeat(nDims - 1)}?lang=sk&type=json`;
    try {
      const js = await getJSON(url, { retries: 0 });
      const label = js.label || cube;
      const all = parseJsonStatSeries(js);
      const series = {};
      for (const [name, pts] of Object.entries(all)) {
        if (!pick || pick.test(name)) {
          // "Živonarodení (Osoba)" → "Živonarodení"
          series[name.replace(/\s*\([^)]*\)\s*$/, '')] = pts;
        }
      }
      const names = Object.keys(series);
      console.log(`  statistics ${cube}: "${String(label).slice(0, 80)}" série: ${names.join(' | ').slice(0, 300)}`);
      return names.length ? { cube, label, series } : null;
    } catch (e) {
      const m = e.message.match(/Expected = (\d+)/);
      if (m && +m[1] !== nDims) { nDims = +m[1]; continue; }
      throw e;
    }
  }
  return null;
}

const norm = s => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// JSON-stat 2.0 → [{year, population}]. Pri ostatných dimenziách sa vyberie
// položka "spolu/celkom" (ak existuje), inak prvá.
function parseJsonStat(js) {
  const ids = js?.id || [];
  const sizes = js?.size || [];
  const values = js?.value || [];
  if (!ids.length || !values.length) return [];

  const strides = new Array(ids.length);
  let s = 1;
  for (let i = ids.length - 1; i >= 0; i--) { strides[i] = s; s *= sizes[i]; }

  const dimOrder = id => Object.entries(js.dimension[id].category.index)
    .sort((a, b) => a[1] - b[1]).map(([k]) => k);

  const timePos = ids.findIndex(d => /rok|year|time|obd/i.test(d));
  if (timePos < 0) return [];

  let offset = 0;
  ids.forEach((id, pos) => {
    if (pos === timePos) return;
    const labels = js.dimension[id].category.label || {};
    const order = dimOrder(id);
    const totalIdx = order.findIndex(c => /spolu|celkom|total|úhrn/i.test(labels[c] || ''));
    offset += Math.max(0, totalIdx) * strides[pos];
  });

  const timeDim = js.dimension[ids[timePos]];
  const items = [];
  dimOrder(ids[timePos]).forEach((code, i) => {
    const v = values[offset + i * strides[timePos]];
    const year = parseInt(String(timeDim.category.label?.[code] ?? code).match(/\d{4}/)?.[0]);
    if (v != null && year) items.push({ year, population: v });
  });
  return items.filter(it => it.population > 0).sort((a, b) => a.year - b.year).slice(-25);
}

// JSON-stat → { "názov ukazovateľa": [{year, value}] } — séria pre každú
// kategóriu prvej ne-časovej, ne-obecnej dimenzie s viac ako 1 položkou.
function parseJsonStatSeries(js) {
  const ids = js?.id || [];
  const sizes = js?.size || [];
  const values = js?.value || [];
  if (!ids.length || !values.length) return {};

  const strides = new Array(ids.length);
  let s = 1;
  for (let i = ids.length - 1; i >= 0; i--) { strides[i] = s; s *= sizes[i]; }
  const dimOrder = id => Object.entries(js.dimension[id].category.index)
    .sort((a, b) => a[1] - b[1]).map(([k]) => k);

  const timePos = ids.findIndex(d => /rok|year|time|obd/i.test(d));
  if (timePos < 0) return {};
  const indPos = ids.findIndex((d, i) => i !== timePos && !/obc|nuts/i.test(d) && sizes[i] > 1);

  const timeDim = js.dimension[ids[timePos]];
  const years = dimOrder(ids[timePos]).map(code => ({
    code,
    year: parseInt(String(timeDim.category.label?.[code] ?? code).match(/\d{4}/)?.[0]),
  }));

  const out = {};
  const indCodes = indPos >= 0 ? dimOrder(ids[indPos]) : [null];
  const indLabels = indPos >= 0 ? (js.dimension[ids[indPos]].category.label || {}) : {};
  indCodes.slice(0, 40).forEach((indCode, ii) => {
    const name = indCode ? (indLabels[indCode] || indCode) : (js.label || 'hodnota');
    const pts = [];
    years.forEach((y, ti) => {
      const idx = ti * strides[timePos] + (indPos >= 0 ? ii * strides[indPos] : 0);
      const v = values[idx];
      if (v != null && y.year) pts.push({ year: y.year, value: v });
    });
    if (pts.length) out[name] = pts.sort((a, b) => a.year - b.year).slice(-25);
  });
  return out;
}
