// Pás „Dnes v obci" — to najdôležitejšie na jeden pohľad: počasie, najbližší
// autobus, zber odpadu, čo je otvorené, výstrahy a odstávky. Každá dlaždica
// je odkaz na príslušnú kartu. Dlaždice sa plnia nezávisle; chýbajúci zdroj
// svoju dlaždicu jednoducho nezobrazí.
import { loadData, getConfig, el, every, timeAgo } from '../util.js';
import { nowInObec, statusNow } from './hours.js';

const toMin = t => (+t.slice(0, 2)) * 60 + (+t.slice(3, 5));
const ORDER = ['weather', 'bus', 'waste', 'open', 'alerts'];

export async function initToday() {
  const box = document.getElementById('today-tiles');
  const foot = document.getElementById('today-foot');
  if (!box) return;
  const tiles = new Map();

  const set = (key, { icon, label, value, sub, href, tone }) => {
    let t = tiles.get(key);
    if (!t) {
      t = el('a', { class: 'today-tile' });
      tiles.set(key, t);
      // drž stabilné poradie bez ohľadu na to, ktorý zdroj dobehne prvý
      const after = ORDER.slice(ORDER.indexOf(key) + 1).map(k => tiles.get(k)).find(Boolean);
      box.insertBefore(t, after || null);
    }
    t.href = href;
    t.dataset.tone = tone || '';
    t.innerHTML = '';
    t.append(
      el('span', { class: 'today-icon', text: icon }),
      el('span', { class: 'today-text' }, [
        el('span', { class: 'today-label', text: label }),
        el('span', { class: 'today-value', text: value }),
        sub ? el('span', { class: 'today-sub', text: sub }) : null,
      ]),
    );
  };

  // počasie — posiela karta počasia pri každom obnovení
  document.addEventListener('lm:weather', e => {
    const w = e.detail;
    set('weather', {
      icon: w.icon, label: 'Počasie teraz', value: `${w.temp} °C · ${w.desc}`,
      sub: Number.isFinite(w.max) ? `dnes ${w.min} až ${w.max} °C` : '', href: '#card-weather',
    });
  });

  // najbližší autobus (obnovuje sa každých 30 s)
  loadData('buses').then(d => {
    const line = (d.lines || [])[0];
    if (!line) return;
    every(30 * 1000, () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const parts = [];
      for (const dir of line.directions || []) {
        const next = (dir.departures || []).find(t => toMin(t) >= nowMin);
        const name = dir.dir === 'doBB' ? 'do BB' : 'z BB ďalej';
        parts.push(next ? { name, next, mins: toMin(next) - nowMin } : { name });
      }
      const main = parts.find(p => p.next) || parts[0];
      if (!main) return;
      const fmt = p => (p.next ? `${p.next} (o ${p.mins <= 0 ? 'chvíľu' : p.mins + ' min'})` : 'dnes už nejde');
      const other = parts.find(p => p !== main);
      set('bus', {
        icon: '🚌', label: `Autobus ${main.name}`, value: fmt(main),
        sub: other ? `${other.name}: ${fmt(other)}` : '', href: '#card-buses',
        tone: main.next && main.mins <= 10 ? 'soon' : '',
      });
    });
  }).catch(() => {});

  // najbližší zber odpadu
  loadData('waste').then(d => {
    const next = (d.items || [])[0];
    if (!next) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const n = Math.round((new Date(next.date + 'T00:00:00') - today) / 86400e3);
    const when = n <= 0 ? 'dnes' : n === 1 ? 'zajtra' : `o ${n} dní`;
    const date = new Intl.DateTimeFormat('sk-SK', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(next.date));
    set('waste', {
      icon: '♻️', label: 'Zber odpadu', value: `${when} · ${next.title}`, sub: date,
      href: '#card-waste', tone: n <= 1 ? 'soon' : '',
    });
  }).catch(() => {});

  // čo je práve otvorené
  getConfig().then(cfg => {
    const places = cfg.openingHours || [];
    if (!places.length) return;
    every(60 * 1000, () => {
      const now = nowInObec();
      const st = places.map(p => ({ name: p.name.replace(/\s*\(.*\)$/, ''), ...statusNow(p, now) }));
      const open = st.filter(s => s.open);
      const closed = st.filter(s => !s.open);
      set('open', {
        icon: '🏪', label: 'Otvorené teraz',
        value: open.length ? open.map(s => s.name).join(', ') : 'všetko zatvorené',
        sub: closed.length ? `zatvorené: ${closed.map(s => s.name).join(', ')}` : 'všetko otvorené',
        href: '#card-hours',
      });
    });
  }).catch(() => {});

  // výstrahy a odstávky — jedna dlaždica, upozorní len keď niečo je
  Promise.allSettled([loadData('alerts'), loadData('outages')]).then(([a, o]) => {
    if (a.status !== 'fulfilled' && o.status !== 'fulfilled') return;
    const alerts = a.status === 'fulfilled' ? (a.value.items || []) : [];
    const outages = o.status === 'fulfilled' ? (o.value.items || []) : [];
    if (!alerts.length && !outages.length) {
      set('alerts', { icon: '✅', label: 'Výstrahy a odstávky', value: 'žiadne', sub: 'počasie aj elektrina v poriadku', href: '#card-alerts' });
      return;
    }
    const bits = [];
    if (alerts.length) bits.push(`${alerts.length}× výstraha (${alerts[0].event})`);
    if (outages.length) bits.push(`${outages.length}× odstávka elektriny`);
    set('alerts', {
      icon: '⚠️', label: 'Výstrahy a odstávky', value: bits[0], sub: bits[1] || '',
      href: alerts.length ? '#card-alerts' : '#card-outages', tone: 'warn',
    });
  });

  // vek dát z GitHub Actions (posledný úspešný beh)
  loadData('_meta').then(m => {
    if (!foot || !m.updated) return;
    const ageH = (Date.now() - new Date(m.updated).getTime()) / 3600e3;
    foot.textContent = ageH > 3
      ? `⚠ Údaje zo zdrojov obce sú staršie — posledná aktualizácia ${timeAgo(m.updated)}. Počasie, lietadlá a obloha sú stále naživo.`
      : `Údaje zo zdrojov aktualizované ${timeAgo(m.updated)} · počasie, lietadlá a obloha naživo`;
    foot.classList.toggle('stale', ageH > 3);
  }).catch(() => {});
}
