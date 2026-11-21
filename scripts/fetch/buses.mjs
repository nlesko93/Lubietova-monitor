// Cestovný poriadok linky 610 (SAD Zvolen / IDS BBSK) — oficiálne PDF.
// pdftotext -layout → tabuľky (strany oddelené \f). Pre každý smer sa
// zbierajú časy na hlavných zastávkach (so súradnicami z config), aby
// prehliadač vedel naživo odhadnúť polohu autobusu medzi zastávkami.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cached, CONFIG } from './lib.mjs';

const ROUTE = CONFIG.busRouteStops || [];        // BB → Povrazník poradie
const OBEC = new RegExp(CONFIG.busStopMatch || 'ubietov', 'i');
// PDF používa skratky (B. Bystrica, Sl. Ľupča)
const BB = /B(?:\.|ansk[aá])\s*Bystrica/i;
const UA = 'LubietovaMonitor/1.0 (+https://github.com/nlesko93/lubietova-monitor)';

export const fetchBuses = () => cached('buses', 12, 2, load, prev => (prev.lines || []).some(l => l.geometry && l.directions?.some(d => d.trips?.length)));

async function load() {
  const lines = [];
  for (const bl of CONFIG.busLines || []) {
    try {
      const parsed = await parseLine(bl);
      if (parsed) { await addGeometry(parsed); lines.push(parsed); }
    } catch (e) {
      console.log(`  buses ${bl.line}: ${e.message.slice(0, 160)}`);
    }
  }
  return { lines };
}

