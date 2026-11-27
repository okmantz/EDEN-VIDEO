// Shared UI helpers: escaping, icons, formatting, toasts, dialogs.

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  create: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M12 9v6M9 12h6"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 14.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16"/>',
  play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 18v.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/><path d="M9 7V4.5A.5.5 0 0 1 9.5 4h5a.5.5 0 0 1 .5.5V7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  alert: '<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
  scissors: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5 20 18M8 15.5 20 6"/>',
  captions: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M8 11.5h2M8 14.5h5M14 11.5h2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sparkle: '<path d="M12 3.5 14 10l6.5 2-6.5 2-2 6.5L10 14l-6.5-2L10 10l2-6.5Z"/>',
  music: '<path d="M9 18V6l10-2v11"/><circle cx="7" cy="18" r="2.5"/><circle cx="17" cy="15" r="2.5"/>',
  volume: '<path d="M4 10v4h3l4 4V6l-4 4H4Z"/><path d="M15.5 9.5a4 4 0 0 1 0 5M18 7a7.5 7.5 0 0 1 0 10"/>',
  wand: '<path d="m4 20 11-11"/><path d="m14 5 1-2 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"/><path d="M19 12l.6 1.4L21 14l-1.4.6L19 16l-.6-1.4L17 14l1.4-.6L19 12Z"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1-.9-1.4-.9-2.4 0-.9.7-1.6 1.7-1.6H17a4 4 0 0 0 4-4c0-4.2-4-8.3-9-8.3Z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7.5" r="1.2"/><circle cx="15" cy="7.8" r="1.2"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
  badge: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.3 2.3 4.7-5"/>',
  brand: '<path d="M12 3 4 7v5c0 4.5 3.3 7.8 8 9 4.7-1.2 8-4.5 8-9V7l-8-4Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
};
export function icon(name, extra = '') {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${ICONS[name] || ''}</svg>`;
}

export function fmtDur(s) {
  s = Math.max(0, Math.round(Number(s) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
export function fmtSize(b) {
  b = Number(b) || 0;
  if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB';
  if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB';
  return Math.max(1, Math.round(b / 1e3)) + ' KB';
}
export function timeAgo(ts) {
  const d = Math.max(0, Date.now() / 1000 - ts);
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  const days = Math.floor(d / 86400);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
export function plural(n, one, many) { return `${n} ${n === 1 ? one : (many || one + 's')}`; }
export const debounce = (fn, ms = 400) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'err' ? ' err' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? 7000 : 3500);
}

export function openModal(html, { narrow = false, onClose } = {}) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="modal${narrow ? ' narrow' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  const previous = document.activeElement;
  const close = () => {
    document.removeEventListener('keydown', onKey);
    scrim.remove();
    previous?.focus?.();
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(scrim);
  $$('[data-close]', scrim).forEach((b) => b.addEventListener('click', close));
  const first = $('button, [href], input', scrim.querySelector('.modal'));
  first?.focus();
  return { el: scrim, close };
}

export function confirmDialog({ title, body, confirm = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    const m = openModal(`
      <h3 class="h-sec" style="font-size:19px">${esc(title)}</h3>
      <p class="muted">${esc(body)}</p>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn ghost" data-close>Cancel</button>
        <button class="btn ${danger ? 'danger' : ''}" id="cfm">${esc(confirm)}</button>
      </div>`, { narrow: true, onClose: () => resolve(false) });
    $('#cfm', m.el).addEventListener('click', () => { resolve(true); m.close(); });
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch {
    toast('Copy failed. Select the text and copy it manually.', 'err');
  }
}


/* ---------------------------------------------------------------- brand theme
   The interface accent follows the brand colour, nudged so text stays readable on both themes. */
const hex2rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const toHex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

export function applyTheme(settings) {
  const root = document.documentElement;
  const light = root.dataset.theme === 'light';
  let rgb = settings && settings.brand_theme !== false ? hex2rgb(settings.brand_color) : null;
  rgb = rgb || hex2rgb('#2EE6A6');
  for (let i = 0; i < 12 && !light && luminance(rgb) < 0.2; i++) rgb = mix(rgb, [255, 255, 255], 0.14);
  for (let i = 0; i < 12 && light && luminance(rgb) > 0.32; i++) rgb = mix(rgb, [0, 0, 0], 0.14);
  const ink = luminance(rgb) > 0.36 ? '#0a0c11' : '#ffffff';
  root.style.setProperty('--accent', toHex(rgb));
  root.style.setProperty('--accent-hi', toHex(mix(rgb, light ? [0, 0, 0] : [255, 255, 255], 0.18)));
  root.style.setProperty('--accent-ink', ink);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = light ? '#f5f6f9' : '#0a0c11';
}
export function initTheme() {
  let t = 'dark';
  try { t = localStorage.getItem('eden.theme') || 'dark'; } catch { /* ignore */ }
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme = t;
}
export function toggleTheme(settings) {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('eden.theme', next); } catch { /* ignore */ }
  applyTheme(settings);
  return next;
}

/* Remembered choices for the one-click editor. */
export const prefs = {
  get() { try { return JSON.parse(localStorage.getItem('eden.prefs') || '{}'); } catch { return {}; } },
  set(patch) { try { localStorage.setItem('eden.prefs', JSON.stringify({ ...prefs.get(), ...patch })); } catch { /* ignore */ } },
};
