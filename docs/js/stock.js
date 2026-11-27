// Real stock footage and photos for b-roll, from Pexels and Pixabay (both free; each needs a free API key).
//
// Keys live in the person's brand profile (Brand > Stock footage) and never leave their browser except to go to the provider.
// A site-wide key can also be set in config.js. Every function here fails soft: a missing key, a slow network or a blocked
// download returns a plain message or null so an edit never breaks and the built-in animated scenes can step in.
import { CONFIG } from './config.js';
import { QUERY_FOR } from './stock-catalog.js';

export const PROVIDERS = {
  pexels: { id: 'pexels', name: 'Pexels', keyUrl: 'https://www.pexels.com/api/', home: 'https://www.pexels.com' },
  pixabay: { id: 'pixabay', name: 'Pixabay', keyUrl: 'https://pixabay.com/api/docs/', home: 'https://pixabay.com' },
};

const PEXELS = 'https://api.pexels.com';
const PIXABAY = 'https://pixabay.com/api';

/** { pexels, pixabay } keys for this person (their own, else the site key from config.js). */
export function keysOf(brand = {}) {
  return { pexels: (brand.pexelsKey || CONFIG.pexelsKey || '').trim(), pixabay: (brand.pixabayKey || CONFIG.pixabayKey || '').trim() };
}
export const hasStock = (brand) => { const k = keysOf(brand); return !!(k.pexels || k.pixabay); };
export const providersFor = (brand) => { const k = keysOf(brand); return ['pexels', 'pixabay'].filter((p) => k[p]); };

/** A better search than the word alone ("money" finds banknotes, not the dictionary). */
export const betterQuery = (word) => QUERY_FOR[String(word || '').toLowerCase()] || word;

const withTimeout = (ms, outer) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  if (outer) outer.addEventListener('abort', () => c.abort(), { once: true });
  return { signal: c.signal, done: () => clearTimeout(t) };
};

class StockError extends Error { constructor(message, code) { super(message); this.code = code; } }

function explain(e, provider) {
  if (e instanceof StockError) return e;
  if (e?.name === 'AbortError') return new StockError(`${PROVIDERS[provider]?.name || 'The provider'} did not answer in time. Try again.`, 'timeout');
  return new StockError(navigator.onLine === false ? 'You are offline. Stock footage needs a connection.' : `Could not reach ${PROVIDERS[provider]?.name || 'the provider'}. Check your connection.`, 'network');
}
function statusError(r, provider) {
  const n = PROVIDERS[provider].name;
  if (r.status === 401 || r.status === 403) return new StockError(`${n} rejected this key. Check it under Brand > Stock footage.`, 'key');
  if (r.status === 429) return new StockError(`${n} is rate-limiting requests right now. Wait a minute and try again.`, 'rate');
  return new StockError(`${n} answered ${r.status}.`, 'http');
}

/* ------------------------------------------------------------------------------------------------ key checks */
/** Check a Pexels key and return {ok, message}. */
export async function testKey(key) {
  if (!key || key.trim().length < 20) return { ok: false, message: 'That does not look like a Pexels API key.' };
  const to = withTimeout(9000);
  try {
    const r = await fetch(`${PEXELS}/videos/search?query=nature&per_page=1`, { headers: { Authorization: key.trim() }, signal: to.signal });
    if (r.status === 401 || r.status === 403) return { ok: false, message: 'Pexels rejected this key.' };
    if (!r.ok) return { ok: false, message: `Pexels answered ${r.status}.` };
    const j = await r.json();
    return j.videos?.length ? { ok: true, message: 'Connected. Stock footage is on.' } : { ok: true, message: 'Connected.' };
  } catch (e) { return { ok: false, message: e.name === 'AbortError' ? 'Pexels did not answer in time.' : 'Could not reach Pexels. Check your connection.' }; }
  finally { to.done(); }
}
/** Check a Pixabay key and return {ok, message}. */
export async function testPixabayKey(key) {
  if (!key || key.trim().length < 12) return { ok: false, message: 'That does not look like a Pixabay API key.' };
  const to = withTimeout(9000);
  try {
    const r = await fetch(`${PIXABAY}/videos/?key=${encodeURIComponent(key.trim())}&q=nature&per_page=3`, { signal: to.signal });
    if (r.status === 400 || r.status === 401 || r.status === 403) return { ok: false, message: 'Pixabay rejected this key.' };
    if (!r.ok) return { ok: false, message: `Pixabay answered ${r.status}.` };
    return { ok: true, message: 'Connected. Stock footage is on.' };
  } catch (e) { return { ok: false, message: e.name === 'AbortError' ? 'Pixabay did not answer in time.' : 'Could not reach Pixabay. Check your connection.' }; }
  finally { to.done(); }
}

/* ------------------------------------------------------------------------------------------------ search */
const cache = new Map();
const remember = (k, v) => { cache.set(k, v); if (cache.size > 60) cache.delete(cache.keys().next().value); return v; };

