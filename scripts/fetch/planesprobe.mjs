// JEDNORAZOVÁ SONDA: zisti, ktoré ADS-B API vracia dáta a či posiela CORS
// hlavičku (Access-Control-Allow-Origin) — bez nej prehliadač fetch zablokuje.
import { writeResult, CONFIG } from './lib.mjs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function fetchPlanesProbe() {
  const lat = CONFIG.lat, lon = CONFIG.lon, r = CONFIG.planes?.radiusNm ?? 25;
  const cands = [
    ['adsb.fi/opendata', `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${r}`],
    ['adsb.fi/api', `https://api.adsb.fi/v2/point/${lat}/${lon}/${r}`],
    ['adsb.lol/point', `https://api.adsb.lol/v2/point/${lat}/${lon}/${r}`],
    ['adsb.lol/latlon', `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${r}`],
    ['airplanes.live', `https://api.airplanes.live/v2/point/${lat}/${lon}/${r}`],
  ];
  const out = [];
  for (const [name, url] of cands) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
      const cors = res.headers.get('access-control-allow-origin') || '—';
      let ac = -1, note = '';
      try { const j = await res.json(); ac = (j.ac || j.aircraft || []).length; }
      catch (e) { note = 'nie JSON'; }
      out.push(`${name}: HTTP ${res.status} · CORS=${cors} · ac=${ac}${note ? ' · ' + note : ''}`);
    } catch (e) {
      out.push(`${name}: CHYBA ${String(e.message).slice(0, 60)}`);
    }
  }
  for (const l of out) console.log('  planes-probe:', l);
  return writeResult('planesprobe', { items: [], _diag: out });
}
