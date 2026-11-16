// Komunálne voľby 2026 (voľby do orgánov samosprávy obcí) — ŠÚ SR.
// Oficiálny CSV export (zip ~4,6 MB) obsahuje priamo tabuľky za obce:
//   tab02d — účasť a súhrn za obec
//   tab05d — kandidáti na starostu (hlasy, %, poznámka „zvolený")
//   tab08e — kandidáti na poslancov (hlasy, %, „zvolený" / „náhradník")
// Štruktúra overená v Actions behu č. 1232.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CONFIG } from './lib.mjs';

const CODE = (CONFIG.obecStatCode || '508748').trim();
const ZIP = 'https://volby.statistics.sk/oso/oso2026/files/OSO2026_SK_csv.zip';
const UA = 'LubietovaMonitor/1.0 (+https://github.com/nlesko93/lubietova-monitor)';

function splitCsv(line) {
  const out = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// Riadky obce z jednej tabuľky ako objekty { hlavička: hodnota }.
function obecRows(dir, tab) {
  const text = new TextDecoder('utf-8').decode(readFileSync(path.join(dir, `OSO2026_SK_${tab}.csv`)));
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const header = splitCsv(lines[0]);
  const codeIdx = header.indexOf('Kód obce');
  return lines.slice(1).map(splitCsv)
    .filter(r => r[codeIdx] === CODE)
    .map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const num = v => parseFloat(String(v).replace(/\s/g, '').replace(',', '.')) || 0;
const sk = n => Number(n).toLocaleString('sk-SK');

function candidates(rows, flagCol) {
  return rows.map(r => ({
    name: `${r['Meno']} ${r['Priezvisko']}`.replace(/\s+/g, ' ').trim(),
    party: r['Politický subjekt'] || '',
    votes: num(r['Počet platných hlasov']),
    pct: num(r['Podiel platných hlasov v %']),
    elected: /zvolen/i.test(r[flagCol] || ''),
  })).filter(c => c.name).sort((a, b) => b.votes - a.votes);
}

export async function fetchOso2026() {
  const res = await fetch(ZIP, { signal: AbortSignal.timeout(120000), headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const dir = mkdtempSync(path.join(tmpdir(), 'oso2026-'));
  const zp = path.join(dir, 'd.zip');
  writeFileSync(zp, buf);
  execFileSync('unzip', ['-o', '-qq', '-j', zp, '-d', dir]);

  const mayor = candidates(obecRows(dir, 'tab05d'), 'Poznámka');
  const council = candidates(obecRows(dir, 'tab08e'), 'Kandidát');
  if (!mayor.length && !council.length) return null;

  const s = obecRows(dir, 'tab02d')[0] || {};
  const seats = num(s['Počet volených poslancov']) || council.filter(c => c.elected).length;
  const note = s['Účasť voličov v %']
    ? `Účasť ${String(s['Účasť voličov v %']).replace('.', ',')} % (${sk(num(s['Počet zúčastnených voličov']))} z ${sk(num(s['Počet zapísaných voličov']))} zapísaných voličov) · zdroj: ŠÚ SR`
    : 'Zdroj: ŠÚ SR (volby.statistics.sk)';
  console.log(`  elections komunalne2026: starosta ${mayor.map(c => `${c.name}:${c.votes}${c.elected ? '✓' : ''}`).join(', ')} | poslanci ${council.length} kandidátov, zvolených ${council.filter(c => c.elected).length}/${seats}`);

  return {
    key: 'komunalne2026', name: 'Komunálne 2026', note,
    sections: [
      { title: 'Starosta obce', rows: mayor },
      { title: `Obecné zastupiteľstvo — ${seats} poslancov`, rows: council },
    ],
  };
}
