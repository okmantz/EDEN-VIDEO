// Project data model: defaults, clip factory functions and pure timeline helpers.
import { uid, clamp, deep } from './util.js';
import { TEXT_DEFAULT, mergeText } from './textrender.js';

export const RATIOS = [
  { id: '9:16', name: '9:16', sub: 'TikTok · Reels · Shorts', w: 1080, h: 1920 },
  { id: '1:1', name: '1:1', sub: 'Square feed', w: 1080, h: 1080 },
  { id: '4:5', name: '4:5', sub: 'Instagram portrait', w: 1080, h: 1350 },
  { id: '16:9', name: '16:9', sub: 'YouTube · Landscape', w: 1920, h: 1080 },
  { id: '4:3', name: '4:3', sub: 'Classic', w: 1440, h: 1080 },
  { id: '21:9', name: '21:9', sub: 'Cinema', w: 2160, h: 926 },
];

export const TRACK_KINDS = { video: 'Video', text: 'Text', fx: 'Effects', audio: 'Audio' };

export function newProject(ratio = '9:16', name = 'Untitled project') {
  const r = RATIOS.find((x) => x.id === ratio) || RATIOS[0];
  return {
    v: 1, id: uid('prj'), name, created: Date.now(), updated: Date.now(),
    canvas: { w: r.w, h: r.h, fps: 30, ratio: r.id, bg: '#000000' },
    tracks: [
      { id: uid('trk'), kind: 'audio', name: 'Audio', clips: [] },
      { id: uid('trk'), kind: 'video', name: 'Main', clips: [] },
    ],
    media: {},
  };
}

export const ADJ_DEFAULT = () => ({ exp: 0, temp: 0, tint: 0, bri: 0, con: 0, sat: 0, vib: 0, hue: 0, hl: 0, sh: 0, sharp: 0, vig: 0, grain: 0 });
export const TF_DEFAULT = () => ({ x: 0, y: 0, s: 1, r: 0, fx: false, fy: false, op: 1, fit: 'fill' });

export function baseClip(kind, extra = {}) {
  return {
    id: uid('clp'), kind, start: 0, dur: 3, in: 0, speed: 1,
    tf: TF_DEFAULT(), kf: {}, adj: ADJ_DEFAULT(), look: { id: 'none', amt: 1 }, fxs: [],
    mask: { type: 'none', scale: 1, feather: 0.1, invert: false, round: 0.3 }, chroma: { on: false, color: '#00ff00', sim: 0.22, smooth: 0.12, spill: 0.5 },
    blend: 'normal', crop: { l: 0, t: 0, r: 0, b: 0 }, bgblur: true, transIn: null,
    animIn: { id: 'none', dur: 0.5 }, animOut: { id: 'none', dur: 0.5 }, animLoop: { id: 'none', amt: 1 },
    vol: 1, mute: false, fadeIn: 0, fadeOut: 0, duck: false, loop: false,
    ...extra,
  };
}

export function videoClip(media, start = 0) {
  return baseClip(media.kind === 'image' ? 'image' : 'video', { mediaId: media.id, name: media.name, start, dur: media.kind === 'image' ? 4 : media.duration, in: 0 });
}
export function genClip(gen, start = 0, dur = 5) { return baseClip('gen', { gen: gen.id, name: gen.name, start, dur }); }
export function audioClip(media, start = 0, extra = {}) { return baseClip('audio', { mediaId: media.id, name: media.name, start, dur: media.duration, ...extra }); }
export function textClip(start = 0, dur = 3, patch = {}) {
  const c = baseClip('text', { start, dur, name: 'Text', text: mergeText(TEXT_DEFAULT(), patch) });
  c.tf.y = 0.18;
  c.animIn = { id: 'pop', dur: 0.4 };
  return c;
}
export function stickerClip(sticker, start = 0, dur = 3) { return baseClip('sticker', { start, dur, name: 'Sticker', sticker }); }
export function fxClip(type, start = 0, dur = 3, params = {}) { return baseClip('fx', { start, dur, name: type, fx: { type, amt: 0.7, p0: 1, p1: 0, p2: 0, p3: 0, ...params } }); }

