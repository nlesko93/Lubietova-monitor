// Karty kreslené z data/*.json, ktoré hodinovo generuje GitHub Actions.
import { loadData, setStatus, showError, el, timeAgo, updatedLabel, escapeHtml, every, fmtTime, haversineKm, getConfig } from '../util.js';
import { barChart, lineChart } from '../charts.js';
import { setBuses, setBusRoute, setTraffic } from './mapcard.js';

async function dataCard(key, bodyId, renderFn, { emptyText = 'Zatiaľ žiadne položky.', handlesEmpty = false } = {}) {
  const body = document.getElementById(bodyId);
  try {
    const d = await loadData(key);
    if (!d.ok) throw new Error(d.error || 'fetcher zlyhal');
    body.innerHTML = '';
    if (!d.items?.length && !handlesEmpty) {
      body.appendChild(el('p', { class: 'empty-note', text: emptyText }));
    } else {
      renderFn(body, d);
    }
    setStatus(key === 'demographics' ? 'demo' : key, updatedLabel(d.updated));
  } catch (e) {
    showError(body, key === 'demographics' ? 'demo' : key, e,
      'Dáta sa ešte nevygenerovali alebo je zdroj nedostupný.');
  }
}

function linkList(items, { metaFn }) {
  const list = el('ul', { class: 'item-list' });
  for (const it of items) {
    list.appendChild(el('li', {}, [
      it.link
        ? el('a', { class: 'item-title', href: it.link, target: '_blank', rel: 'noopener', text: it.title })
        : el('span', { class: 'item-title', text: it.title }),
      el('span', { class: 'item-meta', text: metaFn(it) }),
    ]));
  }
  return list;
}

export function initNews() {
  return dataCard('news', 'news-body', (body, d) => {
    body.appendChild(linkList(d.items.slice(0, 8), {
      metaFn: it => [it.source, it.date ? timeAgo(it.date) : ''].filter(Boolean).join(' · '),
    }));
  }, { emptyText: 'Google News momentálne neeviduje žiadne správy o Ľubietovej.' });
}

export function initObec() {
  return dataCard('obec', 'obec-body', (body, d) => {
    body.appendChild(linkList(d.items.slice(0, 8), {
      metaFn: it => [it.section, it.date].filter(Boolean).join(' · '),
    }));
    body.appendChild(el('p', { class: 'chart-caption', html:
      'Zdroj: <a href="https://www.lubietova.sk/" target="_blank" rel="noopener">lubietova.sk</a>' }));
  });
}

export function initAlerts() {
  return dataCard('alerts', 'alerts-body', (body, d) => {
    const sevColor = {
      Yellow: 'var(--status-warning)', Orange: 'var(--status-serious)', Red: 'var(--status-critical)',
    };
    const sevLabel = { Yellow: '1. stupeň', Orange: '2. stupeň', Red: '3. stupeň' };
    const list = el('ul', { class: 'item-list' });
    for (const a of d.items.slice(0, 6)) {
      list.appendChild(el('li', {}, [
        el('span', { class: 'badge', style: `--badge-color:${sevColor[a.severity] || 'var(--text-muted)'}`,
          text: `${a.event} — ${sevLabel[a.severity] || a.severity}` }),
        el('span', { class: 'item-meta', text: [a.areas, a.onset && `od ${new Date(a.onset).toLocaleString('sk-SK')}`, a.expires && `do ${new Date(a.expires).toLocaleString('sk-SK')}`].filter(Boolean).join(' · ') }),
      ]));
    }
    body.appendChild(list);
  }, { emptyText: 'Žiadne meteorologické výstrahy pre okres Banská Bystrica. ✅' });
}

export function initContracts() {
  return dataCard('contracts', 'contracts-body', (body, d) => {
    body.appendChild(linkList(d.items.slice(0, 7), {
      metaFn: it => [
        it.partner,
        it.value != null ? `${Number(it.value).toLocaleString('sk-SK')} €` : null,
        it.date,
      ].filter(Boolean).join(' · '),
    }));
    body.appendChild(el('p', { class: 'chart-caption', html:
      'Zdroj: <a href="https://www.crz.gov.sk/" target="_blank" rel="noopener">Centrálny register zmlúv</a>' }));
  }, { emptyText: 'V registri sa nenašli žiadne zmluvy obce.' });
}

