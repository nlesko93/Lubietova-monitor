// Podujatia v obci — ručne zadávané v events.json (z plagátov, Facebooku obce
// a skupín). Ukazujú sa len nadchádzajúce; deň po skončení sa samy skryjú.
import { fetchJSON, setStatus, showError, el } from '../util.js';

const TZ = 'Europe/Bratislava';
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

export async function loadEvents() {
  const d = await fetchJSON(`events.json?v=${Math.floor(Date.now() / 600e3)}`);
  const today = todayIso();
  return (d.events || [])
    .filter(e => e.date && (e.dateEnd || e.date) >= today)
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}

export function daysUntil(iso) {
  return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(todayIso() + 'T00:00:00Z')) / 86400e3);
}

export async function initEvents() {
  const body = document.getElementById('events-body');
  try {
    const events = await loadEvents();
    body.innerHTML = '';
    if (!events.length) {
      body.appendChild(el('p', { class: 'empty-note', text: 'Zatiaľ nie sú ohlásené žiadne podujatia.' }));
    } else {
      const ul = el('ul', { class: 'event-list' });
      const mon = new Intl.DateTimeFormat('sk-SK', { month: 'short' });
      const wd = new Intl.DateTimeFormat('sk-SK', { weekday: 'long' });
      for (const e of events) {
        const dt = new Date(e.date + 'T12:00:00');
        const n = daysUntil(e.date);
        const when = n === 0 ? 'dnes' : n === 1 ? 'zajtra' : n < 7 ? `o ${n} dni` : null;
        ul.appendChild(el('li', { class: `event-item${n <= 7 ? ' is-soon' : ''}` }, [
          el('div', { class: 'event-date', 'aria-hidden': 'true' }, [
            el('span', { class: 'event-day', text: String(dt.getDate()) }),
            el('span', { class: 'event-mon', text: mon.format(dt).replace('.', '') }),
          ]),
          el('div', { class: 'event-main' }, [
            el('span', { class: 'event-title', text: e.title }),
            el('span', { class: 'event-meta', text: [
              `${wd.format(dt)} ${dt.toLocaleDateString('sk-SK')}`,
              e.time ? (e.end ? `${e.time} – ${e.end}` : `od ${e.time}`) : null,
              e.place,
              when,
            ].filter(Boolean).join(' · ') }),
            e.note ? el('span', { class: 'event-note', text: e.note }) : null,
            (e.organizer || e.source) ? el('span', { class: 'item-meta', text: [e.organizer, e.source ? `zdroj: ${e.source}` : null].filter(Boolean).join(' · ') }) : null,
          ].filter(Boolean)),
        ]));
      }
      body.appendChild(ul);
    }
    setStatus('events', events.length ? `${events.length} ohlásené` : '');
  } catch (e) {
    showError(body, 'events', e, 'Zoznam podujatí sa nepodarilo načítať.');
  }
}
