// Live template previews. A template is rendered with the real compositor (same engine as the editor and the export),
// using animated scenes in place of the person's clips, so a card shows exactly what the finished video will feel like.
import { Renderer } from './gl.js';
import { Compositor } from './compose.js';
import { newProject, RATIOS } from './model.js';
import { uid } from './util.js';
import { layoutTemplate, templateValues, brandPalette } from './templates.js';
import { loadFonts } from './textrender.js';

// Scenes that stand in for the person's clips. Chosen per category so a preview looks like a real edit.
const FILLERS = {
  Social: ['liquidpastel', 'dreambokeh', 'aurora', 'popart'],
  Business: ['skylineblue', 'corpwaves', 'candles', 'gradmesh'],
  Finance: ['candles', 'skylinenight', 'moneyrain', 'liquidgold'],
  Luxury: ['liquidgold', 'skylinegolden', 'smokewisp', 'skylineblue'],
  Lifestyle: ['skylinegolden', 'cafeglow', 'cloudtime', 'beach'],
  Cinematic: ['cloudtime', 'skylinenight', 'smokewisp', 'ocean'],
  Energy: ['energy', 'speedlines', 'lasers', 'fire'],
  Events: ['petals', 'balloons', 'fireworks', 'sparkles'],
};

let rend = null, comp = null, fontsReady = null;
function init() {
  if (rend) return;
  rend = new Renderer(document.createElement('canvas'));
  rend.setSize(270, 480);
  comp = new Compositor(rend, { frame: () => null });
}
export function ensureFonts() { return (fontsReady ||= Promise.race([loadFonts(), new Promise((r) => setTimeout(r, 2500))])); }

/** Put clips on as few tracks as possible without overlaps. */
function pack(project, kind, clips, label) {
  const lanes = [];
  for (const c of [...clips].sort((a, b) => a.start - b.start)) {
    let lane = lanes.find((l) => l.end <= c.start + 1e-6);
    if (!lane) { lane = { end: 0, track: { id: uid('trk'), kind, name: label, clips: [] } }; lanes.push(lane); project.tracks.push(lane.track); }
    lane.track.clips.push(c); lane.end = c.start + c.dur;
  }
}

/**
 * Build a small throwaway project for a template.
 * @param opts { values, brand, useBrand, ratio, height }
 */
export function buildPreview(tpl, { values = {}, brand = null, useBrand = false, ratio = null, height = 360 } = {}) {
  const R = RATIOS.find((r) => r.id === (ratio || tpl.ratio)) || RATIOS[0];
  const pal = useBrand && brand ? brandPalette(brand) : tpl.pal;
  const vals = templateValues(tpl, values);
  const rot = [...new Set([tpl.gen, tpl.cover?.gen, ...(tpl.fill || FILLERS[tpl.cat] || FILLERS.Social)].filter(Boolean))];
  let n = 0; const pickMap = new Map();
  const genFor = (sl, i) => { if (sl.gen) return sl.gen; if (sl.card) return tpl.gen; if (!pickMap.has(i)) pickMap.set(i, rot[n++ % rot.length]); return pickMap.get(i); };
  const lay = layoutTemplate(tpl, { R, pal, vals, brand, useBrand, genFor });
  const p = newProject(R.id, tpl.name);
  p.canvas.h = Math.round(height); p.canvas.w = Math.round(height * R.w / R.h);
  p.tracks.find((t) => t.kind === 'video').clips.push(...lay.main);
  pack(p, 'text', lay.texts, 'Text');
  pack(p, 'fx', lay.fxs, 'FX');
  // a moment where the title is fully on screen makes the best still
  const first = lay.texts.slice().sort((a, b) => a.start - b.start)[0];
  const still = first ? Math.min(first.start + Math.min(first.dur - 0.05, Math.max(0.7, (first.animIn?.dur || 0.35) + 0.4)), lay.total - 0.05) : Math.min(0.8, lay.total / 2);
  return { project: p, total: lay.total, still: tpl.posterAt != null ? Math.min(tpl.posterAt, lay.total - 0.05) : still, lay };
}

