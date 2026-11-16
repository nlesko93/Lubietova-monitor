// Komunálne voľby 2026 (voľby do orgánov samosprávy obcí) — ŠÚ SR.
// Krok 1 (sonda): nájdi súbory na stiahnutie, rozbaľ CSV a vypíš tabuľky,
// v ktorých sa vyskytuje kód obce — podľa toho sa doladí parser.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CONFIG } from './lib.mjs';

const CODE = (CONFIG.obecStatCode || '508748').trim();
const PAGES = [
  'https://volby.statistics.sk/oso/oso2026/sk/subory_na_stiahnutie.html',
  'https://volbysr.sk/oso/sk/subory_na_stiahnutie.html',
  'https://www.volbysr.sk/oso/sk/subory_na_stiahnutie.html',
];
const UA = 'Mozilla/5.0 (X11; Linux x86_64) LubietovaMonitor/1.0';
const MAX = 80 * 1024 * 1024;

export function decodeBuf(buf) {
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if ((text.match(/�/g) || []).length > 5) text = new TextDecoder('windows-1250').decode(buf);
  return text;
}

export async function probeOso() {
  const log = [];
  const say = s => { log.push(s); console.log('  oso2026:', s); };
  for (const page of PAGES) {
    let html;
    try {
      const res = await fetch(page, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': UA } });
      say(`${page} -> HTTP ${res.status}`);
      if (!res.ok) continue;
      html = await res.text();
    } catch (e) { say(`${page} -> ${e.message.slice(0, 100)}`); continue; }

    const links = [...new Set([...html.matchAll(/href="([^"]+\.(?:zip|csv|xlsx|ods|json|xml))"/gi)]
      .map(m => new URL(m[1], page).href))];
    say(`odkazov: ${links.length} :: ${links.map(l => l.split('/').slice(-2).join('/')).join(' , ').slice(0, 1500)}`);
    const csvLinks = links.filter(l => /csv/i.test(l));
    for (const url of csvLinks.slice(0, 6)) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(120000), headers: { 'user-agent': UA } });
        if (!res.ok) { say(`${url.split('/').pop()} -> HTTP ${res.status}`); continue; }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX) { say(`${url.split('/').pop()} príliš veľký ${Math.round(buf.length / 1e6)} MB`); continue; }
        const dir = mkdtempSync(path.join(tmpdir(), 'oso-'));
        let files = [];
        if (/\.zip$/i.test(url)) {
          const zp = path.join(dir, 'd.zip');
          writeFileSync(zp, buf);
          execFileSync('unzip', ['-o', '-qq', zp, '-d', dir]);
          files = readdirSync(dir, { recursive: true }).map(String).filter(f => /\.csv$/i.test(f)).map(f => path.join(dir, f));
        } else {
          const fp = path.join(dir, url.split('/').pop());
          writeFileSync(fp, buf);
          files = [fp];
        }
        say(`${url.split('/').pop()} (${Math.round(buf.length / 1024)} kB) -> ${files.length} CSV: ${files.map(f => path.basename(f)).join(', ').slice(0, 600)}`);
        for (const f of files) {
          const text = decodeBuf(readFileSync(f));
          const lines = text.split(/\r?\n/).filter(Boolean);
          const hits = lines.filter(l => l.includes(CODE) || /ubietov/i.test(l));
          say(`[${path.basename(f)}] riadkov ${lines.length}, obec ${hits.length} | H: ${lines[0]?.slice(0, 420)}`);
          hits.slice(0, 14).forEach(h => say(`    > ${h.slice(0, 330)}`));
        }
        return log;
      } catch (e) { say(`${url.split('/').pop()} -> ${e.message.slice(0, 140)}`); }
    }
  }
  return log;
}