export function initFinance() {
  return dataCard('finance', 'finance-body', (body, d) => {
    if (d.entity) {
      body.appendChild(el('p', { class: 'chart-caption', text:
        `${d.entity.name} · IČO ${d.entity.ico}${d.entity.pocetZamestnancov ? ' · zamestnancov: ' + d.entity.pocetZamestnancov : ''}` }));
    }
    if (d.series?.length) {
      const box = el('div');
      body.appendChild(box);
      barChart(box, d.series.map(s => ({
        label: String(s.year),
        value: s.value,
        tooltip: `<div class="tt-title">${s.year}</div><div class="tt-row">${escapeHtml(s.label)}: <b>${Number(s.value).toLocaleString('sk-SK')} €</b></div>`,
      })), {});
      body.appendChild(el('p', { class: 'chart-caption', text: d.seriesLabel || '' }));
    }
    if (d.items?.length) {
      body.appendChild(linkList(d.items.slice(0, 5), {
        metaFn: it => [it.type, it.period].filter(Boolean).join(' · '),
      }));
    }
    body.appendChild(el('p', { class: 'chart-caption', html:
      'Zdroj: <a href="https://www.registeruz.sk/" target="_blank" rel="noopener">Register účtovných závierok</a>' }));
  }, { handlesEmpty: true });
}

export function initDemo() {
  return dataCard('demographics', 'demo-body', (body, d) => {
    const latest = d.items.at(-1);
    body.appendChild(el('div', { class: 'hero-row' }, [
      el('span', { class: 'hero-figure', text: Number(latest.population).toLocaleString('sk-SK') }),
      el('span', { class: 'hero-side', text: `obyvateľov (${latest.year})` }),
    ]));
    const box = el('div');
    body.appendChild(box);
    barChart(box, d.items.map(it => ({ label: String(it.year), value: it.population })), { height: 150 });
    body.appendChild(el('p', { class: 'chart-caption', text: 'Počet obyvateľov obce — Štatistický úrad SR' }));

    // ďalšie časové rady (pohyb obyvateľstva a pod.) z DataCube
    const COLORS = ['var(--series-1)', 'var(--series-6)', 'var(--series-2)', 'var(--series-3)'];
    for (const ex of d.extra || []) {
      const names = Object.keys(ex.series)
        .filter(n => !/spolu|celkom|úhrn/i.test(n)).slice(0, 4);
      if (!names.length) continue;
      const series = names.map((n, i) => ({
        name: n, color: COLORS[i % COLORS.length],
        points: ex.series[n].map(p => ({ x: p.year, y: p.value })),
      })).filter(s => s.points.length > 1);
      if (!series.length) continue;
      const chBox = el('div');
      body.appendChild(chBox);
      lineChart(chBox, series, {
        height: 140, fill: series.length === 1,
        xLabel: v => String(Math.round(v)),
      });
      if (series.length > 1) {
        body.appendChild(el('div', { class: 'chart-legend' }, series.map(s =>
          el('span', { class: 'key' }, [
            el('span', { class: 'key-dot', style: `background:${s.color}` }), s.name,
          ]))));
      }
      body.appendChild(el('p', { class: 'chart-caption', text: ex.label || '' }));
    }
  });
}

