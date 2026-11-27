// Preview canvas interaction: tap-to-select, drag to move, corner to scale, handle to rotate, two-finger pinch/rotate.
import { h, clamp, EASE } from '../util.js';
import { evalKF, end } from '../model.js';
import { renderText, renderSticker } from '../textrender.js';
import { clipTransform } from '../compose.js';

const VISUAL = new Set(['video', 'image', 'gen', 'text', 'sticker']);

export class PreviewOverlay {
  constructor(wrap, overlay, app) {
    this.wrap = wrap; this.overlay = overlay; this.app = app;
    this.box = null; this.guides = [h('div.guide', { hidden: true }), h('div.guide', { hidden: true })];
    overlay.append(...this.guides);
    this.pts = new Map();
    wrap.addEventListener('pointerdown', (e) => this._down(e));
    wrap.addEventListener('pointermove', (e) => this._move(e));
    const up = (e) => this._up(e);
    wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
    app.store.on('select', () => this.update());
    app.store.on('change', () => this.update());
    app.engine.on('time', () => { if (!app.engine.playing) this.update(); });
    app.engine.on('pause', () => this.update());
    app.engine.on('play', () => this.update());
  }
  get S() { const r = this.wrap.getBoundingClientRect(); return { w: r.width, h: r.height, rect: r }; }

  /** Displayed size (CSS px) and centre of a clip at the current time. */
  geom(clip) {
    const { app } = this; const eng = app.engine; const { w: W, h: H } = this.S;
    const k = W / eng.r.w; // css px per render px
    const tRel = clamp(eng.t - clip.start, 0, clip.dur);
    const tf = clipTransform(clip, tRel);
    let bw, bh;
    if (clip.kind === 'text') { const t = renderText(clip, eng.r.h, eng.r.w, {}); bw = t.w * tf.s * k; bh = t.h * tf.s * k; }
    else if (clip.kind === 'sticker') { const t = renderSticker(clip, eng.r.h); bw = t.w * tf.s * k; bh = t.h * tf.s * k; }
    else if (clip.kind === 'gen') { bw = W * tf.s; bh = H * tf.s; }
    else {
      const m = app.store.project.media[clip.mediaId]; if (!m || !m.w) { bw = W * tf.s; bh = H * tf.s; }
      else {
        const c = clip.crop; const ew = m.w * Math.max(0.01, 1 - c.l - c.r), eh = m.h * Math.max(0.01, 1 - c.t - c.b);
        const base = clip.tf.fit === 'fit' ? Math.min(eng.r.w / ew, eng.r.h / eh) : Math.max(eng.r.w / ew, eng.r.h / eh);
        bw = ew * base * tf.s * k; bh = eh * base * tf.s * k;
      }
    }
    let cx = W / 2 + tf.x * W, cy = H / 2 + tf.y * H;
    // full-bleed media: show the box where it intersects the canvas so handles stay reachable
    if ((clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'gen') && Math.abs(tf.r) < 0.5 && tf.s <= 1.001 + 1) {
      const x0 = Math.max(cx - bw / 2, 0), x1 = Math.min(cx + bw / 2, W), y0 = Math.max(cy - bh / 2, 0), y1 = Math.min(cy + bh / 2, H);
      if (x1 > x0 && y1 > y0) { cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; bw = x1 - x0; bh = y1 - y0; }
    }
    return { cx, cy, bw, bh, rot: tf.r, tf };
  }

  update() {
    const { app } = this;
    this.box?.remove(); this.box = null;
    if (!app.store.project || app.engine.playing) return;
    const f = app.store.selected;
    if (!f || !VISUAL.has(f.clip.kind)) return;
    const c = f.clip;
    if (app.engine.t < c.start - 1e-3 || app.engine.t > end(c) + 1e-3) return;
    const g = this.geom(c);
    const box = h('div.sel-box', { style: { width: g.bw + 'px', height: g.bh + 'px', left: g.cx - g.bw / 2 + 'px', top: g.cy - g.bh / 2 + 'px', transform: `rotate(${g.rot}deg)` } },
      h('div.stem'), h('div.h.rot', { 'data-h': 'rot' }), h('div.h.br', { 'data-h': 'br' }));
    this.overlay.append(box); this.box = box;
  }