async function parseLine(bl) {
  const res = await fetch(bl.pdf, {
    signal: AbortSignal.timeout(30000),
    headers: { 'user-agent': UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const dir = mkdtempSync(path.join(tmpdir(), `bus-${bl.line}-`));
  const pdfPath = path.join(dir, 'cp.pdf');
  writeFileSync(pdfPath, buf);

  let text;
  try {
    text = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-'],
      { encoding: 'utf8', maxBuffer: 20e6, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    if (!e.stdout) throw new Error(`pdftotext zlyhal: ${e.message.slice(0, 100)}`);
    text = e.stdout.toString();
  }
  return parseTimetable(text, bl, buf.length);
}

// Rozparsuje text cestovného poriadku (pdftotext -layout) na spoje s dňami premávky.
export async function parseTimetable(text, bl, pdfBytes = 0) {
  const legend = parseLegend(text);
  console.log(`  buses ${bl.line}: legenda ${Object.entries(legend).map(([k, v]) => `${k}=${v.kind}`).join(' ')}`);

  const tripsByDir = { zBB: [], doBB: [] };
  const tables = text.split(/\f/).filter(t => OBEC.test(t));
  console.log(`  buses ${bl.line}: PDF ${Math.round(pdfBytes / 1024)} kB, ${tables.length} tabuliek so zastávkou obce`);

  for (const table of tables) {
    const rows = table.split(/\r?\n/);
    const hasTime = l => extractTimes(l).length > 0;
    // smer: zastávka BB pred obcou → z BB (smer Povrazník), inak do BB
    const bbIdx = rows.findIndex(l => BB.test(l) && hasTime(l));
    const obecIdx = rows.findIndex(l => OBEC.test(l) && hasTime(l));
    let key;
    if (bbIdx >= 0 && obecIdx >= 0 && bbIdx !== obecIdx) key = bbIdx < obecIdx ? 'zBB' : 'doBB';
    else key = fallbackDir(rows);
    if (!key) continue;

    // Stĺpce spojov: pozície čísel spojov v hlavičke („Zoznam zastávok … 1 5 3 45 …").
    // pdftotext -layout zachováva zarovnanie, časy sú voči číslam posunuté
    // o ~1–2 znaky (posun odhadneme mediánom), značky dní sú pri číslach.
    // Bez hlavičky: zhluky pozícií časov.
    const firstTimeRow = rows.findIndex(hasTime);
    const headerIdx = rows.findIndex(l => /Zoznam\s+zast/i.test(l));
    const allTimes = [];
    rows.forEach((l, i) => { if (i >= firstTimeRow) allTimes.push(...timesAt(l)); });
    if (!allTimes.length) continue;
    const minC = Math.min(...allTimes.map(t => t.c));
    let cols = [], tripNo = [], anchored = false;
    if (headerIdx >= 0 && headerIdx < firstTimeRow) {
      const nums = [...rows[headerIdx].matchAll(/\b\d+\b/g)]
        .map(m => ({ n: +m[0], c: m.index + m[0].length / 2 }))
        .filter(x => x.c > minC - 6);
      if (nums.length >= 3) { cols = nums.map(x => x.c); tripNo = nums.map(x => x.n); anchored = true; }
    }
    if (!anchored) { cols = clusterColumns(allTimes.map(t => t.c)); tripNo = cols.map(() => null); }
    if (!cols.length) continue;
    const nearestCol = (c, tol) => {
      let best = -1, bd = tol;
      cols.forEach((x, i) => { const d = Math.abs(x - c); if (d < bd) { bd = d; best = i; } });
      return best;
    };
    // posun časov voči číslam spojov (medián)
    let off = 0;
    if (anchored) {
      const ds = allTimes.map(t => { const i = nearestCol(t.c, 9); return i < 0 ? null : t.c - cols[i]; })
        .filter(d => d != null).sort((x, y) => x - y);
      off = ds.length ? ds[Math.floor(ds.length / 2)] : 0;
    }
    const near = c => nearestCol(c - off, 3.2);

    // značky dní (X, 6, +, ba, bb, fb…) sú v riadkoch medzi hlavičkou a prvým časom
    const marks = cols.map(() => []);
    let unassigned = 0;
    for (let i = Math.max(headerIdx + 1, 0); i < firstTimeRow; i++) {
      for (const m of rows[i].matchAll(/\S+/g)) {
        const ci = anchored ? nearestCol(m.index + m[0].length / 2, 2.6) : near(m.index + m[0].length / 2);
        if (ci < 0) { unassigned++; continue; }
        marks[ci].push(m[0]);
      }
    }
    console.log(`  buses ${bl.line} ${key}: ${cols.length} spojov (${anchored ? `podľa čísel spojov, posun časov ${off.toFixed(1)}` : 'podľa zhlukov časov'}), nepriradených značiek ${unassigned}`);

    // riadok pre každú hlavnú zastávku = ten s najviac časmi (hlavné nástupište)
    const rowFor = re => {
      let best = null, n = 0;
      for (const l of rows) {
        if (!re.test(l)) continue;
        const k = extractTimes(l).length;
        if (k > n) { n = k; best = l; }
      }
      return best;
    };
    const stopRows = ROUTE.map(s => [s.name, rowFor(new RegExp(s.match, 'i'))]);
    const namRow = rows.find(l => OBEC.test(l) && /n[aá]m/i.test(l) && hasTime(l)) || rowFor(OBEC);

    cols.forEach((_, ci) => {
      const t = {};
      for (const [name, row] of stopRows) {
        if (!row) continue;
        const hit = timesAt(row).find(x => near(x.c) === ci);
        if (hit) t[name] = hit.t;
      }
      const dep = namRow ? timesAt(namRow).find(x => near(x.c) === ci)?.t : null;
      if (!dep && Object.keys(t).length < 2) return;
      tripsByDir[key].push({ n: tripNo[ci], ...dayRule(marks[ci], legend), t, dep: dep || null });
    });
  }

  const directions = [];
  for (const [key, trips] of Object.entries(tripsByDir)) {
    if (!trips.length) continue;
    const order = key === 'zBB' ? ROUTE : [...ROUTE].reverse();
    const first = tr => tr.dep || Object.values(tr.t).sort()[0] || '';
    trips.sort((a, b) => first(a).localeCompare(first(b)));
    // súhrny (všetky spoje bez ohľadu na deň) — pre spätnú kompatibilitu
    const stops = order.filter(s => trips.some(tr => tr.t[s.name]))
      .map(s => ({ name: s.name, lat: s.lat, lon: s.lon, times: [...new Set(trips.map(tr => tr.t[s.name]).filter(Boolean))].sort() }));
    const departures = [...new Set(trips.map(tr => tr.dep).filter(Boolean))].sort();
    const kinds = trips.reduce((m, tr) => (m[(tr.d || '—') + (tr.sch ? '/' + tr.sch : '')] = (m[(tr.d || '—') + (tr.sch ? '/' + tr.sch : '')] || 0) + 1, m), {});
    console.log(`  buses ${bl.line} ${key}: spojov ${trips.length} (${Object.entries(kinds).map(([k, v]) => `${k}:${v}`).join(' ')}), zastávok ${stops.length}`);
    directions.push({
      dir: key,
      label: key === 'doBB' ? 'do Banskej Bystrice' : 'z Banskej Bystrice (smer Strelníky/Povrazník)',
      departures, stops, trips,
    });
  }
  directions.sort((a, b) => (a.dir === 'doBB' ? -1 : 1));
  return { line: bl.line, route: bl.route, pdf: bl.pdf, directions };
}

// --- dni premávky ---------------------------------------------------------
// Legenda v PDF: „X  premáva v pracovné dni", „6  premáva v sobotu",
// „+  premáva v nedeľu a v štátom uznaný deň pracovného pokoja",
// „ba premáva v dňoch školského vyučovania", „bb … v dňoch prázdnin",
// „fb nepremáva od 24.12.25 do 25.12.25, od 31.12.25 do 1.1.26".
function parseLegend(text) {
  const out = {};
  const re = /(?:^|\s{2,})(\S{1,3})\s{2,}((?:ne)?prem[aá]va\b.*?)(?=\s{3,}\S{1,3}\s{2,}(?:ne)?prem|\s*$)/g;
  for (const line of text.split('\n')) {
    for (const m of line.matchAll(re)) {
      const code = m[1], txt = m[2].trim();
      let kind = 'other';
      if (/^prem[aá]va v pracovn/i.test(txt)) kind = 'X';
      else if (/^prem[aá]va v sobotu/i.test(txt)) kind = '6';
      else if (/^prem[aá]va v nede[ľl]u/i.test(txt)) kind = '+';
      else if (/školsk\S* vyučovan/i.test(txt)) kind = 'school';
      else if (/dňoch prázdnin/i.test(txt)) kind = 'vacation';
      else if (/^neprem[aá]va/i.test(txt)) kind = 'except';
      else if (/^prem[aá]va (aj|tiež)/i.test(txt)) kind = 'also';
      else if (/^prem[aá]va (len|iba)/i.test(txt)) kind = 'only';
      out[code] = { kind, text: txt, dates: parseDates(txt) };
    }
  }
  return out;
}

// „od 24.12.25 do 25.12.25, od 31.12.25 do 1.1.26, 6.1.26" → [[od, do], …]
function parseDates(txt) {
  const iso = (d, m, y) => `${y.length === 2 ? '20' + y : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const D = String.raw`(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})`;
  const ranges = [];
  let rest = txt;
  for (const m of txt.matchAll(new RegExp(`od\\s+${D}\\s+do\\s+${D}`, 'g'))) {
    ranges.push([iso(m[1], m[2], m[3]), iso(m[4], m[5], m[6])]);
    rest = rest.replace(m[0], ' ');
  }
  for (const m of rest.matchAll(new RegExp(D, 'g'))) ranges.push([iso(m[1], m[2], m[3]), iso(m[1], m[2], m[3])]);
  return ranges;
}

// Značky jedného spoja → pravidlo { d: 'X6+…', sch: 'school'|'vacation', ex, aj, only }
function dayRule(tokens, legend) {
  let d = '', sch = null;
  const ex = [], aj = [], only = [];
  for (const tok of tokens) {
    const L = legend[tok];
    if (L && L.kind !== 'other') {
      if (['X', '6', '+'].includes(L.kind)) d += L.kind;
      else if (L.kind === 'school' || L.kind === 'vacation') sch = L.kind;
      else if (L.kind === 'except') ex.push(...L.dates);
      else if (L.kind === 'also') aj.push(...L.dates);
      else if (L.kind === 'only') only.push(...L.dates);
      continue;
    }
    // zlepené jednoznakové značky („6+", „X†", „1234")
    if (/^[X+†1-7]+$/.test(tok)) d += tok.replace('†', '+');
  }
  const r = { d: [...new Set(d)].join('') };
  if (sch) r.sch = sch;
  if (ex.length) r.ex = ex;
  if (aj.length) r.aj = aj;
  if (only.length) r.only = only;
  return r;
}

const timesAt = line => [...line.matchAll(/\b([0-2]?\d)[:.]([0-5]\d)\b/g)]
  .filter(m => +m[1] < 24)
  .map(m => ({ t: `${m[1].padStart(2, '0')}:${m[2]}`, c: m.index + m[0].length / 2 }));

// zhluky pozícií (stĺpce sú od seba ~6 znakov, časy v jednom stĺpci ±1)
function clusterColumns(centers) {
  const cols = [];
  for (const c of [...centers].sort((a, b) => a - b)) {
    const last = cols.at(-1);
    if (last && c - last.max <= 2.5) { last.sum += c; last.n++; last.max = c; }
    else cols.push({ sum: c, n: 1, max: c });
  }
  return cols.map(g => g.sum / g.n);
}

// geometria cesty (aby autobusy na mape kopírovali cestu, nie vzdušnú čiaru)
async function addGeometry(line) {
  try {
    const geo = await roadGeometry(ROUTE);
    if (!geo) return;
    line.geometry = geo.geometry; line.cum = geo.cum;
    for (const d of line.directions) {
      d.dist = {};
      for (const s of d.stops) if (geo.distByName[s.name] != null) s.dist = d.dist[s.name] = geo.distByName[s.name];
    }
  } catch (e) {
    console.log(`  buses ${line.line} geometria: ${e.message.slice(0, 120)}`);
  }
}

// Trasa po ceste z OSRM (waypointy = hlavné zastávky). Vráti polyline
// [[lat,lon],…], kumulatívne vzdialenosti a vzdialenosť každej zastávky
// pozdĺž cesty — klient tak vie autobus umiestniť priamo na cestu.
async function roadGeometry(route) {
  if (route.length < 2) return null;
  const coords = route.map(s => `${s.lon},${s.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=simplified&geometries=geojson`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const d = await res.json();
  const g = d.routes?.[0]?.geometry?.coordinates;
  if (!g || g.length < 2) throw new Error('bez geometrie');
  const geometry = g.map(([lon, lat]) => [round6(lat), round6(lon)]);
  const cum = [0];
  for (let i = 1; i < geometry.length; i++) cum[i] = cum[i - 1] + haversine(geometry[i - 1], geometry[i]);
  const distByName = {};
  for (const s of route) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < geometry.length; i++) {
      const dd = haversine([s.lat, s.lon], geometry[i]);
      if (dd < bestD) { bestD = dd; best = i; }
    }
    distByName[s.name] = Math.round(cum[best]);
  }
  console.log(`  buses geometria: ${geometry.length} bodov, ${Math.round(cum[cum.length - 1])} m po ceste`);
  return { geometry, cum: cum.map(Math.round), distByName };
}

const round6 = x => Math.round(x * 1e6) / 1e6;

function haversine(a, b) {
  const R = 6371000, toRad = x => x * Math.PI / 180;
  const dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function extractTimes(line) {
  return [...line.matchAll(/\b([0-2]?\d)[:.]([0-5]\d)\b/g)]
    .map(m => [+m[1], m[2]]).filter(([h]) => h < 24)
    .map(([h, mm]) => `${String(h).padStart(2, '0')}:${mm}`);
}

function fallbackDir(rows) {
  const timeOf = re => {
    const l = rows.find(x => re.test(x));
    return l ? extractTimes(l)[0] : null;
  };
  const huta = timeOf(/Huta/i);
  const podlipa = timeOf(/Podlipa/i);
  if (huta && podlipa) return huta < podlipa ? 'zBB' : 'doBB';
  return null;
}
