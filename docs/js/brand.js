// Brand profile: name, handle, colors, font and logo. Saved on this device and used by the one-click editor.
import { h } from './util.js';
import { FONTS, loadFonts } from './textrender.js';
import { icon } from './ui/icons.js';

const KEY = 'eden.brand.v1';
export const DEFAULT_BRAND = () => ({
  name: '', handle: '', primary: '#6FF2C6', secondary: '#101418', text: '#FFFFFF', font: 'Montserrat',
  logo: null, logoPos: 'top_right', logoSize: 'medium', showHandle: true, apply: true, theme: true,
});
const SWATCHES = ['#6FF2C6', '#A393FF', '#FF5C8A', '#FFB020', '#4D9BFF', '#22D3EE', '#FF7A2F', '#EF4444', '#A3E635', '#F2F5FA'];
const POS = [['top_left', 'Top left'], ['top_right', 'Top right'], ['bottom_left', 'Bottom left'], ['bottom_right', 'Bottom right']];

export function loadBrand() {
  try { return { ...DEFAULT_BRAND(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return DEFAULT_BRAND(); }
}
export function saveBrand(b) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* storage full or blocked */ } }
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
  const props = ['--accent', '--accent2', '--accent-ink', '--accent-soft', '--accent-line', '--grad', '--grad-soft', '--ring'];
  if (!b.theme || !isConfigured(b)) { props.forEach((p) => st.removeProperty(p)); return; }
  let c = rgb(b.primary);
  for (let i = 0; i < 12 && lum(c) < 0.18; i++) c = mixc(c, [255, 255, 255], 0.14);
  const a2 = mixc(c, lum(c) > 0.5 ? [95, 208, 255] : [255, 255, 255], 0.3);
  const [r, g, bl] = c.map(Math.round);
  st.setProperty('--accent', hex(c)); st.setProperty('--accent2', hex(a2));
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
    const k = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}
export async function logoFile(brand) {
  if (!brand.logo) return null;
  const blob = await (await fetch(brand.logo)).blob();
  return new File([blob], 'logo.png', { type: 'image/png' });
}

/** The phone-shaped live preview used in the profile and the one-click dialog. */
export function brandPreview(b, text = 'Make every second count') {
  const words = text.split(' ');
  const hl = Math.min(2, words.length - 1);
  const cap = h('div.bp-cap', { style: { fontFamily: `"${b.font}", sans-serif`, fontWeight: fontWeight(b.font), color: b.text } },
    words.map((w, i) => h('span', { style: i === hl ? { color: b.primary } : {} }, w + ' ')));
  return h('div.bp', { style: { '--bp': b.primary } },
    h('div.bp-scr', b.logo ? h('img.bp-logo.' + b.logoPos.replace('_', '-') + '.' + b.logoSize, { src: b.logo, alt: '' }) : null,
      b.showHandle && b.handle ? h('div.bp-handle', '@' + b.handle.replace(/^@/, '')) : null, cap,
      h('div.bp-card', { style: { background: b.secondary } }, h('b', { style: { fontFamily: `"${b.font}", sans-serif`, fontWeight: fontWeight(b.font) } }, (b.name || 'YOUR BRAND').toUpperCase()), h('i', { style: { background: b.primary } }))));
}

