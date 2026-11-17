// Merané ovzdušie — verejné senzory v okolí obce.
//   1) AirGradient (verejné lokality, bez tokenu)
//   2) Sensor.Community (záloha — komunitné senzory v okruhu)
// Model CAMS (Open-Meteo) má mriežku ~10 km a lokálny dym z kúrenia
// v doline nezachytí, preto má meranie priamo v obci prednosť.
import { writeResult, CONFIG } from './lib.mjs';

const AG_WORLD = 'https://api.airgradient.com/public/api/v1/world/locations/measures/current';
const RADIUS_KM = CONFIG.airSensor?.radiusKm ?? 25;
const PIN_ID = CONFIG.airSensor?.id ? String(CONFIG.airSensor.id) : null;
const UA = 'LubietovaMonitor/1.0 (+https://github.com/nlesko93/lubietova-monitor)';

function km(lat1, lon1, lat2, lon2) {
  const R = 6371, t = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * t / 2) ** 2 +
    Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin((lon2 - lon1) * t / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const num = v => (v == null || v === '' || !isFinite(+v) ? null : Math.round(+v * 10) / 10);

// Naposledy nasadené data/airsensor.json (kvôli skladaniu histórie).
async function deployed() {
  const site = (CONFIG.siteUrl || '').replace(/\/$/, '');
  if (!site) return null;
  try {
    const res = await fetch(`${site}/data/airsensor.json?t=${Date.now()}`, { signal: AbortSignal.timeout(10000) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

// Záznam AirGradient → jednotný tvar položky.
function agItem(r, own) {
  const lat = +(r.latitude ?? r.lat), lon = +(r.longitude ?? r.lng ?? r.lon);
  const hasPos = isFinite(lat) && isFinite(lon) && (lat !== 0 || lon !== 0);
  return {
    source: 'AirGradient', own,
    id: String(r.locationId ?? r.id ?? ''),
    name: r.publicLocationName || r.locationName || r.publicPlaceName || r.name || `senzor ${r.locationId ?? ''}`,
    owner: r.publicContributorName || '',
    lat: hasPos ? Math.round(lat * 1e4) / 1e4 : null, lon: hasPos ? Math.round(lon * 1e4) / 1e4 : null,
    // vlastný senzor bez zverejnenej polohy berieme ako senzor v obci
    distKm: hasPos ? Math.round(km(CONFIG.lat, CONFIG.lon, lat, lon) * 10) / 10 : (own ? 0 : null),
    pm25: num(r.pm02_corrected ?? r.pm02Compensated ?? r.pm02),
    pm25raw: num(r.pm02),
    pm10: num(r.pm10_corrected ?? r.pm10), pm1: num(r.pm01_corrected ?? r.pm01),
    temp: num(r.atmp_corrected ?? r.atmpCompensated ?? r.atmp),
    rh: num(r.rhum_corrected ?? r.rhumCompensated ?? r.rhum),
    ts: r.timestamp || r.date || null,
    url: 'https://www.airgradient.com/map/',
  };
}

export async function fetchAirSensor() {
  const diag = [];
  const items = [];

  // Vlastný senzor cez API token (GitHub secret AIRGRADIENT_TOKEN) — pre
  // senzory, ktoré nie sú zdieľané verejne. Token sa nikdy nevypisuje.
  const token = process.env.AIRGRADIENT_TOKEN;
  if (token) {
    try {
      const res = await fetch(`https://api.airgradient.com/public/api/v1/locations/measures/current?token=${encodeURIComponent(token)}`, {
        signal: AbortSignal.timeout(30000), headers: { 'user-agent': UA, accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const mine = await res.json();
      const list = Array.isArray(mine) ? mine : [mine];
      diag.push(`AirGradient (token): ${list.length} vlastných lokalít · id ${list.map(r => r.locationId).join(',')} · polia ${Object.keys(list[0] || {}).join(',').slice(0, 300)}`);
      items.push(...list.map(r => agItem(r, true)).filter(i => i.distKm != null && i.distKm <= RADIUS_KM));
    } catch (e) { diag.push(`AirGradient (token): ${String(e.message).replace(token, '***').slice(0, 80)}`); }
  }

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
      // senzor pripnutý v config.json (airSensor.id) berieme vždy, aj keby
      // nemal zverejnenú polohu
      const pinned = PIN_ID && String(r.locationId) === PIN_ID;
      const it = agItem(r, pinned);
      if (it.distKm == null || it.distKm > RADIUS_KM) continue;
      if (items.some(x => x.id === it.id)) continue;   // už ho máme cez token
      items.push(it);
    }
  } catch (e) { diag.push(`AirGradient: ${e.message.slice(0, 160)}`); }

  if (PIN_ID && !items.some(i => i.id === PIN_ID)) diag.push(`pripnutý senzor ${PIN_ID}: vo verejnom zozname AirGradient nie je`);

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

  items.sort((a, b) => Number(!!b.own) - Number(!!a.own) || a.distKm - b.distKm);

  // --- história hlavného senzora (pripnutý / vlastný, inak najbližší v obci) ---
  // Verejné API AirGradient históriu neposkytuje, preto si ju skladáme sami:
  // každý beh pridá aktuálne meranie k histórii z naposledy nasadenej stránky
  // (uchováva sa 7 dní). S tokenom sa navyše doplní hodinová história z API.
  const main = items.find(i => i.own) || items.find(i => i.distKm <= (CONFIG.airSensor?.maxKm ?? 3)) || null;
  let history = [];
  if (main) {
    const prev = await deployed();
    if (prev?.historyId === main.id) history = prev.history || [];
    if (token && main.source === 'AirGradient') {
      // /measures/past?from&to (formát 20261117T093400Z) — merania po ~5 min
      // vrátane korigovaných hodnôt; overené v Actions behu č. 1251
      try {
        const z = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
        const from = z(new Date(Date.now() - 72 * 3600e3)), to = z(new Date());
        const res = await fetch(`https://api.airgradient.com/public/api/v1/locations/${main.id}/measures/past?from=${from}&to=${to}&token=${encodeURIComponent(token)}`, {
          signal: AbortSignal.timeout(60000), headers: { 'user-agent': UA, accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();
        diag.push(`história z API: ${rows.length} meraní od ${rows.at(-1)?.timestamp || rows[0]?.timestamp || '?'}`);
        history.push(...rows.map(r => ({
          t: r.timestamp || r.date,
          pm25: num(r.pm02_corrected ?? r.pm02), pm25raw: num(r.pm02),
          pm10: num(r.pm10_corrected ?? r.pm10), temp: num(r.atmp_corrected ?? r.atmp),
        })));
      } catch (e) { diag.push(`história z API: ${String(e.message).replace(token, '***').slice(0, 80)}`); }
    }
    if (main.ts && main.pm25 != null) history.push({ t: main.ts, pm25: main.pm25, pm25raw: main.pm25raw, pm10: main.pm10, temp: main.temp });
    const cutoff = Date.now() - 7 * 86400e3;
    // priemer v 30-minútových oknách (menší súbor, plynulejší graf)
    const SLOT = 30 * 60e3;
    const bins = new Map();
    for (const h of history) {
      const ms = new Date(h.t).getTime();
      if (!isFinite(ms) || ms < cutoff || h.pm25 == null) continue;
      const k = Math.floor(ms / SLOT);
      const b = bins.get(k) || { n: 0, pm25: 0, pm25raw: 0, nr: 0, pm10: 0, n10: 0, temp: 0, nt: 0 };
      b.n++; b.pm25 += h.pm25;
      if (h.pm25raw != null) { b.nr++; b.pm25raw += h.pm25raw; }
      if (h.pm10 != null) { b.n10++; b.pm10 += h.pm10; }
      if (h.temp != null) { b.nt++; b.temp += h.temp; }
      bins.set(k, b);
    }
    history = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([k, b]) => ({
      t: new Date(k * SLOT + SLOT / 2).toISOString(),
      pm25: num(b.pm25 / b.n), pm25raw: b.nr ? num(b.pm25raw / b.nr) : null,
      pm10: b.n10 ? num(b.pm10 / b.n10) : null, temp: b.nt ? num(b.temp / b.nt) : null,
    }));
    diag.push(`história: ${history.length} bodov pre senzor ${main.id}`);
  }
  console.log('  airsensor:', diag.join(' | '));
  console.log('  airsensor najbližšie:', items.slice(0, 8).map(i => `${i.source} „${i.name}" ${i.distKm} km PM2.5 ${i.pm25} @${i.ts}`).join(' ; ') || 'žiadne');
  return writeResult('airsensor', { items: items.slice(0, 12), radiusKm: RADIUS_KM, historyId: main?.id || null, history, _diag: diag });
}
