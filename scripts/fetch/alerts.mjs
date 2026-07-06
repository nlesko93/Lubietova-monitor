// Meteorologické výstrahy — Meteoalarm (feed pre Slovensko),
// filtrované na okres/kraj Banská Bystrica.
import { getText, getJSON, writeResult, xmlBlocks, xmlValue, stripTags, CONFIG } from './lib.mjs';

const FEEDS = [
  'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-slovakia',
  'https://feeds.meteoalarm.org/api/v1/warnings/feeds-slovakia',
];

const AREA_MATCH = /Bansk[áa] Bystrica|Banskobystrick/i;

export async function fetchAlerts() {
  let lastErr, empty = null;
  for (const url of FEEDS) {
    try {
      let items;
      if (url.includes('api/v1')) {
        const data = await getJSON(url);
        items = fromApi(data);
      } else {
        const xml = await getText(url);
        console.log(`  alerts: feed ${url.slice(0, 60)} → ${xml.length} B`);
        items = fromAtom(xml);
      }
      if (items.length) return writeResult('alerts', { items, via: url });
      empty = { items, via: url };
    } catch (e) {
      lastErr = e;
      console.warn(`  alerts: ${e.message.slice(0, 150)}`);
    }
  }
  if (empty) return writeResult('alerts', empty);
  throw lastErr;
}

// legacy ATOM: entry obsahuje cap:* polia
function fromAtom(xml) {
  const items = [];
  const entries = xmlBlocks(xml, 'entry');
  const areaSamples = new Set();
  for (const entry of entries) {
    const a = xmlValue(entry, 'cap:areaDesc');
    if (a) areaSamples.add(a);
  }
  console.log(`  alerts: ${entries.length} entries, oblasti: ${[...areaSamples].slice(0, 8).join(' | ') || '—'}`);
  for (const entry of entries) {
    const areas = xmlValue(entry, 'cap:areaDesc') || '';
    if (!AREA_MATCH.test(areas)) continue;
    const status = xmlValue(entry, 'cap:status');
    if (status && status !== 'Actual') continue;
    const title = stripTags(xmlValue(entry, 'title'));
    const severityMatch = title.match(/yellow|orange|red/i) ||
      [xmlValue(entry, 'cap:severity')];
    items.push({
      event: translateEvent(xmlValue(entry, 'cap:event') || title),
      severity: capitalize(severityMatch?.[0] || 'Unknown'),
      onset: xmlValue(entry, 'cap:onset') || xmlValue(entry, 'cap:effective'),
      expires: xmlValue(entry, 'cap:expires'),
      areas,
    });
  }
  return dedupe(items);
}

// JSON API v1: warnings[] s alert.info[]
function fromApi(data) {
  const items = [];
  const warnings = data?.warnings || data?.result || [];
  for (const w of warnings) {
    const infos = w?.alert?.info || [];
    for (const info of infos) {
      if ((info.language || '').toLowerCase().startsWith('en')) continue;
      const areas = (info.area || []).map(a => a.areaDesc).join(', ');
      if (!AREA_MATCH.test(areas)) continue;
      items.push({
        event: translateEvent(info.event),
        severity: awarenessColor(info) || info.severity,
        onset: info.onset,
        expires: info.expires,
        areas,
        description: (info.description || '').slice(0, 300),
      });
    }
  }
  return dedupe(items);
}

function awarenessColor(info) {
  const p = (info.parameter || []).find(p => /awareness_level/i.test(p.valueName));
  const m = p?.value?.match(/yellow|orange|red/i);
  return m ? capitalize(m[0]) : null;
}

const capitalize = s => s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;

// Meteoalarm feed je v angličtine — preklad typov výstrah do slovenčiny.
const EVENT_SK = [
  [/thunderstorm/i, 'Búrky'],
  [/rain.?flood/i, 'Prívalová povodeň'],
  [/flood/i, 'Povodeň'],
  [/rain/i, 'Dážď'],
  [/wind/i, 'Vietor'],
  [/snow|ice/i, 'Sneh a poľadovica'],
  [/fog/i, 'Hmla'],
  [/extreme.?high.?temp|high.?temp|heat/i, 'Vysoké teploty'],
  [/extreme.?low.?temp|low.?temp|cold|frost/i, 'Nízke teploty'],
  [/forest.?fire|fire/i, 'Riziko požiarov'],
  [/avalanche/i, 'Lavíny'],
  [/coastal/i, 'Pobrežná udalosť'],
];

function translateEvent(s) {
  const hit = EVENT_SK.find(([re]) => re.test(s || ''));
  if (hit) return hit[1];
  // "Moderate Wind warning" → aspoň očisti od stupňa/warning
  return String(s || 'Výstraha').replace(/\b(moderate|severe|extreme|warning)\b/gi, '').trim() || 'Výstraha';
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(i => {
    const k = `${i.event}|${i.severity}|${i.expires}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 12);
}
