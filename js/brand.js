// Brand profile: name, handle, colors, font, logo, caption look, music and format defaults.
// Saved on this device. Used by the one-click editor and by templates; the app's accent color can follow it.
import { h, downloadBlob } from './util.js';
import { FONTS, loadFonts } from './textrender.js';
import { icon } from './ui/icons.js';
import { lookPicker } from './ui/looks.js';
import { testKey, testPixabayKey } from './stock.js';
import { MUSIC } from './synth.js';
import { RATIOS } from './model.js';
import { userKey } from './session.js';

const key = () => userKey('brand.v1');
export const DEFAULT_BRAND = () => ({
  name: '', handle: '', cta: 'Follow for more', primary: '#6FF2C6', secondary: '#101418', accent: '#FFD24A', text: '#FFFFFF', font: 'Montserrat',
  logo: null, logoPos: 'top_right', logoSize: 'medium', showHandle: true, apply: true, theme: true,
  outro: false, look: 'Viral Pop', music: 'auto', ratio: '9:16', pexelsKey: '', pixabayKey: '',
});
export const PALETTES = [
  { name: 'Mint', primary: '#6FF2C6', secondary: '#101418', accent: '#FFD24A', text: '#FFFFFF' },
  { name: 'Ocean', primary: '#4D9BFF', secondary: '#0B1624', accent: '#22D3EE', text: '#FFFFFF' },
  { name: 'Royal', primary: '#A393FF', secondary: '#120F24', accent: '#FF5C8A', text: '#FFFFFF' },
  { name: 'Sunset', primary: '#FF7A59', secondary: '#1B1020', accent: '#FFD166', text: '#FFFFFF' },
  { name: 'Rose', primary: '#FF5C8A', secondary: '#1F0E16', accent: '#FFE3EC', text: '#FFFFFF' },
  { name: 'Gold', primary: '#F5C451', secondary: '#14110A', accent: '#FFFFFF', text: '#FFF8E6' },
  { name: 'Forest', primary: '#34D399', secondary: '#08150F', accent: '#FDE68A', text: '#F0FFF8' },
  { name: 'Mono', primary: '#F2F5FA', secondary: '#0B0B0D', accent: '#9AA4B2', text: '#FFFFFF' },
];
const POS = [['top_left', 'Top left'], ['top_right', 'Top right'], ['bottom_left', 'Bottom left'], ['bottom_right', 'Bottom right']];
const GENTLE = ['ambient', 'lofi', 'piano', 'corporate', 'ukulele'];

export function loadBrand() {
  try { return { ...DEFAULT_BRAND(), ...JSON.parse(localStorage.getItem(key()) || '{}') }; } catch { return DEFAULT_BRAND(); }
}
export function saveBrand(b) { try { localStorage.setItem(key(), JSON.stringify(b)); } catch { /* storage full or blocked */ } }
export const isConfigured = (b) => !!(b.name || b.handle || b.logo || b.primary.toLowerCase() !== DEFAULT_BRAND().primary.toLowerCase());
export const fontWeight = (id) => FONTS.find((f) => f.id === id)?.w || 800;

/* ---- colour helpers ---- */
const rgb = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };

/** The app's accent follows the brand color (lightened if it is too dark to read on the dark UI). */
export function applyTheme(b) {
  const st = document.documentElement.style;
  const props = ['--accent', '--accent2', '--accent-ink', '--accent-soft', '--accent-line', '--grad', '--grad-soft', '--ring', '--accent-rgb'];
  if (!b.theme || !isConfigured(b)) { props.forEach((p) => st.removeProperty(p)); return; }
  let c = rgb(b.primary);
  for (let i = 0; i < 12 && lum(c) < 0.18; i++) c = mixc(c, [255, 255, 255], 0.14);
  const a2 = mixc(c, lum(c) > 0.5 ? [95, 208, 255] : [255, 255, 255], 0.3);
  const [r, g, bl] = c.map(Math.round);
  st.setProperty('--accent', hex(c)); st.setProperty('--accent2', hex(a2)); st.setProperty('--accent-rgb', `${r},${g},${bl}`);
  st.setProperty('--accent-ink', lum(c) > 0.34 ? '#07080b' : '#ffffff');
  st.setProperty('--accent-soft', `rgba(${r},${g},${bl},.13)`); st.setProperty('--accent-line', `rgba(${r},${g},${bl},.45)`);
  st.setProperty('--grad', `linear-gradient(135deg,${hex(mixc(c, [255, 255, 255], 0.22))} 0%,${hex(c)} 100%)`);
  st.setProperty('--grad-soft', `linear-gradient(135deg,rgba(${r},${g},${bl},.18),rgba(${r},${g},${bl},.07))`);
  st.setProperty('--ring', `0 0 0 3px rgba(${r},${g},${bl},.3)`);
}