/** Closest file to a target short side, preferring ones under the size limit. */
function bestFile(files, target = 720, maxMB = 40) {
  const ok = files.filter((f) => f.url && f.w && f.h);
  if (!ok.length) return null;
  const side = (f) => Math.min(f.w, f.h);
  const small = ok.filter((f) => !f.size || f.size <= maxMB * 1e6);
  const pool = small.length ? small : ok;
  // never go below 480 if something bigger exists; otherwise the closest to the target
  const decent = pool.filter((f) => side(f) >= 480);
  return (decent.length ? decent : pool).sort((a, b) => Math.abs(side(a) - target) - Math.abs(side(b) - target))[0];
}

function fromPexelsVideo(v) {
  const files = (v.video_files || []).filter((f) => f.file_type === 'video/mp4').map((f) => ({ url: f.link, w: f.width, h: f.height }));
  const tiny = files.filter((f) => Math.min(f.w, f.h) <= 540).sort((a, b) => b.w - a.w)[0] || files.sort((a, b) => a.w - b.w)[0];
  return { id: `pexels-v-${v.id}`, provider: 'pexels', kind: 'video', thumb: v.image, w: v.width, h: v.height, dur: v.duration, by: v.user?.name || '', page: v.url, files, preview: tiny?.url || '' };
}
function fromPexelsPhoto(p) {
  return { id: `pexels-p-${p.id}`, provider: 'pexels', kind: 'photo', thumb: p.src?.medium || p.src?.small, w: p.width, h: p.height, dur: 0, by: p.photographer || '', page: p.url, files: [{ url: p.src?.large2x || p.src?.large || p.src?.original, w: Math.min(p.width, 1880), h: Math.round(p.height * Math.min(1, 1880 / p.width)) }], preview: '' };
}
function fromPixabayVideo(v) {
  const files = Object.values(v.videos || {}).filter((f) => f && f.url).map((f) => ({ url: f.url, w: f.width, h: f.height, size: f.size }));
  const t = v.videos?.tiny || v.videos?.small;
  const thumb = v.picture_id ? `https://i.vimeocdn.com/video/${v.picture_id}_640x360.jpg` : '';
  const big = files.sort((a, b) => b.w - a.w)[0];
  return { id: `pixabay-v-${v.id}`, provider: 'pixabay', kind: 'video', thumb, w: big?.w || 1920, h: big?.h || 1080, dur: v.duration, by: v.user || '', page: v.pageURL, files, preview: t?.url || '' };
}
function fromPixabayPhoto(p) {
  return { id: `pixabay-p-${p.id}`, provider: 'pixabay', kind: 'photo', thumb: p.webformatURL, w: p.imageWidth, h: p.imageHeight, dur: 0, by: p.user || '', page: p.pageURL, files: [{ url: p.largeImageURL || p.webformatURL, w: Math.min(p.imageWidth, 1280), h: Math.round(p.imageHeight * Math.min(1, 1280 / p.imageWidth)) }], preview: '' };
}

/**
 * Search stock.
 * @param {{q:string, kind?:'video'|'photo', orientation?:'portrait'|'landscape'|'square'|'any', page?:number, perPage?:number, provider?:'pexels'|'pixabay', keys:{pexels?:string,pixabay?:string}, signal?:AbortSignal}} o
 * @returns {Promise<{items:object[], more:boolean, provider:string}>} items are normalised across providers
 */
export async function searchStock({ q, kind = 'video', orientation = 'any', page = 1, perPage = 16, provider, keys, signal } = {}) {
  const prov = provider && keys?.[provider] ? provider : keys?.pexels ? 'pexels' : keys?.pixabay ? 'pixabay' : null;
  if (!prov) throw new StockError('Add a free Pexels or Pixabay key to search stock footage.', 'nokey');
  const query = String(q || '').trim();
  if (!query) return { items: [], more: false, provider: prov };
  const ck = `${prov}|${kind}|${orientation}|${page}|${perPage}|${query.toLowerCase()}`;
  if (cache.has(ck)) return cache.get(ck);
  const to = withTimeout(11000, signal);
  try {
    let items = [], more = false;
    if (prov === 'pexels') {
      const o = orientation === 'portrait' || orientation === 'landscape' || orientation === 'square' ? `&orientation=${orientation}` : '';
      const url = kind === 'photo'
        ? `${PEXELS}/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}${o}`
        : `${PEXELS}/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}${o}&size=medium`;
      const r = await fetch(url, { headers: { Authorization: keys.pexels }, signal: to.signal });
      if (!r.ok) throw statusError(r, 'pexels');
      const j = await r.json();
      items = kind === 'photo' ? (j.photos || []).map(fromPexelsPhoto) : (j.videos || []).filter((v) => v.duration >= 3).map(fromPexelsVideo);
      more = !!j.next_page;
    } else {
      const key = encodeURIComponent(keys.pixabay);
      if (kind === 'photo') {
        const o = orientation === 'portrait' ? '&orientation=vertical' : orientation === 'landscape' ? '&orientation=horizontal' : '';
        const r = await fetch(`${PIXABAY}/?key=${key}&q=${encodeURIComponent(query)}&image_type=photo&safesearch=true&per_page=${perPage}&page=${page}${o}`, { signal: to.signal });
        if (!r.ok) throw statusError(r, 'pixabay');
        const j = await r.json(); items = (j.hits || []).map(fromPixabayPhoto); more = page * perPage < (j.totalHits || 0);
      } else {
        const r = await fetch(`${PIXABAY}/videos/?key=${key}&q=${encodeURIComponent(query)}&safesearch=true&per_page=${perPage}&page=${page}`, { signal: to.signal });
        if (!r.ok) throw statusError(r, 'pixabay');
        const j = await r.json(); items = (j.hits || []).filter((v) => v.duration >= 3).map(fromPixabayVideo); more = page * perPage < (j.totalHits || 0);
        // Pixabay cannot filter videos by orientation, so put the right shape first.
        if (orientation === 'portrait' || orientation === 'landscape') { const want = (it) => (orientation === 'portrait' ? it.h >= it.w : it.w >= it.h); items = [...items.filter(want), ...items.filter((x) => !want(x))]; }
      }
    }
    return remember(ck, { items, more, provider: prov });
  } catch (e) { throw explain(e, prov); } finally { to.done(); }
}

