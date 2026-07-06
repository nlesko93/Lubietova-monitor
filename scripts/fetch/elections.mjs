// Výsledky volieb v obci — oficiálne CSV exporty z volby.statistics.sk
// (cesty overené v Actions behu č. 21). Zip sa rozbalí cez `unzip`
// na runneri, CSV sa prefiltrujú na riadky Ľubietovej.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeResult, CONFIG } from './lib.mjs';

const OBEC_NAME = /ľubietová/i;
const OBEC_CODE = (CONFIG.obecStatCode || '508748').trim();

const ELECTIONS = [
  // celoslovenský zip NRSR má 226 MB (okrsky) — obecná tabuľka sa berie priamo
  { key: 'nrsr2023', name: 'Parlamentné 2023', csvs: [
    'https://volby.statistics.sk/nrsr/nrsr2023/files/csv/NRSR2023_SK_tab03e.csv',
    'https://volby.statistics.sk/nrsr/nrsr2023/files/csv/NRSR2023_SK_tab03d.csv',
    'https://volby.statistics.sk/nrsr/nrsr2023/files/csv/NRSR2023_SK_tab03a.csv'] },
  { key: 'prezident2024', name: 'Prezidentské 2024 (2. kolo)', zips: [
    'https://volby.statistics.sk/prez/prez2024/files/kolo2/PREZ2024_kolo2_SK_csv.zip'] },
  { key: 'prezident2024k1', name: 'Prezidentské 2024 (1. kolo)', zips: [
    'https://volby.statistics.sk/prez/prez2024/files/kolo1/PREZ2024_kolo1_SK_csv.zip'] },
  { key: 'ep2024', name: 'Európsky parlament 2024', zips: [
    'https://volby.statistics.sk/ep/ep2024/files/EP2024_SK_csv.zip'] },
  { key: 'komunalne2022', name: 'Komunálne 2022', zips: [
    'https://volby.statistics.sk/osk/osk2022/files/OSK2022_SK_csv.zip'] },
];

export async function fetchElections() {
  const items = [];
  for (const elec of ELECTIONS) {
    for (const url of [...(elec.zips || []), ...(elec.csvs || [])]) {
      try {
        const parsed = /\.zip$/i.test(url)
          ? await scanZip(elec, url)
          : await scanCsvUrl(elec, url);
        if (parsed) { items.push(parsed); break; }
      } catch (e) {
        console.log(`  elections ${elec.key}: ${url.split('/').pop()} -> ${e.message.slice(0, 160)}`);
      }
    }
  }
  return writeResult('elections', { items });
}

async function scanCsvUrl(elec, url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = decodeBuf(Buffer.from(await res.arrayBuffer()));
  const rows = csvRows(text);
  if (rows.length < 2) return null;
  const header = rows[0];
  const matches = rows.filter(r => r.some(c => OBEC_NAME.test(c)) || r.includes(OBEC_CODE));
  console.log(`  elections ${elec.key}: ${url.split('/').pop()} -> ${rows.length} riadkov, obec ${matches.length}; hlavička: ${header.join('§').slice(0, 350)}`);
  if (!matches.length) return null;
  console.log(`  elections ${elec.key}: vzorka: ${matches[0].join('§').slice(0, 350)}`);
  return parseRows(elec, header, matches);
}

const MAX_ZIP_BYTES = 60 * 1024 * 1024;

