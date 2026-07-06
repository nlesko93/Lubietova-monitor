// Karty kreslené z data/*.json, ktoré hodinovo generuje GitHub Actions.
import { loadData, setStatus, showError, el, timeAgo, updatedLabel, escapeHtml } from '../util.js';
import { barChart } from '../charts.js';

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
  });
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