export function initElections() {
  return dataCard('elections', 'elections-body', (body, d) => {
    getConfig().then(cfg => {
      // načítané voľby (NRSR/prezident/EP) + statické (komunálne v config.json)
      const items = [...(d.items || []), ...(cfg.electionsStatic || [])];
      body.innerHTML = '';
      if (!items.length) {
        body.appendChild(el('p', { class: 'empty-note', text: 'Výsledky volieb sa nepodarilo načítať.' }));
        return;
      }
      const tabs = el('div', { class: 'tab-row', role: 'tablist' });
      const content = el('div');
      body.append(tabs, content);

      const metric = r => r.pct ?? r.votes ?? 0;   // % ak sú, inak hlasy (pre šírku pruhu)
      const show = key => {
        const e = items.find(x => x.key === key);
        tabs.querySelectorAll('.tab-btn').forEach(b =>
          b.setAttribute('aria-pressed', String(b.dataset.key === key)));
        content.innerHTML = '';
        if (!e) return;
        const max = Math.max(...e.rows.map(metric), 1);
        for (const r of e.rows) {
          content.appendChild(el('div', { class: 'hbar-row' }, [
            el('span', { class: 'hbar-name', title: r.name, text: r.name }),
            el('span', { class: 'hbar-val', text: `${r.pct != null ? r.pct.toFixed(1) + ' % · ' : ''}${r.votes.toLocaleString('sk-SK')} hl.` }),
            el('div', { class: 'hbar-track' }, [
              el('div', { class: 'hbar-fill', style: `width:${Math.max(2, (metric(r) / max) * 100)}%` }),
            ]),
          ]));
        }
        content.appendChild(el('p', { class: 'chart-caption', text: e.note ||
          `Platné hlasy v obci spolu: ${(e.totalVotes || 0).toLocaleString('sk-SK')} · zdroj: ŠÚ SR (volby.statistics.sk)` }));
      };

      for (const e of items) {
        const b = el('button', { class: 'tab-btn', 'data-key': e.key, text: e.name });
        b.addEventListener('click', () => show(e.key));
        tabs.appendChild(b);
      }
      show(items[0]?.key);

      const links = cfg.electionsLinks || [];
      if (links.length) {
        const row = el('div', { class: 'link-row' });
        for (const lk of links) {
          row.appendChild(el('a', { class: 'btn-link', href: lk.url, target: '_blank', rel: 'noopener', text: lk.label + ' →' }));
        }
        body.appendChild(row);
      }
    }).catch(e => showError(body, 'elections', e, 'Výsledky volieb sa nepodarilo načítať.'));
  }, { emptyText: 'Výsledky volieb sa zatiaľ nepodarilo načítať zo ŠÚ SR.' });
}

// Druh odpadu podľa kľúčových slov v názve udalosti → emoji + farba badge.
const WASTE_KINDS = [
  [/plast|pet|žlt/i, '🟡', 'var(--series-3)', 'plasty'],
  [/papier|modr/i, '🔵', 'var(--series-1)', 'papier'],
  [/sklo|zelen/i, '🟢', 'var(--series-4)', 'sklo'],
  [/bio|kuchyn|konár|tráv/i, '🟤', '#8f6b4a', 'bioodpad'],
  [/kov|plechov/i, '🔴', 'var(--series-6)', 'kovy'],
  [/elektro|nebezpe/i, '⚠️', 'var(--status-serious)', 'nebezpečný/elektro'],
  [/komun|zmesov|tko|smeti/i, '⚫', 'var(--text-muted)', 'komunálny'],
];
const wasteKind = title => WASTE_KINDS.find(([re]) => re.test(title)) || [null, '🗑️', 'var(--text-secondary)', null];

