// Lietadlá nad obcou — adsb.lol (fallback airplanes.live), refresh ~45 s.
import { getConfig, fetchJSON, setStatus, showError, every, el, fmtTime, haversineKm, compass } from '../util.js';
import { setPlanes } from './mapcard.js';

const FT_TO_M = 0.3048, KT_TO_KMH = 1.852;

export async function initPlanes() {
  const cfg = await getConfig();
  const body = document.getElementById('planes-body');
  const r = cfg.planes?.radiusNm ?? 25;
  const sources = [
    { name: 'adsb.lol', url: `https://api.adsb.lol/v2/point/${cfg.lat}/${cfg.lon}/${r}` },
    { name: 'airplanes.live', url: `https://api.airplanes.live/v2/point/${cfg.lat}/${cfg.lon}/${r}` },
  ];

  every((cfg.planes?.refreshSeconds ?? 45) * 1000, async () => {
    let lastErr;
    for (const src of sources) {
      try {
        const d = await fetchJSON(src.url, { timeoutMs: 9000 });
        const planes = normalize(d.ac || d.aircraft || [], cfg);
        render(body, planes, r);
        setPlanes(planes);
        setStatus('planes', `${src.name} · ${fmtTime(new Date())}`, 'live');
        return;
      } catch (e) { lastErr = e; }
    }
    showError(body, 'planes', lastErr);
  });
}

function normalize(list, cfg) {
  return list.map(a => {
    const altFt = a.alt_baro === 'ground' ? 0 : (a.alt_baro ?? a.alt_geom);
    return {
      hex: a.hex,
      callsign: (a.flight || '').trim(),
      type: a.t || a.desc || '',
      reg: a.r || '',
      lat: a.lat, lon: a.lon,
      track: a.track ?? a.true_heading ?? 0,
      altM: altFt != null ? altFt * FT_TO_M : null,
      speedKmh: a.gs != null ? a.gs * KT_TO_KMH : null,
      distKm: a.lat != null ? haversineKm(cfg.lat, cfg.lon, a.lat, a.lon) : null,
      bearing: a.lat != null ? bearing(cfg.lat, cfg.lon, a.lat, a.lon) : null,
    };
  }).filter(p => p.lat != null)
    .sort((x, y) => (x.distKm ?? 1e9) - (y.distKm ?? 1e9));
}

function render(body, planes, radiusNm) {
  body.innerHTML = '';
  const radiusKm = Math.round(radiusNm * 1.852);
  if (!planes.length) {
    body.appendChild(el('p', { class: 'empty-note', text: `Momentálne žiadne lietadlo v okruhu ${radiusKm} km (podľa ADS-B prijímačov v regióne).` }));
    return;
  }
  body.appendChild(el('div', { class: 'hero-row' }, [
    el('span', { class: 'hero-figure', text: String(planes.length) }),
    el('span', { class: 'hero-side', text: `lietadiel v okruhu ${radiusKm} km — všetky sú na mape` }),
  ]));
  const list = el('ul', { class: 'item-list' });
  for (const p of planes.slice(0, 8)) {
    const fr24 = p.callsign ? `https://www.flightradar24.com/${encodeURIComponent(p.callsign)}` : null;
    const title = p.callsign || p.reg || p.hex;
    list.appendChild(el('li', {}, [
      el('span', { class: 'item-value', text: p.distKm != null ? `${p.distKm.toFixed(0)} km ${compass(p.bearing)}` : '' }),
      fr24
        ? el('a', { class: 'item-title', href: fr24, target: '_blank', rel: 'noopener', text: title })
        : el('span', { class: 'item-title', text: title }),
      el('span', { class: 'item-meta', text:
        `${p.type || 'typ neznámy'} · ${p.altM != null ? Math.round(p.altM).toLocaleString('sk-SK') + ' m' : 'výška —'} · ` +
        `${p.speedKmh != null ? Math.round(p.speedKmh) + ' km/h' : 'rýchlosť —'}` }),
    ]));
  }
  body.appendChild(list);
}

// Orientačný smer od obce k lietadlu (pre zoznam).
function bearing(lat1, lon1, lat2, lon2) {
  const toR = Math.PI / 180;
  const dLon = (lon2 - lon1) * toR;
  const y = Math.sin(dLon) * Math.cos(lat2 * toR);
  const x = Math.cos(lat1 * toR) * Math.sin(lat2 * toR) -
    Math.sin(lat1 * toR) * Math.cos(lat2 * toR) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
