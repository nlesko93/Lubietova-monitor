// Fotogaléria obce — Wikimedia Commons (kategória obce + fotky v okolí).
// CORS-friendly API (origin=*), rotácia fotky každých 20 s.
import { getConfig, fetchJSON, setStatus, showError, every, el, escapeHtml } from '../util.js';

const API = 'https://commons.wikimedia.org/w/api.php';

let photos = [];
let idx = 0;

export async function initGallery() {
  const cfg = await getConfig();
  const body = document.getElementById('gallery-body');
  try {
    photos = await loadCategory(`Category:${cfg.wikiTitle}`);
    if (photos.length < 3) {
      photos = photos.concat(await loadGeosearch(cfg.lat, cfg.lon));
    }
    photos = dedupe(photos);
    if (!photos.length) {
      document.getElementById('card-gallery').hidden = true;
      return;
    }
    idx = Math.floor(Math.random() * photos.length);
    setStatus('gallery', `Wikimedia Commons · ${photos.length} fotiek`);
    every(20 * 1000, () => {
      show(body);
      idx = (idx + 1) % photos.length;
    });
  } catch (e) {
    showError(body, 'gallery', e);
  }
}

function show(body) {
  const p = photos[idx];
  body.innerHTML = '';
  body.appendChild(el('a', { href: p.descUrl, target: '_blank', rel: 'noopener' }, [
    el('img', { class: 'gallery-img', src: p.thumb, alt: p.title, loading: 'lazy' }),
  ]));
  body.appendChild(el('p', { class: 'chart-caption', html:
    `${escapeHtml(p.title)}${p.author ? ' · ' + escapeHtml(p.author) : ''} · ${escapeHtml(p.license || 'Wikimedia Commons')}` }));
}

async function loadCategory(cat) {
  const url = `${API}?action=query&generator=categorymembers&gcmtitle=${encodeURIComponent(cat)}` +
    '&gcmtype=file&gcmlimit=40&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&format=json&origin=*';
  return extract(await fetchJSON(url));
}

async function loadGeosearch(lat, lon) {
  const url = `${API}?action=query&generator=geosearch&ggscoord=${lat}%7C${lon}&ggsradius=3000` +
    '&ggsnamespace=6&ggslimit=40&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&format=json&origin=*';
  return extract(await fetchJSON(url));
}

function extract(d) {
  return Object.values(d?.query?.pages || {}).map(p => {
    const ii = p.imageinfo?.[0];
    if (!ii || !/\.(jpe?g|png|webp)$/i.test(ii.url || '')) return null;
    const meta = ii.extmetadata || {};
    return {
      title: p.title.replace(/^File:/, '').replace(/\.\w+$/, ''),
      thumb: ii.thumburl || ii.url,
      descUrl: ii.descriptionurl,
      author: stripHtml(meta.Artist?.value),
      license: meta.LicenseShortName?.value,
    };
  }).filter(Boolean);
}

const stripHtml = s => s ? String(s).replace(/<[^>]*>/g, '').trim().slice(0, 60) : null;

function dedupe(list) {
  const seen = new Set();
  return list.filter(p => !seen.has(p.thumb) && (seen.add(p.thumb), true));
}
