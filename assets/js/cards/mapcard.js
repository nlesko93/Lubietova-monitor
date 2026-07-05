// Živá mapa (Leaflet + OSM). Ostatné karty do nej kreslia vrstvy
// cez setPlanes()/setQuakes().
import { getConfig, setStatus, el, escapeHtml } from '../util.js';

let map, planeLayer, quakeLayer;

export async function initMap() {
  const cfg = await getConfig();
  map = L.map('map', { scrollWheelZoom: false }).setView([cfg.lat, cfg.lon], 11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const home = L.circleMarker([cfg.lat, cfg.lon], {
    radius: 8, color: 'var(--surface-1)', weight: 2,
    fillColor: '#3987e5', fillOpacity: 1,
  }).addTo(map);
  home.bindPopup(`<b>${escapeHtml(cfg.obec)}</b><br>${cfg.lat.toFixed(4)}, ${cfg.lon.toFixed(4)}`);

  planeLayer = L.layerGroup().addTo(map);
  quakeLayer = L.layerGroup().addTo(map);

  const legend = document.getElementById('map-legend');
  legend.append(
    legendKey('#3987e5', 'obec'),
    legendKey('#c98500', 'lietadlo'),
    legendKey('#e66767', 'zemetrasenie'),
  );
  setStatus('map', 'OpenStreetMap');
}

function legendKey(color, label) {
  return el('span', { class: 'key' }, [
    el('span', { class: 'key-dot', style: `background:${color}` }),
    label,
  ]);
}

function planeIcon(track = 0) {
  return L.divIcon({
    className: 'plane-icon',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<svg width="26" height="26" viewBox="-13 -13 26 26" style="transform: rotate(${Math.round(track)}deg)">
      <path d="M0,-10 L2,-4 L9,1 L9,3 L2,1 L2,6 L5,9 L5,10 L0,8.4 L-5,10 L-5,9 L-2,6 L-2,1 L-9,3 L-9,1 L-2,-4 Z"
        fill="#c98500" stroke="var(--surface-1)" stroke-width="1"/></svg>`,
  });
}

export function setPlanes(planes) {
  if (!planeLayer) return;
  planeLayer.clearLayers();
  for (const p of planes) {
    if (p.lat == null || p.lon == null) continue;
    const m = L.marker([p.lat, p.lon], { icon: planeIcon(p.track) });
    m.bindPopup(
      `<b>${escapeHtml(p.callsign || p.hex)}</b><br>` +
      `${escapeHtml(p.type || 'neznámy typ')}<br>` +
      `výška ${p.altM != null ? Math.round(p.altM) + ' m' : '—'} · ` +
      `rýchlosť ${p.speedKmh != null ? Math.round(p.speedKmh) + ' km/h' : '—'}`
    );
    planeLayer.addLayer(m);
  }
}

export function setQuakes(quakes) {
  if (!quakeLayer) return;
  quakeLayer.clearLayers();
  for (const q of quakes) {
    const m = L.circleMarker([q.lat, q.lon], {
      radius: 4 + q.mag * 2.2,
      color: 'var(--surface-1)', weight: 1,
      fillColor: '#e66767', fillOpacity: 0.75,
    });
    m.bindPopup(`<b>M ${q.mag.toFixed(1)}</b> ${escapeHtml(q.place)}<br>${new Date(q.time).toLocaleString('sk-SK')}`);
    quakeLayer.addLayer(m);
  }
}
