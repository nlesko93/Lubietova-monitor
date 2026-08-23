// JEDNORAZOVÁ SONDA: stiahni live-widget.js Futbalnetu a zisti, ako sa
// konfiguruje (data-atribúty) a ktoré API volá (aby sme vedeli vložiť widget
// alebo volať API na tabuľku priamo). Po vyriešení sa fetcher odstráni.
import { get, writeResult } from './lib.mjs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const uniq = a => [...new Set(a)];

export async function fetchFootball() {
  const url = 'https://widget.sportnet.sk/v14/live-widget.js';
  const diag = {};
  try {
    const js = await (await get(url, { timeoutMs: 30000, retries: 1, headers: { 'user-agent': UA } })).text();
    diag.jsKb = Math.round(js.length / 1024);
    diag.apiHosts = uniq(js.match(/https?:\/\/[a-z0-9.-]*sportnet[a-z0-9.-]*/gi) || []).slice(0, 10);
    diag.apiPaths = uniq(js.match(/\/(?:api\/)?v\d\/[a-z0-9{}:_-]+(?:\/[a-z0-9{}:_.-]+){0,4}/gi) || []).slice(0, 25);
    diag.dataAttrs = uniq(js.match(/data-[a-z0-9-]+/gi) || []).slice(0, 30);
    diag.words = uniq(js.match(/["'`](competition|competitionId|standing|standings|resultsTable|table|matches|appSpace|widgetType|part|season|team|club|round)["'`]/gi) || []).slice(0, 30);
    // úryvky okolo "competition" na pochopenie kontextu
    const idx = js.search(/competition/i);
    diag.snippet = idx >= 0 ? js.slice(Math.max(0, idx - 120), idx + 180).replace(/\s+/g, ' ') : null;
  } catch (e) {
    diag.error = e.message.slice(0, 160);
  }
  console.log('  football widget.js:', JSON.stringify(diag).slice(0, 900));
  return writeResult('football', { items: [], _diag: diag });
}
