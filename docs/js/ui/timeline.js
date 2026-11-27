// Multi-track timeline: touch + mouse drag, trim, snap, pinch-zoom, scrubbing, waveforms and thumbnails.
import { h, clamp, fmtTime } from '../util.js';
import { icon } from './icons.js';
import { end, projectDuration, snapPoints, snapTime, overlaps, maxMediaSpan, kindOfTrack } from '../model.js';

const LANE_H = { video: 56, text: 38, fx: 34, audio: 46 };
const MAIN_H = 62;
const RULER = 24;
const GAP = 4;
const HANDLE = 14;

export class Timeline {
  constructor(root, ctx) {
    Object.assign(this, ctx); // store, engine, lib, bank, onTransition, onTrackMenu
    this.root = root;
    this.pps = ctx.isMobile ? 52 : 80;
    this.layout = [];
    this.thumbJobs = 0;
    this._build();
    this.store.on('change', () => this.render());
    this.store.on('project', () => { this.render(); this.scrollToTime(0); });
    this.store.on('select', () => this.updateSelection());
    this.engine.on('time', (t) => this.updatePlayhead(t, true));
    this.engine.on('play', () => { this.following = true; });
    new ResizeObserver(() => this.updateWidth()).observe(this.scroll);
  }

  _build() {
    const { root } = this;
    this.btnSplit = h('button.btn.ghost.sm', { title: 'Split at playhead (S)', on: { click: () => this.onSplit?.() } }, icon('split', 17), h('span.desktop-only', 'Split'));
    this.btnDel = h('button.btn.ghost.sm', { title: 'Delete (Del)', on: { click: () => this.onDelete?.() } }, icon('trash', 17), h('span.desktop-only', 'Delete'));
    this.btnDup = h('button.btn.ghost.sm.desktop-only', { title: 'Duplicate (Ctrl+D)', on: { click: () => this.onDuplicate?.() } }, icon('copy', 17), 'Duplicate');
    this.zoomOut = h('button.btn.ghost.sm.icon', { title: 'Zoom out', on: { click: () => this.zoom(1 / 1.35) } }, icon('zoomout', 17));
    this.zoomIn = h('button.btn.ghost.sm.icon', { title: 'Zoom in', on: { click: () => this.zoom(1.35) } }, icon('zoomin', 17));
    this.fitBtn = h('button.btn.ghost.sm.icon', { title: 'Fit to window', on: { click: () => this.fit() } }, icon('fit', 17));
    this.bar = h('div.tl-bar', this.btnSplit, this.btnDup, this.btnDel, h('div.sp'),
      h('div.zoomctl', { style: { display: 'flex', gap: '2px' } }, this.zoomOut, this.zoomIn, this.fitBtn));
    this.heads = h('div.tl-heads');
    this.headsIn = h('div', { style: { position: 'relative' } });
    this.heads.append(this.headsIn);
    this.inner = h('div.tl-inner');
    this.ruler = h('div.ruler');
    this.playhead = h('div.playhead');
    this.snapLine = h('div.snapline', { hidden: true });
    this.empty = h('div.tl-empty', h('div', icon('plus', 22), h('div', 'Add a clip to start editing')));
    this.inner.append(this.ruler, this.playhead, this.snapLine);
    this.scroll = h('div.tl-scroll', this.inner);
    root.append(this.bar, h('div.tl-body', this.heads, this.scroll));
    this.scroll.addEventListener('scroll', () => { this.heads.scrollTop = this.scroll.scrollTop; });
    this.scroll.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX); }
      else if (e.shiftKey && !e.deltaX) { this.scroll.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    // ruler scrubbing
    this.ruler.addEventListener('pointerdown', (e) => this._scrub(e));
    // empty-lane tap: deselect + move playhead
    this.inner.addEventListener('pointerdown', (e) => this._lanePointer(e));
    // pinch zoom
    this.pointers = new Map();
    this.scroll.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { this.pointers.set(e.pointerId, e); if (this.pointers.size === 2) this._pinchStart(); } }, true);
    this.scroll.addEventListener('pointermove', (e) => { if (this.pointers.has(e.pointerId)) { this.pointers.set(e.pointerId, e); if (this.pointers.size === 2) this._pinchMove(); } }, true);
    const up = (e) => { this.pointers.delete(e.pointerId); if (this.pointers.size < 2) this.pinch = null; };
    this.scroll.addEventListener('pointerup', up, true); this.scroll.addEventListener('pointercancel', up, true);
  }

  // ------------------------------------------------------------ geometry
  t2x(t) { return t * this.pps; }
  x2t(x) { return x / this.pps; }
  get contentW() { const d = projectDuration(this.store.project); return Math.max(this.scroll.clientWidth, (d + Math.max(6, this.scroll.clientWidth / this.pps * 0.6)) * this.pps); }
  evT(e) { const r = this.inner.getBoundingClientRect(); return Math.max(0, this.x2t(e.clientX - r.left)); }

  zoom(k, clientX) {
    const r = this.scroll.getBoundingClientRect();
    const cx = clientX != null ? clientX - r.left : this.t2x(this.engine.t) - this.scroll.scrollLeft;
    const tAt = this.x2t(this.scroll.scrollLeft + cx);
    this.pps = clamp(this.pps * k, 6, 420);
    this.render(true);
    this.scroll.scrollLeft = this.t2x(tAt) - cx;
  }
  fit() {
    const d = Math.max(1, projectDuration(this.store.project));
    this.pps = clamp((this.scroll.clientWidth - 40) / d, 6, 420);
    this.render(true); this.scroll.scrollLeft = 0;
  }
  _pinchStart() { const [a, b] = [...this.pointers.values()]; this.pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), pps: this.pps, cx: (a.clientX + b.clientX) / 2 }; this.drag = null; }
  _pinchMove() {
    if (!this.pinch) return;
    const [a, b] = [...this.pointers.values()];
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const target = clamp(this.pinch.pps * (d / this.pinch.d), 6, 420);
    this.zoom(target / this.pps, this.pinch.cx);
  }

  scrollToTime(t, center = false) {
    const x = this.t2x(t), w = this.scroll.clientWidth;
    if (center || x < this.scroll.scrollLeft + 30 || x > this.scroll.scrollLeft + w - 30) this.scroll.scrollLeft = Math.max(0, x - w * (center ? 0.5 : 0.25));
  }

  // ------------------------------------------------------------ render
  render(zoomOnly = false) {
    const p = this.store.project; if (!p) return;
    const tracks = this.store.displayTracks();
    // keep one empty lane of each user-facing kind away; only show populated + essential lanes
    this.layout = [];
    let y = RULER + 6;
    const mainId = p.tracks.find((t) => t.kind === 'video')?.id;
    for (const tr of tracks) {
      const hh = tr.id === mainId ? MAIN_H : LANE_H[tr.kind];
      this.layout.push({ tr, y, h: hh });
      y += hh + GAP;
    }
    this.totalH = y + 44;
    const W = this.contentW;
    this.inner.style.width = W + 'px'; this.inner.style.height = Math.max(this.totalH, this.scroll.clientHeight) + 'px';
    // wipe dynamic children (keep ruler/playhead/snap)
    for (const n of [...this.inner.children]) if (n !== this.ruler && n !== this.playhead && n !== this.snapLine) n.remove();
    this.headsIn.replaceChildren(); this.headsIn.style.height = this.totalH + 'px';
    this._ruler(W);
    this.laneEls = new Map();
    for (const L of this.layout) {
      const lane = h('div.lane', { style: { top: L.y + 'px', height: L.h + 'px' }, 'data-track': L.tr.id });
      this.laneEls.set(L.tr.id, lane);
      this.inner.append(lane);
      const names = { video: 'Video', text: 'Text', fx: 'FX', audio: 'Audio' };
      const head = h('button.lh', { style: { top: L.y + 'px', height: L.h + 'px', opacity: L.tr.hidden || L.tr.muted ? 0.4 : 1 }, title: 'Track options', on: { click: (e) => this.onTrackMenu?.(L.tr, e) } },
        icon(L.tr.kind === 'audio' ? (L.tr.muted ? 'mute' : 'audio') : L.tr.kind === 'text' ? 'text' : L.tr.kind === 'fx' ? 'effects' : (L.tr.hidden ? 'lock' : 'media'), 15),
        h('span.desktop-only', L.tr.name || names[L.tr.kind]));
      this.headsIn.append(head);
      for (const c of L.tr.clips) lane.append(this._clipEl(c, L));
      if (L.tr.kind === 'video') this._transMarks(L, lane);
    }
    const count = p.tracks.reduce((a, t) => a + t.clips.length, 0);
    if (!count) { this.empty.style.top = RULER + 'px'; this.inner.append(this.empty); } else this.empty.remove();
    this.updateSelection(); this.updatePlayhead(this.engine.t);
    this._buttons();
  }

  _ruler(W) {
    this.ruler.replaceChildren();
    this.ruler.style.width = W + 'px';
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const major = steps.find((s) => s * this.pps >= 78) || 600;
    const minor = major / (major >= 5 ? 5 : major === 0.1 ? 1 : 2);
    for (let t = 0; t * this.pps < W; t += minor) {
      const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      this.ruler.append(h('div.tick' + (isMajor ? '' : '.minor'), { style: { left: this.t2x(t) + 'px' } }, isMajor ? (major < 1 ? t.toFixed(1) + 's' : fmtTime(t)) : ''));
    }
  }

  _transMarks(L, lane) {
    const clips = [...L.tr.clips].sort((a, b) => a.start - b.start);
    for (let i = 1; i < clips.length; i++) {
      const A = clips[i - 1], B = clips[i];
      if (Math.abs(end(A) - B.start) > 0.06) continue;
      const has = B.transIn && B.transIn.type && B.transIn.type !== 'none';
      lane.append(h('button.tmark' + (has ? '.has' : ''), { style: { left: this.t2x(B.start) + 'px' }, title: has ? 'Edit transition' : 'Add transition', on: { pointerdown: (e) => e.stopPropagation(), click: () => this.onTransition?.(B.id) } }, icon(has ? 'transitions' : 'plus', 14)));
    }
  }

  _clipEl(c, L) {
    const w = Math.max(6, this.t2x(c.dur));
    const el = h('div.clip.k-' + c.kind, { style: { left: this.t2x(c.start) + 'px', width: w + 'px' }, 'data-id': c.id });
    const media = this.store.project.media[c.mediaId];
    if ((c.kind === 'video' || c.kind === 'image') && media) { const cv = h('canvas.strip-c'); el.append(h('div.strip', cv)); this._fillStrip(cv, c, media, w, L.h - 6); }
    if (c.kind === 'audio' && media) { const cv = h('canvas.wave'); el.append(cv); this._fillWave(cv, c, media, w, L.h - 6); }
    let label = c.name || c.kind;
    if (c.kind === 'text') label = (c.text?.content || 'Text').replace(/\n/g, ' ');
    if (c.kind === 'fx') label = (c.fx?.type || 'fx');
    const badges = [];
    if (c.speed !== 1) badges.push(h('span', { style: { color: '#ffcf5c' } }, c.speed.toFixed(2).replace(/\.?0+$/, '') + '×'));
    if (c.kind === 'video' && media?.hasAudio === false) {}
    if (c.mute || (c.vol === 0)) badges.push(icon('mute', 11));
    if (c.loop) badges.push(icon('loop', 11));
    el.append(h('div.lbl', ...badges, h('span', label)));
    for (const list of Object.values(c.kf || {})) for (const k of list) el.append(h('i.kfdot', { style: { left: this.t2x(k.t) + 'px' } }));
    el.append(h('div.hd.l', { 'data-edge': 'l' }), h('div.hd.r', { 'data-edge': 'r' }));
    el.addEventListener('pointerdown', (e) => this._clipDown(e, c, el, L));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!this.store.sel.has(c.id)) this.store.select(c.id); this.onContext?.(c, e); });
    el.addEventListener('dblclick', () => this.onOpen?.(c));
    if (this.store.sel.has(c.id)) el.classList.add('sel');
    return el;
  }

  async _fillStrip(cv, c, media, w, hh) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const count = media.kind === 'image' ? 1 : 14;
    const frames = await this.lib.thumbs(media, count, 72).catch(() => []);
    if (!cv.isConnected || !frames.length) return;
    cv.height = Math.round(hh * dpr); cv.width = Math.min(4096, Math.round(w * dpr)); cv.style.height = hh + 'px'; cv.style.width = w + 'px';
    const g = cv.getContext('2d');
    const th = frames[0].canvas; const tw = (th.width / th.height) * hh;
    const n = Math.ceil(w / tw);
    for (let i = 0; i < n; i++) {
      const tRel = ((i + 0.5) * tw) / this.pps;
      const st = media.kind === 'image' ? 0 : clamp(c.in + tRel * c.speed, 0, media.duration);
      let best = frames[0];
      for (const f of frames) if (Math.abs(f.t - st) < Math.abs(best.t - st)) best = f;
      g.drawImage(best.canvas, i * tw * dpr, 0, tw * dpr, hh * dpr);
    }
  }

  _fillWave(cv, c, media, w, hh) {
    const draw = () => {
      const perSec = 40;
      const pk = this.bank.peaks(media.id, perSec);
      if (!cv.isConnected) return;
      if (!pk) { setTimeout(draw, 400); return; }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.min(4096, Math.round(w * dpr)); cv.height = Math.round(hh * dpr); cv.style.width = w + 'px'; cv.style.height = hh + 'px';
      const g = cv.getContext('2d'); g.fillStyle = getComputedStyle(cv).color || '#7cf5c8';
      const mid = cv.height / 2;
      const barW = Math.max(1, 2 * dpr), gap = Math.max(1, 1 * dpr);
      const dur = media.duration || 1;
      for (let x = 0; x < cv.width; x += barW + gap) {
        const tRel = (x / dpr) / this.pps;
        let st = c.in + tRel * c.speed;
        if (c.loop) st = st % dur;
        const i = clamp(Math.floor(st * perSec), 0, pk.length - 1);
        let m = pk[i]; const i2 = Math.min(pk.length - 1, i + Math.max(1, Math.floor((barW + gap) / dpr / this.pps * c.speed * perSec)));
        for (let k = i; k <= i2; k++) m = Math.max(m, pk[k]);
        const v = Math.max(1.5 * dpr, Math.pow(m, 0.7) * (cv.height * 0.46));
        g.globalAlpha = 0.85; g.fillRect(x, mid - v, barW, v * 2);
      }
    };
    draw();
  }

  // ------------------------------------------------------------ selection/playhead
  updateSelection() {
    for (const el of this.inner.querySelectorAll('.clip')) el.classList.toggle('sel', this.store.sel.has(el.dataset.id));
    this._buttons();
  }
  _buttons() {
    const has = this.store.sel.size > 0;
    this.btnDel.disabled = !has; this.btnDup.disabled = !has;
  }
  updatePlayhead(t, follow = false) {
    this.playhead.style.transform = `translateX(${this.t2x(t)}px)`;
    if (follow && this.engine.playing) {
      const x = this.t2x(t) - this.scroll.scrollLeft, w = this.scroll.clientWidth;
      if (x > w * 0.88 || x < 0) this.scroll.scrollLeft = this.t2x(t) - w * 0.2;
    }
  }
  updateWidth() { if (this.store.project) this.render(true); }

  // ------------------------------------------------------------ pointer interactions
  _scrub(e) {
    e.preventDefault();
    const move = (ev) => { const t = this.evT(ev); this.engine.seek(clamp(t, 0, this.engine.duration || t)); this.updatePlayhead(this.engine.t); };
    this.ruler.setPointerCapture(e.pointerId);
    move(e);
    const up = () => { this.ruler.removeEventListener('pointermove', move); this.ruler.removeEventListener('pointerup', up); this.ruler.removeEventListener('pointercancel', up); };
    this.ruler.addEventListener('pointermove', move); this.ruler.addEventListener('pointerup', up); this.ruler.addEventListener('pointercancel', up);
  }

  _lanePointer(e) {
    if (e.target.closest('.clip') || e.target.closest('.ruler') || e.target.closest('.tmark')) return;
    const x0 = e.clientX, y0 = e.clientY; let moved = false;
    const mv = (ev) => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) moved = true; };
    const up = (ev) => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (moved || ev.type === 'pointercancel') return;
      this.store.select([]);
      this.engine.seek(clamp(this.evT(ev), 0, this.engine.duration || 0)); this.updatePlayhead(this.engine.t);
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }

  _clipDown(e, c, el, L) {
    if (e.button > 0 || this.pointers.size > 1) return;
    e.stopPropagation();
    const edge = e.target.dataset?.edge;
    const store = this.store;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!store.sel.has(c.id) || additive) store.select(c.id, additive);
    if (additive) return;
    const media = store.project.media[c.mediaId];
    const orig = { start: c.start, dur: c.dur, in: c.in };
    const startX = e.clientX, startY = e.clientY;
    const thr = 9 / this.pps;
    const ignore = new Set([c.id]);
    const pts = snapPoints(store.project, ignore, this.engine.t);
    let mode = edge ? 'trim' + edge : 'move', started = false;
    const group = mode === 'move' ? store.selectedClips.map((x) => x.clip) : [c];
    this.drag = { id: c.id };
    el.setPointerCapture(e.pointerId);
    const laneAt = (ev) => {
      const r = this.inner.getBoundingClientRect(); const y = ev.clientY - r.top;
      return this.layout.find((l) => y >= l.y - 2 && y <= l.y + l.h + 2);
    };
    let target = { start: c.start, laneId: L.tr.id, ok: true };
    const showSnap = (t) => { if (t == null) { this.snapLine.hidden = true; return; } this.snapLine.hidden = false; this.snapLine.style.left = this.t2x(t) + 'px'; };

    const move = (ev) => {
      if (!this.drag) return;
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!started) { if (Math.hypot(dx, dy) < 5) return; started = true; el.classList.add('drag'); if (ev.pointerType !== 'mouse') navigator.vibrate?.(8); }
      const dt = dx / this.pps;
      if (mode === 'move') {
        let s = Math.max(0, orig.start + dt);
        const a = snapTime(s, pts, thr), b = snapTime(s + c.dur, pts, thr);
        let snapped = null;
        if (a != null) { s = a; snapped = a; } else if (b != null) { s = b - c.dur; snapped = b; }
        s = Math.max(0, s); showSnap(snapped);
        const lane = laneAt(ev);
        let laneId = L.tr.id, ok = true;
        if (lane && lane.tr.kind === kindOfTrack(c.kind)) laneId = lane.tr.id;
        const trk = store.project.tracks.find((t) => t.id === laneId);
        const moving = new Set(group.map((g) => g.id));
        if (group.length === 1 && overlaps(trk, s, s + c.dur, moving)) ok = false;
        el.classList.toggle('bad', !ok);
        target = { start: s, laneId, ok };
        const delta = s - orig.start;
        const ty = this.layout.find((l) => l.tr.id === laneId);
        el.style.transform = `translate(${this.t2x(delta)}px, ${ty ? ty.y - L.y : 0}px)`;
        if (group.length > 1) for (const g of group) { if (g.id === c.id) continue; const ge = this.inner.querySelector(`[data-id="${g.id}"]`); if (ge) ge.style.transform = `translateX(${this.t2x(delta)}px)`; }
        // edge auto-scroll
        const sr = this.scroll.getBoundingClientRect();
        if (ev.clientX > sr.right - 40) this.scroll.scrollLeft += 14; else if (ev.clientX < sr.left + 40) this.scroll.scrollLeft -= 14;
      } else if (mode === 'triml') {
        let s = clamp(orig.start + dt, 0, orig.start + orig.dur - 0.1);
        const sn = snapTime(s, pts, thr); if (sn != null) s = sn; showSnap(sn);
        let d = s - orig.start;
        if (c.kind === 'video' || c.kind === 'audio') { const minIn = c.loop ? -1e9 : 0; d = Math.max(d, (minIn - orig.in) / c.speed); }
        s = orig.start + d;
        target = { start: s, dur: orig.dur - d, in: orig.in + d * c.speed, ok: true };
        el.style.left = this.t2x(s) + 'px'; el.style.width = Math.max(6, this.t2x(target.dur)) + 'px';
      } else if (mode === 'trimr') {
        let e2 = orig.start + orig.dur + dt;
        const sn = snapTime(e2, pts, thr); if (sn != null) e2 = sn; showSnap(sn);
        let d = Math.max(0.1, e2 - orig.start);
        d = Math.min(d, maxMediaSpan({ ...c, in: orig.in }, media));
        target = { dur: d, ok: true };
        el.style.width = Math.max(6, this.t2x(d)) + 'px';
      }
    };
    const up = (ev) => {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      this.snapLine.hidden = true;
      const wasDrag = started; this.drag = null;
      el.classList.remove('drag', 'bad'); el.style.transform = '';
      if (!wasDrag) { if (ev.type === 'pointerup' && !edge) { /* tap = select (already) */ } return; }
      if (ev.type === 'pointercancel') { this.render(); return; }
      if (mode === 'move') {
        if (!target.ok) { this.render(); return; }
        const delta = target.start - orig.start;
        const trackChanged = target.laneId !== L.tr.id;
        if (group.length > 1) store.edit((cl) => { cl.start = Math.max(0, cl.start + delta); }, { ids: group.map((g) => g.id), structure: true });
        else if (trackChanged || Math.abs(delta) > 1e-4) store.moveClip(c.id, target.start, target.laneId);
        else this.render();
      } else if (mode === 'triml') {
        store.edit((cl) => { cl.start = target.start; cl.dur = target.dur; cl.in = target.in; if (cl.kind === 'text' && cl.words) { /* word timings stay clip-relative */ } }, { ids: [c.id], structure: true, audio: true });
      } else if (mode === 'trimr') {
        store.edit((cl) => { cl.dur = target.dur; }, { ids: [c.id], structure: true, audio: true });
      }
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
}