/* ------------------------------------------------------------------------------------------------ download */
const slug = (s) => String(s || 'clip').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'clip';

/**
 * Download one result as a File, ready for the media library.
 * @param {object} item  from searchStock
 * @param {{label?:string, target?:number, maxMB?:number, onProgress?:(frac:number)=>void, signal?:AbortSignal}} [o]
 */
export async function downloadStock(item, { label = '', target = 720, maxMB = 40, onProgress, signal } = {}) {
  const f = item.kind === 'photo' ? item.files[0] : bestFile(item.files, target, maxMB);
  if (!f?.url) throw new StockError('That clip has no downloadable file.', 'nofile');
  const to = withTimeout(60000, signal);
  try {
    const r = await fetch(f.url, { signal: to.signal });
    if (!r.ok) throw new StockError(`The download failed (${r.status}). Try another clip.`, 'http');
    const total = +r.headers.get('content-length') || f.size || 0;
    if (total && total > maxMB * 1e6) throw new StockError(`That file is ${(total / 1e6).toFixed(0)} MB. Pick a shorter clip.`, 'big');
    let blob;
    if (r.body?.getReader && onProgress) {
      const rd = r.body.getReader(); const parts = []; let got = 0;
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        parts.push(value); got += value.length;
        if (got > maxMB * 1e6) { rd.cancel(); throw new StockError('That file is too large. Pick a shorter clip.', 'big'); }
        if (total) onProgress(Math.min(0.99, got / total));
      }
      blob = new Blob(parts, { type: r.headers.get('content-type') || (item.kind === 'photo' ? 'image/jpeg' : 'video/mp4') });
    } else blob = await r.blob();
    if (!blob.size) throw new StockError('The download came back empty. Try another clip.', 'empty');
    if (blob.size > maxMB * 1e6) throw new StockError('That file is too large. Pick a shorter clip.', 'big');
    onProgress?.(1);
    const type = blob.type && /^(video|image)\//.test(blob.type) ? blob.type : (item.kind === 'photo' ? 'image/jpeg' : 'video/mp4');
    const ext = item.kind === 'photo' ? (type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg') : 'mp4';
    return new File([blob], `${slug(label || item.by || item.provider)}-${item.id}.${ext}`, { type });
  } catch (e) {
    if (e instanceof StockError) throw e;
    if (e?.name === 'AbortError') throw new StockError('The download took too long or was cancelled.', 'timeout');
    throw new StockError('That file could not be downloaded here (the host blocked the request). Try another clip.', 'cors');
  } finally { to.done(); }
}

/* ------------------------------------------------------------------------------------------------ one-call helper */
/**
 * Find and download one short, relevant clip. Returns a File or null.
 * Used by Edit for me and "Fill with stock". Tries each provider that has a key, so a failure on one still gets a clip.
 * @param {string} query
 * @param {{key?:string, keys?:{pexels?:string,pixabay?:string}, portrait?:boolean, maxMB?:number, kind?:'video'|'photo', pick?:number}} [o]
 */
export async function fetchStockFile(query, { key, keys, portrait = true, maxMB = 18, kind = 'video', pick = 0 } = {}) {
  const ks = { pexels: keys?.pexels || key || '', pixabay: keys?.pixabay || '' };
  if (!query || (!ks.pexels && !ks.pixabay)) return null;
  for (const provider of ['pexels', 'pixabay']) {
    if (!ks[provider]) continue;
    try {
      const { items } = await searchStock({ q: query, kind, orientation: portrait ? 'portrait' : 'landscape', perPage: 12, provider, keys: ks });
      const usable = items.filter((it) => kind === 'photo' || it.dur <= 40);
      const order = usable.length ? [...usable.slice(pick % usable.length), ...usable.slice(0, pick % usable.length)] : [];
      for (const it of order.slice(0, 3)) {
        try { return await downloadStock(it, { label: query, maxMB, target: 720 }); } catch { /* try the next one */ }
      }
    } catch { /* try the next provider */ }
  }
  return null;
}
