// Výsledky volieb v obci — otvorené dáta ŠÚ SR.
// Datasety sa hľadajú cez CKAN API portálu data.gov.sk; CSV s výsledkami
// za obce sa filtruje na Ľubietovú. Kým nie je parser doladený podľa
// reálnych hlavičiek (logujú sa), zapisuje sa diagnostický výstup.
import { getJSON, get, writeResult, CONFIG } from './lib.mjs';

const OBEC_NAME = /ľubietová/i;
const OBEC_CODE = (CONFIG.obecStatCode || '508748').trim();

const ELECTIONS = [
  { key: 'nrsr2023', name: 'Parlamentné voľby 2023', q: '"voľby" "2023" NRSR výsledky' },
  { key: 'prezident2024', name: 'Prezidentské voľby 2024', q: 'voľby prezidenta 2024 výsledky' },
  { key: 'ep2024', name: 'Voľby do EP 2024', q: 'voľby európskeho parlamentu 2024 výsledky' },
  { key: 'komunalne2022', name: 'Komunálne voľby 2022', q: 'voľby orgánov samosprávy obcí 2022 výsledky' },
];

const CKAN = 'https://data.gov.sk/api/3/action/package_search';

export async function fetchElections() {
  const items = [];
  for (const elec of ELECTIONS) {
    try {
      const parsed = await fetchOne(elec);
      if (parsed) items.push(parsed);
    } catch (e) {
      console.log(`  elections ${elec.key}: ${e.message.slice(0, 180)}`);
    }
  }
  return writeResult('elections', { items });
}

async function fetchOne(elec) {
  const search = await getJSON(`${CKAN}?q=${encodeURIComponent(elec.q)}&rows=6`, { retries: 0 });
  const pkgs = search?.result?.results || [];
  console.log(`  elections ${elec.key}: ${pkgs.length} datasetov: ${pkgs.map(p => p.title).join(' ; ').slice(0, 300)}`);

  // kandidátske CSV zdroje — preferuj tie s "obc"/"obec"/"vysledky" v názve
  const resources = pkgs.flatMap(p => (p.resources || []).map(r => ({ pkg: p.title, ...r })))
    .filter(r => /csv/i.test(r.format || '') || /\.csv/i.test(r.url || ''));
  resources.sort((a, b) => score(b) - score(a));
  console.log(`  elections ${elec.key}: CSV zdroje: ${resources.slice(0, 6).map(r => `${r.name || r.description || '?'} -> ${r.url}`).join(' | ').slice(0, 700)}`);

  for (const res of resources.slice(0, 4)) {
    try {
      const rows = await downloadCsvRows(res.url);
      if (!rows) continue;
      const header = rows[0];
      const matches = rows.filter(r => r.some(c => OBEC_NAME.test(c)) ||
        r.some(c => c === OBEC_CODE || c === `SK0321${OBEC_CODE}`));
      console.log(`  elections ${elec.key}: ${res.url.slice(0, 90)} -> ${rows.length} riadkov, obec match ${matches.length}; hlavička: ${header.join('§').slice(0, 400)}`);
      if (matches.length) {
        console.log(`  elections ${elec.key}: vzorka: ${matches[0].join('§').slice(0, 400)}`);
        const parsed = parseRows(elec, header, matches);
        if (parsed) return parsed;
      }
    } catch (e) {
      console.log(`  elections ${elec.key}: ${res.url?.slice(0, 80)} -> ${e.message.slice(0, 140)}`);
    }
  }
  return null;
}

function score(r) {
  const s = `${r.name || ''} ${r.description || ''} ${r.url || ''}`.toLowerCase();
  return (/obc|obec/.test(s) ? 4 : 0) + (/vysledk|výsledk/.test(s) ? 2 : 0) +
    (/kandid|stran|subjekt/.test(s) ? 1 : 0) - (/okrsk/.test(s) ? 2 : 0);
}

async function downloadCsvRows(url) {
  const res = await get(url, { retries: 0, timeoutMs: 30000 });
  const buf = new Uint8Array(await res.arrayBuffer());
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if ((text.match(/�/g) || []).length > 5) {
    text = new TextDecoder('windows-1250').decode(buf);
  }
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;
  const delim = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  return lines.map(l => splitCsvLine(l, delim));
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

// Všeobecný parser: nájde stĺpce s názvom subjektu/kandidáta, počtom
// hlasov a percentom podľa hlavičky. Ak sa nenájdu, vráti null a v logu
// ostane hlavička na doladenie.
function parseRows(elec, header, rows) {
  const h = header.map(c => c.toLowerCase());
  const idx = re => h.findIndex(c => re.test(c));
  const nameIdx = idx(/n[aá]zov.*(stran|subjekt|koal)|kandid[aá]t|meno|priezvisko|subjekt/);
  const votesIdx = idx(/(po[cč]et )?(platn[yý]ch )?hlas/);
  const pctIdx = idx(/podiel|%|percent/);
  if (nameIdx < 0 || votesIdx < 0) return null;

  const surnameIdx = idx(/priezvisko/);
  const results = rows.map(r => ({
    name: surnameIdx >= 0 && surnameIdx !== nameIdx
      ? `${r[nameIdx]} ${r[surnameIdx]}`.trim()
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
