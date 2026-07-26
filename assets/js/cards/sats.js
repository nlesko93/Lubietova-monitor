// Satelity nad obzorom — TLE z data/tle.json (Actions, CelesTrak),
// polohy počíta satellite.js priamo v prehliadači každých 10 s.
import { getConfig, loadData, setStatus, showError, every, el, updatedLabel } from '../util.js';
import { setSatPoints } from './sky.js';

const DEG = 180 / Math.PI;

let sats = [];       // { name, satrec }
let observerGd = null;
let tleUpdated = null;

export async function initSats() {
  const cfg = await getConfig();
  const body = document.getElementById('sats-body');
  observerGd = {
    latitude: cfg.lat / DEG,
    longitude: cfg.lon / DEG,
    height: (cfg.elevationM || 0) / 1000,
  };

  try {
    const d = await loadData('tle');
    tleUpdated = d.updated;
    sats = (d.items || []).map(t => {
      try {
        return {
          name: t.name, norad: t.norad, type: satType(t.name, t.group),
          satrec: satellite.twoline2satrec(t.l1, t.l2),
        };
      } catch { return null; }
    }).filter(Boolean);
  } catch (e) {
    showError(body, 'sats', e, 'Dráhové dáta (TLE) sa ešte nestiahli — počkajte na prvý beh aktualizácie.');
    return;
  }

  every(10 * 1000, () => {
    const { above, visibleCount } = compute();
    render(body, above);
    setSatPoints(above.filter(s => s.el > 0).map(s => ({
      name: s.name, az: s.az, el: s.el,
      color: s.visible ? 'var(--series-2)' : 'var(--text-muted)',
      kind: s.visible ? 'satelit — viditeľný voľným okom' : 'satelit (neosvetlený alebo denná obloha)',
      extra: `${s.type} · výška dráhy ${Math.round(s.heightKm)} km`,
      label: s.name.includes('ISS') || s.visible,
    })));
    setStatus('sats', `${sats.length} sledovaných · ${updatedLabel(tleUpdated)}`, visibleCount ? 'live' : '');
  });
}

function compute() {
  const now = new Date();
  const gmst = satellite.gstime(now);
  const sunH = horizSun(now);
  const darkEnough = sunH < -6; // aspoň občiansky súmrak
  const above = [];
  let visibleCount = 0;

  for (const s of sats) {
    let pv;
    try { pv = satellite.propagate(s.satrec, now); } catch { continue; }
    if (!pv?.position) continue;
    const ecf = satellite.eciToEcf(pv.position, gmst);
    const look = satellite.ecfToLookAngles(observerGd, ecf);
    const elDeg = look.elevation * DEG;
    if (elDeg < 5) continue;
    const gd = satellite.eciToGeodetic(pv.position, gmst);
    const sunlit = isSunlit(pv.position, now);
    const visible = darkEnough && sunlit;
    if (visible) visibleCount++;
    above.push({
      name: s.name, norad: s.norad, type: s.type,
      az: look.azimuth * DEG,
      el: elDeg,
      rangeKm: look.rangeSat,
      heightKm: gd.height,
      sunlit, visible,
    });
  }
  above.sort((a, b) => b.el - a.el);
  return { above, visibleCount };
}

// Výška Slnka nad obzorom (jednoduchý výpočet cez astronomy-engine).
let obs = null;
function horizSun(now) {
  if (!obs) obs = new Astronomy.Observer(observerGd.latitude * DEG, observerGd.longitude * DEG, observerGd.height * 1000);
  const eq = Astronomy.Equator(Astronomy.Body.Sun, now, obs, true, true);
  return Astronomy.Horizon(now, obs, eq.ra, eq.dec, 'normal').altitude;
}

// Je satelit osvetlený Slnkom? (test valcového tieňa Zeme)
function isSunlit(posEci, now) {
  const sunEqd = Astronomy.Equator(Astronomy.Body.Sun, now, obs, true, false);
  const auKm = 149597870.7;
  const sun = {
    x: sunEqd.vec.x * auKm,
    y: sunEqd.vec.y * auKm,
    z: sunEqd.vec.z * auKm,
  };
  const dot = posEci.x * sun.x + posEci.y * sun.y + posEci.z * sun.z;
  const sunMag = Math.hypot(sun.x, sun.y, sun.z);
  const along = dot / sunMag;
  if (along > 0) return true; // na slnečnej strane
  const posMag2 = posEci.x ** 2 + posEci.y ** 2 + posEci.z ** 2;
  const perp = Math.sqrt(Math.max(0, posMag2 - along * along));
  return perp > 6371; // mimo tieňového valca Zeme
}

