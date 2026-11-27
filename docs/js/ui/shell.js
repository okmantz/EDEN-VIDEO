// The tabbed shell: Home · Templates · Projects · Brand. Sidebar on desktop, tab bar on phones.
import { h, fmtDur, fmtBytes } from '../util.js';
import { icon, logoMark } from './icons.js';
import { loadBrand, isConfigured, brandEditor } from '../brand.js';
import { Storage } from '../media.js';
import { RATIOS } from '../model.js';
import { oneClickDialog } from '../oneclick.js';
import { TEMPLATES, CATEGORIES, buildTemplate, templateDuration, templateClipSlots, brandPalette } from '../templates.js';
import { logoFile } from '../brand.js';
import { lazyPoster, LivePreview } from '../tplpreview.js';
import { builtinMedia } from '../audio.js';

const $ = (id) => document.getElementById(id);
const MEDIA = 'video/*,image/*,.mp4,.mov,.m4v,.webm,.jpg,.jpeg,.png,.webp,.heic';
const TABS = [['home', 'Home', 'home'], ['templates', 'Templates', 'templates'], ['projects', 'Projects', 'folder'], ['brand', 'Brand', 'palette']];

const ago = (t) => {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago';
  const d = Math.round(s / 86400); return d < 8 ? d + ' d ago' : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const isVideo = (f) => f && (f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(f.name));
const pickFile = (accept, multiple, cb) => {
  const i = h('input', { type: 'file', accept, multiple, hidden: true, on: { change: () => { const fs = [...i.files]; i.remove(); if (fs.length) cb(fs); } } });
  document.body.append(i); i.click();
};

/* ======================================================================================================== shell */
export async function showShell(app, tab) {
  if (app.engine) app.engine.pause();
  fillPrev?.destroy(); fillPrev = null; liveCards.clear();
  document.title = 'EDEN Studio';
  tab = TABS.some((t) => t[0] === tab) ? tab : 'home';
  app.shellTab = tab;
  const home = $('home'); $('editor').hidden = true; home.hidden = false;
  home.className = 'shell-root';

  const go = (t) => { history.replaceState(null, '', location.pathname + location.search); showShell(app, t); };
  app.refreshBrandView = () => { if (app.shellTab === 'brand') showShell(app, 'brand'); };

  const side = h('aside.side', h('div.brand', logoMark(34), h('div', h('b', 'EDEN'), h('span', 'STUDIO'))),
    h('button.btn.primary.lg.sidecta', { on: { click: () => createSheet(app) } }, icon('plus', 19), 'Create'),
    h('nav', TABS.map(([k, l, ic]) => h('button.nav' + (k === tab ? '.on' : ''), { on: { click: () => go(k) }, 'aria-current': k === tab ? 'page' : null }, icon(ic, 19), h('span', l)))),
    h('div.sp'), h('button.nav.small', { on: { click: () => app.helpDialog() } }, icon('help', 18), h('span', 'Help')),
    h('button.nav.small.inst', { hidden: true, on: { click: () => app.install() } }, icon('download', 18), h('span', 'Install app')));
  const bar = h('nav.tabbar', { 'aria-label': 'Main' }, ...TABS.slice(0, 2).map(tabBtn), h('button.create', { 'aria-label': 'Create', on: { click: () => createSheet(app) } }, icon('plus', 24)), ...TABS.slice(2).map(tabBtn));
  function tabBtn([k, l, ic]) { return h('button.tab' + (k === tab ? '.on' : ''), { on: { click: () => go(k) }, 'aria-current': k === tab ? 'page' : null }, icon(ic, 21), h('span', l)); }

  const main = h('main.main', { id: 'shellMain' });
  home.replaceChildren(side, main, bar);
  app.installBtn = side.querySelector('.inst');
  app.updateInstallUI();

  const view = { home: viewHome, templates: viewTemplates, projects: viewProjects, brand: viewBrand }[tab];
  main.append(await view(app, go));
  main.scrollTop = 0;
}

/** The "Create" sheet: every way to start, in one place. */
export function createSheet(app) {
  let m;
  const opt = (ic, title, sub, fn, cls = '') => h('button.opt' + cls, { type: 'button', on: { click: () => { m.close(); setTimeout(fn, 60); } } }, h('span.oi', icon(ic, 22)), h('div', h('b', title), h('small', sub)), icon('chevron', 16));
  m = app.modal({ title: 'Create', body: h('div.opts',
    opt('magic', 'Edit for me', 'Upload a video. Cuts, captions, music and b-roll are done for you.', () => pickFile('video/*,.mp4,.mov,.m4v,.webm', false, (fs) => oneClickDialog(app, fs[0])), '.hot'),
    opt('templates', 'Use a template', 'Drop your clips into a ready-made design.', () => showShell(app, 'templates')),
    opt('upload', 'Edit myself', 'Start from your clips and use the full editor.', () => pickFile(MEDIA, true, (fs) => app.startFromFiles(fs))),
    opt('plus', 'Blank project', 'Pick a canvas and start empty.', () => app.newProjectDialog())),
  actions: [{ label: 'Close', ghost: true }] });
}

/* ======================================================================================================== home */
async function viewHome(app, go) {
  const brand = loadBrand();
  const list = await Storage.listProjects().catch(() => []);
  const drop = h('div.drop', { tabindex: 0, role: 'button', 'aria-label': 'Choose a video to edit for me',
    on: {
      click: () => pickFile('video/*,.mp4,.mov,.m4v,.webm', false, (fs) => oneClickDialog(app, fs[0])),
      keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drop.click(); } },
      dragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, dragleave: () => drop.classList.remove('over'),
      drop: (e) => { e.preventDefault(); drop.classList.remove('over'); const f = [...(e.dataTransfer?.files || [])].find(isVideo); if (f) oneClickDialog(app, f); else app.toast('Drop a video file', 'err'); },
    } },
  h('div.drop-ic', icon('magic', 30)), h('h1', 'Upload a video.', h('br'), h('em', 'Get a finished edit.')),
  h('p', 'One tap cuts dead air, adds captions, quiet music and b-roll, and applies your brand.'),
  h('span.btn.primary.lg', icon('upload', 19), 'Choose a video'), h('small', 'or drop one here · stays on your device'));

  const tplRow = h('div.hscroll', TEMPLATES.slice(0, 9).map((t) => tplCard(t, app, brand)));
  const recent = list.slice(0, 6);
  const brandCard = isConfigured(brand)
    ? h('button.bcard', { on: { click: () => go('brand') } }, h('div.sws', [brand.primary, brand.secondary, brand.accent || brand.primary].map((c) => h('i', { style: { background: c } }))), h('div', h('b', brand.name || 'Your brand'), h('small', 'Applied to captions, templates and end cards')), icon('chevron', 16))
    : h('button.bcard.todo', { on: { click: () => go('brand') } }, h('span.bi', icon('palette', 20)), h('div', h('b', 'Set up your brand'), h('small', 'Name, colors, font and logo once. Everything you make uses them.')), icon('chevron', 16));

  return h('div.view.v-home',
    h('section.hero2', drop,
      h('div.quick', [['templates', 'Templates', 'Fill in a ready design', () => go('templates')], ['upload', 'Edit myself', 'Full editor', () => pickFile(MEDIA, true, (fs) => app.startFromFiles(fs))], ['plus', 'Blank', 'Pick a canvas', () => app.newProjectDialog()]]
        .map(([ic, t, s, fn]) => h('button.qa', { on: { click: fn } }, h('span.qi', icon(ic, 20)), h('b', t), h('small', s))))),
    brandCard,
    h('div.sec-h', h('h2', 'Templates'), h('button.link', { on: { click: () => go('templates') } }, 'See all', icon('chevron', 14))), tplRow,
    recent.length ? h('div.sec-h', h('h2', 'Continue editing'), h('button.link', { on: { click: () => go('projects') } }, 'All projects', icon('chevron', 14))) : null,
    recent.length ? h('div.pgrid.sm', recent.map((p) => projCard(app, p))) : h('div.empty', icon('film', 22), h('b', 'No projects yet'), h('small', 'Your edits save automatically on this device.')),
    h('footer.foot-note', 'Free and private. Your files never leave your device.'));
}

