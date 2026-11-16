// DOČASNÁ sonda (3. kolo): zoznamy uznesení / zápisníc a položka úradnej tabule.
import { getText, writeResult } from './lib.mjs';

const cut = (s, n) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);

export async function fetchProbe() {
  const log = [];
  const base = 'https://www.lubietova.sk';
  for (const sec of ['/zverejnovanie/uznesenia/', '/zverejnovanie/zvukove-zaznamy-a-zapisnice/', '/zverejnovanie/uradna-tabula/']) {
    try {
      const html = await getText(base + sec, { retries: 0, timeoutMs: 15000 });
      const i = html.search(/class="gcm-main"/);
      log.push(`OBEC ${sec}: gcm-main@${i} · ${cut(html.slice(i, i + 2600), 2400)}`);
    } catch (e) { log.push(`OBEC ${sec}: ${e.message.slice(0, 100)}`); }
  }
  return writeResult('_probe', { log });
}