export function initWaste() {
  return dataCard('waste', 'waste-body', (body, d) => {
    const dayMs = 86400e3;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daysTo = iso => Math.round((new Date(iso + 'T00:00:00') - today) / dayMs);
    const dayLabel = n => n <= 0 ? 'dnes' : n === 1 ? 'zajtra' : `o ${n} dní`;
    const dateFmt = new Intl.DateTimeFormat('sk-SK', { weekday: 'short', day: 'numeric', month: 'numeric' });

    const next = d.items[0];
    const [, emoji, color, kind] = wasteKind(next.title);
    const n = daysTo(next.date);
    body.appendChild(el('div', { class: 'hero-row' }, [
      el('span', { class: 'hero-emoji', text: emoji }),
      el('span', { class: 'hero-figure', text: dayLabel(n) }),
      el('span', { class: 'hero-side' }, [
        el('span', { class: 'badge', style: `--badge-color:${color}`, text: next.title }),
        el('span', { html: `<br>${dateFmt.format(new Date(next.date))}${kind ? ' · ' + kind : ''}` }),
      ]),
    ]));

    const list = el('ul', { class: 'item-list' });
    for (const it of d.items.slice(1, 6)) {
      const [, em, c] = wasteKind(it.title);
      list.appendChild(el('li', {}, [
        el('span', { class: 'item-value', text: dayLabel(daysTo(it.date)) }),
        el('span', { class: 'badge', style: `--badge-color:${c}`, text: `${em} ${it.title}` }),
        el('span', { class: 'item-meta', text: dateFmt.format(new Date(it.date)) }),
      ]));
    }
    if (d.items.length > 1) body.appendChild(list);
    body.appendChild(el('p', { class: 'chart-caption', text: 'Zdroj: verejný kalendár zvozu odpadu obce (Google Calendar)' }));
  }, { emptyText: 'V kalendári nie sú žiadne najbližšie termíny zvozu.' });
}

export function initOutages() {
  return dataCard('outages', 'outages-body', (body, d) => {
    if (!d.items.length) {
      body.appendChild(el('p', { class: 'empty-note', text: 'Na úradnej tabuli obce nie je žiadny oznam o odstávke elektriny. ✅' }));
      body.appendChild(el('p', { class: 'chart-caption', html:
        'Sleduje sa úradná tabuľa obce · odberné miesto si overíte na <a href="https://www.ssd.sk/planovane-odstavky" target="_blank" rel="noopener">ssd.sk</a>' }));
      return;
    }
    const list = el('ul', { class: 'item-list' });
    for (const o of d.items.slice(0, 6)) {
      list.appendChild(el('li', {}, [
        el('a', { class: 'item-title', href: o.link || '#', target: '_blank', rel: 'noopener' }, [
          el('span', { class: 'badge', style: '--badge-color: var(--status-warning)', text: `⚡ ${o.title}` }),
        ]),
        el('span', { class: 'item-meta', text: [o.summary, o.date ? timeAgo(o.date) : null].filter(Boolean).join(' · ') }),
      ]));
    }
    body.appendChild(list);
    body.appendChild(el('p', { class: 'chart-caption', text: 'Oznamy o prerušení distribúcie elektriny z úradnej tabule obce (SSD)' }));
  }, { handlesEmpty: true });
}

const toMin = t => (+t.slice(0, 2)) * 60 + (+t.slice(3, 5));

// Bod na polyline cesty v danej kumulatívnej vzdialenosti (m).
function pointAtDist(geom, cum, target) {
  if (!geom || geom.length < 2 || !cum) return null;
  const last = cum[cum.length - 1];
  if (target <= 0) return geom[0];
  if (target >= last) return geom[geom.length - 1];
  let lo = 0, hi = cum.length - 1;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= target) lo = mid; else hi = mid; }
  const seg = cum[hi] - cum[lo] || 1;
  const f = (target - cum[lo]) / seg;
  return [geom[lo][0] + (geom[hi][0] - geom[lo][0]) * f, geom[lo][1] + (geom[hi][1] - geom[lo][1]) * f];
}

