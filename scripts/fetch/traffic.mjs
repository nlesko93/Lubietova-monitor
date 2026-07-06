// Doprava BB ↔ Ľubietová — udalosti na ceste (Waze live-map) + čas cesty.
// Waze má neoficiálne, ale bežne používané verejné rozhrania:
//   - live-map/api/georss: alerts (nehody, polícia, prekážky) a zápchy v bboxe
//   - row-RoutingManager: čas cesty s premávkou aj bez nej
// Fallback na OSRM (voľná premávka) keď Waze zlyhá.
import { writeResult, CONFIG } from './lib.mjs';

const T = CONFIG.traffic || {};
const UA = 'Mozilla/5.0 (LubietovaMonitor; +https://github.com/nlesko93/lubietova-monitor)';

const ALERT_SK = {
  ACCIDENT: ['Nehoda', '⚠️'], HAZARD: ['Prekážka na ceste', '🚧'], JAM: ['Zápcha', '🚗'],
  ROAD_CLOSED: ['Uzávierka', '⛔'], POLICE: ['Polícia', '👮'], CONSTRUCTION: ['Práce na ceste', '🚧'],
  WEATHERHAZARD: ['Nebezpečenstvo (počasie)', '🌧️'],
};

async function wget(url, opts = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { 'user-agent': UA, referer: 'https://www.waze.com/', accept: 'application/json', ...opts.headers },
  });
  const type = res.headers.get('content-type') || '';
  const body = await res.text();
  return { ok: res.ok, status: res.status, type, body };
}

export async function fetchTraffic() {
  const out = { events: [], route: null };

  // 1) udalosti + zápchy v koridore
  const b = T.bbox || {};
  const geoUrl = `https://www.waze.com/live-map/api/georss?top=${b.top}&bottom=${b.bottom}&left=${b.left}&right=${b.right}&env=row&types=alerts,traffic`;
  try {
    const r = await wget(geoUrl);
    console.log(`  traffic georss: ${r.status} ${r.type} -> ${r.body.slice(0, 200).replace(/\s+/g, ' ')}`);
    if (r.ok && /json/.test(r.type)) {
      const d = JSON.parse(r.body);
      out.events = parseAlerts(d);
      console.log(`  traffic: ${out.events.length} udalostí (${(d.alerts || []).length} alerts, ${(d.jams || []).length} jams)`);
    }
  } catch (e) {
    console.log(`  traffic georss: ${e.message.slice(0, 120)}`);
  }

  // 2) čas cesty s premávkou (Waze routing)
  if (T.from && T.to) {
    const f = `x:${T.from.lon}+y:${T.from.lat}`;
    const t = `x:${T.to.lon}+y:${T.to.lat}`;
    const routeUrl = `https://www.waze.com/row-RoutingManager/routingRequest?from=${f}&to=${t}&at=0&returnJSON=true&returnGeometries=false&returnInstructions=false&timeout=60000&nPaths=1&options=AVOID_TRAILS:t`;
    try {
      const r = await wget(routeUrl);
      console.log(`  traffic route: ${r.status} ${r.type} -> ${r.body.slice(0, 300).replace(/\s+/g, ' ')}`);
      if (r.ok && /json/.test(r.type)) out.route = parseRoute(JSON.parse(r.body));
    } catch (e) {
      console.log(`  traffic route: ${e.message.slice(0, 120)}`);
    }
  }

  // 3) fallback voľná premávka (OSRM)
  if (!out.route && T.from && T.to) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${T.from.lon},${T.from.lat};${T.to.lon},${T.to.lat}?overview=false`;
      const r = await wget(url, { headers: { referer: '' } });
      console.log(`  traffic osrm: ${r.status} -> ${r.body.slice(0, 150)}`);
      if (r.ok && /json/.test(r.type)) {
        const d = JSON.parse(r.body);
        const sec = d.routes?.[0]?.duration;
        if (sec) out.route = { minutes: Math.round(sec / 60), freeMinutes: Math.round(sec / 60), source: 'OSRM (voľná premávka)', lengthKm: Math.round((d.routes[0].distance || 0) / 100) / 10 };
      }
    } catch (e) {
      console.log(`  traffic osrm: ${e.message.slice(0, 120)}`);
    }
  }

  return writeResult('traffic', out);
}

function inCorridor(x, y) {
  const b = T.bbox || {};
  return y <= b.top && y >= b.bottom && x >= b.left && x <= b.right;
}

function parseAlerts(d) {
  const events = [];
  for (const a of d.alerts || []) {
    const loc = a.location || {};
    if (loc.x != null && !inCorridor(loc.x, loc.y)) continue;
    const [label, icon] = ALERT_SK[a.type] || [a.type, '⚠️'];
    events.push({
      kind: 'alert', label, icon,
      subtype: (a.subtype || '').replace(/_/g, ' ').toLowerCase(),
      street: a.street || a.city || '',
      lat: loc.y, lon: loc.x,
      reliability: a.reliability, ts: a.pubMillis ? new Date(a.pubMillis).toISOString() : null,
    });
  }
  for (const j of d.jams || []) {
    const pt = (j.line || [])[0] || {};
    if (pt.x != null && !inCorridor(pt.x, pt.y)) continue;
    events.push({
      kind: 'jam', label: 'Zápcha', icon: '🚗',
      street: j.street || '', delaySec: j.delay, lengthM: j.length,
      speedKmh: j.speedKMH != null ? Math.round(j.speedKMH) : null,
      lat: pt.y, lon: pt.x,
    });
  }
  return events.slice(0, 12);
}

function parseRoute(d) {
  // Waze vracia results[] alebo alternatives[].response.results[]
  const resp = d.response || d.alternatives?.[0]?.response || d;
  const results = resp.results || resp.result || [];
  if (!results.length) return null;
  let cross = 0, crossNoTraffic = 0, length = 0;
  for (const s of results) {
    cross += s.crossTime ?? s.crossTimeWithRealTime ?? 0;
    crossNoTraffic += s.crossTimeWithoutRealTime ?? s.crossTime ?? 0;
    length += s.length ?? 0;
  }
  if (!cross) return null;
  return {
    minutes: Math.round(cross / 60),
    freeMinutes: Math.round(crossNoTraffic / 60),
    lengthKm: Math.round(length / 100) / 10,
    source: 'Waze',
  };
}