/** Shrink an uploaded logo to a sensible size and keep transparency. Resolves to a PNG data URL. */
export async function logoFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That image could not be read.')); i.src = url; });
    const k = Math.min(1, 512 / Math.max(img.naturalWidth || 512, img.naturalHeight || 512));
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round((img.naturalWidth || 512) * k)); cv.height = Math.max(1, Math.round((img.naturalHeight || 512) * k));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}
export async function logoFile(brand) {
  if (!brand.logo) return null;
  const blob = await (await fetch(brand.logo)).blob();
  return new File([blob], 'logo.png', { type: 'image/png' });
}

/** The phone-shaped live preview used in the profile and the one-click flow. */
export function brandPreview(b, text = 'Make every second count') {
  const words = text.split(' ');
  const hl = Math.min(2, words.length - 1);
  const cap = h('div.bp-cap', { style: { fontFamily: `"${b.font}", sans-serif`, fontWeight: fontWeight(b.font), color: b.text } },
    words.map((w, i) => h('span', { style: i === hl ? { color: b.primary } : {} }, w + ' ')));
  return h('div.bp', { style: { '--bp': b.primary } },
    h('div.bp-scr', b.logo ? h('img.bp-logo.' + b.logoPos.replace('_', '-') + '.' + b.logoSize, { src: b.logo, alt: '' }) : null,
      b.showHandle && b.handle ? h('div.bp-handle', '@' + b.handle.replace(/^@/, '')) : null, cap,
      h('div.bp-card', { style: { background: b.secondary } }, h('b', { style: { fontFamily: `"${b.font}", sans-serif`, fontWeight: fontWeight(b.font), color: b.text } }, (b.name || 'YOUR BRAND').toUpperCase()), h('i', { style: { background: b.primary } }))));
}

/**
 * The profile form. Used as the Brand tab and inside the dialog. Everything saves as you type.
 * Returns { el, preview } where `preview` is the live phone (place it beside or above the form).
 */
