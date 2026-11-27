// Frame compositor: turns (project, time) into pixels using the WebGL renderer.
import { EASE, hexToRgb, clamp } from './util.js';
import { ANIM_IN, ANIM_OUT, ANIM_LOOP, effectById, filterById } from './effects.js';
import { renderText, renderSticker } from './textrender.js';
import { srcTime, evalKF, end } from './model.js';

const KF_KEYS = ['x', 'y', 's', 'r', 'op'];

/** Evaluate geometry for a clip at clip-relative time. */
export function clipTransform(clip, tRel) {
  const tf = clip.tf;
  const v = {};
  for (const k of KF_KEYS) v[k] = evalKF(clip.kf?.[k], tRel, tf[k], EASE);
  let { x, y, s, r, op } = v;
  const extra = {};
  const ai = ANIM_IN.find((a) => a.id === clip.animIn?.id);
  if (ai?.f && tRel < clip.animIn.dur) {
    const d = ai.f(clamp(tRel / Math.max(0.05, clip.animIn.dur), 0, 1));
    x += d.x || 0; y += d.y || 0; r += d.r || 0; s *= d.s ?? 1; op *= d.op ?? 1;
    if (d.type != null) extra.type = d.type;
    if (d.words != null) extra.words = d.words;
  }
  const remain = clip.dur - tRel;
  const ao = ANIM_OUT.find((a) => a.id === clip.animOut?.id);
  if (ao?.f && remain < clip.animOut.dur) {
    const d = ao.f(clamp(1 - remain / Math.max(0.05, clip.animOut.dur), 0, 1));
    x += d.x || 0; y += d.y || 0; r += d.r || 0; s *= d.s ?? 1; op *= d.op ?? 1;
  }
  const al = ANIM_LOOP.find((a) => a.id === clip.animLoop?.id);
  if (al?.f) {
    const d = al.f(tRel, clip.animLoop.amt ?? 1);
    x += d.x || 0; y += d.y || 0; r += d.r || 0; s *= d.s ?? 1;
  }
  return { x, y, s: Math.max(0, s), r, op: clamp(op, 0, 1), extra };
}

export function fxParams(fx) {
  const def = effectById(fx.type);
  const out = { amt: fx.amt ?? 0.7, p: [0, 0, 0, 0] };
  if (def) {
    def.params.forEach((pd) => {
      if (pd.k === 'amt') return;
      const idx = +pd.k.slice(1);
      out.p[idx] = fx[pd.k] ?? pd.def;
    });
  }
  return out;
}

export class Compositor {
  /** provider.frame(clip, srcT) -> {el, w, h} | null  (video / image sources) */
  constructor(renderer, provider) {
    this.r = renderer;
    this.provider = provider;
    this.lastStats = {};
  }

  renderFrame(project, t, { present = true } = {}) {
    const r = this.r;
    r.beginFrame();
    let acc = r.fbo();
    let acc2 = r.fbo();
    const bg = hexToRgb(project.canvas.bg || '#000000');
    r.clear(acc, bg[0], bg[1], bg[2], 1);
    for (const track of project.tracks) {
      if (track.hidden) continue;
      if (track.kind === 'video' || track.kind === 'text') {
        for (const layer of this._layersFor(track, t)) {
          const L = layer.trans ? this._drawTransition(layer, t) : this._drawClip(layer.clip, t, srcTime(layer.clip, t));
          if (!L) continue;
          r.compose(acc, L.fbo, acc2, L.opacity, L.blend);
          r.release(L.fbo);
          [acc, acc2] = [acc2, acc];
        }
      } else if (track.kind === 'fx') {
        for (const c of track.clips) {
          if (t < c.start || t >= end(c)) continue;
          const a = fxParams(c.fx);
          let amt = a.amt;
          // soft edges so effects ease in/out instead of popping
          const edge = Math.min(0.15, c.dur / 4);
          const k = Math.min(1, (t - c.start) / edge, (end(c) - t) / edge);
          amt *= c.fx.ease === false ? 1 : Math.max(0, k);
          if (r.effect(c.fx.type, acc, acc2, { amt, t: t - c.start, p: a.p })) [acc, acc2] = [acc2, acc];
        }
      }
    }
    if (present) r.present(acc);
    return acc;
  }

  /** Which video/image sources are needed at time t (used by the exporter to pre-seek). */
  requests(project, t) {
    const out = [];
    for (const track of project.tracks) {
      if (track.hidden || track.kind !== 'video') continue;
      for (const layer of this._layersFor(track, t)) {
        const list = layer.trans ? [layer.trans.a, layer.trans.b] : [layer.clip];
        for (const c of list) if (c.kind === 'video' || c.kind === 'image') out.push({ clip: c, srcT: Math.max(0, srcTime(c, t)) });
      }
    }
    return out;
  }

  _layersFor(track, t) {
    const clips = [...track.clips].sort((a, b) => a.start - b.start);
    const layers = [];
    const handled = new Set();
    if (track.kind === 'video') {
      for (let i = 1; i < clips.length; i++) {
        const B = clips[i], A = clips[i - 1];
        if (!B.transIn || !B.transIn.type || B.transIn.type === 'none') continue;
        if (Math.abs(end(A) - B.start) > 0.06) continue;
        const d = clamp(B.transIn.dur, 0.1, Math.max(0.1, Math.min(A.dur, B.dur) * 0.9));
        const t0 = B.start - d / 2, t1 = B.start + d / 2;
        if (t >= t0 && t < t1) { layers.push({ trans: { a: A, b: B, type: B.transIn.type, p: (t - t0) / d } }); handled.add(A.id); handled.add(B.id); }
      }
    }
    for (const c of clips) {
      if (handled.has(c.id)) continue;
      if (t >= c.start && t < end(c)) layers.push({ clip: c });
    }
    // keep stable z-order by start time
    layers.sort((a, b) => (a.trans ? a.trans.b.start : a.clip.start) - (b.trans ? b.trans.b.start : b.clip.start));
    return layers;
  }

