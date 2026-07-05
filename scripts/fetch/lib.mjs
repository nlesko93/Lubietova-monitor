// Zdieľané pomôcky pre fetchery (Node 20+, bez závislostí).
import { writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const ROOT = new URL('../..', import.meta.url).pathname;
export const DATA_DIR = path.join(ROOT, 'data');
export const CONFIG = JSON.parse(readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

const UA = 'LubietovaMonitor/1.0 (+https://github.com/nlesko93/lubietova-monitor; OSINT dashboard obce)';

export async function get(url, { timeoutMs = 20000, headers = {}, retries = 1 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'user-agent': UA, accept: '*/*', ...headers },
      });
      if (!res.ok) {
        let body = '';
        try { body = (await res.text()).slice(0, 300).replace(/\s+/g, ' '); } catch { /* ignore */ }
        throw new Error(`HTTP ${res.status} ${url}${body ? ` :: ${body}` : ''}`);
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

export const getText = async (url, opts) => (await get(url, opts)).text();
export const getJSON = async (url, opts) => (await get(url, opts)).json();

export async function writeResult(name, payload) {
  await mkdir(DATA_DIR, { recursive: true });
  const out = { updated: new Date().toISOString(), ok: true, ...payload };
  await writeFile(path.join(DATA_DIR, `${name}.json`), JSON.stringify(out, null, 1));
  const n = out.items ? ` (${out.items.length} položiek)` : '';
  console.log(`✔ ${name}${n}`);
  return out;
}

export async function writeFailure(name, err) {
  await mkdir(DATA_DIR, { recursive: true });
  const out = { updated: new Date().toISOString(), ok: false, error: String(err?.message || err) };
  await writeFile(path.join(DATA_DIR, `${name}.json`), JSON.stringify(out, null, 1));
  console.error(`✘ ${name}: ${out.error}`);
  return out;
}

// --- mini XML/HTML pomôcky (na RSS/ATOM stačí regex-parser) ---

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ');
}

export function stripTags(s) {
  return decodeEntities(String(s ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// Vráti obsah všetkých <tag>…</tag> blokov.
export function xmlBlocks(xml, tag) {
  const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, 'g');
  return xml.match(re) || [];
}

// Prvá hodnota <tag …>value</tag> vo fragmente.
export function xmlValue(fragment, tag) {
  const m = fragment.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? decodeEntities(m[1]).trim() : null;
}

// Atribút z prvého výskytu tagu: xmlAttr(frag, 'link', 'href')
export function xmlAttr(fragment, tag, attr) {
  const m = fragment.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`));
  return m ? decodeEntities(m[1]) : null;
}
