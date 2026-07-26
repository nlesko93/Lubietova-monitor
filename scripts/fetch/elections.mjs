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

const DEBUG = [];

export async function fetchElections() {
  const items = [];
  for (const elec of ELECTIONS) {
    for (const url of [...(elec.zips || []), ...(elec.csvs || [])]) {
      try {
        const parsed = /\.zip$/i.test(url)
          ? await scanZip(elec, url)
          : await scanCsvUrl(elec, url);
        if (Array.isArray(parsed)) {
          if (parsed.length) { items.push(...parsed); break; }
        } else if (parsed) { items.push(parsed); break; }
      } catch (e) {
        console.log(`  elections ${elec.key}: ${url.split('/').pop()} -> ${e.message.slice(0, 160)}`);
      }
    }
  }
  return writeResult('elections', { items, _debug: DEBUG });
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

  // komunálne majú iný model (hlasy podľa poradového čísla + samostatný
  // register mien) — spracujeme ich osobitne, spojením cez poradové číslo.
  if (/osk|komunal/i.test(elec.key)) return scanKomunalne(elec, dir, csvs);

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
    const parsed = parseRows(elec, header, matches);
    console.log(`  elections ${elec.key}: ${path.basename(f)} -> ${matches.length} riadkov obce, parsed=${parsed ? `kind${parsed.kind}/${parsed.count}` : 'null'}; hlavička: ${header.join('§').slice(0, 200)}`);
    if (parsed) {
      // uprednostni súhrnnú tabuľku (strany/kandidáti), pri zhode menej riadkov
      const better = !best || parsed.kind > best.kind ||
        (parsed.kind === best.kind && parsed.count < best.count);
      if (better) {
        console.log(`  elections ${elec.key}: použijem ${path.basename(f)} — ${parsed.rows.slice(0, 3).map(r => `${r.name}:${r.votes}`).join(', ')}`);
        best = parsed;
      }
    }
  }
  return best;
}

