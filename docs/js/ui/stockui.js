// Stock footage browser: the "Real footage" tab in the editor's B-roll panel, and the picker that opens from a template slot.
// Search is by hand-tuned categories (city skyline, money, offices, nature...) or any words. Clips download on tap and go
// straight into the media library, so everything after that works like footage the person filmed.
import { h, fmtDur } from '../util.js';
import { icon } from './icons.js';
import { loadBrand, saveBrand } from '../brand.js';
import { STOCK_CATS } from '../stock-catalog.js';
import { PROVIDERS, keysOf, providersFor, searchStock, downloadStock, testKey, testPixabayKey } from '../stock.js';

// Remembered while the app is open, so the panel comes back where the person left it.
const S = { kind: 'video', cat: 'city', sub: 0, free: '', provider: 'auto' };
const canHover = typeof matchMedia === 'function' && matchMedia('(hover:hover) and (pointer:fine)').matches;

/** Shown until a key is saved. Explains what it is, links to the free sign-up, and checks the key before saving it. */
function setupCard(app, done) {
  const box = h('div.stock-setup');
  const block = (id, test, placeholder, field) => {
    const msg = h('small.fhelp', '');
    const input = h('input.field.mono', { type: 'password', placeholder, autocomplete: 'off', spellcheck: false, 'aria-label': `${PROVIDERS[id].name} API key` });
    const btn = h('button.btn.sm.primary', { type: 'button', on: { click: async () => {
      const v = input.value.trim(); if (!v) { msg.className = 'fhelp bad'; msg.textContent = 'Paste your key first.'; return; }
      btn.disabled = true; msg.className = 'fhelp'; msg.textContent = 'Checking…';
      const r = await test(v);
      msg.className = 'fhelp ' + (r.ok ? 'ok' : 'bad'); msg.textContent = r.message; btn.disabled = false;
      if (r.ok) { const b = loadBrand(); b[field] = v; saveBrand(b); app.toast(`${PROVIDERS[id].name} connected`, 'ok'); done(); }
    } } }, 'Connect');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
    return h('div.sk-prov', h('div.sk-ph', h('b', PROVIDERS[id].name), h('a', { href: PROVIDERS[id].keyUrl, target: '_blank', rel: 'noopener' }, 'Get a free key')), h('div.keyrow', input, btn), msg);
  };
  box.append(
    h('div.sk-ic', icon('film', 26)),
    h('h4', 'Real footage, one free key away'),
    h('p', 'Photographic clips and photos: city skylines, cash, offices, cars, nature and more. Pexels and Pixabay both give a key for free in about a minute. It stays in this browser and is only sent to them.'),
    block('pexels', testKey, 'Pexels API key', 'pexelsKey'),
    block('pixabay', testPixabayKey, 'Pixabay API key', 'pixabayKey'),
    h('p.fine', 'Prefer to skip it? The Animated tab has realistic scenes that need nothing.'));
  return box;
}

/**
 * @param {object} app
 * @param {{cols?:string, orient?:()=>('portrait'|'landscape'|'square'|'any'), onPick:(file:File, item:object)=>Promise<void>}} o
 * @returns {HTMLElement} the browser; `.destroy()` stops any search in flight
 */
