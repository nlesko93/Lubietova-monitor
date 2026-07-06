// Cestovný poriadok linky 610 (SAD Zvolen / IDS BBSK) — oficiálne PDF.
// pdftotext -layout → tabuľky (strany oddelené \f). Pre každý smer sa
// zbierajú časy na hlavných zastávkach (so súradnicami z config), aby
// prehliadač vedel naživo odhadnúť polohu autobusu medzi zastávkami.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeResult, CONFIG } from './lib.mjs';

const ROUTE = CONFIG.busRouteStops || [];        // BB → Povrazník poradie
const OBEC = new RegExp(CONFIG.busStopMatch || 'ubietov', 'i');

export async function fetchBuses() {
  const lines = [];
  for (const bl of CONFIG.busLines || []) {
    try {
      const parsed = await parseLine(bl);
      if (parsed) lines.push(parsed);
    } catch (e) {
      console.log(`  buses ${bl.line}: ${e.message.slice(0, 160)}`);
    }
  }
  return writeResult('buses', { lines });
}

async function parseLine(bl) {
  const res = await fetch(bl.pdf, {
    signal: AbortSignal.timeout(30000),
    headers: { 'user-agent': 'LubietovaMonitor/1.0 (+https://github.com/nlesko93/lubietova-monitor)' },
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

  // dva smery: kľúč -> { stops: Map(stopName -> Set(HH:MM)), namTimes: Set }
  const dirs = { zBB: mkDir(), doBB: mkDir() };
  const tables = text.split(/\f/).filter(t => OBEC.test(t));
  console.log(`  buses ${bl.line}: PDF ${Math.round(buf.length / 1024)} kB, ${tables.length} tabuliek so zastávkou obce`);

  for (const table of tables) {
    const rows = table.split(/\r?\n/);
    const bbIdx = rows.findIndex(l => /Bansk[aá] Bystrica/i.test(l));
    const obecIdx = rows.findIndex(l => OBEC.test(l));
    // smer: ak je BB v tabuľke pred obcou → cesta z BB (smer Povrazník),
    // inak do BB. Fallback: poradie časov Huta vs Podlipa.
    let key;
    if (bbIdx >= 0 && obecIdx >= 0) key = bbIdx < obecIdx ? 'zBB' : 'doBB';
    else key = fallbackDir(rows);
    if (!key) continue;
    const D = dirs[key];

    for (const stop of ROUTE) {
      for (const l of rows) {
        if (!l.includes(stop.match)) continue;
        const times = extractTimes(l);
        if (!times.length) continue;
        if (!D.stops.has(stop.name)) D.stops.set(stop.name, new Set());
        times.forEach(t => D.stops.get(stop.name).add(t));
      }
    }
    // odchody z centrálnej zastávky obce (nám.)
    for (const l of rows) {
      if (!OBEC.test(l)) continue;
      if (!/n[aá]m/i.test(l)) continue;
      extractTimes(l).forEach(t => D.namTimes.add(t));
    }
  }

  const directions = [];
  for (const [key, D] of Object.entries(dirs)) {
    if (!D.stops.size && !D.namTimes.size) continue;
    // zastávky v poradí jazdy (zBB = BB→Povrazník, doBB = opačne)
    const order = key === 'zBB' ? ROUTE : [...ROUTE].reverse();
    const stops = order
      .filter(s => D.stops.has(s.name))
      .map(s => ({ name: s.name, lat: s.lat, lon: s.lon, times: [...D.stops.get(s.name)].sort() }));
    const namTimes = [...D.namTimes].sort();
    const departures = namTimes.length ? namTimes
      : (D.stops.get('Ľubietová') ? [...D.stops.get('Ľubietová')].sort() : []);
    console.log(`  buses ${bl.line} ${key}: zastávok ${stops.length}, odchodov z obce ${departures.length}`);
    directions.push({
      dir: key,
      label: key === 'doBB' ? 'do Banskej Bystrice' : 'z Banskej Bystrice (smer Strelníky/Povrazník)',
      departures, stops,
    });
  }
  // najužitočnejší smer (do BB) ako prvý
  directions.sort((a, b) => (a.dir === 'doBB' ? -1 : 1));

  return { line: bl.line, route: bl.route, pdf: bl.pdf, directions };
}

const mkDir = () => ({ stops: new Map(), namTimes: new Set() });

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