// Odhad polôh autobusov z cestovného poriadku (ak idú načas). Odchody z A
// sa párujú 1:1 s príchodmi do B (FIFO — autobusy sa nepredbiehajú), takže
// jeden spoj = najviac jeden autobus (žiadne duplikáty). Poloha sa počíta
// pozdĺž skutočnej geometrie cesty, nie vzdušnou čiarou.
function busVehicles(lines) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const vehicles = [];
  for (const l of lines) {
    const geom = l.geometry, cum = l.cum;
    for (const dir of l.directions || []) {
      const stops = dir.stops || [];
      for (let i = 0; i < stops.length - 1; i++) {
        const A = stops[i], B = stops[i + 1];
        if (!A.times?.length || !B.times?.length) continue;
        const bTimes = [...B.times].sort();
        let bi = 0;
        for (const ta of [...A.times].sort()) {
          const ma = toMin(ta);
          while (bi < bTimes.length && toMin(bTimes[bi]) <= ma) bi++;
          if (bi >= bTimes.length) break;
          const tb = bTimes[bi]; const mb = toMin(tb); bi++;   // tento príchod patrí práve tomuto spoju
          if (mb - ma > 25) continue;                          // nespárované (short-turn) → preskoč
          if (nowMin < ma || nowMin >= mb) continue;           // polootvorený interval → na zastávke bez zdvojenia
          const f = (nowMin - ma) / (mb - ma);
          let pos = (A.dist != null && B.dist != null)
            ? pointAtDist(geom, cum, A.dist + (B.dist - A.dist) * f) : null;
          if (!pos) pos = [A.lat + (B.lat - A.lat) * f, A.lon + (B.lon - A.lon) * f];
          vehicles.push({
            lat: pos[0], lon: pos[1],
            line: l.line, dir: dir.dir, dirLabel: dir.label, from: A.name, to: B.name, depart: ta, arrive: tb,
          });
        }
      }
    }
  }
  return dedupeVehicles(vehicles);
}

// Poistka: zlúč autobusy rovnakej linky a smeru, ktoré vyšli blízko seba
// (< 300 m) — jeden fyzický spoj sa nikdy nezobrazí dvakrát.
function dedupeVehicles(vehicles) {
  const kept = [];
  for (const v of vehicles) {
    const dup = kept.find(k => k.line === v.line && k.dir === v.dir &&
      haversineKm(k.lat, k.lon, v.lat, v.lon) < 0.3);
    if (!dup) kept.push(v);
  }
  return kept;
}

export function initBuses() {
  const card = document.getElementById('card-buses');
  const body = document.getElementById('buses-body');
  loadData('buses').then(d => {
    const lines = (d.lines || []).filter(l => (l.directions || []).some(x => x.departures?.length));
    if (!lines.length) { card.hidden = true; return; }
    card.hidden = false;

    const routeGeom = lines.find(l => l.geometry?.length > 1)?.geometry;
    if (routeGeom) setBusRoute(routeGeom);

    every(30 * 1000, () => {
      renderBuses(body, lines);
      setBuses(busVehicles(lines));
    });
    setStatus('buses', updatedLabel(d.updated), 'live');
  }).catch(e => showError(body, 'buses', e, 'Cestovný poriadok sa nepodarilo načítať.'));
}

// zobraz najbližšie odchody; ak je po poslednom, zobraz posledné 8 dňa
function chipTimes(departures, nowMin, next) {
  const upcoming = departures.filter(t => toMin(t) >= nowMin);
  return upcoming.length ? upcoming.slice(0, 10) : departures.slice(-8);
}

function renderBuses(body, lines) {
  body.innerHTML = '';
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const l = lines[0];

  for (const dir of l.directions) {
    if (!dir.departures?.length) continue;
    const next = dir.departures.find(t => toMin(t) >= nowMin);
    const mins = next ? toMin(next) - nowMin : null;
    body.appendChild(el('div', { class: 'bus-dir' }, [
      el('div', { class: 'bus-dir-head' }, [
        el('span', { class: 'bus-dir-label', text: `🚌 ${dir.label}` }),
        el('span', { class: 'bus-dir-next', text: next
          ? `${next}${mins != null ? ' · o ' + (mins <= 0 ? 'chvíľu' : mins + ' min') : ''}`
          : 'dnes už žiadny spoj' }),
      ]),
      el('div', { class: 'time-chips' }, chipTimes(dir.departures, nowMin, next)
        .map(t => el('span', { class: `chip${t === next ? ' chip-now' : ''}`, text: t }))),
    ]));
  }
  body.appendChild(el('p', { class: 'chart-caption', html:
    `Zastávka Ľubietová, nám. · trasa ${escapeHtml(l.route || '')}<br>` +
    `Ikony 🚌 na mape sú odhad polohy podľa cestovného poriadku. ` +
    `<a href="${l.pdf}" target="_blank" rel="noopener">Úplný cestovný poriadok (PDF) →</a>` }));
}

