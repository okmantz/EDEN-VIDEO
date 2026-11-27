// EDEN Studio — application shell: home screen, editor wiring, import/export, shortcuts, PWA.
import { h, clamp, fmtTime, fmtDur, fmtBytes, downloadBlob, safeName, isMobile, debounce, EASE, deep } from './util.js';
import { Store } from './state.js';
import { AudioBank, builtinMedia } from './audio.js';
import { MediaLibrary, Storage } from './media.js';
import { Engine } from './engine.js';
import { loadFonts, mergeText, TEXT_PRESETS } from './textrender.js';
import { RATIOS, end, findClip, projectDuration, videoClip, textClip, overlaps } from './model.js';
import { effectDefaults, transitionById } from './effects.js';
import { exportWebCodecs, exportRealtime, capabilities, RESOLUTIONS, outputSize } from './export.js';
import { icon } from './ui/icons.js';
import { Panels, TOOLS } from './ui/panels.js';
import { Inspector, slider } from './ui/inspector.js';
import { Timeline } from './ui/timeline.js';
import { PreviewOverlay } from './ui/preview.js';
import { destroyThumbs } from './thumbs.js';
import { MUSIC } from './synth.js';

const $ = (id) => document.getElementById(id);
function toast(msg, kind = '', ms = 2600) {
  const t = h('div.toast' + (kind ? '.' + kind : ''), msg);
  $('toasts').append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = 0; setTimeout(() => t.remove(), 320); }, ms);
}
window.EDEN = { toast };

function modal({ title, lead, body, actions = [], dismiss = true, wide = false }) {
  const back = h('div.modal-back');
  const close = () => back.remove();
  const box = h('div.modal', wide ? { style: { width: 'min(640px,100%)' } } : null, h('h3', title), lead ? h('p.lead', lead) : null, body || null,
    actions.length ? h('div.foot', actions.map((a) => h('button.btn' + (a.primary ? '.primary' : a.ghost ? '.ghost' : '') + (a.danger ? '.danger' : ''), { on: { click: async () => { if (a.onClick) { const r = await a.onClick(close); if (r === false) return; } if (!a.keep) close(); } } }, a.label))) : null);
  back.append(box);
  if (dismiss) back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  document.body.append(back);
  return { close, box, back };
}

class App {
  constructor() {
    this.isMobile = isMobile();
    this.store = new Store();
    this.bank = new AudioBank();
    this.lib = new MediaLibrary(this.bank);
    this.tool = null;
    this.panelOpen = false; this.inspOpen = false;
    this.panels = new Panels(this);
    this.slider = slider;
    this.mergeText = mergeText;
  }

