// Spustí všetky fetchery; chyba jedného zdroja nezhodí ostatné.
// Vždy končí kódom 0 — dashboard zobrazí error stav z data/*.json.
import { writeFailure } from './lib.mjs';
import { fetchNews } from './news.mjs';
import { fetchObec } from './obec.mjs';
import { fetchAlerts } from './alerts.mjs';
import { fetchContracts } from './crz.mjs';
import { fetchFinance } from './registeruz.mjs';
import { fetchDemographics } from './statistics.mjs';
import { fetchTle } from './tle.mjs';
import { fetchWebcams } from './webcams.mjs';
import { fetchWaste } from './waste.mjs';

const FETCHERS = [
  ['news', fetchNews],
  ['obec', fetchObec],
  ['alerts', fetchAlerts],
  ['contracts', fetchContracts],
  ['finance', fetchFinance],
  ['demographics', fetchDemographics],
  ['tle', fetchTle],
  ['webcams', fetchWebcams],
  ['waste', fetchWaste],
];

const results = await Promise.allSettled(
  FETCHERS.map(async ([name, fn]) => {
    try {
      return await fn();
    } catch (e) {
      return writeFailure(name, e);
    }
  }),
);

const okCount = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
console.log(`\nHotovo: ${okCount}/${FETCHERS.length} zdrojov OK`);