export const kindOfTrack = (clipKind) => (clipKind === 'audio' ? 'audio' : clipKind === 'text' || clipKind === 'sticker' ? 'text' : clipKind === 'fx' ? 'fx' : 'video');
export const end = (c) => c.start + c.dur;
export const projectDuration = (p) => { let d = 0; for (const t of p.tracks) for (const c of t.clips) d = Math.max(d, end(c)); return d; };
export const allClips = (p) => p.tracks.flatMap((t) => t.clips);
export function findClip(p, id) { for (const t of p.tracks) { const c = t.clips.find((x) => x.id === id); if (c) return { clip: c, track: t }; } return null; }

/** Clip durations in source seconds consumed. */
export const srcSpan = (c) => c.dur * c.speed;
export const srcTime = (c, t) => c.in + (t - c.start) * c.speed;

/** Keyframe interpolation. kf = [{t, v, e}] sorted by t (clip-relative seconds). */
export function evalKF(list, t, base, EASE) {
  if (!list || !list.length) return base;
  if (t <= list[0].t) return list[0].v;
  const last = list[list.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
      const f = EASE[a.e || 'inout'] || EASE.linear;
      return a.v + (b.v - a.v) * f(k);
    }
  }
  return base;
}

/** Make sure a clip loaded from storage has every field the editor expects. */
export function normalizeClip(c) {
  const b = baseClip(c.kind);
  const out = { ...b, ...c };
  out.tf = { ...b.tf, ...c.tf }; out.adj = { ...b.adj, ...c.adj }; out.look = { ...b.look, ...c.look };
  out.mask = { ...b.mask, ...c.mask }; out.chroma = { ...b.chroma, ...c.chroma }; out.crop = { ...b.crop, ...c.crop };
  out.animIn = { ...b.animIn, ...c.animIn }; out.animOut = { ...b.animOut, ...c.animOut }; out.animLoop = { ...b.animLoop, ...c.animLoop };
  out.kf = c.kf || {}; out.fxs = c.fxs || [];
  if (c.kind === 'text') out.text = mergeText(TEXT_DEFAULT(), c.text || {});
  return out;
}
export function normalizeProject(p) {
  const out = deep(p);
  out.tracks.forEach((t) => { t.clips = t.clips.map(normalizeClip); });
  out.media = out.media || {};
  return out;
}

/** Snap helper: returns the closest snap point to `t` among candidates within `thr`. */
export function snapTime(t, points, thr) {
  let best = null, bd = thr;
  for (const p of points) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } }
  return best;
}

export function snapPoints(p, ignoreIds = new Set(), playhead = null) {
  const pts = [0];
  if (playhead != null) pts.push(playhead);
  for (const t of p.tracks) for (const c of t.clips) { if (ignoreIds.has(c.id)) continue; pts.push(c.start, end(c)); }
  return pts;
}

/** Does [s,e) overlap any clip on track (excluding ids)? */
export function overlaps(track, s, e, ignore = new Set()) {
  return track.clips.some((c) => !ignore.has(c.id) && c.start < e - 1e-4 && end(c) > s + 1e-4);
}

export function splitClip(clip, at) {
  const rel = at - clip.start;
  if (rel < 0.05 || clip.dur - rel < 0.05) return null;
  const a = clip;
  const b = deep(clip);
  b.id = uid('clp');
  b.start = at; b.dur = clip.dur - rel;
  b.in = clip.in + rel * clip.speed;
  b.transIn = null;
  b.animIn = { id: 'none', dur: 0.5 };
  b.fadeIn = 0;
  const aOldDur = a.dur;
  a.dur = rel;
  a.animOut = { id: 'none', dur: 0.5 };
  a.fadeOut = 0;
  // keyframes: split by time
  const kfA = {}, kfB = {};
  for (const [k, list] of Object.entries(a.kf || {})) {
    kfA[k] = list.filter((x) => x.t <= rel);
    kfB[k] = list.filter((x) => x.t >= rel).map((x) => ({ ...x, t: x.t - rel }));
    if (!kfA[k].length) delete kfA[k];
    if (!kfB[k].length) delete kfB[k];
  }
  a.kf = kfA; b.kf = kfB;
  if (clip.kind === 'text' && clip.words) {
    b.words = clip.words.map((w) => ({ ...w, t0: w.t0 - rel, t1: w.t1 - rel })).filter((w) => w.t1 > 0);
    a.words = clip.words.filter((w) => w.t0 < rel);
  }
  void aOldDur;
  return b;
}

export const clampDur = (d) => Math.max(0.1, d);
export const maxMediaSpan = (clip, media) => (media && (clip.kind === 'video' || clip.kind === 'audio') && !clip.loop ? (media.duration - clip.in) / clip.speed : Infinity);
export { clamp };
