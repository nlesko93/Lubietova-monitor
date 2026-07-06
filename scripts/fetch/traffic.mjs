// Doprava BB ↔ Ľubietová — čas cesty + (best-effort) udalosti na ceste.
//
// Poznámka k realite: Waze verejné rozhrania (live-map/api/georss, routing)
// blokujú serverové IP GitHub Actions (403 / 410 Gone), takže odtiaľ live
// incidenty a čas-s-premávkou spoľahlivo nedostaneme. Preto:
//   - čas cesty berieme z OSRM (funguje z Actions) = voľná premávka,
//   - o Waze georss sa pokúsime „best-effort" (ak niekedy prejde, super),
//   - pre živé incidenty a čas podľa premávky dáme používateľovi odkazy
//     na živé mapy (Waze / Google Maps s premávkou) — tie počíta prehliadač
//     používateľa, nie serverová IP.
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
    headers: { 'user-agent': UA, accept: 'application/json', ...opts.headers },
  });
  const type = res.headers.get('content-type') || '';
  const body = await res.text();
  return { ok: res.ok, status: res.status, type, body };
}

export async function fetchTraffic() {
  const out = { events: [], route: null, links: liveLinks() };

  // čas cesty (voľná premávka) — OSRM, funguje z Actions
  if (T.from && T.to) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${T.from.lon},${T.from.lat};${T.to.lon},${T.to.lat}?overview=false`;
      const r = await wget(url);
      console.log(`  traffic osrm: ${r.status} -> ${r.body.slice(0, 150).replace(/\s+/g, ' ')}`);
      if (r.ok && /json/.test(r.type)) {
        const d = JSON.parse(r.body);
        const sec = d.routes?.[0]?.duration;
        if (sec) out.route = {
          minutes: Math.round(sec / 60),
          lengthKm: Math.round((d.routes[0].distance || 0) / 100) / 10,
          source: 'OSRM (voľná premávka)',
          liveTraffic: false,
        };
      }
    } catch (e) {
      console.log(`  traffic osrm: ${e.message.slice(0, 120)}`);
    }
  }

  // best-effort: Waze udalosti v koridore (z Actions zvyčajne 403/blokované)
  const b = T.bbox || {};
  if (b.top != null) {
    const geoUrl = `https://www.waze.com/live-map/api/georss?top=${b.top}&bottom=${b.bottom}&left=${b.left}&right=${b.right}&env=row&types=alerts,traffic`;
    try {
      const r = await wget(geoUrl, { headers: { referer: 'https://www.waze.com/' } });
      console.log(`  traffic georss: ${r.status} ${r.type} -> ${r.body.slice(0, 160).replace(/\s+/g, ' ')}`);
      if (r.ok && /json/.test(r.type)) {
        const d = JSON.parse(r.body);
        out.events = parseAlerts(d);
        console.log(`  traffic: ${out.events.length} udalostí (${(d.alerts || []).length} alerts, ${(d.jams || []).length} jams)`);
      }
    } catch (e) {
      console.log(`  traffic georss: ${e.message.slice(0, 120)}`);
    }
  }

  return writeResult('traffic', out);
}

function liveLinks() {
  const f = T.from, t = T.to;
  if (!f || !t) return [];
  return [
    {
      label: 'Živá premávka a čas cesty (Google Maps)',
      url: `https://www.google.com/maps/dir/?api=1&origin=${f.lat},${f.lon}&destination=${t.lat},${t.lon}&travelmode=driving`,
    },
    {
      label: 'Udalosti na ceste naživo (Waze)',
      url: `https://www.waze.com/live-map/directions?to=ll.${t.lat}%2C${t.lon}&from=ll.${f.lat}%2C${f.lon}`,
    },
  ];
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
