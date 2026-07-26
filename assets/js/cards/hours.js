// Otváracie hodiny miestnych inštitúcií (obecný úrad, pošta, Jednota).
// Statické dáta z config.json; „otvorené/zatvorené teraz" počíta prehliadač
// v čase obce a obnovuje sa každú minútu.
import { getConfig, setStatus, el, escapeHtml, TZ, every } from '../util.js';

const SHORT = { Pondelok: 'Po', Utorok: 'Ut', Streda: 'St', Štvrtok: 'Št', Piatok: 'Pi', Sobota: 'So', Nedeľa: 'Ne' };
const ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const toMin = t => { const [h, m] = t.split(':'); return (+h) * 60 + (+m); };
const fmt = t => t.replace(/^(\d):/, '0$1:');   // 7:30 → 07:30

// aktuálny deň (0=Po) a minúta dňa v čase obce
function nowInObec() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { day: ORDER.indexOf(p.weekday), min: (+p.hour) * 60 + (+p.minute) };
}

// stav miesta teraz: { open, text }
function statusNow(place, now) {
  const today = place.week[now.day];
  if (today && today.int.length) {
    for (const [o, c] of today.int) {
      if (now.min >= toMin(o) && now.min < toMin(c)) {
        return { open: true, text: `otvorené · zatvára ${fmt(c)}` };
      }
    }
    // dnes ešte otvoria?
    const next = today.int.find(([o]) => toMin(o) > now.min);
    if (next) return { open: false, text: `zatvorené · otvára o ${fmt(next[0])}` };
  }
  // najbližší otvárací deň v ďalších 7 dňoch
  for (let i = 1; i <= 7; i++) {
    const d = place.week[(now.day + i) % 7];
    if (d && d.int.length) {
      const lbl = i === 1 ? 'zajtra' : SHORT[d.d];
      return { open: false, text: `zatvorené · otvára ${lbl} o ${fmt(d.int[0][0])}` };
    }
  }
  return { open: false, text: 'zatvorené' };
}

function dayHours(entry) {
  if (!entry.int.length) return entry.label || 'zatvorené';
  return entry.int.map(([o, c]) => `${fmt(o)}–${fmt(c)}`).join(' · ');
}

export async function initHours() {
  const card = document.getElementById('card-hours');
  const body = document.getElementById('hours-body');
  const cfg = await getConfig();
  const places = cfg.openingHours || [];
  if (!places.length) { card.hidden = true; return; }

  const render = () => {
    const now = nowInObec();
    body.innerHTML = '';
    for (const place of places) {
      const st = statusNow(place, now);
      const head = el('div', { class: 'oh-head' }, [
        el('span', { class: 'oh-name', text: place.name }),
        el('span', {
          class: `badge oh-badge ${st.open ? 'is-open' : 'is-closed'}`,
          style: `--badge-color: ${st.open ? 'var(--status-good)' : 'var(--status-critical)'}`,
          text: st.open ? 'otvorené' : 'zatvorené',
        }),
      ]);
      const week = el('ul', { class: 'oh-week' });
      place.week.forEach((entry, i) => {
        week.appendChild(el('li', { class: i === now.day ? 'oh-today' : '' }, [
          el('span', { class: 'oh-day', text: SHORT[entry.d] || entry.d }),
          el('span', { class: 'oh-time', text: dayHours(entry) }),
        ]));
      });
      const block = el('div', { class: 'oh-place' }, [
        head,
        place.subtitle ? el('div', { class: 'oh-sub', text: place.subtitle }) : null,
        el('div', { class: 'oh-status', text: st.text }),
        week,
      ].filter(Boolean));
      if (place.url) {
        block.appendChild(el('a', {
          class: 'oh-link', href: place.url, target: '_blank', rel: 'noopener', text: 'zdroj →',
        }));
      }
      body.appendChild(block);
    }
  };

  every(60 * 1000, render);
  setStatus('hours', 'z verejných zdrojov');
}