/* ======================================================================================================== templates */
/* ---- live card previews: hover on desktop, the card nearest the middle of the screen on touch ---- */
let fillPrev = null;
const liveCards = new Map();                // card element -> { start, stop }
const fine = matchMedia('(hover:hover) and (pointer:fine)');
const calm = matchMedia('(prefers-reduced-motion: reduce)');
let liveTimer = 0;
const io = new IntersectionObserver((es) => { for (const e of es) { const c = liveCards.get(e.target); if (c) c.visible = e.isIntersecting; } pickLive(); }, { threshold: [0, 0.6] });
function pickLive() {
  if (fine.matches || calm.matches) return;
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    const mid = innerHeight * 0.45; let best = null, bd = 1e9;
    for (const [el, c] of liveCards) { if (!c.visible) continue; const r = el.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - mid); if (d < bd && r.height > 40) { bd = d; best = c; } }
    for (const c of liveCards.values()) if (c !== best && c.on) c.stop();
    if (best && !best.on) best.start();
  }, 220);
}
function attachLive(card, media, t) {
  let lp = null; const cv = h('canvas.tlive');
  media.append(cv);
  const c = { visible: false, on: false,
    start: async () => {
      if (!lp) { lp = new LivePreview(cv, t, {}); lp.onStart = () => { c.on = true; cv.classList.add('on'); }; lp.onStop = () => { c.on = false; cv.classList.remove('on'); }; lp.refresh(); }
      lp.play();
    },
    stop: () => lp?.pause() };
  liveCards.set(card, c); io.observe(card);
  if (fine.matches) { card.addEventListener('pointerenter', c.start); card.addEventListener('pointerleave', c.stop); card.addEventListener('focus', c.start); card.addEventListener('blur', c.stop); }
}
function tplCard(t, app, brand) {
  const R = RATIOS.find((r) => r.id === t.ratio) || RATIOS[0];
  const media = h('div.tmedia', { style: `aspect-ratio:${R.w}/${R.h};--p:${t.pal.primary};--s:${t.pal.secondary}` }, h('span.tplay', icon('play', 16)));
  lazyPoster(media, t);
  const card = h('button.tcard', { type: 'button', 'aria-label': 'Use template ' + t.name, on: { click: () => openTemplate(app, t) } },
    media, t.badge ? h('span.tbadge', t.badge) : null, h('span.tratio', t.ratio),
    h('div.tmeta', h('b', t.name), h('small', `${Math.round(templateDuration(t))}s · ${templateClipSlots(t)} ${templateClipSlots(t) === 1 ? 'clip' : 'clips'}`)));
  attachLive(card, media, t);
  return card;
}
async function viewTemplates(app, go) {
  const brand = loadBrand();
  let cat = 'All', q = '';
  const grid = h('div.tgrid'), chips = h('div.chips');
  const draw = () => {
    chips.replaceChildren(...CATEGORIES.map((c) => h('button.chip' + (c === cat ? '.on' : ''), { on: { click: () => { cat = c; draw(); } } }, c)));
    const list = TEMPLATES.filter((t) => (cat === 'All' || t.cat === cat) && (!q || (t.name + ' ' + t.blurb + ' ' + t.cat).toLowerCase().includes(q)));
    grid.replaceChildren(...(list.length ? list.map((t) => tplCard(t, app, brand)) : [h('div.empty', icon('search', 22), h('b', 'No templates match'), h('small', 'Try a different word or category.'))]));
  };
  const search = h('label.search', icon('search', 17), h('input', { type: 'search', placeholder: 'Search templates', 'aria-label': 'Search templates', on: { input: (e) => { q = e.target.value.trim().toLowerCase(); draw(); } } }));
  draw();
  return h('div.view.v-tpl', h('header.vh', h('div', h('h1', 'Templates'), h('p', 'Pick a design, drop in your clips, change the words. Done.')), search), chips, grid);
}

