// Zemetrasenia v okolí — USGS FDSN API (live, CORS OK).
import { getConfig, fetchJSON, setStatus, showError, every, el, timeAgo } from '../util.js';
import { setQuakes } from './mapcard.js';

export async function initQuakes() {
  const cfg = await getConfig();
  const body = document.getElementById('quakes-body');
  const q = cfg.quakes || {};
  const days = q.days ?? 30;
  const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson' +
    `&latitude=${cfg.lat}&longitude=${cfg.lon}` +
    `&maxradiuskm=${q.radiusKm ?? 150}&minmagnitude=${q.minMagnitude ?? 1.5}` +
    `&starttime=${new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10)}` +
    '&orderby=time';

  every(30 * 60 * 1000, async () => {
    try {
      const d = await fetchJSON(url);
      const quakes = (d.features || []).map(f => ({
        mag: f.properties.mag ?? 0,
        place: f.properties.place || '',
        time: f.properties.time,
        url: f.properties.url,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        depthKm: f.geometry.coordinates[2],
      }));
      render(body, quakes, days);
      setQuakes(quakes);
      setStatus('quakes', `USGS · posledných ${days} dní`, 'live');
    } catch (e) {
      showError(body, 'quakes', e);
    }
  });
}

function render(body, quakes, days) {
  body.innerHTML = '';
  if (!quakes.length) {
    body.appendChild(el('p', { class: 'empty-note', text: `Za posledných ${days} dní nezaznamenané žiadne zemetrasenie v okruhu 150 km. (Dobrá správa.)` }));
    return;
  }
  const list = el('ul', { class: 'item-list' });
  for (const q of quakes.slice(0, 6)) {
    list.appendChild(el('li', {}, [
      el('span', { class: 'item-value', text: `M ${q.mag.toFixed(1)}` }),
      el('a', { class: 'item-title', href: q.url, target: '_blank', rel: 'noopener', text: q.place }),
      el('span', { class: 'item-meta', text: `${timeAgo(new Date(q.time).toISOString())} · hĺbka ${Math.round(q.depthKm)} km · na mape` }),
    ]));
  }
  body.appendChild(list);
}
