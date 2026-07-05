// Hospodárenie obce — Register účtovných závierok (registeruz.sk, verejné API).
// IČO obce sa rozresolvuje cez RPO API ŠÚ SR, ak nie je v config.json.
import { getJSON, writeResult, CONFIG } from './lib.mjs';

const RUZ = 'https://www.registeruz.sk/cruz-public/api';

export async function fetchFinance() {
  const ico = CONFIG.icoObce || await resolveIco();
  if (!ico) throw new Error('IČO obce sa nepodarilo zistiť');
  console.log(`  registeruz: IČO ${ico}`);

  // účtovná jednotka
  const ujList = await getJSON(`${RUZ}/uctovne-jednotky?zmenene-od=2000-01-01&ico=${ico}&max-zaznamov=10`);
  const ujId = ujList?.id?.[0];
  if (!ujId) throw new Error(`RegisterUZ nepozná IČO ${ico}`);
  const uj = await getJSON(`${RUZ}/uctovna-jednotka?id=${ujId}`);

  // účtovné závierky (posledné roky)
  const zavierky = [];
  for (const zid of (uj.idUctovnychZavierok || []).slice(-8)) {
    try {
      const z = await getJSON(`${RUZ}/uctovna-zavierka?id=${zid}`);
      zavierky.push(z);
    } catch (e) { console.warn(`  registeruz závierka ${zid}: ${e.message}`); }
  }
  zavierky.sort((a, b) => String(a.obdobieOd || '').localeCompare(String(b.obdobieOd || '')));

  const items = zavierky.reverse().map(z => ({
    title: `Účtovná závierka ${String(z.obdobieOd || '').slice(0, 4)}`,
    type: z.typ || '',
    period: [z.obdobieOd, z.obdobieDo].filter(Boolean).join(' – '),
    link: `https://www.registeruz.sk/cruz-public/domain/accountingentity/show/${ujId}`,
  }));

  return writeResult('finance', {
    entity: { name: uj.nazovUJ, ico: uj.ico, address: [uj.ulica, uj.mesto].filter(Boolean).join(', ') },
    items,
  });
}

// RPO (register právnických osôb) — vyhľadanie IČO podľa názvu.
async function resolveIco() {
  const name = encodeURIComponent(CONFIG.icoSearchName || `Obec ${CONFIG.obec}`);
  const attempts = [
    `https://api.statistics.sk/rpo/v1/search?fullName=${name}&onlyActive=true`,
    `https://api.statistics.sk/rpo/v1/search?fullName=${name}`,
  ];
  for (const url of attempts) {
    try {
      const d = await getJSON(url, { retries: 0 });
      const results = d?.results || d?.items || [];
      const hit = results.find(r =>
        (r.fullNames || r.names || []).some?.(n => /obec/i.test(n.value || n)) ||
        /obec/i.test(r.fullName || r.name || ''));
      const rec = hit || results[0];
      const ico = rec?.identifiers?.[0]?.value || rec?.ico || rec?.identifier;
      if (ico) return String(ico).padStart(8, '0');
    } catch (e) { console.warn(`  rpo: ${e.message}`); }
  }
  return null;
}