/** The fill-in screen for one template. */
function openTemplate(app, t) {
  const brand = loadBrand();
  const files = new Array(t.slots.length).fill(null);
  const urls = new Array(t.slots.length).fill(null);
  const values = {}; (t.inputs || []).forEach((f) => { values[f.id] = f.value; });
  let useBrand = isConfigured(brand) && brand.apply !== false, ratio = t.ratio;

  const main = $('shellMain');
  fillPrev?.destroy();
  const R0 = RATIOS.find((r) => r.id === t.ratio) || RATIOS[0];
  const pv = h('canvas.fill-canvas', { width: 270, height: 480, 'aria-label': 'Live preview of this template' });
  const coverBox = h('div.fill-cover', pv);
  fillPrev = new LivePreview(pv, t, { values, brand, useBrand, height: 560, ratio });
  const playBtn = h('button.btn.sm.pvbtn', { type: 'button', 'aria-label': 'Play or pause the preview', on: { click: () => { if (fillPrev.playing) fillPrev.pause(); else fillPrev.play(fillPrev.hold || 0); } } }, icon('pause', 15));
  fillPrev.onStart = () => playBtn.replaceChildren(icon('pause', 15)); fillPrev.onStop = () => playBtn.replaceChildren(icon('play', 15));
  let musicBtn = null;
  if (t.music) { musicBtn = h('button.btn.sm.pvbtn', { type: 'button', 'aria-label': 'Hear the music', on: { click: async () => { const on = await app.previewAudio(builtinMedia.music(t.music)); musicBtn.classList.toggle('on', !!on); } } }, icon('audio', 15), 'Music'); app.onPreviewEnd = () => musicBtn?.classList.remove('on'); }
  const drawCover = () => fillPrev.setOptions({ useBrand, ratio, values: { ...values } });
  let pvT = 0; const refreshSoon = () => { clearTimeout(pvT); pvT = setTimeout(() => fillPrev.setOptions({ values: { ...values } }), 140); };
  setTimeout(() => { fillPrev.refresh(); if (!calm.matches) fillPrev.play(0); }, 30);

  const slotsEl = h('div.slots');
  const setFile = (i, f) => {
    if (urls[i]) URL.revokeObjectURL(urls[i]);
    files[i] = f || null; urls[i] = f ? URL.createObjectURL(f) : null; drawSlots(); upd();
  };
  const fill = (fs) => {
    const empties = t.slots.map((s, i) => (!s.card && !files[i] ? i : -1)).filter((i) => i >= 0);
    fs.slice(0, empties.length).forEach((f, k) => { if (urls[empties[k]]) URL.revokeObjectURL(urls[empties[k]]); files[empties[k]] = f; urls[empties[k]] = URL.createObjectURL(f); });
    if (fs.length > empties.length) app.toast(`Only ${empties.length} empty slot${empties.length === 1 ? '' : 's'}; the rest were skipped`);
    drawSlots(); upd();
  };
  const drawSlots = () => slotsEl.replaceChildren(...t.slots.map((s, i) => {
    if (s.card) return h('div.slot.card', h('div.sth', icon('sparkle', 18)), h('div.st', h('b', s.label), h('small', 'Animated title card, made for you')));
    const f = files[i];
    const th = f ? (isVideo(f) ? h('video', { src: urls[i] + '#t=0.3', muted: true, playsInline: true, preload: 'metadata' }) : h('img', { src: urls[i], alt: '' })) : icon('image', 20);
    const row = h('div.slot' + (f ? '.has' : ''), { tabindex: 0, role: 'button', 'aria-label': (f ? 'Replace ' : 'Add ') + s.label,
      on: {
        click: (e) => { if (e.target.closest('.x')) return; pickFile(MEDIA, false, (fs) => setFile(i, fs[0])); },
        keydown: (e) => { if (e.key === 'Enter') row.click(); },
        dragover: (e) => { e.preventDefault(); row.classList.add('over'); }, dragleave: () => row.classList.remove('over'),
        drop: (e) => { e.preventDefault(); row.classList.remove('over'); const x = e.dataTransfer?.files?.[0]; if (x) setFile(i, x); },
      } },
    h('div.sth', th), h('div.st', h('b', `${i + 1}. ${s.label}`), h('small', f ? f.name : s.hint)),
    f ? h('button.x.btn.ghost.sm.icon', { 'aria-label': 'Remove ' + s.label, on: { click: () => setFile(i, null) } }, icon('close', 15)) : h('span.add', icon('plus', 16)));
    return row;
  }));
  drawSlots();

  const texts = (t.inputs || []).map((f) => h('label.fld', h('span', f.label), h('input.field', { value: f.value, maxLength: f.max || 60, 'aria-label': f.label, on: { input: (e) => { values[f.id] = e.target.value; refreshSoon(); } } })));

  const create = h('button.btn.primary.lg.go', { on: { click: () => run() } }, icon('magic', 19), 'Create video');
  const status = h('small.cstat', '');
  const upd = () => {
    const n = files.filter(Boolean).length, need = templateClipSlots(t);
    create.disabled = n === 0; create.classList.toggle('dis', n === 0);
    status.textContent = n === 0 ? 'Add at least one clip' : n < need ? `${n} of ${need} clips added. Empty slots get an animated background.` : 'All clips added';
  };
  const brandSwitch = isConfigured(brand) ? h('label.tg', (() => { const i = h('input', { type: 'checkbox', checked: useBrand, on: { change: () => { useBrand = i.checked; drawCover(); } } }); return h('label.sw.mini', i, h('span.trk')); })(),
    h('span', h('b', `Use my brand${brand.name ? ' (' + brand.name + ')' : ''}`), h('small', 'Colors, font, handle, logo and end card'))) : h('button.bcard.todo.slim', { on: { click: () => showShell(app, 'brand') } }, h('span.bi', icon('palette', 18)), h('div', h('b', 'Add your brand'), h('small', 'Colors and logo apply to every template')), icon('chevron', 16));
  const fmt = h('div.seg');
  const drawFmt = () => fmt.replaceChildren(...RATIOS.slice(0, 4).map((r) => h('button' + (ratio === r.id ? '.on' : ''), { type: 'button', on: { click: () => { ratio = r.id; drawFmt(); fillPrev.setOptions({ ratio }); } } }, r.id)));
  drawFmt();
  const several = h('button.btn.sm', { type: 'button', on: { click: () => pickFile(MEDIA, true, fill) } }, icon('upload', 15), 'Add several at once');

  async function run() {
    const step = h('small.pnote', ''); const bar = h('i');
    const dlg = app.modal({ title: 'Creating your video', lead: 'Building the timeline on your device.', body: h('div', h('div.pbar', bar), step), dismiss: false });
    let n = 0;
    try {
      const logoMedia = useBrand && brand.logo ? await (async () => { try { return await app.lib.importFile(await logoFile(brand)); } catch { return null; } })() : null;
      const r = await buildTemplate(app, t, { files, values, brand, useBrand, ratio, logoMedia, onStep: (l) => { step.textContent = l + '…'; bar.style.width = Math.min(92, ++n * 14) + '%'; } });
      bar.style.width = '100%'; dlg.close();
      if (r.warnings.length) app.toast(r.warnings[0], 'err', 5000); else app.toast('Done. Everything is editable.', 'ok');
    } catch (e) { console.error(e); dlg.close(); app.toast(e.message || 'Could not build that template', 'err', 6000); }
  }

  upd();
  main.replaceChildren(h('div.view.v-fill',
    h('button.back', { on: { click: () => showShell(app, 'templates') } }, icon('back', 18), 'Templates'),
    h('div.fill',
      h('aside.fill-l', h('div.fill-stage', coverBox, h('div.pvbar', playBtn, musicBtn, h('small', 'Preview with sample scenes'))), h('h1', t.name), h('p', t.blurb), h('div.tags', h('span', t.ratio), h('span', `~${Math.round(templateDuration(t))}s`), h('span', t.cat))),
      h('div.fill-r',
        h('section.fcard', h('div.fh', h('h3', '1 · Your clips'), several), h('p.fhint', 'Tap a slot to choose a video or photo. Drag files onto a slot too.'), slotsEl),
        texts.length ? h('section.fcard', h('div.fh', h('h3', '2 · Your words')), h('div.tfields', texts)) : null,
        h('section.fcard', h('div.fh', h('h3', texts.length ? '3 · Style' : '2 · Style')), brandSwitch, h('div.fld', h('span', 'Format'), fmt)),
        h('div.createbar', status, create)))));
  $('shellMain').scrollTop = 0;
}

