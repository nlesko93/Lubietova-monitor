// Karta obce — súhrn zo slovenskej Wikipédie (REST API, CORS OK).
import { getConfig, fetchJSON, setStatus, showError, el } from '../util.js';

export async function initWiki() {
  const cfg = await getConfig();
  const body = document.getElementById('wiki-body');
  try {
    const d = await fetchJSON(`https://sk.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cfg.wikiTitle)}`);
    body.innerHTML = '';
    const img = d.thumbnail?.source
      ? el('img', { src: d.thumbnail.source, alt: `Fotografia: ${d.title}`, loading: 'lazy' })
      : null;
    body.appendChild(el('div', { class: 'wiki-flex' }, [
      img,
      el('div', { class: 'wiki-text' }, [
        el('p', { text: d.extract || '' }),
        el('a', { href: d.content_urls?.desktop?.page || '#', target: '_blank', rel: 'noopener', text: 'Celý článok na Wikipédii →' }),
      ]),
    ]));
    setStatus('wiki', 'sk.wikipedia.org');
  } catch (e) {
    showError(body, 'wiki', e);
  }
}
