// Webkamery — overí dostupnosť snapshot URL z config.json.
// Karta na dashboarde sa zobrazí len pre funkčné kamery.
import { get, writeResult, CONFIG } from './lib.mjs';

export async function fetchWebcams() {
  const items = [];
  for (const cam of CONFIG.webcams || []) {
    // Windy webkamera — vložíme oficiálny embed prehrávač (bez API kľúča),
    // netreba overovať snapshot.
    if (cam.windyId) {
      items.push({
        name: cam.name,
        embed: `https://webcams.windy.com/webcams/public/embed/player/${cam.windyId}/day`,
        page: cam.page || `https://www.windy.com/webcams/${cam.windyId}`,
        ok: true,
      });
      continue;
    }
    let snapshot = cam.snapshot;
    let found = [];
    // bez explicitnej snapshot URL skús nájsť obrázok kamery na stránke
    if (!snapshot && cam.page) {
      const d = await discoverSnapshot(cam);
      snapshot = d.snapshot;
      found = d.all;
    }
    if (!snapshot) {
      items.push({ ...cam, ok: false, note: 'snapshot sa nenašiel', found });
      continue;
    }
    try {
      const res = await get(snapshot, { retries: 0, timeoutMs: 12000 });
      const type = res.headers.get('content-type') || '';
      const ok = type.startsWith('image/');
      items.push({ ...cam, snapshot, ok, note: ok ? null : `content-type ${type}` });
    } catch (e) {
      items.push({ ...cam, snapshot, ok: false, note: e.message.slice(0, 120) });
    }
  }
  console.log('  webcams:', items.map(c => `${c.name}=${c.ok ? 'OK ' + c.snapshot : c.note}`).join(' | '));
  return writeResult('webcams', { items });
}

// Heuristika: na stránke kamery nájdi <img>/<a> smerujúce na jpg,
// ktoré v URL pripomína webkameru.
async function discoverSnapshot(cam) {
  try {
    const html = await (await get(cam.page, { retries: 0, timeoutMs: 15000 })).text();
    const abs = u => (u.startsWith('http') ? u : new URL(u, cam.page).href);
    const all = [...new Set([...html.matchAll(/(?:src|href|data-src)="([^"]+\.(?:jpe?g|png|mjpe?g)(?:\?[^"]*)?)"/gi)].map(m => m[1]))];
    // diagnostika: všetky nájdené obrázky (aby sa dala kamera odhaliť z logu)
    console.log(`  webcams ${cam.name}: všetky obrázky: ${all.slice(0, 10).map(abs).join(' , ') || 'žiadne'}`);
    const absAll = all.map(abs);
    const cands = absAll.filter(u => /kamer|webcam|cam\b|snapshot|snimk|live|foto/i.test(u)).slice(0, 5);
    console.log(`  webcams ${cam.name}: kandidáti ${cands.join(' , ') || 'žiadni'}`);
    return { snapshot: cands[0] || null, all: absAll.slice(0, 12) };
  } catch (e) {
    console.log(`  webcams ${cam.name}: stránka nedostupná (${e.message.slice(0, 100)})`);
    return { snapshot: null, all: [] };
  }
}
