// Live preview engine: playback clock (AudioContext), video element pool, audio scheduling, rendering.
import { Emitter, clamp } from './util.js';
import { Renderer } from './gl.js';
import { Compositor } from './compose.js';
import { scheduleAudio } from './audio.js';
import { projectDuration, srcTime, end } from './model.js';

const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

export class Engine extends Emitter {
  constructor(canvas, lib, bank, { maxVideos = 6, previewEdge = 1080 } = {}) {
    super();
    this.canvas = canvas;
    this.lib = lib; this.bank = bank;
    this.r = new Renderer(canvas);
    this.r.onRestore = () => this.requestRender();
    this.comp = new Compositor(this.r, { frame: (clip, srcT) => this.frame(clip, srcT) });
    this.project = null;
    this.t = 0;
    this.playing = false;
    this.videos = new Map();
    this.maxVideos = maxVideos;
    this.previewEdge = previewEdge;
    this.actx = null;
    this.audio = null;
    this.loop = false;
    this._raf = 0;
    this.holder = document.createElement('div');
    this.holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none';
    document.body.append(this.holder);
  }

  setProject(p) {
    this.project = p;
    this.applySize();
    this.requestRender();
  }

  applySize() {
    const { w, h } = this.project.canvas;
    const k = Math.min(1, this.previewEdge / Math.max(w, h));
    this.r.setSize(Math.round((w * k) / 2) * 2, Math.round((h * k) / 2) * 2);
  }

  get duration() { return this.project ? projectDuration(this.project) : 0; }

