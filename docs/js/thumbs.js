// Live-rendered preview thumbnails for effects, transitions, filters and B-roll, using one small shared WebGL context.
import { Renderer } from './gl.js';
import { Compositor } from './compose.js';
import { newProject, videoClip, genClip, fxClip } from './model.js';
import { effectDefaults } from './effects.js';

const W = 144, H = 192;
let rend = null, comp = null, demoA = null, demoB = null, provider = null;
const cache = new Map();
const queue = [];
let running = false;

function drawDemo(ctx, w, h, pal) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, pal[0]); g.addColorStop(0.55, pal[1]); g.addColorStop(1, pal[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = pal[3]; ctx.beginPath(); ctx.arc(w * 0.68, h * 0.3, w * 0.13, 0, 7); ctx.fill();
  ctx.fillStyle = pal[4];
  ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, h * 0.7); ctx.lineTo(w * 0.25, h * 0.52); ctx.lineTo(w * 0.5, h * 0.72); ctx.lineTo(w * 0.78, h * 0.46); ctx.lineTo(w, h * 0.7); ctx.lineTo(w, h); ctx.fill();
  ctx.fillStyle = pal[5]; ctx.fillRect(w * 0.12, h * 0.82, w * 0.76, h * 0.06);
  // a face-like skin tone blob so colour looks read clearly
  ctx.fillStyle = '#e0a687'; ctx.beginPath(); ctx.ellipse(w * 0.34, h * 0.58, w * 0.11, w * 0.14, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#3b6fd8'; ctx.fillRect(w * 0.22, h * 0.68, w * 0.24, h * 0.1);
}

function init() {
  if (rend) return;
  const c = document.createElement('canvas');
  rend = new Renderer(c); rend.setSize(W, H);
  demoA = document.createElement('canvas'); demoA.width = 270; demoA.height = 360;
  drawDemo(demoA.getContext('2d'), 270, 360, ['#1b2a5a', '#e9795c', '#2a1f3d', '#ffe9a8', '#20203a', '#7cf5c8']);
  demoB = document.createElement('canvas'); demoB.width = 270; demoB.height = 360;
  drawDemo(demoB.getContext('2d'), 270, 360, ['#0d3b32', '#3fbf9a', '#0b1f1c', '#fffbe0', '#12332c', '#ff5d8f']);
  provider = { frame: (clip) => ({ el: clip.mediaId === 'demoB' ? demoB : demoA, w: 270, h: 360, version: clip.mediaId }) };
  comp = new Compositor(rend, provider);
}

function mini() { const p = newProject('9:16', 'thumb'); p.canvas.w = W; p.canvas.h = H; p.media.demoA = { id: 'demoA', kind: 'image', duration: 5, w: 270, h: 360 }; p.media.demoB = { id: 'demoB', kind: 'image', duration: 5, w: 270, h: 360 }; return p; }

function build(kind, id) {
  const p = mini(); const main = p.tracks.find((t) => t.kind === 'video');
  const a = videoClip(p.media.demoA, 0); a.dur = 2; main.clips.push(a);
  let t = 0.8;
  if (kind === 'effect') { a.fxs = [{ ...effectDefaults(id), amt: 0.8 }]; t = 0.9; }
  else if (kind === 'filter') { a.look = { id, amt: 1 }; t = 0.5; }
  else if (kind === 'transition') {
    const b = videoClip(p.media.demoB, 1.5); b.dur = 2; b.transIn = { type: id, dur: 1 }; b.start = 1.5; a.dur = 1.5; main.clips.push(b); t = 1.5;
    return { p, t };
  } else if (kind === 'gen') { main.clips.length = 0; const g = genClip({ id, name: id }, 0, 4); main.clips.push(g); t = 1.2; }
  return { p, t };
}

function pump() {
  if (running) return; running = true;
  const step = () => {
    const job = queue.shift();
    if (!job) { running = false; return; }
    try {
      init();
      const { p, t } = build(job.kind, job.id);
      comp.renderFrame(p, t);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      c.getContext('2d').drawImage(rend.canvas, 0, 0);
      const url = c.toDataURL('image/jpeg', 0.8);
      cache.set(job.key, url);
      job.resolve(url);
    } catch (e) { console.warn('thumb', job.key, e); job.resolve(null); }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function thumb(kind, id) {
  const key = kind + ':' + id;
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  return new Promise((resolve) => { queue.push({ kind, id, key, resolve }); pump(); });
}

/** Fill an <img>/<div> lazily when it scrolls into view. */
const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    io.unobserve(e.target);
    const { tk, ti } = e.target.dataset;
    thumb(tk, ti).then((u) => { if (u) { e.target.style.backgroundImage = `url(${u})`; e.target.classList.add('ready'); } });
  }
}, { rootMargin: '160px' }) : null;

export function lazyThumb(el, kind, id) {
  el.dataset.tk = kind; el.dataset.ti = id; el.classList.add('thumb');
  if (cache.has(kind + ':' + id)) { el.style.backgroundImage = `url(${cache.get(kind + ':' + id)})`; el.classList.add('ready'); }
  else io?.observe(el);
  return el;
}

export function destroyThumbs() { rend?.destroy(); rend = null; }