  // ------------------------------------------------------------ boot
  async start() {
    await Promise.race([loadFonts([{ id: 'Inter', w: 600 }, { id: 'Inter', w: 800 }, { id: 'Montserrat', w: 800 }]), new Promise((r) => setTimeout(r, 1500))]);
    this.buildEditorShell();
    window.addEventListener('resize', debounce(() => { this.isMobile = isMobile(); this.fitCanvas(); this.renderRail(); }, 100));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('beforeunload', () => this.store.flush());
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.store.flush(); this.engine?.pause(); } });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => { if (!this.store.project) return; e.preventDefault(); if (e.dataTransfer?.files?.length) this.importFiles([...e.dataTransfer.files]); });
    await this.showHome();
    $('loading').classList.add('gone'); setTimeout(() => $('loading').remove(), 600);
    Storage.persist();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ------------------------------------------------------------ home
  async showHome() {
    if (this.engine) { this.engine.pause(); }
    const home = $('home'); $('editor').hidden = true; home.hidden = false;
    const list = await Storage.listProjects().catch(() => []);
    const est = await Storage.estimate();
    const cards = list.map((p) => h('div.pcard', { tabindex: 0, on: { click: () => this.openProject(p.id), keydown: (e) => { if (e.key === 'Enter') this.openProject(p.id); } } },
      h('div.th', { style: p.thumb ? { backgroundImage: `url(${p.thumb})` } : null }, p.thumb ? null : icon('media', 30)),
      h('button.del', { title: 'Delete project', on: { click: (e) => { e.stopPropagation(); this.confirmDelete(p); } } }, icon('trash', 15)),
      h('div.meta', h('b', p.name), h('span', `${p.ratio} · ${p.duration ? fmtDur(p.duration) : 'empty'} · ${new Date(p.updated).toLocaleDateString()}`))));
    home.replaceChildren(h('div.home-in',
      h('div.brand', h('div.logo', icon('play', 18)), 'EDEN STUDIO'),
      h('div.hero', h('h1', 'Edit like a pro.', h('br'), h('em', 'Right in your browser.')),
        h('p', 'A full multi-track video editor with effects, transitions, music, captions and 4K export. Private by design: your files never leave your device.'),
        h('div.row', h('button.btn.primary', { on: { click: () => this.newProjectDialog() } }, icon('plus', 20), 'New project'),
          this.installBtn = h('button.btn', { hidden: true, on: { click: () => this.install() } }, icon('upload', 18), 'Install app'))),
      h('div.feat', ...[['47', 'Effects'], ['40', 'Transitions'], ['58', 'B-roll loops'], ['12', 'Music tracks']].map(([n, t]) => h('div', h('b', n), t))),
      h('h2.sec', 'Your projects'),
      cards.length ? h('div.projects', cards) : h('div.empty', 'No projects yet. Create one to get started.'),
      est?.quota ? h('div.hint', { style: { marginTop: '24px' } }, `Local storage used: ${fmtBytes(est.usage || 0)} of ${fmtBytes(est.quota)}`) : null));
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this._installEv = e; if (this.installBtn) this.installBtn.hidden = false; }, { once: true });
    if (this._installEv && this.installBtn) this.installBtn.hidden = false;
  }
  async install() { const e = this._installEv; if (!e) return; e.prompt(); await e.userChoice; this._installEv = null; this.installBtn.hidden = true; }

  newProjectDialog() {
    let ratio = '9:16';
    const grid = h('div.ratio-grid');
    const draw = () => grid.replaceChildren(...RATIOS.map((r) => { const k = 34 / Math.max(r.w, r.h); return h('button.ratio' + (ratio === r.id ? '.on' : ''), { on: { click: () => { ratio = r.id; draw(); } } }, h('i', { style: { width: Math.round(r.w * k) + 'px', height: Math.round(r.h * k) + 'px' } }), r.name, h('small', r.sub)); }));
    draw();
    const name = h('input.field', { placeholder: 'Project name', value: 'My video' });
    modal({ title: 'New project', lead: 'Pick a canvas. You can change it any time.', body: h('div', name, h('div', { style: { height: '14px' } }), grid),
      actions: [{ label: 'Cancel', ghost: true }, { label: 'Create', primary: true, onClick: async () => { await this.createProject(ratio, name.value.trim() || 'My video'); } }] });
  }

  confirmDelete(p) {
    modal({ title: 'Delete project?', lead: `“${p.name}” and its imported media will be removed from this device.`, actions: [{ label: 'Cancel', ghost: true }, { label: 'Delete', danger: true, onClick: async () => { await Storage.deleteProject(p.id); this.showHome(); } }] });
  }

  async createProject(ratio, name) {
    const p = this.store.create(ratio, name);
    await this.enterEditor(p, true);
  }
  async openProject(id) {
    const p = await Storage.loadProject(id);
    if (!p) { toast('Could not open that project', 'err'); return; }
    this.store.open(p);
    await this.enterEditor(this.store.project, false);
  }

  // ------------------------------------------------------------ editor shell (built once)
  buildEditorShell() {
    // top bar
    this.titleInput = h('input.title', { 'aria-label': 'Project name', on: { change: (e) => this.store.rename(e.target.value), keydown: (e) => { if (e.key === 'Enter') e.target.blur(); } } });
    this.saveState = h('span.savestate.desktop-only', '');
    this.undoBtn = h('button.btn.ghost.icon', { title: 'Undo (Ctrl+Z)', on: { click: () => this.store.undo() } }, icon('undo', 20));
    this.redoBtn = h('button.btn.ghost.icon', { title: 'Redo (Ctrl+Shift+Z)', on: { click: () => this.store.redo() } }, icon('redo', 20));
    this.ratioBtn = h('button.btn.ghost.sm', { title: 'Canvas', on: { click: () => this.openTool('canvas') } }, icon('ratio', 16), h('span'));
    $('topbar').append(
      h('button.btn.ghost.icon', { title: 'Projects', on: { click: () => this.goHome() } }, icon('home', 20)),
      h('div.name', this.titleInput, this.saveState),
      this.ratioBtn, this.undoBtn, this.redoBtn,
      h('button.btn.primary.export', { on: { click: () => this.exportDialog() } }, icon('export', 18), h('span', 'Export')));
    // transport
    this.timeEl = h('div.time');
    this.playBtn = h('button.playbtn', { title: 'Play / Pause (Space)', on: { click: () => this.engine.toggle() } }, icon('play', 22));
    this.loopBtn = h('button.btn.ghost.icon.sm.desktop-only', { title: 'Loop', on: { click: () => { this.engine.loop = !this.engine.loop; this.loopBtn.style.color = this.engine.loop ? 'var(--accent)' : ''; } } }, icon('loopmode', 18));
    $('transport').append(this.timeEl, h('div.sp'),
      h('button.btn.ghost.icon.sm', { title: 'Back to start', on: { click: () => this.engine.seek(0) } }, icon('skipback', 18)), this.playBtn, h('div.sp'), this.loopBtn,
      h('button.btn.ghost.icon.sm', { title: 'Fullscreen preview', on: { click: () => this.fullscreen() } }, icon('fullscreen', 18)));
    $('panelClose').append(icon('close', 18)); $('inspClose').append(icon('close', 18));
    $('panelClose').addEventListener('click', () => this.closeSheets());
    $('inspClose').addEventListener('click', () => this.closeSheets());
    $('scrim').addEventListener('click', () => this.closeSheets());
    for (const g of ['panelGrab', 'inspGrab']) this.swipeDown($(g), () => this.closeSheets());
    new ResizeObserver(() => this.fitCanvas()).observe($('viewport'));
  }

  swipeDown(el, fn) {
    let y0 = null;
    el.addEventListener('pointerdown', (e) => { y0 = e.clientY; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => { if (y0 != null && e.clientY - y0 > 40) { y0 = null; fn(); } });
    el.addEventListener('pointerup', () => { y0 = null; });
    el.addEventListener('click', fn);
  }

  async enterEditor(project) {
    $('home').hidden = true; $('editor').hidden = false;
    const first = !this.engine;
    this.lib.forget(); this.lib.setProject(project.id);
    if (first) {
      const cv = $('cv');
      const mobile = this.isMobile;
      this.engine = new Engine(cv, this.lib, this.bank, { maxVideos: mobile ? 4 : 7, previewEdge: mobile ? 960 : 1280 });
      this.engine.on('play', () => this.playBtn.replaceChildren(icon('pause', 22)));
      this.engine.on('pause', () => this.playBtn.replaceChildren(icon('play', 22)));
      this.engine.on('ended', () => this.playBtn.replaceChildren(icon('play', 22)));
      this.engine.on('time', (t) => this.updateTime(t));
      this.store.getTime = () => this.engine.t;
      this.inspector = new Inspector($('inspector'), this);
      this.timeline = new Timeline($('timeline'), {
        store: this.store, engine: this.engine, lib: this.lib, bank: this.bank, isMobile: this.isMobile,
        onSplit: () => this.doSplit(), onDelete: () => this.store.remove(), onDuplicate: () => this.store.duplicate(),
        onTransition: (id) => { this.store.select(id); this.openTool('transitions'); },
        onTrackMenu: (tr, e) => this.trackMenu(tr, e), onContext: (c, e) => this.clipMenu(c, e),
        onOpen: () => { if (!this.isMobile) return; this.openInspector(); },
      });
      this.overlayCtl = new PreviewOverlay($('cwrap'), $('overlay'), this);
      this.store.on('change', (info) => this.onChange(info));
      this.store.on('select', () => this.onSelect());
      this.store.on('added', (c) => { if (!this.engine.playing && this.engine.t < c.start + 0.45) this.engine.seek(c.start + 0.45); });
      this.store.on('saved', () => { this.saveState.textContent = 'Saved'; });
      this.store.on('save-error', () => { this.saveState.textContent = 'Not saved'; toast('Could not save (storage full?)', 'err'); });
      this.engine.on('frame', () => {});
      window.addEventListener('pagehide', () => this.store.flush());
    }
    this.store.pruneSel();
    this.titleInput.value = project.name;
    this.engine.setProject(this.store.project);
    this.engine.seek(0, true);
    this.timeline.render(); this.timeline.scrollToTime(0, false);
    this.fitCanvas(); this.refreshRatioBtn();
    this.tool = this.isMobile ? null : 'media';
    this.renderRail(); if (!this.isMobile) this.openTool('media'); else this.closeSheets();
    this.inspector.render();
    this.updateTime(0); this.updateUndo();
    // restore media blobs for this project
    const items = Object.values(project.media);
    await Promise.all(items.map((m) => this.lib.ensure(m).catch(() => {})));
    this.engine.invalidate({ audio: false });
    const missing = items.filter((m) => m.missing);
    if (missing.length) toast(`${missing.length} media file(s) could not be restored on this device`, 'err', 4200);
    this.timeline.render();
  }

  async goHome() {
    this.engine.pause(); this.store.flush();
    try {
      const d = projectDuration(this.store.project);
      this.engine.seek(Math.min(0.5, d / 2), true); this.engine.renderNow();
      const th = await this.engine.snapshot(320);
      this.store.project.updated = Date.now();
      await Storage.saveProject(this.store.project, { thumb: th, duration: d });
    } catch (e) { console.warn(e); }
    this.closeSheets();
    this.showHome();
  }

  // ------------------------------------------------------------ layout helpers
  fitCanvas() {
    const p = this.store.project; if (!p || !this.engine) return;
    const vp = $('viewport'); const pad = this.isMobile ? 8 : 20;
    const aw = vp.clientWidth - pad * 2, ah = vp.clientHeight - pad * 2;
    if (aw <= 0 || ah <= 0) return;
    const ar = p.canvas.w / p.canvas.h;
    let w = aw, hh = aw / ar; if (hh > ah) { hh = ah; w = ah * ar; }
    const cw = $('cwrap'); cw.style.width = Math.floor(w) + 'px'; cw.style.height = Math.floor(hh) + 'px';
    this.engine.requestRender(); this.overlayCtl?.update();
  }
  refreshRatioBtn() { this.ratioBtn.lastChild.textContent = this.store.project.canvas.ratio; }
  updateTime(t) { const d = projectDuration(this.store.project); this.timeEl.replaceChildren(h('b', fmtTime(t, true, this.store.project.canvas.fps)), ' / ' + fmtTime(d)); }
  updateUndo() { this.undoBtn.disabled = !this.store.canUndo(); this.redoBtn.disabled = !this.store.canRedo(); }

  onChange(info) {
    this.engine.setProject(this.store.project);
    this.engine.applySize();
    this.engine.invalidate({ audio: info?.audio !== false });
    this.updateUndo(); this.updateTime(this.engine.t); this.refreshRatioBtn(); this.fitCanvas();
    this.saveState.textContent = 'Saving…';
    if (!this.inspector.busy) this.inspector.render();
    if (this.panelOpen && ['filters', 'transitions', 'effects', 'media', 'canvas'].includes(this.tool) && !this.inspector.busy) this.refreshPanel();
    this.renderRail();
  }
  onSelect() {
    this.inspector.focus = null; this.inspector.render();
    if (this.panelOpen && ['filters', 'transitions', 'effects'].includes(this.tool)) this.refreshPanel();
    this.renderRail();
    if (!this.isMobile) return;
    if (this.store.sel.size === 0) this.closeInspectorSheet();
  }

  // ------------------------------------------------------------ rail & sheets
  renderRail() {
    const rail = $('rail'); rail.replaceChildren();
    const sel = this.store.sel.size ? this.store.selected : null;
    if (this.isMobile && this.store.sel.size && !this.panelOpen) {
      const c = sel?.clip;
      rail.append(h('button.tool.back', { on: { click: () => this.store.select([]) } }, icon('chevdown', 20), h('span', 'Done')));
      const T = (ic, name, fn, cls = '') => h('button.tool' + cls, { on: { click: fn } }, icon(ic, 21), h('span', name));
      const items = [T('split', 'Split', () => this.doSplit())];
      const focus = (id) => () => this.openInspector(id);
      if (c) {
        if (c.kind === 'text') items.push(T('text', 'Edit', focus('text')));
        if (c.kind === 'sticker') items.push(T('sticker', 'Edit', focus('sticker')));
        if (c.kind === 'fx') items.push(T('effects', 'Settings', focus('fxlayer')));
        if (c.kind === 'video' || c.kind === 'image' || c.kind === 'gen' || c.kind === 'text' || c.kind === 'sticker') items.push(T('canvas', 'Transform', focus('transform')));
        if (c.kind === 'video' || c.kind === 'audio') items.push(T('speed', 'Speed', focus('speed')));
        if (c.kind === 'video' || c.kind === 'audio') items.push(T('volume', 'Volume', focus('audio')));
        if (['video', 'image', 'gen', 'text'].includes(c.kind)) items.push(T('filters', 'Filter', focus('look')), T('adjust', 'Adjust', focus('adjust')), T('effects', 'Effects', () => this.openTool('effects')));
        if (['video', 'image', 'gen', 'text', 'sticker'].includes(c.kind)) items.push(T('anim', 'Animate', focus('anim')));
        if (['video', 'image', 'gen'].includes(c.kind)) items.push(T('transitions', 'Transition', () => this.openTool('transitions')), T('mask', 'Mask', focus('mask')), T('chroma', 'Chroma', focus('chroma')), T('blend', 'Blend', focus('blend')));
      }
      items.push(T('copy', 'Duplicate', () => this.store.duplicate()), T('trash', 'Delete', () => this.store.remove(), '.danger'));
      rail.append(...items);
      return;
    }
    for (const t of TOOLS) rail.append(h('button.tool' + (this.tool === t.id && this.panelOpen ? '.on' : ''), { title: t.name, on: { click: () => (this.tool === t.id && this.panelOpen && this.isMobile ? this.closeSheets() : this.openTool(t.id)) } }, icon(t.icon, 22), h('span', t.name)));
  }

  openTool(id) {
    this.tool = id; this.panelOpen = true;
    this.refreshPanel();
    if (this.isMobile) { this.inspOpen = false; $('inspector').classList.remove('open'); $('panel').classList.add('open'); $('scrim').classList.remove('soft'); $('scrim').classList.add('on'); }
    this.renderRail();
  }
  refreshPanel() {
    if (!this.tool) return;
    $('panelTitle').textContent = this.panels.titleOf(this.tool);
    const body = $('panelBody'); const top = body.scrollTop;
    body.replaceChildren(this.panels.build(this.tool)); body.scrollTop = top;
  }
  openInspector(focus = null) {
    this.inspOpen = true; this.inspector.show(focus);
    $('inspTitle').textContent = focus ? ({ transform: 'Transform', speed: 'Speed', audio: 'Volume', look: 'Filter', adjust: 'Adjust', anim: 'Animation', mask: 'Mask', chroma: 'Chroma key', blend: 'Blend', text: 'Text', sticker: 'Sticker', fxlayer: 'Effect' }[focus] || 'Edit') : 'Edit';
    if (this.isMobile) { $('panel').classList.remove('open'); this.panelOpen = false; $('inspector').classList.add('open'); $('scrim').classList.add('on', 'soft'); }
    this.renderRail();
  }
  closeInspectorSheet() { $('inspector').classList.remove('open'); this.inspOpen = false; if (!this.panelOpen) $('scrim').classList.remove('on'); this.renderRail(); }
  closeSheets() {
    if (this.isMobile) { $('panel').classList.remove('open'); $('inspector').classList.remove('open'); $('scrim').classList.remove('on'); this.panelOpen = false; this.inspOpen = false; this.inspector.focus = null; this.inspector.render(); }
    this.renderRail();
  }

  // ------------------------------------------------------------ import
  async importFiles(files) {
    if (!files.length) return;
    let n = 0;
    for (const f of files) {
      try {
        toast(`Importing ${f.name}…`, '', 1400);
        const m = await this.lib.importFile(f);
        this.store.appendMedia(m); n++;
        if (m.kind !== 'image' && m.hasAudio === false && m.kind === 'video') { /* silent video, fine */ }
      } catch (e) { toast(e.message || 'Import failed', 'err', 4000); }
    }
    if (n) { toast(`${n} file${n > 1 ? 's' : ''} added`, 'ok'); this.timeline.fit(); this.engine.seek(0); if (this.tool === 'media') this.refreshPanel(); if (this.isMobile) this.closeSheets(); }
  }
  async importAudioFile(f) {
    try { toast(`Importing ${f.name}…`, '', 1400); return await this.lib.importFile(f); } catch (e) { toast(e.message || 'Import failed', 'err', 4000); return null; }
  }
  addOverlay(m) {
    const c = videoClip(m, this.engine.t);
    c.tf.s = 0.45; c.tf.x = 0.22; c.tf.y = -0.22; c.animIn = { id: 'pop', dur: 0.4 };
    this.store.commit((p) => {
      p.media[m.id] = m;
      let tr = p.tracks.filter((t) => t.kind === 'video').slice(1).find((t) => !overlaps(t, c.start, end(c)));
      if (!tr) tr = this.store.addTrack('video');
      tr.clips.push(c); this.store.sel.clear(); this.store.sel.add(c.id);
    });
    toast('Added as overlay', 'ok');
  }

  async addAudioMedia(media, extra) {
    if (media.builtin && !this.bank.has(media.id)) { toast(`Generating ${media.name}…`, '', 9000); await this.bank.ensureBuiltin(media.id).catch(() => {}); }
    this.store.addAudio(media, extra);
    toast(media.name + ' added', 'ok');
  }

  // ------------------------------------------------------------ audio preview
  async previewAudio(media) {
    const eng = this.engine; await eng.unlockAudio();
    if (this._pv) { try { this._pv.stop(); } catch {} const same = this._pvId === media.id; this._pv = null; this._pvId = null; this.onPreviewEnd?.(); if (same) return false; }
    if (media.builtin && !this.bank.has(media.id)) toast('Generating…', '', 5000);
    await this.bank.ensureBuiltin(media.id).catch(() => {});
    const buf = this.bank.buffer(media.id); if (!buf) return false;
    const src = eng.actx.createBufferSource(); src.buffer = buf;
    const g = eng.actx.createGain(); g.gain.value = 0.8; src.connect(g).connect(eng.actx.destination);
    src.onended = () => { if (this._pv === src) { this._pv = null; this._pvId = null; this.onPreviewEnd?.(); } };
    src.start(0, 0); this._pv = src; this._pvId = media.id;
    setTimeout(() => { if (this._pv === src) { try { src.stop(); } catch {} } }, 30000);
    return true;
  }

  // ------------------------------------------------------------ editing helpers used by panels
  doSplit() { if (!this.store.split(this.engine.t)) toast('Move the playhead over a clip to split it'); }

  setTf(clip, patch, tRel) {
    this.inspector.busy = true;
    try {
      this.store.edit((c) => {
        for (const [k, v] of Object.entries(patch)) {
          if (c.kf?.[k]?.length) { const list = c.kf[k]; const i = list.findIndex((x) => Math.abs(x.t - tRel) < 0.04); if (i >= 0) list[i].v = v; else { list.push({ t: +tRel.toFixed(3), v, e: 'inout' }); list.sort((a, b) => a.t - b.t); } }
          else c.tf[k] = v;
        }
      }, { ids: [clip.id], coalesce: 'tfdrag', structure: false });
    } finally { this.inspector.busy = false; }
  }

  applyEffect(id, asLayer) {
    const f = this.store.selected;
    if (asLayer || !f || f.clip.kind === 'audio' || f.clip.kind === 'fx') { this.store.addEffectLayer(id); toast('Effect layer added', 'ok'); return; }
    this.store.edit((c) => { c.fxs = [...(c.fxs || []).filter((x) => x.type !== id), effectDefaults(id)]; }, { ids: [f.clip.id], structure: true });
    toast('Effect applied', 'ok');
  }
  applyFilter(id) {
    const f = this.store.selected;
    if (!f || !['video', 'image', 'gen', 'text'].includes(f.clip.kind)) {
      // no selection: apply to every visual clip on the main track
      const ids = this.store.mainTrack.clips.map((c) => c.id);
      if (!ids.length) { toast('Add a clip first'); return; }
      this.store.edit((c) => { c.look = { id, amt: 1 }; }, { ids, structure: true }); toast('Look applied to all clips', 'ok'); return;
    }
    this.store.edit((c) => { c.look = { id, amt: c.look?.amt ?? 1 }; }, { ids: [f.clip.id], structure: true });
  }
  currentTransitionClip() {
    const f = this.store.selected; if (!f) return null;
    if (!['video', 'image', 'gen'].includes(f.clip.kind)) return null;
    const clips = [...f.track.clips].sort((a, b) => a.start - b.start);
    const i = clips.findIndex((c) => c.id === f.clip.id);
    if (i <= 0 || Math.abs(end(clips[i - 1]) - f.clip.start) > 0.06) return null;
    return f.clip;
  }
  setTransition(id, type, dur = 0.6) {
    if (!id) { toast('Select the clip after the cut first'); return; }
    this.inspector.busy = true;
    this.store.edit((c) => { c.transIn = type ? { type, dur } : null; }, { ids: [id], structure: true, coalesce: 'trans' });
    this.inspector.busy = false;
    if (type) { const was = this.engine.playing; this.engine.pause(); const f = findClip(this.store.project, id); this.engine.seek(f.clip.start); void was; }
    this.refreshPanel();
  }

  setRatio(r) { this.store.setCanvas(r.id, r.w, r.h); this.refreshPanel(); }

  // ------------------------------------------------------------ captions & silence
  importSubtitles(text, name = '') {
    const cues = []; const norm = text.replace(/\r/g, '').replace(/^﻿/, '');
    const re = /(?:^|\n)(?:\d+\n)?(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{1,3}) --> (\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{1,3})[^\n]*\n([\s\S]*?)(?=\n\n|\n*$)/g;
    const sec = (hh, mm, ss, ms) => (hh ? parseInt(hh) : 0) * 3600 + parseInt(mm) * 60 + parseInt(ss) + parseInt(ms.padEnd(3, '0')) / 1000;
    let m; while ((m = re.exec(norm))) cues.push({ s: sec(m[1], m[2], m[3], m[4]), e: sec(m[5], m[6], m[7], m[8]), text: m[9].replace(/<[^>]+>/g, '').trim() });
    if (!cues.length) { toast('No captions found in that file', 'err'); return; }
    this.addCaptionClips(cues); toast(`${cues.length} captions imported`, 'ok');
  }
  addCaptionClips(cues, presetName = 'Viral Pop') {
    const preset = TEXT_PRESETS.find((p) => p.name === presetName) || TEXT_PRESETS[0];
    this.store.commit((p) => {
      const tr = this.store.addTrack('text'); tr.name = 'Captions';
      for (const q of cues) {
        const c = textClip(q.s, Math.max(0.3, q.e - q.s), { ...preset.text, content: q.text, size: 0.05 });
        c.name = q.text.slice(0, 24); c.tf.y = 0.3; c.animIn = { id: 'fade', dur: 0.12 }; tr.clips.push(c);
      }
    });
  }
  pasteCaptions() {
    const ta = h('textarea.field', { style: { height: '160px' }, placeholder: 'One caption per line…' });
    modal({ title: 'Add captions', lead: 'Each line becomes a caption, spread evenly across your video.', body: ta,
      actions: [{ label: 'Cancel', ghost: true }, { label: 'Add captions', primary: true, onClick: () => {
        const lines = ta.value.split('\n').map((s) => s.trim()).filter(Boolean); if (!lines.length) return false;
        const sel = this.store.selected?.clip; const t0 = sel ? sel.start : 0; const dur = sel ? sel.dur : Math.max(projectDuration(this.store.project), lines.length * 2);
        const per = dur / lines.length;
        this.addCaptionClips(lines.map((text, i) => ({ s: t0 + i * per, e: t0 + (i + 1) * per - 0.05, text })));
      } }] });
  }
  cutSilences() {
    const f = this.store.selected;
    if (!f || (f.clip.kind !== 'video' && f.clip.kind !== 'audio')) { toast('Select a video or audio clip first'); return; }
    const c = f.clip; const m = this.store.project.media[c.mediaId];
    if (!this.bank.has(c.mediaId)) { toast('This clip has no analysable audio', 'err'); return; }
    const sil = this.bank.silences(c.mediaId, -38, 0.35);
    const a = c.in, b = c.in + c.dur * c.speed;
    const keep = []; let cur = a;
    for (const [s0, s1] of sil) { if (s1 <= a || s0 >= b) continue; const s = Math.max(s0, a), e = Math.min(s1, b); if (s - cur > 0.08) keep.push([cur, s + 0.06]); cur = Math.max(cur, e - 0.06); }
    if (b - cur > 0.08) keep.push([cur, b]);
    if (keep.length <= 1 && !sil.some(([s0, s1]) => s1 > a && s0 < b)) { toast('No silences found'); return; }
    this.store.commit(() => {
      const tr = f.track;
      const after = tr.clips.filter((o) => o.id !== c.id && o.start >= end(c) - 1e-3);
      tr.clips = tr.clips.filter((x) => x.id !== c.id);
      let t = c.start;
      for (const [s, e] of keep) { const n = deep(c); n.id = 'clp_' + Math.random().toString(36).slice(2, 9); n.in = s; n.dur = (e - s) / c.speed; n.start = t; n.transIn = null; n.kf = {}; t += n.dur; tr.clips.push(n); }
      const removed = c.dur - (t - c.start);
      for (const o of after) o.start = Math.max(0, o.start - removed);
      this.store.sel.clear();
    });
    toast('Silences removed', 'ok'); void m;
  }

  // ------------------------------------------------------------ menus
  menu(x, y, items) {
    document.querySelector('.ctxmenu')?.remove();
    const m = h('div.ctxmenu', items.map((i) => (i === '-' ? h('div.sep') : h('button', { on: { click: () => { m.remove(); i.fn(); } } }, icon(i.icon || 'more', 16), i.label))));
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = clamp(x, 8, innerWidth - r.width - 8) + 'px'; m.style.top = clamp(y, 8, innerHeight - r.height - 8) + 'px';
    const off = (e) => { if (!m.contains(e.target)) { m.remove(); window.removeEventListener('pointerdown', off, true); } };
    setTimeout(() => window.addEventListener('pointerdown', off, true), 0);
  }
  clipMenu(c, e) {
    this.menu(e.clientX, e.clientY, [{ label: 'Split at playhead', icon: 'split', fn: () => this.doSplit() }, { label: 'Duplicate', icon: 'copy', fn: () => this.store.duplicate() }, { label: 'Copy', icon: 'copy', fn: () => this.store.copy() }, { label: 'Paste at playhead', icon: 'plus', fn: () => this.store.paste() }, '-',
      { label: 'Delete', icon: 'trash', fn: () => this.store.remove() }, { label: 'Delete & close gap', icon: 'trash', fn: () => this.store.remove([...this.store.sel], { ripple: true }) }]);
  }
  trackMenu(tr, e) {
    const r = e.currentTarget.getBoundingClientRect();
    const items = [];
    if (tr.kind !== 'audio') items.push({ label: tr.hidden ? 'Show track' : 'Hide track', icon: 'eye', fn: () => { this.store.commit(() => { tr.hidden = !tr.hidden; }, { audio: false }); } });
    if (tr.kind === 'audio' || tr.kind === 'video') items.push({ label: tr.muted ? 'Unmute track' : 'Mute track', icon: tr.muted ? 'volume' : 'mute', fn: () => { this.store.commit(() => { tr.muted = !tr.muted; }); } });
    const essential = ['video', 'audio'].includes(tr.kind) && this.store.project.tracks.filter((t) => t.kind === tr.kind)[0]?.id === tr.id;
    if (!essential) items.push('-', { label: 'Delete track', icon: 'trash', fn: () => this.store.commit((p) => { p.tracks = p.tracks.filter((t) => t.id !== tr.id); }) });
    if (!items.length) return;
    this.menu(r.right + 4, r.top, items);
  }

  fullscreen() { const el = $('cwrap'); (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el); }

  // ------------------------------------------------------------ keyboard
  onKey(e) {
    if ($('editor').hidden) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) && !(e.target.type === 'range')) return;
    if (document.querySelector('.modal-back')) return;
    const mod = e.ctrlKey || e.metaKey; const s = this.store; const eng = this.engine;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); eng.toggle(); }
    else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? s.redo() : s.undo(); }
    else if (mod && k === 'y') { e.preventDefault(); s.redo(); }
    else if (mod && k === 'd') { e.preventDefault(); s.duplicate(); }
    else if (mod && k === 'c') { s.copy(); }
    else if (mod && k === 'v') { s.paste(); }
    else if (mod && k === 'a') { e.preventDefault(); s.select(s.project.tracks.flatMap((t) => t.clips.map((c) => c.id))); }
    else if (k === 's' && !mod) { e.preventDefault(); this.doSplit(); }
    else if (k === 'delete' || k === 'backspace') { e.preventDefault(); s.remove([...s.sel], { ripple: e.shiftKey }); }
    else if (k === 'arrowleft') { e.preventDefault(); eng.seek(eng.t - (e.shiftKey ? 1 : 1 / s.project.canvas.fps)); }
    else if (k === 'arrowright') { e.preventDefault(); eng.seek(eng.t + (e.shiftKey ? 1 : 1 / s.project.canvas.fps)); }
    else if (k === 'home') eng.seek(0);
    else if (k === 'end') eng.seek(eng.duration);
    else if (k === '=' || k === '+') this.timeline.zoom(1.3);
    else if (k === '-') this.timeline.zoom(1 / 1.3);
    else if (k === 'escape') { s.select([]); this.closeSheets(); }
  }

  // ------------------------------------------------------------ export
  async exportDialog() {
    const p = this.store.project; this.engine.pause();
    if (projectDuration(p) <= 0) { toast('Add some clips first', 'err'); return; }
    const cap = await capabilities();
    const mobile = this.isMobile;
    const opts = { res: mobile ? '1080' : '1080', fps: 30, quality: 'high', normalize: true };
    const resList = RESOLUTIONS.filter((r) => (mobile ? ['720', '1080'].includes(r.id) || r.id === '1440' : true));
    const info = h('div.hint'); const body = h('div');
    const mk = (label, key, list) => { const g = h('div.opt-grid' + (list.length === 3 ? '.c3' : '')); const draw = () => g.replaceChildren(...list.map(([v, n, s]) => h('button.opt' + (opts[key] === v ? '.on' : ''), { on: { click: () => { opts[key] = v; draw(); upd(); } } }, n, s ? h('small', s) : null))); draw(); body.append(h('div.sub', { style: { margin: '4px 2px' } }, label), g); };
    mk('Resolution', 'res', resList.map((r) => [r.id, r.name, (() => { const o = outputSize(p, r.short); return `${o.W}×${o.H}`; })()]));
    mk('Frame rate', 'fps', [[24, '24 fps', 'Cinematic'], [30, '30 fps', 'Standard'], [60, '60 fps', 'Smooth']]);
    mk('Quality', 'quality', [['high', 'High', 'Larger file'], ['medium', 'Balanced', ''], ['low', 'Small', 'Smallest file']]);
    body.append(h('div.rowx', h('label', { style: { flex: 1 } }, 'Normalise loudness'), sw2(opts.normalize, (v) => { opts.normalize = v; })), info);
    const upd = () => {
      const r = RESOLUTIONS.find((x) => x.id === opts.res); const o = outputSize(p, r.short);
      const mbps = (o.W * o.H * opts.fps * ({ high: 0.2, medium: 0.12, low: 0.07 }[opts.quality])) / 1e6;
      const size = (mbps * projectDuration(p)) / 8;
      info.textContent = `${o.W}×${o.H} · about ${fmtBytes(size * 1e6)} · ${fmtDur(projectDuration(p))}` + (cap.webcodecs && cap.h264 ? '' : ' · compatibility mode (real-time)');
    };
    upd();
    if (!(cap.webcodecs && cap.h264)) body.append(h('div.hint', { style: { color: 'var(--warn)' } }, 'This browser lacks fast encoding, so your video will be recorded in real time. Keep this tab open and in front.'));
    modal({ title: 'Export video', lead: 'Rendered on your device. Nothing is uploaded.', body, actions: [{ label: 'Cancel', ghost: true }, { label: 'Export', primary: true, onClick: () => { this.runExport(opts, cap); } }] });
  }

  async runExport(opts, cap) {
    const p = this.store.project; const res = RESOLUTIONS.find((r) => r.id === opts.res);
    const abort = new AbortController();
    const bar = h('i'); const stage = h('span', 'Preparing…'); const eta = h('span', '');
    const m = modal({ title: 'Exporting', lead: 'Keep this tab open until it finishes.', body: h('div', h('div.bar', bar), h('div.stat', stage, eta)), dismiss: false, actions: [{ label: 'Cancel', ghost: true, onClick: () => { abort.abort(); } }] });
    const onProgress = (x) => { stage.textContent = x.stage + (x.frame ? ` · frame ${x.frame}/${x.total}` : ''); bar.style.width = Math.round((x.pct || 0) * 100) + '%'; eta.textContent = x.eta != null ? `${Math.ceil(x.eta)}s left` : ''; };
    await this.engine.unlockAudio();
    const wake = await navigator.wakeLock?.request?.('screen').catch(() => null);
    let out;
    try {
      const fps = +opts.fps;
      if (cap.webcodecs && cap.h264) {
        try { out = await exportWebCodecs({ project: p, lib: this.lib, bank: this.bank, res, fps, quality: opts.quality, normalize: opts.normalize, onProgress, signal: abort.signal, cap }); }
        catch (e) {
          if (e.name === 'AbortError') throw e;
          if (e.message === 'NO_AUDIO_ENCODER' || e.name === 'EncodingError' || /encod/i.test(e.message || '')) { toast('Switching to compatibility export…'); out = await exportRealtime({ engine: this.engine, project: p, res, fps, onProgress, signal: abort.signal }); }
          else throw e;
        }
      } else out = await exportRealtime({ engine: this.engine, project: p, res, fps, onProgress, signal: abort.signal });
      m.close();
      this.finishExport(out);
    } catch (e) {
      m.close();
      if (e.name === 'AbortError') toast('Export cancelled'); else { console.error(e); toast('Export failed: ' + (e.message || e), 'err', 5000); }
    } finally { wake?.release?.(); this.engine.seek(this.engine.t, true); }
  }

  finishExport(out) {
    const name = safeName(this.store.project.name) + '.' + out.ext;
    const file = new File([out.blob], name, { type: out.blob.type || 'video/mp4' });
    const url = URL.createObjectURL(out.blob);
    const vid = h('video', { src: url, controls: true, playsInline: true, style: { width: '100%', maxHeight: '46vh', borderRadius: '12px', background: '#000' } });
    const acts = [{ label: 'Done', ghost: true, onClick: () => { URL.revokeObjectURL(url); } }];
    if (navigator.canShare?.({ files: [file] })) acts.unshift({ label: 'Share', keep: true, onClick: async () => { try { await navigator.share({ files: [file], title: name }); } catch {} } });
    acts.push({ label: 'Download', primary: true, keep: true, onClick: () => downloadBlob(out.blob, name) });
    modal({ title: 'Your video is ready', lead: `${out.W}×${out.H} · ${out.fps} fps · ${fmtBytes(out.blob.size)}${out.audio === 'opus' ? ' · Opus audio' : ''}`, body: vid, actions: acts, dismiss: false });
  }
}

const sw2 = (on, fn) => { const b = h('button.switch' + (on ? '.on' : ''), { role: 'switch', on: { click: () => { const v = !b.classList.contains('on'); b.classList.toggle('on', v); fn(v); } } }); return b; };

const app = new App();
window.__app = app;
app.start().catch((e) => { console.error(e); document.body.append(h('pre', { style: { position: 'fixed', inset: 0, padding: '20px', background: '#000', color: '#f66', zIndex: 999, whiteSpace: 'pre-wrap' } }, 'EDEN Studio failed to start:\n' + (e.stack || e))); });
void MUSIC; void EASE; void builtinMedia; void transitionById; void mergeText;
