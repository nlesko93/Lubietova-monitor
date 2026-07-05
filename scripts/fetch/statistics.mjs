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
      const d = await getJSON(`${API}/dimension/${CUBE}/${dim}?lang=sk`, { retries: 0 });
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

  let lastErr;
  for (const url of attempts) {
    try {
      const cube = await getJSON(url, { retries: 0 });
      const items = parseJsonStat(cube);
      if (items.length) return writeResult('demographics', { items, obecCode, via: url });
      console.warn(`  statistics: ${url} vrátila 0 hodnôt, dims=${(cube.id || []).join(',')}`);
      lastErr = new Error('kocka nevrátila použiteľné hodnoty');
    } catch (e) {
      lastErr = e;
      console.warn(`  statistics dataset: ${e.message.slice(0, 220)}`);
    }
  }
  throw lastErr;
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
