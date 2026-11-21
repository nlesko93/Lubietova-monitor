// Dni premávky autobusov: ktorý spoj ide v daný deň.
// Značky z cestovného poriadku (scripts/fetch/buses.mjs → trip.d / sch / ex / aj / only):
//   X = pracovné dni, 6 = sobota, + = nedeľa a štátom uznaný deň pracovného pokoja,
//   1–7 = konkrétny deň v týždni, sch 'school' = len v dňoch školského vyučovania,
//   sch 'vacation' = len cez školské prázdniny, ex = nepremáva v dátumoch, aj = premáva aj.
// Sviatky (dni pracovného pokoja) a školské prázdniny sú v config.json.
import { TZ } from './util.js';

const isoOf = date => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
const inRanges = (iso, ranges) => (ranges || []).some(([a, b]) => iso >= a && iso <= (b || a));

// Veľká noc (gregoriánsky kalendár) — pre roky, ktoré nie sú v config.json
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}
function defaultHolidays(y) {
  const e = easter(y), shift = n => new Date(e.getTime() + n * 86400e3).toISOString().slice(0, 10);
  return ['01-01', '01-06', '05-01', '05-08', '07-05', '08-29', '09-15', '11-01', '12-24', '12-25', '12-26']
    .map(md => `${y}-${md}`).concat([shift(-2), shift(1)]);
}

export function dayInfo(cfg, date = new Date()) {
  const iso = isoOf(date);
  const y = iso.slice(0, 4);
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay() || 7;           // 1 = pondelok … 7 = nedeľa
  const holidays = cfg.holidays?.[y] || defaultHolidays(+y);
  const holiday = holidays.includes(iso);
  const workday = dow <= 5 && !holiday;
  const schoolDay = workday && !inRanges(iso, cfg.schoolHolidays);
  const label = holiday ? 'sviatok (premávka ako v nedeľu)'
    : dow === 7 ? 'nedeľa' : dow === 6 ? 'sobota'
    : schoolDay ? 'pracovný deň' : 'pracovný deň · školské prázdniny';
  return { iso, dow, holiday, workday, schoolDay, label };
}

export function tripRuns(trip, info) {
  if (trip.only?.length && !inRanges(info.iso, trip.only)) return false;
  if (inRanges(info.iso, trip.aj)) return true;
  if (inRanges(info.iso, trip.ex)) return false;
  const d = trip.d || '';
  if (d) {
    const ok = info.holiday || info.dow === 7
      ? d.includes('+') || (info.dow === 7 && d.includes('7'))
      : info.dow === 6
        ? d.includes('6')
        : d.includes('X') || d.includes(String(info.dow));
    if (!ok) return false;
  }
  if (trip.sch === 'school' && !info.schoolDay) return false;
  if (trip.sch === 'vacation' && (info.schoolDay || !info.workday)) return false;
  return true;
}

// Kópia linky len so spojmi, ktoré idú v daný deň (odchody aj časy na zastávkach).
// Staršie dáta bez `trips` vráti bez zmeny.
export function lineForDay(line, cfg, date = new Date()) {
  const info = dayInfo(cfg, date);
  const directions = (line.directions || []).map(dir => {
    if (!dir.trips) return dir;
    const trips = dir.trips.filter(tr => tripRuns(tr, info));
    const departures = [...new Set(trips.map(tr => tr.dep || tr.t['Ľubietová']).filter(Boolean))].sort();
    const stops = (dir.stops || []).map(s => ({ ...s, times: [...new Set(trips.map(tr => tr.t[s.name]).filter(Boolean))].sort() }));
    return { ...dir, trips, departures, stops };
  });
  return { ...line, directions, day: info };
}