async function scanZip(elec, zipUrl) {
  // timeout musí kryť aj sťahovanie tela, nie len hlavičky
  const res = await fetch(zipUrl, {
    signal: AbortSignal.timeout(120000),
    headers: { 'user-agent': 'LubietovaMonitor/1.0 (+https://github.com/nlesko93/lubietova-monitor)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const len = parseInt(res.headers.get('content-length') || '0');
  if (len > MAX_ZIP_BYTES) throw new Error(`zip príliš veľký (${Math.round(len / 1e6)} MB)`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_ZIP_BYTES) throw new Error(`zip príliš veľký (${Math.round(buf.length / 1e6)} MB)`);
  const dir = mkdtempSync(path.join(tmpdir(), `volby-${elec.key}-`));
  const zipPath = path.join(dir, 'data.zip');
  writeFileSync(zipPath, buf);
  execFileSync('unzip', ['-o', '-qq', zipPath, '-d', dir]);
  const csvs = readdirSync(dir, { recursive: true }).map(String).filter(f => /\.csv$/i.test(f));
  console.log(`  elections ${elec.key}: ${zipUrl.split('/').pop()} (${Math.round(buf.length / 1024)} kB) -> ${csvs.length} CSV`);

  // kandidátske tabuľky: tie, kde sa obec vyskytuje vo viacerých riadkoch
  let best = null;
  for (const f of csvs) {
    const text = decodeBuf(readFileSync(path.join(dir, f)));
    if (!new RegExp(`${OBEC_CODE}|ubietov`, 'i').test(text)) continue;
    const rows = csvRows(text);
    if (rows.length < 2) continue;
    const header = rows[0];
    const matches = rows.filter(r => r.some(c => OBEC_NAME.test(c)) || r.includes(OBEC_CODE));
    if (!matches.length) continue;
    console.log(`  elections ${elec.key}: ${path.basename(f)} -> ${matches.length} riadkov obce; hlavička: ${header.join('§').slice(0, 350)}`);
    const parsed = parseRows(elec, header, matches);
    if (parsed && (!best || parsed.rows.length > best.rows.length)) {
      console.log(`  elections ${elec.key}: vzorka: ${matches[0].join('§').slice(0, 350)}`);
      best = parsed;
    }
  }
  return best;
}

function decodeBuf(buf) {
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if ((text.match(/�/g) || []).length > 5) text = new TextDecoder('windows-1250').decode(buf);
  return text;
}

function csvRows(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  // niektoré exporty (komunálne voľby) používajú zvislítko
  const counts = [';', ',', '|'].map(d => [d, (lines[0].match(new RegExp(`\\${d}`, 'g')) || []).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return lines.map(l => splitCsvLine(l, counts[0][0]));
}

function splitCsvLine(line, delim) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === delim && !inQ) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// Nájde stĺpce subjektu/kandidáta, hlasov a podielu podľa hlavičky.
function parseRows(elec, header, rows) {
  const h = header.map(c => c.toLowerCase());
  const idx = re => h.findIndex(c => re.test(c));
  const nameIdx = idx(/n[aá]zov.*(stran|subjekt|koal)|kandid[aá]t|^meno$|priezvisko|subjekt/);
  const votesIdx = idx(/pc_hl|(po[cč]et )?(platn[yý]ch )?hlasov|hlasy/);
  const pctIdx = idx(/podiel|%|percent/);
  if (nameIdx < 0 || votesIdx < 0) return null;

  const firstNameIdx = idx(/^meno/);
  const surnameIdx = idx(/priezvisko/);
  const results = rows.map(r => ({
    name: surnameIdx >= 0 && firstNameIdx >= 0 && surnameIdx !== nameIdx
      ? `${r[firstNameIdx]} ${r[surnameIdx]}`.trim()
      : r[nameIdx],
    votes: parseInt(String(r[votesIdx]).replace(/\s/g, '')) || 0,
    pct: pctIdx >= 0 ? parseFloat(String(r[pctIdx]).replace(',', '.')) : null,
  })).filter(x => x.name && x.votes > 0);

  if (!results.length) return null;
  results.sort((a, b) => b.votes - a.votes);
  const total = results.reduce((s, x) => s + x.votes, 0);
  for (const x of results) x.pct ??= Math.round((x.votes / total) * 1000) / 10;
  return { key: elec.key, name: elec.name, totalVotes: total, rows: results.slice(0, 12) };
}
