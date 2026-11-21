// DOČASNÁ sonda: ako sú v PDF cestovného poriadku 610 označené dni premávky
// (X, 6, 7/†, poznámky) a ako sedia stĺpce spojov v pdftotext -layout.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeResult, CONFIG } from './lib.mjs';

export async function fetchProbe() {
  const log = [];
  const bl = (CONFIG.busLines || [])[0];
  const res = await fetch(bl.pdf, { signal: AbortSignal.timeout(30000) });
  const buf = Buffer.from(await res.arrayBuffer());
  const dir = mkdtempSync(path.join(tmpdir(), 'probe-'));
  writeFileSync(path.join(dir, 'cp.pdf'), buf);
  const text = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', path.join(dir, 'cp.pdf'), '-'], { encoding: 'utf8', maxBuffer: 20e6 });
  const pages = text.split(/\f/);
  log.push(`strán ${pages.length}, znakov ${text.length}`);
  pages.forEach((p, i) => {
    const lines = p.split('\n');
    log.push(`=== strana ${i + 1} (${lines.length} riadkov, Ľubietová: ${/ubietov/i.test(p)}) ===`);
    // celá strana, ale len prvých 120 riadkov a 230 znakov na riadok
    lines.slice(0, 120).forEach((l, j) => { if (l.trim()) log.push(`${String(j).padStart(3)}|${l.slice(0, 230)}`); });
  });
  return writeResult('_probe', { log });
}
