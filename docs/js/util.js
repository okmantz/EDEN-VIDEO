// Small shared helpers.
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const deep = (o) => JSON.parse(JSON.stringify(o));
export const round = (v, n = 3) => { const k = 10 ** n; return Math.round(v * k) / k; };

export function fmtTime(s, frames = false, fps = 30) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const base = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  if (frames) return `${base}:${String(Math.floor((s % 1) * fps)).padStart(2, '0')}`;
  return base;
}
export function fmtDur(s) {
  if (s >= 60) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${s.toFixed(1)}s`;
}
export function fmtBytes(n) {
  if (n > 1e9) return (n / 1e9).toFixed(2) + ' GB';
  if (n > 1e6) return (n / 1e6).toFixed(1) + ' MB';
  return Math.round(n / 1e3) + ' KB';
}

export function hexToRgb(hex) {
  let h = (hex || '#000000').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// DOM builder: h('div.cls#id', {attrs, on:{click}}, ...children)
export function h(tag, props, ...kids) {
  const m = /^([a-z0-9-]+)((?:[.#][\w-]+)*)$/i.exec(tag);
  const el = document.createElement(m ? m[1] : tag);
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (props != null && (props.nodeType || typeof props === 'string' || typeof props === 'number' || Array.isArray(props))) { kids.unshift(props); props = null; }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'class') el.className += ' ' + v;
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && k !== 'list' && k !== 'type' && !k.startsWith('aria') && !k.startsWith('data')) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  if (props && props.title && el.tagName === 'BUTTON' && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', props.title);
  const add = (k) => {
    if (k == null || k === false) return;
    if (Array.isArray(k)) k.forEach(add);
    else el.append(k.nodeType ? k : document.createTextNode(String(k)));
  };
  kids.forEach(add);
  return el;
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

export class Emitter {
  constructor() { this._l = {}; }
  on(ev, fn) { (this._l[ev] ||= new Set()).add(fn); return () => this._l[ev].delete(fn); }
  emit(ev, ...a) { this._l[ev]?.forEach((fn) => { try { fn(...a); } catch (e) { console.error(e); } }); }
}

export const EASE = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  inout: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  hold: (t) => (t < 1 ? 0 : 1),
  spring: (t) => 1 - Math.cos(t * Math.PI * 4.5) * Math.exp(-t * 6),
};

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
export const isMobile = () => matchMedia('(max-width: 860px), (pointer: coarse) and (max-width: 1100px)').matches;

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

export function safeName(s) { return (s || 'video').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'video'; }
