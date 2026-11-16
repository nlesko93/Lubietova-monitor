// DOČASNÁ sonda: zistí štruktúru zdrojov, ktoré sa nedajú overiť lokálne
// (stránkovanie CRZ, výkazy RegisterUZ, sekcie webu obce). Po doladení
// parserov sa odstráni.
import { getText, getJSON, writeResult, stripTags } from './lib.mjs';

const RUZ = 'https://www.registeruz.sk/cruz-public/api';
const cut = (s, n) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);

export async function fetchProbe() {
  const log = [];
  const say = s => log.push(s);

  // 1) CRZ — stránkovanie
  try {
    const html = await getText('https://www.crz.gov.sk/2171273-sk/centralny-register-zmluv/?art_ico1=00313564', { retries: 1 });
    const pg = [...new Set([...html.matchAll(/href="([^"]*(?:page|strana|pg|offset)=[^"]*)"/gi)].map(m => m[1].replace(/&amp;/g, '&')))];
    say(`CRZ stránkovanie (${pg.length}): ${pg.slice(0, 6).join(' , ')}`);
    const i = html.search(/pagination|strankovanie|pager/i);
    say(`CRZ pager HTML: ${i >= 0 ? cut(html.slice(i - 100, i + 700), 800) : 'nenájdené'}`);
    const cnt = stripTags(html).match(/[^.]{0,60}(?:nájden|záznam|zmlúv spolu|výsledk)[^.]{0,60}/i);
    say(`CRZ počet: ${cnt ? cut(cnt[0], 160) : '—'}`);
  } catch (e) { say(`CRZ: ${e.message.slice(0, 120)}`); }

  // 2) RegisterUZ — výkazy (lesy = podnikateľ, obec = verejná správa)
  for (const [name, ico] of [['lesy', '31579043'], ['pila', '31605397'], ['obec', '00313564']]) {
    try {
      const l = await getJSON(`${RUZ}/uctovne-jednotky?zmenene-od=2000-01-01&ico=${ico}&max-zaznamov=10`);
      const uj = await getJSON(`${RUZ}/uctovna-jednotka?id=${l.id[0]}`);
      const ids = uj.idUctovnychZavierok || [];
      say(`RUZ ${name}: uj ${l.id.join(',')} · ${uj.nazovUJ} · závierok ${ids.length} · ids ${ids.join(',')}`);
      const zs = [];
      for (const id of ids) { try { zs.push(await getJSON(`${RUZ}/uctovna-zavierka?id=${id}`)); } catch { /* skip */ } }
      zs.sort((a, b) => String(b.obdobieDo).localeCompare(String(a.obdobieDo)));
      say(`RUZ ${name} obdobia: ${zs.map(z => `${String(z.obdobieDo).slice(0, 4)}${z.konsolidovana ? 'K' : ''}:${z.typ}:${(z.idUctovnychVykazov || []).length}v`).join(' ')}`);
      const z = zs.find(x => (x.idUctovnychVykazov || []).length) || zs[0];
      say(`RUZ ${name} závierka kľúče: ${Object.keys(z).join(',')}`);
      for (const vid of (z.idUctovnychVykazov || []).slice(0, 3)) {
        const v = await getJSON(`${RUZ}/uctovny-vykaz?id=${vid}`);
        const tabs = v.obsah?.tabulky || [];
        say(`RUZ ${name} výkaz ${vid}: kľúče ${Object.keys(v).join(',')} · šablóna ${v.idSablony} · tabuľky ${tabs.map(t => `${cut(t.nazov?.sk, 40)}[${(t.data || []).length}]`).join(' | ')}`);
        if (v.idSablony) {
          const sb = await getJSON(`${RUZ}/sablona?id=${v.idSablony}`);
          say(`RUZ ${name} šablóna ${v.idSablony}: ${cut(sb.nazov, 80)} · kľúče ${Object.keys(sb).join(',')}`);
          (sb.tabulky || []).forEach((t, ti) => {
            const rows = t.riadky || [];
            say(`   T${ti} ${cut(t.nazov?.sk, 50)} · riadkov ${rows.length} · dátových stĺpcov ${t.pocetDatovychStlpcov} · kľúče riadku ${Object.keys(rows[0] || {}).join(',')} · hlavička ${cut(JSON.stringify(t.hlavicka), 200)}`);
            rows.forEach((r, ri) => {
              const txt = r.text?.sk || '';
              if (/čistý obrat|výsledok hospodárenia.*(po zdanení|za účtovné obdobie)|tržby z predaja|výnosy.*spolu|náklady.*spolu|spolu majetok|vlastné imanie/i.test(txt)) {
                const cols = t.pocetDatovychStlpcov || 1;
                const data = (tabs[ti]?.data || []).slice(ri * cols, ri * cols + cols);
                say(`      r${ri} č.${r.cisloRiadku} „${cut(txt, 90)}" = ${JSON.stringify(data)}`);
              }
            });
          });
        }
      }
    } catch (e) { say(`RUZ ${name}: ${e.message.slice(0, 160)}`); }
  }

  // 3) web obce — kde je úradná tabuľa, zastupiteľstvo, podujatia
  try {
    const base = 'https://www.lubietova.sk';
    const home = await getText(base + '/', { retries: 1 });
    const links = [...home.matchAll(/<a\s[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
      .map(m => [m[1].startsWith('/') ? base + m[1] : m[1], stripTags(m[2])])
      .filter(([h]) => h.startsWith(base));
    const uniq = [...new Map(links.map(l => [l[0], l])).values()];
    say(`OBEC domov ${home.length} B, interných odkazov ${uniq.length}; generator: ${cut((home.match(/<meta[^>]*generator[^>]*>/i) || [''])[0], 120)}`);
    const want = uniq.filter(([h, t]) => /uradn|tabul|zastupitel|zasadnut|zapisnic|uzneseni|podujat|kalendar|oznam|rozhlas|aktualit/i.test(h + ' ' + t));
    say(`OBEC kandidáti: ${want.map(([h, t]) => `${h.replace(base, '')} „${cut(t, 30)}"`).join(' ; ').slice(0, 1800)}`);
    for (const [h] of want.slice(0, 9)) {
      try {
        const html = await getText(h, { retries: 0, timeoutMs: 15000 });
        const main = html.slice(html.search(/<main|id="content"|class="content/i));
        const i = main.search(/\d{1,2}\.\s?\d{1,2}\.\s?20\d\d/);
        say(`OBEC ${h.replace(base, '')}: ${html.length} B · rss ${(html.match(/<link[^>]*(?:rss|atom)[^>]*>/i) || ['—'])[0].slice(0, 140)} · okolie dátumu: ${i >= 0 ? cut(main.slice(Math.max(0, i - 500), i + 500), 1000) : 'bez dátumu'}`);
      } catch (e) { say(`OBEC ${h.replace(base, '')}: ${e.message.slice(0, 100)}`); }
    }
  } catch (e) { say(`OBEC: ${e.message.slice(0, 120)}`); }

  return writeResult('_probe', { log });
}