export function initTraffic() {
  return dataCard('traffic', 'traffic-body', (body, d) => {
    setTraffic(d.events || []);

    if (d.route) {
      body.appendChild(el('div', { class: 'hero-row' }, [
        el('span', { class: 'hero-figure', text: `${d.route.minutes}` }),
        el('span', { class: 'hero-side', html:
          `min do Banskej Bystrice${d.route.lengthKm ? ' · ' + d.route.lengthKm + ' km' : ''}<br>` +
          `<span class="badge" style="--badge-color:var(--status-good)">${d.route.liveTraffic ? 'podľa premávky' : 'voľná premávka'}</span>` }),
      ]));
    }

    if (d.events?.length) {
      const list = el('ul', { class: 'item-list' });
      for (const e of d.events.slice(0, 6)) {
        list.appendChild(el('li', {}, [
          el('span', { class: 'item-title', text: `${e.icon || '⚠️'} ${e.label}${e.subtype ? ' — ' + e.subtype : ''}` }),
          el('span', { class: 'item-meta', text: [e.street, e.speedKmh != null ? e.speedKmh + ' km/h' : null, e.ts ? timeAgo(e.ts) : null].filter(Boolean).join(' · ') }),
        ]));
      }
      body.appendChild(list);
    }

    // živé odkazy (Waze/Google Maps) — reálny čas počíta prehliadač používateľa
    if (d.links?.length) {
      const links = el('div', { class: 'link-row' });
      for (const lk of d.links) {
        links.appendChild(el('a', { class: 'btn-link', href: lk.url, target: '_blank', rel: 'noopener', text: lk.label + ' →' }));
      }
      body.appendChild(links);
    }

    body.appendChild(el('p', { class: 'chart-caption', text:
      `Čas cesty: ${d.route?.source || 'OSRM'} (voľná premávka). ` +
      'Živé udalosti a čas podľa premávky cez odkazy vyššie — Waze/Google Maps ich rátajú v tvojom prehliadači.' }));
  }, { handlesEmpty: true });
}

export function initHydro() {
  return dataCard('hydro', 'hydro-body', (body, d) => {
    if (d.pending || !d.items?.length) {
      body.appendChild(el('p', { class: 'empty-note', text: 'Vodné stavy zo SHMÚ sa ešte pripravujú.' }));
      return;
    }
    const tiles = el('div', { class: 'tiles', style: 'grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));' });
    for (const s of d.items.slice(0, 4)) {
      tiles.appendChild(el('div', { class: 'tile' }, [
        el('div', { class: 'label', text: `${s.station}${s.river ? ' — ' + s.river : ''}` }),
        el('div', { class: 'value', html: `${s.levelCm ?? '—'} <span class="unit">cm</span>${/^[123]$/.test(s.alert || '') ? ' <span class="unit">⚠ ' + s.alert + '. st. PA</span>' : ''}` }),
        el('div', { class: 'sub', text: s.time || '' }),
      ]));
    }
    body.appendChild(tiles);
    body.appendChild(el('p', { class: 'chart-caption', text: 'Najbližšie vodomerné stanice (Hron) · zdroj: SHMÚ' }));
  }, { handlesEmpty: true });
}