export function stockBrowser(app, { cols = 'g2', orient = () => 'any', onPick } = {}) {
  const root = h('div.stock');
  let ctl = null, items = [], page = 1, more = false, loading = false, error = '', ticket = 0, busy = false;

  const provider = () => { const have = providersFor(loadBrand()); return S.provider !== 'auto' && have.includes(S.provider) ? S.provider : have[0]; };
  const query = () => S.free || STOCK_CATS.find((c) => c.id === S.cat)?.queries[S.sub] || STOCK_CATS[0].queries[0];

  async function run(reset) {
    ctl?.abort(); ctl = new AbortController();
    const mine = ++ticket;
    if (reset) { items = []; page = 1; more = false; }
    loading = true; error = ''; drawResults();
    try {
      const r = await searchStock({ q: query(), kind: S.kind, orientation: orient(), page, provider: provider(), keys: keysOf(loadBrand()), signal: ctl.signal });
      if (mine !== ticket) return;
      items = reset ? r.items : [...items, ...r.items]; more = r.more;
    } catch (e) { if (mine !== ticket) return; error = e.message || 'Search failed.'; }
    loading = false; drawResults();
  }

  const grid = h('div.grid.' + cols + '.sk-grid');
  const foot = h('div.sk-foot');
  const note = h('div.sk-note');

  function card(it) {
    const wide = it.w > it.h * 1.15;
    const im = h('div.im.sk-im' + (wide ? '.wide' : ''), { style: it.thumb ? { backgroundImage: `url("${it.thumb}")` } : {} });
    const bar = h('i'); const prog = h('div.sk-prog', bar);
    const c = h('button.card.sk', { type: 'button', title: `${it.by ? 'By ' + it.by + ' · ' : ''}${PROVIDERS[it.provider].name}`, on: { click: () => choose(it, c, bar) } },
      im, it.kind === 'video' ? h('span.tag', fmtDur(it.dur || 0)) : h('span.tag', 'PHOTO'), h('span.add', icon('plus', 15)), prog);
    if (canHover && it.kind === 'video' && it.preview) {
      let v = null;
      c.addEventListener('pointerenter', () => { if (v) return; v = h('video.sk-pv', { src: it.preview, muted: true, loop: true, playsInline: true, autoplay: true, preload: 'none' }); v.muted = true; im.append(v); v.play?.().catch(() => {}); });
      c.addEventListener('pointerleave', () => { v?.remove(); v = null; });
    }
    return c;
  }

  async function choose(it, c, bar) {
    if (busy) { app.toast('One clip at a time. Hang on a second.'); return; }
    busy = true; c.classList.add('busy'); bar.style.width = '6%';
    try {
      const file = await downloadStock(it, { label: query(), maxMB: it.kind === 'photo' ? 25 : 45, onProgress: (f) => { bar.style.width = Math.max(6, f * 92) + '%'; } });
      bar.style.width = '96%';
      await onPick(file, it);
      c.classList.add('done');
    } catch (e) { app.toast(e.message || 'Could not add that one', 'err', 5000); }
    finally { busy = false; c.classList.remove('busy'); bar.style.width = '0'; }
  }

  function drawResults() {
    grid.replaceChildren(...items.map(card));
    foot.replaceChildren();
    if (loading) foot.append(h('div.sk-load', h('i'), h('span', items.length ? 'Loading more…' : 'Searching…')));
    else if (error) foot.append(h('div.sk-err', icon('info', 16), h('span', error), error.includes('key') ? h('button.btn.sm', { type: 'button', on: { click: () => { drawMain(true); } } }, 'Change key') : h('button.btn.sm', { type: 'button', on: { click: () => run(!items.length) } }, 'Retry')));
    else if (!items.length) foot.append(h('div.noresult', `Nothing found for “${query()}”. Try other words.`));
    else if (more) foot.append(h('button.btn.sm.sk-more', { type: 'button', on: { click: () => { page++; run(false); } } }, 'Show more'));
    const p = PROVIDERS[provider()];
    note.replaceChildren(p ? h('span', `${S.kind === 'video' ? 'Videos' : 'Photos'} from `, h('a', { href: p.home, target: '_blank', rel: 'noopener' }, p.name), '. Free to use.') : '');
  }

  function drawMain(forceSetup = false) {
    ticket++; ctl?.abort();
    if (forceSetup || !providersFor(loadBrand()).length) { root.replaceChildren(setupCard(app, () => drawMain())); return; }
    const have = providersFor(loadBrand());
    const kindSeg = h('div.seg', ...[['video', 'Videos'], ['photo', 'Photos']].map(([id, n]) => h('button' + (S.kind === id ? '.on' : ''), { type: 'button', on: { click: () => { if (S.kind === id) return; S.kind = id; drawMain(); } } }, n)));
    const provSeg = have.length > 1 ? h('div.seg.sk-prov-seg', ...have.map((id) => h('button' + (provider() === id ? '.on' : ''), { type: 'button', on: { click: () => { S.provider = id; drawMain(); } } }, PROVIDERS[id].name))) : null;
    const input = h('input', { type: 'search', placeholder: 'Search any footage', value: S.free, autocomplete: 'off', autocapitalize: 'off', spellcheck: false, enterkeyhint: 'search', 'aria-label': 'Search stock footage' });
    const submit = () => { S.free = input.value.trim(); drawChips(); run(true); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); input.blur(); } });
    input.addEventListener('input', () => { if (!input.value) { if (S.free) { S.free = ''; drawChips(); run(true); } } });
    const search = h('div.search', icon('search', 16), input);
    const cats = h('div.chips'), subs = h('div.chips.sub');
    function drawChips() {
      cats.replaceChildren(...STOCK_CATS.map((c) => h('button.chip' + (!S.free && S.cat === c.id ? '.on' : ''), { type: 'button', on: { click: () => { S.cat = c.id; S.sub = 0; S.free = ''; input.value = ''; drawChips(); run(true); } } }, c.name)));
      const cat = STOCK_CATS.find((c) => c.id === S.cat);
      subs.replaceChildren(...(S.free ? [] : cat.queries.map((q, i) => h('button.chip.sm' + (S.sub === i ? '.on' : ''), { type: 'button', on: { click: () => { S.sub = i; drawChips(); run(true); } } }, q))));
      subs.hidden = !!S.free;
    }
    drawChips();
    root.replaceChildren(h('div.hint', 'Real, photographic footage. Tap one to add it to your project.'), h('div.sk-ctl', kindSeg, provSeg), search, cats, subs, grid, foot, note,
      h('button.sk-keys', { type: 'button', on: { click: () => drawMain(true) } }, 'Change keys'));
    run(true);
  }

  drawMain();
  root.destroy = () => { ticket++; ctl?.abort(); };
  return root;
}

/** A modal version, used from a template slot. Calls onPick(file) and closes when a clip is chosen. */
export function openStockPicker(app, { title = 'Stock footage', orient = () => 'any', onPick }) {
  let dlg = null;
  const br = stockBrowser(app, { cols: 'g3', orient, onPick: async (file, it) => { await onPick(file, it); dlg?.close(); } });
  dlg = app.modal({ title, body: br, wide: true, actions: [{ label: 'Close', ghost: true }], onClose: () => br.destroy?.() });
  dlg.box.classList.add('stockmodal');
  return dlg;
}
