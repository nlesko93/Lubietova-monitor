// TLE dráhové elementy — CelesTrak (stanice + vizuálne najjasnejšie satelity).
import { getText, writeResult } from './lib.mjs';

const GROUPS = ['stations', 'visual'];

export async function fetchTle() {
  const seen = new Set();
  const items = [];
  for (const group of GROUPS) {
    const txt = await getText(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`);
    const lines = txt.split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean);
    for (let i = 0; i + 2 < lines.length + 1; i += 3) {
      const [name, l1, l2] = [lines[i], lines[i + 1], lines[i + 2]];
      if (!l1?.startsWith('1 ') || !l2?.startsWith('2 ')) break;
      const norad = l1.slice(2, 7).trim();
      if (seen.has(norad)) continue;
      seen.add(norad);
      items.push({ name: name.trim(), norad, group, l1, l2 });
    }
  }
  if (items.length < 10) throw new Error(`podozrivo málo TLE záznamov (${items.length})`);
  return writeResult('tle', { items });
}
