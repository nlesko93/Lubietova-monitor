// Meteorologické výstrahy — Meteoalarm (feed pre Slovensko),
// filtrované na okres/kraj Banská Bystrica.
import { getText, getJSON, writeResult, xmlBlocks, xmlValue, stripTags, CONFIG } from './lib.mjs';

const FEEDS = [
  'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-slovakia',
  'https://feeds.meteoalarm.org/api/v1/warnings/feeds-slovakia',
];

const AREA_MATCH = /Bansk[áa] Bystrica|Banskobystrick/i;

export async function fetchAlerts() {
  let lastErr;
  for (const url of FEEDS) {
    try {
      if (url.includes('api/v1')) {
        const data = await getJSON(url);
        return writeResult('alerts', { items: fromApi(data), via: url });
      }
      const xml = await getText(url);
      return writeResult('alerts', { items: fromAtom(xml), via: url });
    } catch (e) { lastErr = e; }
  }
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
      event: xmlValue(entry, 'cap:event') || title,
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
        event: info.event,
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

function dedupe(items) {
  const seen = new Set();
  return items.filter(i => {
    const k = `${i.event}|${i.severity}|${i.expires}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 12);
}
