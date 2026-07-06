// Karty kreslené z data/*.json, ktoré hodinovo generuje GitHub Actions.
import { loadData, setStatus, showError, el, timeAgo, updatedLabel, escapeHtml, every, fmtTime } from '../util.js';
import { barChart, lineChart } from '../charts.js';
import { setBuses, setTraffic } from './mapcard.js';

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
    const tabs = el('div', { class: 'tab-row', role: 'tablist' });
    const content = el('div');
    body.append(tabs, content);

    const show = key => {
      const e = d.items.find(x => x.key === key);
      tabs.querySelectorAll('.tab-btn').forEach(b =>
        b.setAttribute('aria-pressed', String(b.dataset.key === key)));
      content.innerHTML = '';
      if (!e) return;
      const max = Math.max(...e.rows.map(r => r.pct ?? 0), 1);
      for (const r of e.rows) {
        content.appendChild(el('div', { class: 'hbar-row' }, [
          el('span', { class: 'hbar-name', title: r.name, text: r.name }),
          el('span', { class: 'hbar-val', text: `${r.pct != null ? r.pct.toFixed(1) + ' %' : ''} · ${r.votes.toLocaleString('sk-SK')} hl.` }),
          el('div', { class: 'hbar-track' }, [
            el('div', { class: 'hbar-fill', style: `width:${Math.max(2, ((r.pct ?? 0) / max) * 100)}%` }),
          ]),
        ]));
      }
      content.appendChild(el('p', { class: 'chart-caption', text:
        `Platné hlasy v obci spolu: ${e.totalVotes.toLocaleString('sk-SK')} · zdroj: ŠÚ SR (volby.statistics.sk / data.gov.sk)` }));
    };

    for (const e of d.items) {
      const b = el('button', { class: 'tab-btn', 'data-key': e.key, text: e.name });
      b.addEventListener('click', () => show(e.key));
      tabs.appendChild(b);
    }
    show(d.items[0]?.key);
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

// Odhad polôh autobusov z cestovného poriadku (ak idú načas) — interpolácia
// medzi susednými zastávkami podľa aktuálneho času.
function busVehicles(lines) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const vehicles = [];
  for (const l of lines) for (const dir of l.directions || []) {
    const stops = dir.stops || [];
    for (let i = 0; i < stops.length - 1; i++) {
      const A = stops[i], B = stops[i + 1];
      if (!A.times?.length || !B.times?.length) continue;
      for (const ta of A.times) {
        const ma = toMin(ta);
        const tb = B.times.find(t => toMin(t) > ma);
        if (!tb) continue;
        const mb = toMin(tb);
        if (mb - ma > 25 || mb <= ma) continue; // nespárované (short-turn) → preskoč
        if (nowMin >= ma && nowMin <= mb) {
          const f = (nowMin - ma) / (mb - ma);
          vehicles.push({
            lat: A.lat + (B.lat - A.lat) * f, lon: A.lon + (B.lon - A.lon) * f,
            line: l.line, dirLabel: dir.label, from: A.name, to: B.name, depart: ta, arrive: tb,
          });
        }
      }
    }
  }
  return vehicles;
}

export function initBuses() {
  const card = document.getElementById('card-buses');
  const body = document.getElementById('buses-body');
  loadData('buses').then(d => {
    const lines = (d.lines || []).filter(l => (l.directions || []).some(x => x.departures?.length));
    if (!lines.length) { card.hidden = true; return; }
    card.hidden = false;

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
      const delay = d.route.freeMinutes != null ? d.route.minutes - d.route.freeMinutes : 0;
      const color = delay >= 8 ? 'var(--status-critical)' : delay >= 3 ? 'var(--status-warning)' : 'var(--status-good)';
      body.appendChild(el('div', { class: 'hero-row' }, [
        el('span', { class: 'hero-figure', text: `${d.route.minutes}` }),
        el('span', { class: 'hero-side', html:
          `min do Banskej Bystrice${d.route.lengthKm ? ' · ' + d.route.lengthKm + ' km' : ''}<br>` +
          `<span class="badge" style="--badge-color:${color}">${delay > 0 ? '+' + delay + ' min zdržanie' : 'plynulá premávka'}</span>` }),
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
    } else {
      body.appendChild(el('p', { class: 'empty-note', text: 'Žiadne hlásené udalosti na ceste BB ↔ Ľubietová. ✅' }));
    }
    body.appendChild(el('p', { class: 'chart-caption', text:
      `Zdroj: ${d.route?.source || 'Waze'} · udalosti Waze · aktualizované hodinovo` }));
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
    for (const c of okCams) {
      grid.appendChild(el('div', {}, [
        el('a', { href: c.page || c.snapshot, target: '_blank', rel: 'noopener' }, [
          el('img', { src: c.snapshot, alt: `Webkamera ${c.name}`, loading: 'lazy' }),
        ]),
        el('div', { class: 'webcam-name', text: c.name }),
      ]));
    }
    body.appendChild(grid);
  });
}