// Komunálne voľby (OSK) — DIAGNOSTIKA väzby obvod↔obec↔kandidát.
// Dočasne nevytvára položky (aby sa nezobrazovali nesprávne mená), len
// vypíše, ako sa dáta viažu, aby sa dalo spraviť správne párovanie.
function scanKomunalne(elec, dir, csvs) {
  const CODE = OBEC_CODE;
  const read = f => { try { return csvRows(decodeBuf(readFileSync(path.join(dir, f)))); } catch { return []; } };
  const colOf = (h, re) => h.map(c => c.toLowerCase().trim()).findIndex(c => re.test(c));
  const base = f => path.basename(f);
  const dbg = [];

  // tab0dc: OBEC -> VOBVOD, a či je VOBVOD obce zdieľaný viacerými obcami
  const obvody = new Set();
  const fdc = csvs.find(x => /0dc\.csv$/i.test(base(x)));
  if (fdc) {
    const rows = read(fdc); const h = rows[0];
    const oi = colOf(h, /^obec$/), vi = colOf(h, /^vobvod$/);
    const luRows = rows.slice(1).filter(r => r[oi] === CODE);
    for (const r of luRows) obvody.add(r[vi]);
    dbg.push(`tab0dc[${h.join(',')}] Ľ-riadkov=${luRows.length}: ${luRows.slice(0, 3).map(r => r.join('|')).join(' ;; ')}`);
    for (const v of obvody) {
      const shared = rows.slice(1).filter(r => r[vi] === v);
      dbg.push(`VOBVOD ${v} má v tab0dc ${shared.length} obcí (zdieľaný?): ${shared.slice(0, 4).map(r => r[colOf(h, /nobec/)]).join(', ')}`);
    }
  }

  // tab0b (poslanci mená) — koľko kandidátov v obvode obce a kde bývajú
  const fb = csvs.find(x => /0b\.csv$/i.test(base(x)));
  if (fb) {
    const rows = read(fb); const h = rows[0];
    const vi = colOf(h, /^vobvod$/), tpi = colOf(h, /tp_nobec|nobec/);
    const inObv = rows.slice(1).filter(r => obvody.has(r[vi]));
    const luRes = inObv.filter(r => tpi >= 0 && OBEC_NAME.test(r[tpi] || ''));
    dbg.push(`tab0b VOBVOD∈{${[...obvody]}}: ${inObv.length} kandidátov, z toho bydlisko Ľubietová=${luRes.length}`);
    dbg.push(`tab0b vzorka: ${inObv.slice(0, 4).map(r => `PC${r[colOf(h, /^pc_hl$/)]}:${r[colOf(h, /^meno$/)]} ${r[colOf(h, /priezvisko/)]}(${r[tpi]})`).join(' ;; ')}`);
  }

  // tab09d (poslanci výsledky) — koľko výsledkov pre obec a rozsah PC
  const f9 = csvs.find(x => /09d\.csv$/i.test(base(x)));
  if (f9) {
    const rows = read(f9); const h = rows[0];
    const oi = colOf(h, /^obec$/), pci = colOf(h, /^pc_hl$/);
    const res = rows.slice(1).filter(r => r[oi] === CODE);
    const pcs = res.map(r => +r[pci]).filter(Number.isFinite);
    dbg.push(`tab09d OBEC=${CODE}: ${res.length} výsledkov, PC ${Math.min(...pcs)}..${Math.max(...pcs)}`);
  }

  DEBUG.push({ file: 'kom-diag', header: dbg.join('   ||   '), n: dbg.length, sample: [] });
  return [];   // dočasne žiadne komunálne položky, kým nevyriešim správnu väzbu
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

// Nájde súhrnnú tabuľku výsledkov: stĺpec názvu strany / mena kandidáta,
// stĺpec platných hlasov a podielu. Preferenčné tabuľky (strana + kandidát)
// sa vynechávajú — pre výsledok obce chceme súhrn strán, resp. kandidátov.
function parseRows(elec, header, rows) {
  const h = header.map(c => c.toLowerCase().trim());
  const idx = re => h.findIndex(c => re.test(c));

  const partyIdx = idx(/^n[aá]zov.*(subjekt|stran|koal|politick)/); // "Názov politického subjektu"
  const kandidatIdx = idx(/^kandid[aá]t/);                          // komunálne: KANDIDAT
  const menoIdx = idx(/^meno$/);
  const priezIdx = idx(/priezvisko/);
  const hasCandidate = menoIdx >= 0 && priezIdx >= 0;

  // platné hlasy — NIE prednostné/hlasovania
  let votesIdx = h.findIndex(c => /po[cč]et\s+platn[yý]ch\s+hlasov/.test(c) && !/predn/.test(c));
  if (votesIdx < 0) votesIdx = idx(/^p_hl$/);
  if (votesIdx < 0) votesIdx = h.findIndex(c => /^hlasy$/.test(c));
  if (votesIdx < 0) return null;

  // strana + kandidát v jednej tabuľke = preferenčné hlasy → nie je to súhrn
  if (partyIdx >= 0 && hasCandidate) return null;

  let nameFn, kind;
  if (partyIdx >= 0) { nameFn = r => r[partyIdx]; kind = 3; }            // súhrn strán
  else if (hasCandidate) { nameFn = r => `${r[menoIdx]} ${r[priezIdx]}`.trim(); kind = 3; } // súhrn kandidátov (prez.)
  else if (kandidatIdx >= 0) { nameFn = r => r[kandidatIdx]; kind = 2; } // komunálne
  else if (priezIdx >= 0) { nameFn = r => r[priezIdx]; kind = 2; }
  else return null;

  const pctIdx = idx(/podiel|%|percent/);
  const results = rows.map(r => ({
    name: (nameFn(r) || '').trim(),
    votes: parseInt(String(r[votesIdx] ?? '').replace(/\s/g, '')) || 0,
    pct: pctIdx >= 0 ? parseFloat(String(r[pctIdx] ?? '').replace(',', '.')) : null,
  })).filter(x => x.name && !/^\d+$/.test(x.name) && x.votes > 0);

  if (results.length < 2) return null;
  results.sort((a, b) => b.votes - a.votes);
  const total = results.reduce((s, x) => s + x.votes, 0);
  for (const x of results) if (!(x.pct >= 0)) x.pct = Math.round((x.votes / total) * 1000) / 10;
  return { key: elec.key, name: elec.name, totalVotes: total, kind, count: results.length, rows: results.slice(0, 12) };
}