  // ------------------------------------------------------------ sources
  frame(clip, srcT) {
    if (clip.kind === 'image') {
      const p = this.lib.images.get(clip.mediaId);
      if (!p) { this.lib.image(clip.mediaId).then(() => this.requestRender()); return null; }
      const cached = this._imgCache?.get(clip.mediaId);
      if (cached) return cached;
      p.then((img) => { if (img) { (this._imgCache ||= new Map()).set(clip.mediaId, { el: img, w: img.naturalWidth, h: img.naturalHeight, version: 'img' }); this.requestRender(); } });
      return null;
    }
    const e = this.getVideo(clip);
    if (!e) return null;
    const v = e.v;
    e.last = performance.now();
    const media = this.project.media[clip.mediaId];
    const dur = media?.duration || v.duration || 0;
    const tt = clamp(srcT, 0, Math.max(0, dur - 0.04));
    if (this.playing) {
      const rate = clamp(clip.speed, 0.0625, 16);
      if (v.playbackRate !== rate) v.playbackRate = rate;
      if (v.paused) { if (Math.abs(v.currentTime - tt) > 0.04) v.currentTime = tt; v.play().catch(() => {}); }
      else if (Math.abs(v.currentTime - tt) > 0.3) v.currentTime = tt;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - tt) > 0.025) v.currentTime = tt;
    }
    if (v.readyState < 2 || !v.videoWidth) return v.videoWidth ? { el: v, w: v.videoWidth, h: v.videoHeight, reuse: true } : null;
    return { el: v, w: v.videoWidth, h: v.videoHeight };
  }

  getVideo(clip) {
    let e = this.videos.get(clip.id);
    if (e) return e;
    const url = this.lib.url(clip.mediaId);
    if (!url) return null;
    this.evict();
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.src = url;
    const kick = () => { if (!this.playing) this.requestRender(); };
    v.addEventListener('seeked', kick); v.addEventListener('loadeddata', kick); v.addEventListener('canplay', kick);
    this.holder.append(v);
    e = { v, mediaId: clip.mediaId, last: performance.now() };
    this.videos.set(clip.id, e);
    return e;
  }

  evict() {
    if (this.videos.size < this.maxVideos) return;
    const live = new Set(this.project.tracks.flatMap((t) => t.clips.map((c) => c.id)));
    const arr = [...this.videos.entries()].sort((a, b) => a[1].last - b[1].last);
    for (const [id, e] of arr) {
      if (this.videos.size < this.maxVideos) break;
      if (performance.now() - e.last < 1500 && live.has(id)) continue;
      this.drop(id);
    }
  }
  drop(id) { const e = this.videos.get(id); if (!e) return; e.v.pause(); e.v.removeAttribute('src'); e.v.load(); e.v.remove(); this.videos.delete(id); this.r.dropSource('clip:' + id); }

  warmNext() {
    if (!this.project) return;
    for (const tr of this.project.tracks) {
      if (tr.kind !== 'video') continue;
      for (const c of tr.clips) {
        if (c.kind !== 'video') continue;
        const ahead = c.start - this.t;
        if (ahead > -0.1 && ahead < 2.5 && !this.videos.has(c.id)) {
          const e = this.getVideo(c);
          if (e && !this.playing) e.v.currentTime = c.in;
          else if (e) e.v.currentTime = c.in;
        }
      }
    }
  }

  // ------------------------------------------------------------ audio
  async unlockAudio() {
    if (!this.actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.actx = new AC({ latencyHint: 'interactive' });
      try { const a = new Audio(SILENT_WAV); a.loop = true; this._silent = a; } catch {}
    }
    try { this._silent?.play().catch(() => {}); } catch {}
    if (this.actx.state !== 'running') { try { await this.actx.resume(); } catch {} }
  }

  _startAudio() {
    this._stopAudio();
    if (!this.actx) return;
    this.ctxStart = this.actx.currentTime + 0.05;
    this.playFrom = this.t;
    this.audio = scheduleAudio(this.actx, this.project, this.bank, this.t, this.ctxStart, this.audioDest || this.actx.destination);
  }
  _stopAudio() { if (this.audio) { this.audio.stop(); this.audio = null; } }

  // ------------------------------------------------------------ transport
  async play() {
    if (this.playing || !this.project) return;
    if (this.t >= this.duration - 0.05) this.t = 0;
    await this.unlockAudio();
    this.playing = true;
    this._startAudio();
    this.emit('play');
    cancelAnimationFrame(this._raf); this._raf = 0;
    let n = 0;
    const tick = () => {
      if (!this.playing) return;
      const now = this.actx.currentTime;
      let t = this.playFrom + Math.max(0, now - this.ctxStart);
      const dur = this.duration;
      if (t >= dur) {
        if (this.loop && dur > 0) { this.t = 0; this._startAudio(); this._raf = requestAnimationFrame(tick); return; }
        this.t = dur; this.pause(); this.emit('ended'); return;
      }
      this.t = t;
      this.renderNow();
      this.emit('time', t);
      if (++n % 20 === 0) this.warmNext();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  pause() {
    if (!this.playing) { return; }
    this.playing = false;
    cancelAnimationFrame(this._raf); this._raf = 0;
    this._stopAudio();
    try { this._silent?.pause(); } catch {}
    for (const e of this.videos.values()) e.v.pause();
    this.emit('pause');
    this.requestRender();
  }

  toggle() { return this.playing ? this.pause() : this.play(); }

  seek(t, silent = false) {
    this.t = clamp(t, 0, Math.max(this.duration, 0));
    if (this.playing) { this._startAudio(); }
    this.requestRender();
    if (!silent) this.emit('time', this.t);
  }

  /** Call after the project changed (edits): re-render and refresh audio if playing. */
  invalidate({ audio = true } = {}) {
    if (!this.project) return;
    for (const id of [...this.videos.keys()]) {
      const live = this.project.tracks.some((tr) => tr.clips.some((c) => c.id === id));
      if (!live) this.drop(id);
    }
    if (this.playing && audio) { clearTimeout(this._ai); this._ai = setTimeout(() => this._startAudio(), 30); }
    this.requestRender();
  }

  requestRender() {
    if (this.playing || this._raf || this._pending) return;
    this._pending = requestAnimationFrame(() => { this._pending = 0; this.renderNow(); });
  }

  renderNow() {
    if (!this.project || this.r.lost) return;
    try { this.comp.renderFrame(this.project, this.t); }
    catch (e) { console.error('[render]', e); }
    if (this.r.frameN % 120 === 0) this.r.trimSources();
    this.emit('frame');
  }

  /** Small JPEG data URL of the first frame (for project cards). */
  async snapshot(w = 240) {
    this.renderNow();
    const c = document.createElement('canvas');
    const k = w / this.canvas.width;
    c.width = w; c.height = Math.round(this.canvas.height * k);
    c.getContext('2d').drawImage(this.canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  }

  destroy() {
    this.pause();
    for (const id of [...this.videos.keys()]) this.drop(id);
    this.holder.remove();
    this.r.destroy();
  }
}
