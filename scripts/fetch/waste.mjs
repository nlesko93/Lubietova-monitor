// Zber odpadu — verejný iCal kalendár obce (Google Calendar ICS).
// Parsuje VEVENT bloky, rozbaľuje jednoduché RRULE (WEEKLY/MONTHLY interval)
// a zapíše najbližšie termíny.
import { getText, writeResult, CONFIG } from './lib.mjs';

const HORIZON_DAYS = 120;
const MAX_ITEMS = 20;

export async function fetchWaste() {
  if (!CONFIG.wasteIcs) throw new Error('wasteIcs nie je v config.json');
  const ics = await getText(CONFIG.wasteIcs);
  const events = parseIcs(ics);
  console.log(`  waste: ${events.length} VEVENT blokov v kalendári`);

  const now = Date.now() - 86400e3; // dnešný zvoz ešte ukazuj celý deň
  const horizon = Date.now() + HORIZON_DAYS * 86400e3;

  const upcoming = events
    .flatMap(ev => expand(ev, now, horizon))
    .filter(ev => ev.ts >= now && ev.ts <= horizon)
    .sort((a, b) => a.ts - b.ts)
    .slice(0, MAX_ITEMS)
    .map(ev => ({ date: new Date(ev.ts).toISOString().slice(0, 10), title: ev.title }));

  if (!upcoming.length && events.length) {
    const samples = events.slice(0, 5).map(e => `${e.title}@${e.dtstart}`).join(' | ');
    console.log(`  waste: žiadne budúce termíny; vzorka udalostí: ${samples}`);
  }
  return writeResult('waste', { items: upcoming, totalEvents: events.length });
}

// --- ICS parser (folded lines, DTSTART date/datetime, základné RRULE) ---

function parseIcs(ics) {
  const unfolded = ics.replace(/\r?\n[ \t]/g, '');
  const events = [];
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0];
    const prop = name => {
      const m = body.match(new RegExp(`^${name}(?:;[^:\\n]*)?:(.*)$`, 'mi'));
      return m ? m[1].trim() : null;
    };
    const dtstart = prop('DTSTART');
    const title = (prop('SUMMARY') || '')
      .replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ').trim();
    if (!dtstart || !title) continue;
    events.push({ title, dtstart, rrule: prop('RRULE') });
  }
  return events;
}

function parseIcsDate(s) {
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0));
}

// Rozbalí udalosť na výskyty v okne [from, to]; podporuje FREQ=DAILY/WEEKLY/
// MONTHLY s INTERVAL, COUNT a UNTIL — na obecný kalendár zvozu to stačí.
function expand(ev, from, to) {
  const start = parseIcsDate(ev.dtstart);
  if (start == null) return [];
  if (!ev.rrule) return [{ ts: start, title: ev.title }];

  const rule = Object.fromEntries(ev.rrule.split(';').map(p => p.split('=')));
  const freq = rule.FREQ;
  const interval = parseInt(rule.INTERVAL || '1');
  const until = rule.UNTIL ? parseIcsDate(rule.UNTIL) : to;
  const count = rule.COUNT ? parseInt(rule.COUNT) : Infinity;

  const stepDays = { DAILY: 1, WEEKLY: 7 }[freq];
  const out = [];
  if (stepDays) {
    for (let i = 0, ts = start; ts <= Math.min(to, until) && i < count; i++, ts += stepDays * interval * 86400e3) {
      if (ts >= from) out.push({ ts, title: ev.title });
    }
  } else if (freq === 'MONTHLY') {
    const d = new Date(start);
    for (let i = 0; i < count; i++) {
      const ts = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i * interval, d.getUTCDate(), 12);
      if (ts > Math.min(to, until)) break;
      if (ts >= from) out.push({ ts, title: ev.title });
    }
  } else {
    console.log(`  waste: nepodporované RRULE "${ev.rrule}" (${ev.title})`);
    out.push({ ts: start, title: ev.title });
  }
  return out;
}
