// Webkamery — overí dostupnosť snapshot URL z config.json.
// Karta na dashboarde sa zobrazí len pre funkčné kamery.
import { get, writeResult, CONFIG } from './lib.mjs';

export async function fetchWebcams() {
  const items = [];
  for (const cam of CONFIG.webcams || []) {
    if (!cam.snapshot) {
      items.push({ ...cam, ok: false, note: 'chýba snapshot URL' });
      continue;
    }
    try {
      const res = await get(cam.snapshot, { retries: 0, timeoutMs: 12000 });
      const type = res.headers.get('content-type') || '';
      const ok = type.startsWith('image/');
      items.push({ ...cam, ok, note: ok ? null : `content-type ${type}` });
    } catch (e) {
      items.push({ ...cam, ok: false, note: e.message });
    }
  }
  console.log('  webcams:', items.map(c => `${c.name}=${c.ok ? 'OK' : c.note}`).join(' | '));
  return writeResult('webcams', { items });
}
