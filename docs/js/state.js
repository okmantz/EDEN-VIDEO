// Editor state: current project, selection, undo/redo history, autosave and all timeline edit operations.
import { Emitter, deep, uid, debounce, clamp } from './util.js';
import {
  newProject, normalizeProject, findClip, allClips, projectDuration, end, splitClip, kindOfTrack, overlaps,
  videoClip, genClip, audioClip, textClip, stickerClip, fxClip, snapPoints, snapTime, TF_DEFAULT,
} from './model.js';
import { Storage } from './media.js';

const MAX_HISTORY = 80;

export class Store extends Emitter {
  constructor() {
    super();
    this.project = null;
    this.sel = new Set();          // selected clip ids
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;
    this.save = debounce(() => this._save(), 700);
    this.clipboard = null;
  }

  // ------------------------------------------------------------ project lifecycle
  open(project) {
    this.project = normalizeProject(project);
    this.sel.clear(); this.undoStack = []; this.redoStack = []; this.dirty = false;
    this.emit('project'); this.emit('select');
  }
  create(ratio, name) { const p = newProject(ratio, name); this.open(p); this._save(); return this.project; }
  async _save() {
    if (!this.project) return;
    this.project.updated = Date.now();
    try { await Storage.saveProject(this.project); this.dirty = false; this.emit('saved'); } catch (e) { console.warn('save failed', e); this.emit('save-error', e); }
  }
  flush() { this.save.flush(); }