/** Open the profile editor. Everything saves as you type. */
export function brandDialog(app, onClose = () => {}) {
  const b = loadBrand();
  loadFonts(FONTS);
  let preview = brandPreview(b);
  const holder = h('div.bp-wrap', preview);
  const redraw = () => { const n = brandPreview(b); holder.replaceChildren(n); preview = n; };
  const change = () => { saveBrand(b); applyTheme(b); redraw(); };

  const text = (key, label, ph, max) => h('label.fld', h('span', label), h('input.field', { value: b[key], placeholder: ph, maxLength: max, 'aria-label': label, on: { input: (e) => { b[key] = e.target.value; change(); } } }));
  const colorField = (key, label, hint) => {
    const txt = h('input.field.mono', { value: b[key].toUpperCase(), maxLength: 7, 'aria-label': label + ' hex code', spellcheck: false });
    const pick = h('input', { type: 'color', value: b[key], 'aria-label': label });
    const set = (v) => { b[key] = v.toUpperCase(); txt.value = b[key]; pick.value = b[key]; if (key === 'primary') markSw(); change(); };
    pick.addEventListener('input', () => set(pick.value));
    txt.addEventListener('change', () => { let v = txt.value.trim(); if (v && v[0] !== '#') v = '#' + v; if (/^#[0-9a-f]{6}$/i.test(v)) set(v); else { txt.value = b[key]; app.toast('Use a hex color like #A393FF', 'err'); } });
    return h('div.colorf', h('b', label), h('div.cin', pick, txt), h('small', hint));
  };
  const swWrap = h('div.swatches', SWATCHES.map((c) => h('button', { style: { background: c }, 'data-c': c, title: c, on: { click: () => { b.primary = c; applyAll(); } } })));
  const markSw = () => swWrap.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.c.toLowerCase() === b.primary.toLowerCase()));
  let colorsEl;
  const applyAll = () => { colorsEl.replaceChildren(...mkColors()); markSw(); change(); };
  const mkColors = () => [colorField('primary', 'Primary', 'Highlights, accents and keyword cards.'), colorField('secondary', 'Background', 'Caption boxes and card backgrounds.'), colorField('text', 'Text', 'Main caption text.')];
  colorsEl = h('div.colors', mkColors());
  markSw();

  const fontGrid = h('div.fontpick');
  const drawFonts = () => fontGrid.replaceChildren(...FONTS.map((f) => h('button' + (f.id === b.font ? '.on' : ''), { on: { click: () => { b.font = f.id; drawFonts(); change(); } } },
    h('span.fs', { style: { fontFamily: `"${f.id}", sans-serif`, fontWeight: f.w } }, b.name || 'Your brand'), h('small', f.name))));
  drawFonts();

  const logoBox = h('div.logo-box');
  const drawLogo = () => {
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', hidden: true, on: { change: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { b.logo = await logoFromFile(f); change(); drawLogo(); } catch (err) { app.toast(err.message, 'err'); }
    } } });
    logoBox.replaceChildren(file,
      h('div.prev', b.logo ? h('img', { src: b.logo, alt: 'Your logo' }) : h('span', 'No logo')),
      h('div.lb', h('div.row', h('button.btn.sm', { on: { click: () => file.click() } }, icon('upload', 15), b.logo ? 'Replace logo' : 'Upload logo'),
        b.logo ? h('button.btn.sm.ghost', { on: { click: () => { b.logo = null; change(); drawLogo(); } } }, 'Remove') : null),
        h('small', 'A PNG with a transparent background looks best.')),
      b.logo ? h('div.lopts',
        h('div', h('b', 'Position'), h('div.posgrid', POS.map(([k, l]) => h('button' + (b.logoPos === k ? '.on' : ''), { title: l, 'data-pos': k, on: { click: () => { b.logoPos = k; change(); drawLogo(); } } })))),
        h('div', h('b', 'Size'), h('div.seg', [['small', 'S'], ['medium', 'M'], ['large', 'L']].map(([k, l]) => h('button' + (b.logoSize === k ? '.on' : ''), { on: { click: () => { b.logoSize = k; change(); drawLogo(); } } }, l))))) : null);
  };
  drawLogo();

  const toggle = (key, title, desc) => {
    const input = h('input', { type: 'checkbox', checked: !!b[key], on: { change: () => { b[key] = input.checked; change(); } } });
    return h('label.sw', h('div', h('b', title), h('small', desc)), input, h('span.trk'));
  };

  const body = h('div.brand-dlg',
    h('div.bd-main',
      h('section', h('h4', 'Identity'), h('div.two', text('name', 'Brand name', 'e.g. Eden Studio', 60), text('handle', 'Handle', '@yourhandle', 40)),
        toggle('showHandle', 'Show my handle on videos', 'A small, tidy watermark in the corner.')),
      h('section', h('h4', 'Colors'), colorsEl, swWrap),
      h('section', h('h4', 'Font'), fontGrid),
      h('section', h('h4', 'Logo'), logoBox),
      h('section', h('h4', 'How Eden uses it'),
        toggle('apply', 'Apply my brand to every one-click edit', 'Tints captions and cards with your colors and adds your handle and logo.'),
        toggle('theme', 'Use my primary color in the app', 'Changes the accent color of buttons and highlights.'))),
    h('aside.bd-prev', holder, h('small', 'Live preview')));
  const m = app.modal({ title: 'Your brand', lead: 'Set this up once. Everything saves automatically and is used by the one-click editor.', body, wide: true, onClose: () => onClose(b), actions: [{ label: 'Done', primary: true }] });
  m.box.classList.add('brandbox');
  return m;
}
