// Cestovný poriadok linky 610 (SAD Zvolen / IDS BBSK) — oficiálne PDF.
// PDF sa prevedie cez `pdftotext -layout`; z riadkov zastávok v obci
// (formát: "<id> <por> <deň> Ľubietová, <zastávka> HH:MM HH:MM …")
// sa vytiahnu časy odchodov. Preferuje sa centrálna zastávka „nám.".
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeResult, CONFIG } from './lib.mjs';

const STOP = new RegExp(CONFIG.busStopMatch || 'ubietov', 'i');

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
    text = e.stdout.toString(); // flate-warningy idú do stderr, text je OK
  }

  // riadky obsahujúce zastávku obce + časy
  const stops = new Map(); // "Ľubietová, nám." -> Set(HH:MM)
  for (const raw of text.split(/\r?\n/)) {
    if (!STOP.test(raw)) continue;
    const times = [...raw.matchAll(/\b([0-2]?\d)[:.]([0-5]\d)\b/g)]
      .map(m => [+m[1], m[2]]).filter(([h]) => h < 24)
      .map(([h, mm]) => `${String(h).padStart(2, '0')}:${mm}`);
    if (!times.length) continue;
    // názov zastávky: text medzi "Ľubietová" a prvým časom
    const m = raw.match(/(Ľubietová[^0-9]*?)\s+\d{1,2}[:.]\d{2}/);
    const stop = (m ? m[1] : 'Ľubietová').replace(/\s+/g, ' ').trim();
    if (!stops.has(stop)) stops.set(stop, new Set());
    times.forEach(t => stops.get(stop).add(t));
  }
  if (!stops.size) return { line: bl.line, route: bl.route, pdf: bl.pdf, stop: null, departures: [] };

  // preferuj centrálnu zastávku „nám.", inak tú s najviac časmi
  const entries = [...stops.entries()];
  const primary = entries.find(([s]) => /n[aá]m/i.test(s)) ||
    entries.sort((a, b) => b[1].size - a[1].size)[0];
  const departures = [...primary[1]].sort();
  console.log(`  buses ${bl.line}: zastávka "${primary[0]}", ${departures.length} odchodov: ${departures.join(' ')}`);
  return { line: bl.line, route: bl.route, pdf: bl.pdf, stop: primary[0], departures };
}