  // ------------------------------------------------------------ history
  /** Run a mutation as ONE undo step. `coalesce` merges rapid same-key edits (sliders). */
  commit(fn, { coalesce = null, structure = true, audio = true } = {}) {
    const now = performance.now();
    const snap = JSON.stringify(this.project);
    const merge = coalesce && this._co && this._co.key === coalesce && now - this._co.t < 900;
    if (!merge) { this.undoStack.push(snap); if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift(); }
    this.redoStack = [];
    this._co = coalesce ? { key: coalesce, t: now } : null;
    const r = fn(this.project);
    this.dirty = true;
    this.pruneSel();
    this.emit('change', { structure, audio });
    this.save();
    return r;
  }
  pruneSel() { for (const id of [...this.sel]) if (!findClip(this.project, id)) this.sel.delete(id); }
  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.undoStack.pop());
    this._co = null; this.pruneSel(); this.dirty = true;
    this.emit('change', { structure: true, audio: true }); this.emit('select'); this.save();
  }
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.redoStack.pop());
    this._co = null; this.pruneSel(); this.dirty = true;
    this.emit('change', { structure: true, audio: true }); this.emit('select'); this.save();
  }

  // ------------------------------------------------------------ selection
  select(ids, additive = false) {
    ids = ids == null ? [] : Array.isArray(ids) ? ids : [ids];
    if (!additive) this.sel.clear();
    ids.forEach((i) => (additive && this.sel.has(i) ? this.sel.delete(i) : this.sel.add(i)));
    this.emit('select');
  }
  get selId() { return this.sel.size === 1 ? [...this.sel][0] : null; }
  get selected() { const id = this.selId; return id ? findClip(this.project, id) : null; }
  get selectedClips() { return [...this.sel].map((id) => findClip(this.project, id)).filter(Boolean); }

  // ------------------------------------------------------------ tracks
  trackFor(kind, t0, dur, ignore = new Set()) {
    const p = this.project;
    const want = kindOfTrack(kind);
    const list = p.tracks.filter((t) => t.kind === want);
    // overlay video tracks are the ones above Main; try the first track with space (main first for video)
    for (const tr of (want === 'video' ? list : list)) if (!overlaps(tr, t0, t0 + dur, ignore)) return tr;
    return this.addTrack(want);
  }
  addTrack(kind) {
    const p = this.project;
    const names = { video: 'Overlay', text: 'Text', fx: 'Effects', audio: 'Audio' };
    const n = p.tracks.filter((t) => t.kind === kind).length;
    const tr = { id: uid('trk'), kind, name: kind === 'video' ? `Overlay ${n}` : `${names[kind]} ${n + 1}`, clips: [] };
    // display order: text/fx/overlay above main; audio at the bottom
    if (kind === 'audio') p.tracks.unshift(tr); else p.tracks.push(tr);
    return tr;
  }
  /** Tracks sorted for display (top → bottom). Higher in array = on top for video/text. */
  displayTracks() {
    const order = { text: 0, fx: 1, video: 2, audio: 3 };
    const vids = this.project.tracks.filter((t) => t.kind === 'video');
    const mainId = vids[0]?.id;
    const rank = (t) => (t.kind === 'video' ? (t.id === mainId ? 2.5 : 2 - this.project.tracks.indexOf(t) * 0.001) : order[t.kind]);
    return [...this.project.tracks].sort((a, b) => rank(a) - rank(b));
  }
  get mainTrack() { return this.project.tracks.find((t) => t.kind === 'video'); }

  // ------------------------------------------------------------ adding content
  addClip(clip, { at = null, track = null, select = true } = {}) {
    return this.commit((p) => {
      const start = at ?? this.playheadTime ?? 0;
      clip.start = Math.max(0, start);
      let tr = track || this.trackFor(clip.kind, clip.start, clip.dur);
      if (overlaps(tr, clip.start, end(clip))) tr = this.trackFor(clip.kind, clip.start, clip.dur);
      tr.clips.push(clip);
      if (select) { this.sel.clear(); this.sel.add(clip.id); }
      return clip;
    });
  }
  get playheadTime() { return this.getTime ? this.getTime() : 0; }
  /** Append media to the end of the main track (the CapCut "add" behaviour). */
  appendMedia(media) {
    const m = media;
    return this.commit((p) => {
      p.media[m.id] = m;
      const main = this.mainTrack;
      const c = m.kind === 'audio' ? audioClip(m, 0) : videoClip(m, 0);
      if (m.kind === 'audio') {
        const tr = this.trackFor('audio', this.playheadTime || 0, c.dur);
        c.start = this.playheadTime || 0; tr.clips.push(c);
      } else {
        c.start = main.clips.reduce((a, x) => Math.max(a, end(x)), 0);
        main.clips.push(c);
      }
      this.sel.clear(); this.sel.add(c.id);
      return c;
    });
  }
  addMediaRef(m) { this.commit((p) => { p.media[m.id] = m; }, { structure: false, audio: false }); }

  addGenerator(g, dur = 5) {
    return this.commit(() => {
      const main = this.mainTrack;
      const c = genClip(g, main.clips.reduce((a, x) => Math.max(a, end(x)), 0), dur);
      main.clips.push(c); this.sel.clear(); this.sel.add(c.id); return c;
    });
  }
  addText(patch = {}) {
    return this.commit(() => {
      const t0 = this.playheadTime || 0;
      const c = textClip(t0, 3, patch);
      this.trackFor('text', t0, 3).clips.push(c); this.sel.clear(); this.sel.add(c.id); this.emit('added', c); return c;
    });
  }
  addSticker(sticker) {
    return this.commit(() => {
      const t0 = this.playheadTime || 0;
      const c = stickerClip(sticker, t0, 3);
      this.trackFor('sticker', t0, 3).clips.push(c); this.sel.clear(); this.sel.add(c.id); return c;
    });
  }
  addEffectLayer(type, params = {}) {
    return this.commit(() => {
      const t0 = this.playheadTime || 0;
      const c = fxClip(type, t0, Math.min(3, Math.max(1, projectDuration(this.project) - t0) || 3), params);
      this.trackFor('fx', t0, c.dur).clips.push(c); this.sel.clear(); this.sel.add(c.id); return c;
    });
  }
  addAudio(media, extra = {}) {
    return this.commit((p) => {
      p.media[media.id] = media;
      const t0 = this.playheadTime || 0;
      const c = audioClip(media, t0, extra);
      const pd = projectDuration(p);
      if (extra.loop && pd > t0 + 1) c.dur = pd - t0; // background music fits the video
      this.trackFor('audio', t0, c.dur).clips.push(c); this.sel.clear(); this.sel.add(c.id); return c;
    });
  }

  // ------------------------------------------------------------ editing ops
  split(at = this.playheadTime) {
    const targets = (this.sel.size ? this.selectedClips : allClips(this.project).filter((c) => at > c.start + 0.05 && at < end(c) - 0.05).map((c) => findClip(this.project, c.id)))
      .filter((x) => x && at > x.clip.start + 0.05 && at < end(x.clip) - 0.05);
    if (!targets.length) return false;
    this.commit(() => {
      for (const { clip, track } of targets) { const b = splitClip(clip, at); if (b) { track.clips.push(b); } }
    });
    return true;
  }
  remove(ids = [...this.sel], { ripple = false } = {}) {
    if (!ids.length) return;
    this.commit((p) => {
      for (const tr of p.tracks) {
        const gone = tr.clips.filter((c) => ids.includes(c.id));
        if (!gone.length) continue;
        tr.clips = tr.clips.filter((c) => !ids.includes(c.id));
        if (ripple || tr === this.mainTrack) {
          // main track closes gaps like a magnetic timeline only when ripple requested
          if (ripple) for (const g of gone.sort((a, b) => b.start - a.start)) tr.clips.forEach((c) => { if (c.start >= end(g) - 1e-3) c.start -= g.dur; });
        }
      }
      this.sel.clear();
    });
  }
  duplicate(ids = [...this.sel]) {
    const nu = [];
    this.commit((p) => {
      for (const id of ids) {
        const f = findClip(p, id); if (!f) continue;
        const c = deep(f.clip); c.id = uid('clp'); c.transIn = null;
        c.start = end(f.clip);
        let tr = f.track;
        if (overlaps(tr, c.start, end(c))) tr = this.trackFor(c.kind, c.start, c.dur);
        tr.clips.push(c); nu.push(c.id);
      }
      this.sel = new Set(nu);
    });
    this.emit('select');
  }
  copy() { this.clipboard = this.selectedClips.map((x) => deep(x.clip)); return this.clipboard.length; }
  paste(at = this.playheadTime) {
    if (!this.clipboard?.length) return;
    const base = Math.min(...this.clipboard.map((c) => c.start));
    const nu = [];
    this.commit(() => {
      for (const src of this.clipboard) {
        const c = deep(src); c.id = uid('clp'); c.start = at + (src.start - base); c.transIn = null;
        this.trackFor(c.kind, c.start, c.dur).clips.push(c); nu.push(c.id);
      }
      this.sel = new Set(nu);
    });
    this.emit('select');
  }

  /** Patch clip(s) with a function; used by every inspector control. */
  edit(fn, { ids = [...this.sel], coalesce = null, structure = false, audio = false } = {}) {
    if (!ids.length) return;
    this.commit((p) => { for (const id of ids) { const f = findClip(p, id); if (f) fn(f.clip, f.track); } }, { coalesce: coalesce && coalesce + ids.join(), structure, audio });
  }

  moveClip(id, start, trackId) {
    this.commit((p) => {
      const f = findClip(p, id); if (!f) return;
      const to = p.tracks.find((t) => t.id === trackId) || f.track;
      if (to !== f.track && to.kind !== kindOfTrack(f.clip.kind)) return;
      f.track.clips = f.track.clips.filter((c) => c.id !== id);
      f.clip.start = Math.max(0, start);
      to.clips.push(f.clip);
    });
  }

  /** Remove empty non-essential tracks. */
  tidy() {
    const p = this.project;
    const keep = new Set();
    for (const k of ['video', 'audio']) { const f = p.tracks.find((t) => t.kind === k); if (f) keep.add(f.id); }
    p.tracks = p.tracks.filter((t) => t.clips.length || keep.has(t.id));
  }

  setCanvas(ratioId, w, h) {
    this.commit((p) => { p.canvas.ratio = ratioId; p.canvas.w = w; p.canvas.h = h; });
  }
  rename(name) { this.commit((p) => { p.name = name.trim() || 'Untitled project'; }, { structure: false, audio: false }); }

  // keyframes
  toggleKeyframe(clip, key, tRel, value) {
    this.edit((c) => {
      const list = (c.kf[key] ||= []);
      const i = list.findIndex((k) => Math.abs(k.t - tRel) < 0.04);
      if (i >= 0) { list.splice(i, 1); if (!list.length) delete c.kf[key]; }
      else { list.push({ t: +tRel.toFixed(3), v: value, e: 'inout' }); list.sort((a, b) => a.t - b.t); }
    }, { ids: [clip.id], structure: true });
  }

  snap(t, ignore, thr) { const pts = snapPoints(this.project, ignore, this.playheadTime); const s = snapTime(t, pts, thr); return s == null ? t : s; }
}

export { TF_DEFAULT, clamp };