/* ======================================================================================================== projects */
function projCard(app, p) {
  const open = () => app.openProject(p.id);
  return h('div.pcard', { tabindex: 0, role: 'button', 'aria-label': 'Open ' + p.name, on: { click: open, keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } } },
    h('div.th', { style: p.thumb ? `--img:url("${p.thumb}")` : '' }, p.thumb ? h('div.pic') : icon('film', 28, 'ph-ic'), h('span.badge', p.duration ? fmtDur(p.duration) : 'Empty'), p.ratio ? h('span.badge.r', p.ratio) : null),
    h('button.more', { 'aria-label': 'Project options', on: { click: (e) => { e.stopPropagation(); app.projectMenu(p, e); } } }, icon('dots', 16)),
    h('div.meta', h('b', p.name), h('span', ago(p.updated))));
}
async function viewProjects(app) {
  const [list, est] = await Promise.all([Storage.listProjects().catch(() => []), Storage.estimate()]);
  app.statusRow = h('div.status-row');
  const install = h('div.install-card', h('div.ci', icon('phone', 22)), h('div', h('b', 'Install EDEN Studio'), h('span', 'Add it to your home screen for a full-screen app that works offline.')), h('button.btn.sm.primary', { on: { click: () => app.install() } }, 'Install'));
  app.installCard = install;
  const v = h('div.view.v-proj',
    h('header.vh', h('div', h('h1', 'Projects'), h('p', list.length ? `${list.length} saved on this device` : 'Everything you make is saved here, automatically.')), h('button.btn.primary', { on: { click: () => createSheet(app) } }, icon('plus', 17), 'New')),
    install,
    list.length ? h('div.pgrid', list.map((p) => projCard(app, p))) : h('div.empty.big', icon('film', 26), h('b', 'No projects yet'), h('small', 'Try Edit for me or pick a template to get going.'), h('button.btn.primary', { on: { click: () => createSheet(app) } }, 'Create something')),
    est?.quota ? h('div.storage', h('div', `Local storage: ${fmtBytes(est.usage || 0)} used of ${fmtBytes(est.quota)}`), h('div.meter', h('i', { style: { width: Math.max(1, Math.min(100, ((est.usage || 0) / est.quota) * 100)) + '%' } })),
      h('small', 'Projects and media live in this browser. Clearing site data deletes them, so export videos you want to keep.')) : null,
    app.statusRow);
  app.refreshStatus(); app.updateInstallUI();
  return v;
}

/* ======================================================================================================== brand */
async function viewBrand(app) {
  const b = loadBrand();
  const ed = brandEditor(app, b);
  return h('div.view.v-brand',
    h('header.vh', h('div', h('h1', 'Brand'), h('p', 'Set it up once. Edit for me, templates and end cards all use it. Saves automatically.'))),
    h('div.brand-grid', h('div.bd-main', ed.el), h('aside.bd-prev', ed.preview, h('small', 'Live preview'))));
}
