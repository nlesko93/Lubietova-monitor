// Merané ovzdušie — verejné senzory v okolí obce.
//   1) AirGradient (verejné lokality, bez tokenu)
//   2) Sensor.Community (záloha — komunitné senzory v okruhu)
// Model CAMS (Open-Meteo) má mriežku ~10 km a lokálny dym z kúrenia
// v doline nezachytí, preto má meranie priamo v obci prednosť.
import { writeResult, CONFIG } from './lib.mjs';

const AG_WORLD = 'https://api.airgradient.com/public/api/v1/world/locations/measures/current';
const RADIUS_KM = CONFIG.airSensor?.radiusKm ?? 25;
const UA = 'LubietovaMonitor/1.0 (+https://github.com/nlesko93/lubietova-monitor)';

function km(lat1, lon1, lat2, lon2) {
  const R = 6371, t = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * t / 2) ** 2 +
    Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin((lon2 - lon1) * t / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const num = v => (v == null || v === '' || !isFinite(+v) ? null : Math.round(+v * 10) / 10);

export async function fetchAirSensor() {
  const diag = [];
  const items = [];

  try {
    const res = await fetch(AG_WORLD, {
      signal: AbortSignal.timeout(60000),
      headers: { 'user-agent': UA, accept: 'application/json', origin: 'https://nlesko93.github.io' },
    });
    const cors = res.headers.get('access-control-allow-origin') || '—';
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    const all = await res.json();
    const list = Array.isArray(all) ? all : (all.data || all.locations || []);
    diag.push(`AirGradient: ${list.length} lokalít · CORS ${cors} · kľúče: ${Object.keys(list[0] || {}).join(',').slice(0, 400)}`);
    for (const r of list) {
      const lat = +(r.latitude ?? r.lat ?? r.location?.latitude);
      const lon = +(r.longitude ?? r.lng ?? r.lon ?? r.location?.longitude);
      if (!isFinite(lat) || !isFinite(lon)) continue;
      const d = km(CONFIG.lat, CONFIG.lon, lat, lon);
      if (d > RADIUS_KM) continue;
      items.push({
        source: 'AirGradient',
        id: String(r.locationId ?? r.id ?? ''),
        name: r.publicLocationName || r.locationName || r.publicPlaceName || r.name || `senzor ${r.locationId ?? ''}`,
        owner: r.publicContributorName || r.ownerName || '',
        lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4,
        distKm: Math.round(d * 10) / 10,
        pm25: num(r.pm02_corrected ?? r.pm02Compensated ?? r.pm02),
        pm25raw: num(r.pm02),
        pm10: num(r.pm10_corrected ?? r.pm10), pm1: num(r.pm01_corrected ?? r.pm01),
        temp: num(r.atmp_corrected ?? r.atmpCompensated ?? r.atmp),
        rh: num(r.rhum_corrected ?? r.rhumCompensated ?? r.rhum),
        ts: r.timestamp || r.date || null,
        url: `https://www.airgradient.com/map/`,
      });
    }
  } catch (e) { diag.push(`AirGradient: ${e.message.slice(0, 160)}`); }

  try {
    const url = `https://data.sensor.community/airrohr/v1/filter/area=${CONFIG.lat},${CONFIG.lon},${RADIUS_KM}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    const byLoc = new Map();
    for (const r of list) {
      const v = Object.fromEntries((r.sensordatavalues || []).map(x => [x.value_type, +x.value]));
      if (v.P2 == null && v.P1 == null) continue;
      const lat = +r.location?.latitude, lon = +r.location?.longitude;
      const prev = byLoc.get(r.location?.id);
      if (prev && prev.ts >= r.timestamp) continue;
      byLoc.set(r.location?.id, {
        source: 'Sensor.Community', id: String(r.sensor?.id ?? ''), name: `senzor #${r.sensor?.id}`, owner: '',
        lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4,
        distKm: Math.round(km(CONFIG.lat, CONFIG.lon, lat, lon) * 10) / 10,
        pm25: num(v.P2), pm25raw: num(v.P2), pm10: num(v.P1), pm1: num(v.P0), temp: null, rh: null,
        ts: r.timestamp ? r.timestamp.replace(' ', 'T') + 'Z' : null,
        url: `https://maps.sensor.community/#13/${lat}/${lon}`,
      });
    }
    diag.push(`Sensor.Community: ${list.length} záznamov, ${byLoc.size} miest s PM`);
    items.push(...byLoc.values());
  } catch (e) { diag.push(`Sensor.Community: ${e.message.slice(0, 120)}`); }

  items.sort((a, b) => a.distKm - b.distKm);
  console.log('  airsensor:', diag.join(' | '));
  console.log('  airsensor najbližšie:', items.slice(0, 8).map(i => `${i.source} „${i.name}" ${i.distKm} km PM2.5 ${i.pm25} @${i.ts}`).join(' ; ') || 'žiadne');
  return writeResult('airsensor', { items: items.slice(0, 12), radiusKm: RADIUS_KM, _diag: diag });
}