function render(body, above) {
  body.innerHTML = '';
  if (!above.length) {
    body.appendChild(el('p', { class: 'empty-note', text: 'Žiadny zo sledovaných jasných satelitov nie je teraz aspoň 5° nad obzorom.' }));
    return;
  }
  const visible = above.filter(s => s.visible);
  body.appendChild(el('div', { class: 'hero-row' }, [
    el('span', { class: 'hero-figure', text: String(above.length) }),
    el('span', { class: 'hero-side', html:
      `nad obzorom (z ~${sats.length} najjasnejších)<br>` +
      (visible.length
        ? `<b>${visible.length}</b> teraz viditeľných voľným okom`
        : 'žiadny momentálne nie je viditeľný voľným okom') }),
  ]));
  const list = el('ul', { class: 'item-list' });
  for (const s of above.slice(0, 7)) {
    const title = s.norad
      ? el('a', { class: 'item-title', href: `https://www.n2yo.com/satellite/?s=${s.norad}`,
          target: '_blank', rel: 'noopener', title: 'Detaily satelitu (N2YO)', text: s.name })
      : el('span', { class: 'item-title', text: s.name });
    list.appendChild(el('li', {}, [
      el('span', { class: 'item-value', text: `${Math.round(s.el)}°` }),
      title,
      el('span', { class: 'item-meta', text:
        `${s.visible ? '👁 viditeľný · ' : ''}${s.type} · azimut ${Math.round(s.az)}° · ${Math.round(s.rangeKm)} km · dráha ${Math.round(s.heightKm)} km` }),
    ]));
  }
  body.appendChild(list);
  body.appendChild(el('p', { class: 'chart-caption', text: 'Klik na názov otvorí detaily satelitu (N2YO). Polohy sa prepočítavajú každých 10 s zo SGP4 elementov; satelity sú aj na polárnom grafe v karte Obloha.' }));
}

// Hrubé zaradenie satelitu podľa názvu/skupiny — „na čo slúži".
function satType(name, group) {
  const n = (name || '').toUpperCase();
  if (/ISS|ZARYA/.test(n)) return 'medzinárodná vesmírna stanica';
  if (/TIANGONG|CSS \(/.test(n)) return 'čínska vesmírna stanica';
  if (/PROGRESS|CREW DRAGON|CARGO|CYGNUS|SOYUZ/.test(n)) return 'zásobovacia/pilotovaná loď';
  if (/STARLINK/.test(n)) return 'internetový satelit (Starlink)';
  if (/ONEWEB/.test(n)) return 'internetový satelit (OneWeb)';
  if (/IRIDIUM|GLOBALSTAR|ORBCOMM/.test(n)) return 'komunikačný satelit';
  if (/NAVSTAR|GPS/.test(n)) return 'navigácia (GPS)';
  if (/GALILEO/.test(n)) return 'navigácia (Galileo)';
  if (/BEIDOU/.test(n)) return 'navigácia (BeiDou)';
  if (/GLONASS/.test(n)) return 'navigácia (GLONASS)';
  if (/NOAA|METEOR|METOP|GOES|FENGYUN|HIMAWARI|ELEKTRO/.test(n)) return 'meteorologický satelit';
  if (/LANDSAT|SENTINEL|TERRA|AQUA|WORLDVIEW|SPOT|PLEIADES|ICEYE|CAPELLA|SUOMI|PROBA/.test(n)) return 'pozorovanie Zeme';
  if (/HUBBLE|HST|TESS|CHEOPS|SPEKTR/.test(n)) return 'vesmírny teleskop';
  if (/R\/B|ROCKET|DEB\b|CZ-|SL-\d|BREEZE|CENTAUR|FALCON|ATLAS|ARIANE|H-2/.test(n)) return 'raketový stupeň / úlomok';
  if (/COSMOS|KOSMOS/.test(n)) return 'ruský satelit (Cosmos)';
  if (/USA \d/.test(n)) return 'vojenský satelit (USA)';
  if (/YAOGAN|SHIYAN/.test(n)) return 'čínsky prieskumný satelit';
  return group === 'stations' ? 'vesmírna stanica / loď' : 'jasný satelit';
}