export function brandEditor(app, b, { onChange = () => {} } = {}) {
  loadFonts(FONTS);
  const holder = h('div.bp-wrap', brandPreview(b));
  const change = () => { saveBrand(b); applyTheme(b); holder.replaceChildren(brandPreview(b)); looks.redraw(); onChange(b); };

  const text = (key, label, ph, max, help) => h('label.fld', h('span', label), h('input.field', { value: b[key], placeholder: ph, maxLength: max, 'aria-label': label, autocomplete: 'off', on: { input: (e) => { b[key] = e.target.value; change(); } } }), help ? h('small.fhelp', help) : null);
  const toggle = (key, title, desc) => {
    const input = h('input', { type: 'checkbox', checked: !!b[key], on: { change: () => { b[key] = input.checked; change(); } } });
    return h('label.sw', h('div', h('b', title), h('small', desc)), input, h('span.trk'));
  };
  const seg = (items, get, set) => {
    const el = h('div.seg');
    const draw = () => el.replaceChildren(...items.map(([k, l]) => h('button' + (get() === k ? '.on' : ''), { type: 'button', on: { click: () => { set(k); draw(); } } }, l)));
    draw(); return el;
  };
  const section = (ico, title, sub, ...kids) => h('section.bsec', h('div.bsec-h', h('span.ci', icon(ico, 19)), h('div', h('h3', title), sub ? h('p', sub) : null)), ...kids);

  /* ---- colors */
  const colorsEl = h('div.colors');
  const swWrap = h('div.palettes');
  const colorField = (key, label, hint) => {
    const txt = h('input.field.mono', { value: b[key].toUpperCase(), maxLength: 7, 'aria-label': label + ' hex code', spellcheck: false });
    const pick = h('input', { type: 'color', value: b[key], 'aria-label': label });
    const set = (v) => { b[key] = v.toUpperCase(); txt.value = b[key]; pick.value = b[key]; markPal(); change(); };
    pick.addEventListener('input', () => set(pick.value));
    txt.addEventListener('change', () => { let v = txt.value.trim(); if (v && v[0] !== '#') v = '#' + v; if (/^#[0-9a-f]{6}$/i.test(v)) set(v); else { txt.value = b[key]; app.toast('Use a hex color like #A393FF', 'err'); } });
    return h('div.colorf', h('b', label), h('div.cin', pick, txt), h('small', hint));
  };
  const mkColors = () => [colorField('primary', 'Primary', 'Highlights, accents, buttons.'), colorField('secondary', 'Background', 'Caption boxes and cards.'), colorField('accent', 'Accent', 'A second pop of color.'), colorField('text', 'Text', 'Main caption text.')];
  const drawColors = () => colorsEl.replaceChildren(...mkColors());
  const same = (p) => ['primary', 'secondary', 'accent', 'text'].every((k) => b[k].toLowerCase() === p[k].toLowerCase());
  const markPal = () => swWrap.querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', same(PALETTES[i])));
  swWrap.append(...PALETTES.map((p) => h('button.pal', { type: 'button', title: p.name, 'aria-label': p.name + ' palette', on: { click: () => { Object.assign(b, { primary: p.primary, secondary: p.secondary, accent: p.accent, text: p.text }); drawColors(); markPal(); change(); } } },
    h('span.pal-sw', [p.secondary, p.primary, p.accent, p.text].map((c) => h('i', { style: { background: c } }))), h('small', p.name))));
  drawColors(); markPal();

  /* ---- font */
  const fontGrid = h('div.fontpick');
  const drawFonts = () => fontGrid.replaceChildren(...FONTS.map((f) => h('button' + (f.id === b.font ? '.on' : ''), { type: 'button', on: { click: () => { b.font = f.id; drawFonts(); change(); } } },
    h('span.fs', { style: { fontFamily: `"${f.id}", sans-serif`, fontWeight: f.w } }, b.name || 'Your brand'), h('small', f.name))));
  drawFonts();

  /* ---- logo */
  const logoBox = h('div.logo-box');
  const drawLogo = () => {
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', hidden: true, on: { change: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { b.logo = await logoFromFile(f); change(); drawLogo(); } catch (err) { app.toast(err.message, 'err'); }
    } } });
    logoBox.replaceChildren(file,
      h('div.prev', b.logo ? h('img', { src: b.logo, alt: 'Your logo' }) : h('span', 'No logo')),
      h('div.lb', h('div.row', h('button.btn.sm', { type: 'button', on: { click: () => file.click() } }, icon('upload', 15), b.logo ? 'Replace logo' : 'Upload logo'),
        b.logo ? h('button.btn.sm.ghost', { type: 'button', on: { click: () => { b.logo = null; change(); drawLogo(); } } }, 'Remove') : null),
        h('small', 'A PNG with a transparent background looks best.')),
      b.logo ? h('div.lopts',
        h('div', h('b', 'Position'), h('div.posgrid', POS.map(([k, l]) => h('button' + (b.logoPos === k ? '.on' : ''), { type: 'button', title: l, 'aria-label': l, on: { click: () => { b.logoPos = k; change(); drawLogo(); } } })))),
        h('div', h('b', 'Size'), h('div.seg', [['small', 'S'], ['medium', 'M'], ['large', 'L']].map(([k, l]) => h('button' + (b.logoSize === k ? '.on' : ''), { type: 'button', on: { click: () => { b.logoSize = k; change(); drawLogo(); } } }, l))))) : null);
  };
  drawLogo();

  /* ---- video defaults */
  const looks = lookPicker({ brand: b, applyBrand: () => b.apply, get: () => b.look, set: (n) => { b.look = n; saveBrand(b); onChange(b); }, compact: true });
  const musicSel = h('select.field', { 'aria-label': 'Default music', on: { change: (e) => { b.music = e.target.value; change(); } } },
    [['auto', 'Auto-pick'], ...GENTLE.map((id) => [id, MUSIC.find((m) => m.id === id)?.name || id]), ['none', 'No music']].map(([v, l]) => h('option', { value: v, selected: v === b.music }, l)));

  /* ---- stock keys (Pexels and Pixabay) */
  const keyField = (field, label, test) => {
    const msg = h('small.fhelp', '');
    const input = h('input.field.mono', { type: 'password', value: b[field] || '', placeholder: `Paste your ${label} API key`, autocomplete: 'off', spellcheck: false, 'aria-label': `${label} API key`, on: { input: (e) => { b[field] = e.target.value.trim(); saveBrand(b); msg.textContent = ''; } } });
    const btn = h('button.btn.sm', { type: 'button', on: { click: async () => {
      btn.disabled = true; msg.className = 'fhelp'; msg.textContent = 'Checking…';
      const r = await test(b[field]); msg.textContent = r.message; msg.className = 'fhelp ' + (r.ok ? 'ok' : 'bad'); btn.disabled = false;
    } } }, 'Test key');
    return { input, msg, row: h('div.fld', h('span', label), h('div.keyrow', input, btn), msg) };
  };
  const pexKey = keyField('pexelsKey', 'Pexels', testKey), pixKey = keyField('pixabayKey', 'Pixabay', testPixabayKey);

  /* ---- backup */
  const restoreIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, on: { change: async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const j = JSON.parse(await f.text()); if (typeof j !== 'object' || !j) throw new Error('bad'); Object.assign(b, DEFAULT_BRAND(), j); change(); redrawAll(); app.toast('Brand restored', 'ok'); }
    catch { app.toast('That file is not an EDEN brand backup', 'err'); }
  } } });
  const redrawAll = () => { pexKey.input.value = b.pexelsKey || ''; pixKey.input.value = b.pixabayKey || ''; drawColors(); markPal(); drawFonts(); drawLogo(); root.querySelectorAll('input.field').forEach((i) => { const k = i.getAttribute('data-k'); if (k) i.value = b[k]; }); app.refreshBrandView?.(); };

  const root = h('div.bform',
    restoreIn,
    section('user', 'Identity', 'How your name shows up on videos.',
      h('div.two', text('name', 'Brand name', 'e.g. Eden Studio', 60), text('handle', 'Handle', '@yourhandle', 40)),
      text('cta', 'Call to action', 'Follow for more', 48, 'Shown on the end card, under your handle.'),
      toggle('showHandle', 'Show my handle on videos', 'A small, tidy watermark in the corner.')),
    section('palette', 'Colors', 'Pick a palette, or set your own.', swWrap, colorsEl),
    section('text', 'Font', 'Used for captions, titles and cards.', fontGrid),
    section('media', 'Logo', 'Placed in the safe area of your videos.', logoBox),
    section('magic', 'Video defaults', 'Used by Edit for me and templates unless you change them there.',
      h('div.fld', h('span', 'Caption look'), looks),
      h('div.row2', h('div.fld', h('span', 'Background music'), musicSel), h('div.fld', h('span', 'Default format'), seg(RATIOS.slice(0, 4).map((r) => [r.id, r.name]), () => b.ratio, (v) => { b.ratio = v; saveBrand(b); onChange(b); }))),
      toggle('apply', 'Apply my brand automatically', 'Tints captions and cards with your colors and adds your handle and logo.'),
      toggle('outro', 'Add an end card', 'A short branded card at the end with your name and call to action.'),
      toggle('theme', 'Use my primary color in the app', 'Changes the accent color of buttons and highlights.')),
    section('broll', 'Stock footage (optional)', 'Real, photographic clips and photos for b-roll, templates and Edit for me. Free with a Pexels or Pixabay key.',
      pexKey.row, pixKey.row,
      h('p.fine', 'Get a free key at ', h('a', { href: 'https://www.pexels.com/api/', target: '_blank', rel: 'noopener' }, 'pexels.com/api'), ' or ', h('a', { href: 'https://pixabay.com/api/docs/', target: '_blank', rel: 'noopener' }, 'pixabay.com/api/docs'), '. Keys stay in this browser and are only sent to the site they belong to. You need just one. Without one, the animated scenes work with no internet.')),
    section('download', 'Back up', 'Your brand lives in this browser. Save a copy to keep it safe or move it to another device.',
      h('div.row', h('button.btn.sm', { type: 'button', on: { click: () => downloadBlob(new Blob([JSON.stringify({ ...b, pexelsKey: '', pixabayKey: '' }, null, 2)], { type: 'application/json' }), 'eden-brand.json') } }, icon('download', 15), 'Download backup'),
        h('button.btn.sm', { type: 'button', on: { click: () => restoreIn.click() } }, icon('upload', 15), 'Restore from file'),
        h('button.btn.sm.ghost.danger', { type: 'button', on: { click: () => app.modal({ title: 'Reset your brand?', lead: 'Name, colors, font and logo go back to the defaults.', actions: [{ label: 'Cancel', ghost: true }, { label: 'Reset', primary: true, danger: true, onClick: () => { Object.assign(b, DEFAULT_BRAND()); change(); redrawAll(); } }] }) } }, 'Reset'))));

  // keep text inputs in sync after a restore/reset
  root.querySelectorAll('.fld input.field').forEach((i, n) => { i.setAttribute('data-k', ['name', 'handle', 'cta'][n] || ''); });
  return { el: root, preview: holder };
}

/** Open the profile editor in a dialog (used from inside Edit for me). */
export function brandDialog(app, onClose = () => {}) {
  const b = loadBrand();
  const ed = brandEditor(app, b);
  const body = h('div.brand-dlg', h('div.bd-main', ed.el), h('aside.bd-prev', ed.preview, h('small', 'Live preview')));
  const m = app.modal({ title: 'Your brand', lead: 'Set this up once. Everything saves automatically.', body, wide: true, onClose: () => onClose(b), actions: [{ label: 'Done', primary: true }] });
  m.box.classList.add('brandbox');
  return m;
}
