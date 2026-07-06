// Odchody/polohy autobusov — zatiaľ bez verejného zdroja.
// Overené v Actions behoch č. 17–23: cp.sk (cp.hnonline.sk) vracia
// HTTP 403 pre automatizovaný prístup, Ubian (TransData) nemá verejné
// API (web aj appka používajú privátne rozhrania bez CORS), SAD Zvolen
// nezverejňuje GPS polohy. Živé polohy by vyžadovali malý proxy server.
import { writeResult } from './lib.mjs';

export async function fetchBuses() {
  return writeResult('buses', { items: [], unavailable: true });
}
