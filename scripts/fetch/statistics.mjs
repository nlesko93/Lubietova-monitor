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

  // 2) zisti kódy rokov a ukazovateľov (niektoré kocky nepodporujú "all")
  const years = await dimCodes(`${CUBE}_rok`);
  const ukaz = await dimCodes(`${CUBE}_ukaz`);
  console.log(`  statistics: rokov ${years.length} (${years.slice(0, 3)}…), ukazovatele: ${ukaz.join(',') || '—'}`);

  // 3) časový rad — postupne od najkonkrétnejšieho tvaru
  const attempts = [
    years.length && ukaz.length && `${API}/dataset/${CUBE}/${obecCode}/${years.slice(-25).join(',')}/${ukaz[0]}?lang=sk&type=json`,
    ukaz.length && `${API}/dataset/${CUBE}/${obecCode}/all/${ukaz[0]}?lang=sk&type=json`,
    `${API}/dataset/${CUBE}/${obecCode}/all/all?lang=sk&type=json`,
  ].filter(Boolean);

  let lastErr;
  for (const url of attempts) {
    try {
      const cube = await getJSON(url, { retries: 0 });
      const items = parseJsonStat(cube);
      if (items.length) return writeResult('demographics', { items, obecCode, via: url });
      lastErr = new Error('kocka nevrátila použiteľné hodnoty');
    } catch (e) {
      lastErr = e;
      console.warn(`  statistics dataset: ${e.message.slice(0, 200)}`);
    }
  }
  throw lastErr;
}

async function dimCodes(dim) {
  try {
    const d = await getJSON(`${API}/dimension/${CUBE}/${dim}?lang=sk`, { retries: 0 });
    return Object.entries(d?.category?.index || {})
      .sort((a, b) => a[1] - b[1]).map(([k]) => k);
  } catch (e) {
    console.warn(`  statistics dim ${dim}: ${e.message.slice(0, 150)}`);
    return [];
  }
}

const norm = s => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// JSON-stat 2.0 → [{year, population}]
function parseJsonStat(js) {
  const dimIds = js?.id || [];
  const timeDimId = dimIds.find(d => /rok|year|time/i.test(d)) || dimIds[1];
  const timeDim = js?.dimension?.[timeDimId];
  if (!timeDim) return [];
  const timeIdx = Object.entries(timeDim.category.index)
    .sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const size = js.size || [];
  const values = js.value || [];
  // veľkosť bloku pre časovú dimenziu
  const tPos = dimIds.indexOf(timeDimId);
  let stride = 1;
  for (let i = tPos + 1; i < size.length; i++) stride *= size[i];

  const items = [];
  timeIdx.forEach((t, i) => {
    // prvá kombinácia ostatných dimenzií (celkový ukazovateľ býva prvý)
    const v = values[i * stride];
    const year = parseInt(String(timeDim.category.label?.[t] ?? t).match(/\d{4}/)?.[0]);
    if (v != null && year) items.push({ year, population: v });
  });
  return items.filter(it => it.population > 0).sort((a, b) => a.year - b.year).slice(-25);
}