export function initWebcams() {
  const card = document.getElementById('card-webcams');
  return dataCard('webcams', 'webcams-body', (body, d) => {
    const okCams = (d.items || []).filter(c => c.ok);
    if (!okCams.length) { card.hidden = true; return; }
    card.hidden = false;
    const grid = el('div', { class: 'webcam-grid' });
    const liveImgs = [];
    for (const c of okCams) {
      let media;
      if (c.embed) {
        media = el('iframe', {
          class: 'webcam-embed', src: c.embed, loading: 'lazy',
          frameborder: '0', allow: 'fullscreen', title: `Webkamera ${c.name}`,
        });
      } else {
        const img = el('img', { src: c.snapshot, alt: `Webkamera ${c.name}`, loading: 'lazy' });
        liveImgs.push({ img, url: c.snapshot });
        media = el('a', { href: c.page || c.snapshot, target: '_blank', rel: 'noopener' }, [img]);
      }
      grid.appendChild(el('div', {}, [
        media,
        el('div', { class: 'webcam-name', text: c.name }),
      ]));
    }
    body.appendChild(grid);

    // živé obnovovanie snímok (cache-busting) — každú minútu
    if (liveImgs.length) {
      every(60 * 1000, () => {
        for (const { img, url } of liveImgs) {
          img.src = url + (url.includes('?') ? '&' : '?') + '_=' + Date.now();
        }
      });
    }
  });
}

export function initBazos() {
  return dataCard('bazos', 'bazos-body', (body, d) => {
    if (!d.items?.length) {
      body.appendChild(el('p', { class: 'empty-note', text: 'Momentálne žiadne inzeráty s PSČ 976 55.' }));
    } else {
      const list = el('div', { class: 'bazos-list' });
      for (const it of d.items) {
        list.appendChild(el('a', { class: 'bazos-item', href: it.link, target: '_blank', rel: 'noopener' }, [
          it.img
            ? el('img', { class: 'bazos-thumb', src: it.img, alt: '', loading: 'lazy' })
            : el('div', { class: 'bazos-thumb bazos-noimg', text: '🛒' }),
          el('div', { class: 'bazos-info' }, [
            el('span', { class: 'bazos-title', text: it.title }),
            el('span', { class: 'bazos-meta', text: [it.location, it.date].filter(Boolean).join(' · ') }),
            it.desc ? el('span', { class: 'bazos-desc', text: it.desc }) : null,
          ].filter(Boolean)),
          it.price ? el('span', { class: 'bazos-price', text: it.price }) : null,
        ].filter(Boolean)));
      }
      body.appendChild(list);
    }
    body.appendChild(el('p', { class: 'chart-caption', html:
      'Zdroj: <a href="https://www.bazos.sk" target="_blank" rel="noopener">Bazoš.sk</a> · inzeráty s PSČ 976 55 · aktualizované hodinovo' }));
  }, { handlesEmpty: true });
}

export async function initFootball() {
  const card = document.getElementById('card-football');
  const body = document.getElementById('football-body');
  try {
    const cfg = await getConfig();
    const f = cfg.football;
    if (!f || (!(f.links || []).length && !f.widgetHtml)) { card.hidden = true; return; }
    body.innerHTML = '';
    if (f.league) body.appendChild(el('p', { class: 'chart-caption', text: f.league }));

    // Oficiálny živý widget Futbalnetu (embed snippet z Futbalnetu).
    if (f.widgetHtml) {
      const wrap = el('div', { class: 'football-widget' });
      wrap.innerHTML = f.widgetHtml;               // kontajner s data-atribútmi
      body.appendChild(wrap);
      if (f.widgetScript) {                        // <script> vloženej cez innerHTML sa nespustí → pridáme ho korektne
        const s = document.createElement('script');
        s.src = f.widgetScript; s.async = true;
        body.appendChild(s);
      }
    }

    const row = el('div', { class: 'link-row' });
    for (const lk of f.links) {
      row.appendChild(el('a', { class: 'btn-link', href: lk.url, target: '_blank', rel: 'noopener', text: lk.label + ' →' }));
    }
    body.appendChild(row);
    body.appendChild(el('p', { class: 'chart-caption', html:
      'Zdroj: <a href="https://sportnet.sme.sk/futbalnet/" target="_blank" rel="noopener">Futbalnet (SPORTNET)</a> — tabuľka, výsledky, súpisky aj štatistiky hráčov.' }));
    setStatus('football', 'odkazy');
  } catch (e) {
    showError(body, 'football', e, 'Odkazy sa nepodarilo načítať.');
  }
}