  _drawTransition(layer, t) {
    const r = this.r;
    const { a, b, type, p } = layer.trans;
    const La = this._drawClip(a, t, Math.max(0, srcTime(a, t)), true);
    const Lb = this._drawClip(b, t, Math.max(0, srcTime(b, t)), true);
    if (!La && !Lb) return null;
    if (!La || !Lb) return La || Lb;
    const out = r.fbo();
    r.clear(out, 0, 0, 0, 0);
    r.transition(type, La.fbo, Lb.fbo, out, p, t);
    r.release(La.fbo); r.release(Lb.fbo);
    return { fbo: out, opacity: La.opacity + (Lb.opacity - La.opacity) * p, blend: Lb.blend };
  }

  /** Render one clip into its own premultiplied layer. */
  _drawClip(clip, t, srcT, ignoreRange = false) {
    const r = this.r;
    const tRel = t - clip.start;
    const kind = clip.kind;
    let src = null;
    let native = false;
    let extra = {};
    const tfm = clipTransform(clip, Math.max(0, tRel));

    if (kind === 'video' || kind === 'image') {
      const f = this.provider.frame(clip, srcT);
      if (!f || !f.w) return null;
      const useMip = clip.tf.fit === 'fit' && clip.bgblur;
      if (f.reuse) { src = r.sources.get('clip:' + clip.id) || null; if (src) src.used = r.frameN; }
      else src = r.upload('clip:' + clip.id, f.el, f.w, f.h, { version: f.version ?? null, mip: useMip });
      if (!src) return null;
    } else if (kind === 'gen') {
      const g = r.fbo();
      r.clear(g, 0, 0, 0, 1);
      if (!r.generator(clip.gen, g, Math.max(0, tRel) + (clip.in || 0))) { r.release(g); return null; }
      src = { tex: g.tex, w: r.w, h: r.h };
      this._tempFbo = g;
    } else if (kind === 'text') {
      let active = -1;
      if (clip.words) { const tr = tRel; active = clip.words.findIndex((w) => tr >= w.t0 && tr < w.t1); }
      const tx = renderText(clip, r.h, r.w, { type: tfm.extra.type, words: tfm.extra.words, active, time: tRel });
      src = r.upload('clip:' + clip.id, tx.canvas, tx.w, tx.h, { version: tx.version });
      native = true;
    } else if (kind === 'sticker') {
      const st = renderSticker(clip, r.h);
      src = r.upload('clip:' + clip.id, st.canvas, st.w, st.h, { version: st.version });
      native = true;
    }
    if (!src) return null;

    const cw = r.w, ch = r.h;
    const crop = clip.crop;
    const cl = crop.l || 0, ct = crop.t || 0, cr = crop.r || 0, cb = crop.b || 0;
    const esw = src.w * Math.max(0.01, 1 - cl - cr), esh = src.h * Math.max(0.01, 1 - ct - cb);
    let base = 1;
    if (!native) base = clip.tf.fit === 'fit' ? Math.min(cw / esw, ch / esh) : Math.max(cw / esw, ch / esh);
    const disp = [esw * base * tfm.s, esh * base * tfm.s];
    const L = r.fbo();
    r.clear(L, 0, 0, 0, 0);
    const look = filterById(clip.look?.id);
    const amt = clip.look?.amt ?? 1;
    const adj = { ...clip.adj };
    adj.vig = (adj.vig || 0) + (look.look.vig || 0) * amt;
    adj.grain = (adj.grain || 0) + (look.look.grain || 0) * amt;
    const lookAmt = look.id === 'none' ? 0 : amt;
    const o = {
      disp, off: [tfm.x * cw, -tfm.y * ch], rot: (-tfm.r * Math.PI) / 180, flip: [clip.tf.fx ? -1 : 1, clip.tf.fy ? -1 : 1],
      crop: [cl, ct, cr, cb], adj, look: look.look, lookAmt, t: t, seed: Math.floor(t * 24) * 1.37,
      chroma: clip.chroma?.on ? { on: true, key: hexToRgb(clip.chroma.color), sim: clip.chroma.sim, smooth: clip.chroma.smooth, spill: clip.chroma.spill } : null,
      mask: clip.mask && clip.mask.type !== 'none' ? { type: ['none', 'circle', 'rect', 'heart', 'star', 'diamond', 'split'].indexOf(clip.mask.type), scale: clip.mask.scale, feather: clip.mask.feather, invert: clip.mask.invert, round: clip.mask.round } : null,
    };
    if (!native && clip.tf.fit === 'fit' && clip.bgblur && kind !== 'gen') {
      const cover = Math.max(cw / esw, ch / esh);
      o.bgBlur = { disp: [esw * cover * 1.05, esh * cover * 1.05], lod: Math.max(1.5, Math.log2(Math.max(src.w, src.h) / 110)), dim: 0.62 };
    }
    r.layer(L, src, o);
    if (this._tempFbo) { r.release(this._tempFbo); this._tempFbo = null; }

    // per-clip effects
    let cur = L;
    if (clip.fxs && clip.fxs.length) {
      let other = r.fbo();
      for (const fx of clip.fxs) {
        const a = fxParams(fx);
        if (r.effect(fx.type, cur, other, { amt: a.amt, t: Math.max(0, tRel), p: a.p })) [cur, other] = [other, cur];
      }
      r.release(other);
    }
    return { fbo: cur, opacity: tfm.op, blend: clip.blend || 'normal' };
  }
}
