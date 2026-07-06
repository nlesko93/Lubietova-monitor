// Výsledky volieb v obci — otvorené dáta ŠÚ SR.
// Datasety sa hľadajú cez CKAN API portálu data.gov.sk; CSV s výsledkami
// za obce sa filtruje na Ľubietovú. Kým nie je parser doladený podľa
// reálnych hlavičiek (logujú sa), zapisuje sa diagnostický výstup.
import { get, getText, writeResult, CONFIG } from './lib.mjs';

const OBEC_NAME = /ľubietová/i;
const OBEC_CODE = (CONFIG.obecStatCode || '508748').trim();

const ELECTIONS = [
  { key: 'nrsr2023', name: 'Parlamentné voľby 2023', site: 'https://volby.statistics.sk/nrsr/nrsr2023/' },
  { key: 'prezident2024', name: 'Prezidentské voľby 2024', site: 'https://volby.statistics.sk/prez/prez2024/' },
  { key: 'ep2024', name: 'Voľby do EP 2024', site: 'https://volby.statistics.sk/ep/ep2024/' },
  { key: 'komunalne2022', name: 'Komunálne voľby 2022', site: 'https://volby.statistics.sk/osk/osk2022/' },
];

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
  if (!items.length) await logPortalDiscovery();
  return writeResult('elections', { items });
}

// Nájde na webe volieb odkazy na dátové súbory (CSV/XLSX/JSON) —
// prehľadá koreň + jednu úroveň "data/opendata" podstránok.
async function fetchOne(elec) {
  const dataLinks = [];
  const queue = [elec.site];
  const visited = new Set();

  for (let depth = 0; depth < 2 && queue.length; depth++) {
    const pages = queue.splice(0, 4);
    for (const page of pages) {
      if (visited.has(page)) continue;
      visited.add(page);
      let html;
      try {
        html = await getText(page, { retries: 2, timeoutMs: 20000 });
      } catch (e) {
        console.log(`  elections ${elec.key}: ${page.slice(0, 70)} -> ${e.message.slice(0, 100)}`);
        continue;
      }
      const links = [...new Set([...html.matchAll(/href="([^"#]+)"/gi)].map(m => m[1]))]
        .map(u => { try { return new URL(u, page).href; } catch { return null; } })
        .filter(Boolean);
      for (const u of links) {
        if (/\.(csv|xlsx|json)(\?|$)/i.test(u)) dataLinks.push(u);
        else if (depth === 0 && /open.?data|\/data|download|subor|vysledk/i.test(u) && u.startsWith(elec.site)) queue.push(u);
      }
      console.log(`  elections ${elec.key}: ${page.slice(0, 80)} -> ${links.length} odkazov, dátové: ` +
        links.filter(u => /open.?data|\.csv|\.xlsx|\.json|download|tab\d|vysledk/i.test(u)).slice(0, 12).join(' , ').slice(0, 900));
    }
  }

  // CSV odkazy skús rovno spracovať (preferuj tie s "obc/obec/tab" v názve)
  const csvs = [...new Set(dataLinks.filter(u => /\.csv/i.test(u)))]
    .sort((a, b) => scoreUrl(b) - scoreUrl(a));
  for (const url of csvs.slice(0, 6)) {
    try {
      const rows = await downloadCsvRows(url);
      if (!rows) continue;
      const header = rows[0];
      const matches = rows.filter(r => r.some(c => OBEC_NAME.test(c)) ||
        r.some(c => c === OBEC_CODE || c === `SK0321${OBEC_CODE}`));
      console.log(`  elections ${elec.key}: ${url.slice(0, 100)} -> ${rows.length} riadkov, obec match ${matches.length}; hlavička: ${header.join('§').slice(0, 400)}`);
      if (matches.length) {
        console.log(`  elections ${elec.key}: vzorka: ${matches[0].join('§').slice(0, 400)}`);
        const parsed = parseRows(elec, header, matches);
        if (parsed) return parsed;
      }
    } catch (e) {
      console.log(`  elections ${elec.key}: ${url.slice(0, 80)} -> ${e.message.slice(0, 140)}`);
    }
  }
  return null;
}

const scoreUrl = u => (/obc|obec/i.test(u) ? 4 : 0) + (/tab|vysledk/i.test(u) ? 2 : 0) - (/okrsk/i.test(u) ? 2 : 0);

// Nový portál otvorených dát (data.slovensko.sk) — zaloguj odpoveď API,
// aby sa dal doladiť náhradný zdroj, keď weby volieb nič nevydajú.
async function logPortalDiscovery() {
  const candidates = [
    'https://data.slovensko.sk/api/publicApi/v1/datasets/search?q=vo%C4%BEby%20nrsr&pageSize=5',
    'https://data.slovensko.sk/api/datasets?q=vo%C4%BEby',
  ];
  for (const url of candidates) {
    try {
      const txt = await getText(url, { retries: 0, timeoutMs: 15000 });
      console.log(`  elections portal: ${url.slice(0, 80)} -> ${txt.slice(0, 500).replace(/\s+/g, ' ')}`);
    } catch (e) {
      console.log(`  elections portal: ${url.slice(0, 80)} -> ${e.message.slice(0, 120)}`);
    }
  }
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
