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