function drawTo(ctx2d, built, t) {
  init();
  const p = built.project;
  rend.setSize(p.canvas.w, p.canvas.h);
  comp.renderFrame(p, t);
  const cv = ctx2d.canvas;
  if (cv.width !== p.canvas.w || cv.height !== p.canvas.h) { cv.width = p.canvas.w; cv.height = p.canvas.h; }
  ctx2d.drawImage(rend.canvas, 0, 0);
}

/* ------------------------------------------------------------------ posters (still frames) */
const posters = new Map();
const queue = [];
let running = false;
const posterKey = (tpl, o = {}) => [tpl.id, o.ratio || '', o.useBrand ? 'b' : '', o.height || 360].join('|');

function pump() {
  if (running) return; running = true;
  const step = async () => {
    const job = queue.shift();
    if (!job) { running = false; return; }
    try {
      await ensureFonts();
      const built = buildPreview(job.tpl, { ...job.opts, height: job.opts.height || 360 });
      const c = document.createElement('canvas');
      drawTo(c.getContext('2d'), built, built.still);
      const url = c.toDataURL('image/jpeg', 0.82);
      posters.set(job.key, url); job.resolve(url);
    } catch (e) { console.warn('[tplpreview] poster', job.tpl.id, e); job.resolve(null); }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function poster(tpl, opts = {}) {
  const key = posterKey(tpl, opts);
  if (posters.has(key)) return Promise.resolve(posters.get(key));
  return new Promise((resolve) => { queue.push({ tpl, opts, key, resolve }); pump(); });
}
export const cachedPoster = (tpl, opts = {}) => posters.get(posterKey(tpl, opts)) || null;

const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    io.unobserve(e.target);
    const tpl = e.target._tpl; if (!tpl) continue;
    poster(tpl).then((u) => { if (u) { e.target.style.backgroundImage = `url(${u})`; e.target.classList.add('ready'); } });
  }
}, { rootMargin: '240px' }) : null;

/** Fill an element's background with the template's poster when it scrolls into view. */
export function lazyPoster(el, tpl) {
  el._tpl = tpl; el.classList.add('tpl-poster');
  const c = cachedPoster(tpl);
  if (c) { el.style.backgroundImage = `url(${c})`; el.classList.add('ready'); } else io?.observe(el);
  return el;
}

/* ------------------------------------------------------------------ live playback */
let active = null;
export class LivePreview {
  /** @param canvas a visible <canvas> that receives the frames */
  constructor(canvas, tpl, opts = {}) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.tpl = tpl; this.opts = opts;
    this.t0 = 0; this.playing = false; this.raf = 0; this.dead = false; this.built = null;
  }
  setOptions(patch) { this.opts = { ...this.opts, ...patch }; this.refresh(); }
  /** Rebuild (after text, brand or format changes) and keep the playhead where it is. */
  refresh() {
    this.built = buildPreview(this.tpl, this.opts);
    if (this.cv.width !== this.built.project.canvas.w) { this.cv.width = this.built.project.canvas.w; this.cv.height = this.built.project.canvas.h; }
    if (!this.playing) this.drawStill(this.hold ?? this.built.still);
  }
  drawStill(t) { if (!this.built || this.dead) return; this.hold = t; try { drawTo(this.ctx, this.built, t); } catch (e) { /* ignore */ } }
  async play(from = 0) {
    await ensureFonts(); if (this.dead) return;
    if (active && active !== this) active.pause();
    active = this; if (!this.built) this.refresh();
    this.playing = true; this.onStart?.(); this.t0 = performance.now() - from * 1000;
    const loop = () => {
      if (!this.playing || this.dead) return;
      const span = this.built.total + 0.9;
      const t = ((performance.now() - this.t0) / 1000) % span;
      try { drawTo(this.ctx, this.built, Math.min(t, this.built.total - 0.01)); } catch (e) { /* ignore */ }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  pause() { const was = this.playing; this.playing = false; cancelAnimationFrame(this.raf); if (active === this) active = null; if (was) this.onStop?.(); }
  get time() { return this.playing ? ((performance.now() - this.t0) / 1000) % (this.built.total + 0.9) : (this.hold || 0); }
  destroy() { this.dead = true; this.pause(); }
}

export function destroyPreviews() { rend?.destroy(); rend = null; comp = null; posters.clear(); }