  hit(px, py) {
    const { app } = this; const t = app.engine.t; const p = app.store.project;
    const order = [];
    for (const tr of p.tracks) { if (tr.hidden || (tr.kind !== 'video' && tr.kind !== 'text')) continue; for (const c of tr.clips) if (VISUAL.has(c.kind) && t >= c.start && t < end(c)) order.push(c); }
    for (let i = order.length - 1; i >= 0; i--) {
      const c = order[i]; const g = this.geom(c);
      const a = (-g.rot * Math.PI) / 180; const dx = px - g.cx, dy = py - g.cy;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= g.bw / 2 && Math.abs(ly) <= g.bh / 2) return c;
    }
    return null;
  }

  local(e) { const r = this.wrap.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  _down(e) {
    if (!this.app.store.project) return;
    this.pts.set(e.pointerId, this.local(e));
    const handle = e.target.dataset?.h;
    const f = this.app.store.selected;
    this.wrap.setPointerCapture(e.pointerId);
    if (this.pts.size === 2 && f) { this._startPinch(f.clip); return; }
    const p = this.local(e);
    let c = f?.clip;
    if (!handle) {
      const inSel = c && VISUAL.has(c.kind) && this.box && e.target.closest('.sel-box');
      if (!inSel) { const hitC = this.hit(p.x, p.y); if (hitC) { this.app.store.select(hitC.id); c = hitC; } else { this.app.store.select([]); this.drag = null; this.tap = { x: e.clientX, y: e.clientY, t: performance.now() }; return; } }
    }
    if (!c) return;
    const g = this.geom(c);
    const tRel = clamp(this.app.engine.t - c.start, 0, c.dur);
    this.drag = { mode: handle || 'move', id: c.id, p0: p, g, tf0: { x: g.tf.x, y: g.tf.y, s: g.tf.s, r: g.tf.r }, tRel, moved: false, ang0: Math.atan2(p.y - g.cy, p.x - g.cx), d0: Math.hypot(p.x - g.cx, p.y - g.cy) };
  }

  _move(e) {
    if (!this.pts.has(e.pointerId)) return;
    const p = this.local(e); this.pts.set(e.pointerId, p);
    if (this.pinch && this.pts.size >= 2) { this._pinchMove(); return; }
    const d = this.drag; if (!d) return;
    const { w: W, h: H } = this.S;
    const f = this.app.store.selected; if (!f || f.clip.id !== d.id) return;
    const c = f.clip;
    if (!d.moved && Math.hypot(p.x - d.p0.x, p.y - d.p0.y) < 3) return;
    d.moved = true;
    if (d.mode === 'move') {
      let x = d.tf0.x + (p.x - d.p0.x) / W, y = d.tf0.y + (p.y - d.p0.y) / H;
      const gx = Math.abs(x) < 0.012, gy = Math.abs(y) < 0.012;
      if (gx) x = 0; if (gy) y = 0;
      this._guides(gx, gy);
      this.app.setTf(c, { x, y }, d.tRel);
    } else if (d.mode === 'br') {
      const dist = Math.hypot(p.x - d.g.cx, p.y - d.g.cy);
      this.app.setTf(c, { s: clamp(d.tf0.s * (dist / Math.max(4, d.d0)), 0.05, 8) }, d.tRel);
    } else if (d.mode === 'rot') {
      const a = Math.atan2(p.y - d.g.cy, p.x - d.g.cx);
      let r = d.tf0.r + ((a - d.ang0) * 180) / Math.PI;
      r = ((r + 540) % 360) - 180;
      for (const snap of [0, 90, -90, 180, -180, 45, -45, 135, -135]) if (Math.abs(r - snap) < 3) r = snap;
      this.app.setTf(c, { r }, d.tRel);
    }
    this._place(c);
  }

  _place(c) {
    if (!this.box) return;
    const g = this.geom(c);
    Object.assign(this.box.style, { width: g.bw + 'px', height: g.bh + 'px', left: g.cx - g.bw / 2 + 'px', top: g.cy - g.bh / 2 + 'px', transform: `rotate(${g.rot}deg)` });
  }

  _guides(gx, gy) {
    const [v, hz] = this.guides; const { w: W, h: H } = this.S;
    Object.assign(v.style, { left: W / 2 - 0.5 + 'px', top: 0, width: '1px', height: '100%' }); v.hidden = !gx;
    Object.assign(hz.style, { top: H / 2 - 0.5 + 'px', left: 0, height: '1px', width: '100%' }); hz.hidden = !gy;
  }

  _startPinch(c) {
    const [a, b] = [...this.pts.values()];
    const g = this.geom(c);
    this.drag = null;
    this.pinch = { id: c.id, d0: Math.hypot(a.x - b.x, a.y - b.y), a0: Math.atan2(b.y - a.y, b.x - a.x), s0: g.tf.s, r0: g.tf.r, tRel: clamp(this.app.engine.t - c.start, 0, c.dur) };
  }
  _pinchMove() {
    const [a, b] = [...this.pts.values()]; const P = this.pinch;
    const f = this.app.store.selected; if (!f || f.clip.id !== P.id) return;
    const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    let r = P.r0 + ((ang - P.a0) * 180) / Math.PI; r = ((r + 540) % 360) - 180;
    this.app.setTf(f.clip, { s: clamp(P.s0 * (d / Math.max(10, P.d0)), 0.05, 8), r }, P.tRel);
    this._place(f.clip);
  }

  _up(e) {
    this.pts.delete(e.pointerId);
    if (this.pts.size < 2) this.pinch = null;
    if (this.tap && this.pts.size === 0) { const t = this.tap; this.tap = null; void t; }
    if (this.pts.size === 0) {
      const d = this.drag; this.drag = null;
      this.guides.forEach((g) => { g.hidden = true; });
      if (d?.moved) { this.app.inspector.render(); this.update(); }
    }
  }
}
void EASE; void evalKF;
