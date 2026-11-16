// DOČASNÁ sonda (2. kolo): stránkovanie CRZ a štruktúra zoznamov na webe obce.
import { getText, writeResult, stripTags } from './lib.mjs';

const cut = (s, n) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);

export async function fetchProbe() {
  const log = [];
  const say = s => log.push(s);

  try {
    const html = await getText('https://www.crz.gov.sk/2171273-sk/centralny-register-zmluv/?art_ico1=00313564', { retries: 1 });
    const pg = [...new Set([...html.matchAll(/href="([^"]*(?:page|strana|pg|offset|start)=[^"]*)"/gi)].map(m => m[1].replace(/&amp;/g, '&')))];
    say(`CRZ stránkovanie (${pg.length}): ${pg.slice(0, 4).join(' , ').slice(0, 500)}`);
    const i = html.search(/class="[^"]*pagination|class="[^"]*pager|strankovanie/i);
    say(`CRZ pager: ${i >= 0 ? cut(html.slice(i - 60, i + 500), 560) : 'nenájdené'}`);
    const cnt = stripTags(html).match(/[^.]{0,50}(?:nájden|záznam|zmlúv spolu|výsledk)[^.]{0,50}/i);
    say(`CRZ počet: ${cnt ? cut(cnt[0], 140) : '—'}`);
  } catch (e) { say(`CRZ: ${e.message.slice(0, 120)}`); }

  const base = 'https://www.lubietova.sk';
  for (const rss of ['/api/rss', '/?rss=200']) {
    try {
      const xml = await getText(base + rss, { retries: 0 });
      const items = xml.match(/<item[\s>][\s\S]*?<\/item>/g) || [];
      say(`RSS ${rss}: ${xml.length} B, ${items.length} položiek · ${items.slice(0, 4).map(it => cut(stripTags((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]), 50) + ' → ' + cut((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1], 90) + ' @' + cut((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1], 20)).join(' ;; ')}`);
    } catch (e) { say(`RSS ${rss}: ${e.message.slice(0, 80)}`); }
  }
  for (const sec of ['/zverejnovanie/uradna-tabula/', '/zverejnovanie/uznesenia/', '/zverejnovanie/zvukove-zaznamy-a-zapisnice/', '/aktualne/kalendar/', '/aktualne/oznamy/']) {
    try {
      const html = await getText(base + sec, { retries: 0, timeoutMs: 15000 });
      const re = new RegExp(`<a\\s[^>]*href="((?:${base})?${sec}[^"]+|[^"]+\\.(?:pdf|docx?|mp3|zip))"[^>]*>([\\s\\S]*?)</a>`, 'gi');
      const hits = [...html.matchAll(re)];
      say(`OBEC ${sec}: ${html.length} B · položiek ${hits.length} · ${hits.slice(0, 5).map(m => cut(m[1].replace(base, ''), 70) + ' | ' + cut(stripTags(m[2]), 90)).join(' ;; ')}`);
      // preskoč menu: vezmi položku, ktorej text obsahuje dátum, inak 3. v poradí
      const pick = hits.find(m => /\d{1,2}\.\s?\d{1,2}\.\s?20\d\d/.test(stripTags(m[2]))) || hits[Math.min(2, hits.length - 1)];
      if (pick) say(`   HTML: ${cut(html.slice(Math.max(0, pick.index - 350), pick.index + 650), 1000)}`);
    } catch (e) { say(`OBEC ${sec}: ${e.message.slice(0, 100)}`); }
  }
  return writeResult('_probe', { log });
}
