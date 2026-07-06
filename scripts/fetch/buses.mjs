// Cestovný poriadok linky 610 (SAD Zvolen / IDS BBSK) — oficiálne PDF.
// PDF sa prevedie cez `pdftotext -layout` a z riadkov so zastávkou obce
// (Ľubietová) sa vytiahnu časy odchodov po smeroch.
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
    text = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 20e6 });
  } catch (e) {
    throw new Error(`pdftotext zlyhal: ${e.message.slice(0, 100)}`);
  }

  const allLines = text.split(/\r?\n/);
  const stopLines = allLines.filter(l => STOP.test(l));
  console.log(`  buses ${bl.line}: PDF ${Math.round(buf.length / 1024)} kB, ${allLines.length} riadkov, ${stopLines.length} so zastávkou obce`);
  stopLines.slice(0, 6).forEach(l => console.log(`    | ${l.replace(/\s+/g, ' ').trim().slice(0, 300)}`));

  // časy HH:MM alebo HH.MM z riadkov obce
  const times = new Set();
  for (const l of stopLines) {
    for (const m of l.matchAll(/\b([0-2]?\d)[:.]([0-5]\d)\b/g)) {
      const h = +m[1], min = +m[2];
      if (h < 24) times.add(`${String(h).padStart(2, '0')}:${m[2]}`);
    }
  }
  const departures = [...times].sort();
  if (!departures.length) return { line: bl.line, route: bl.route, pdf: bl.pdf, departures: [] };
  return { line: bl.line, route: bl.route, pdf: bl.pdf, departures };
}
