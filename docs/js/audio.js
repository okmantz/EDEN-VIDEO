// Audio: decoded-buffer bank (user media + built-in synth), waveform peaks, speech detection,
// and one scheduler that drives both live preview and the offline export mix.
import { renderMusic, renderSfx, MUSIC, SFX, musicDuration } from './synth.js';
import { clamp } from './util.js';
import { Storage } from './media.js';

const SYNTH_VER = 1;

let decodeCtx = null;
const getDecodeCtx = () => (decodeCtx ||= new OfflineAudioContext(2, 1, 48000));

export class AudioBank {
  constructor() {
    this.buffers = new Map();
    this.peaksCache = new Map();
    this.actCache = new Map();
    this.pending = new Map();
    this.failed = new Set();
  }

  has(id) { return this.buffers.has(id); }
  buffer(id) { return this.buffers.get(id) || null; }

  async decodeBlob(id, blob) {
    if (this.buffers.has(id)) return this.buffers.get(id);
    if (this.pending.has(id)) return this.pending.get(id);
    const p = (async () => {
      try {
        const ab = await blob.arrayBuffer();
        const buf = await getDecodeCtx().decodeAudioData(ab);
        this.buffers.set(id, buf);
        return buf;
      } catch (e) {
        this.failed.add(id);
        return null;
      } finally { this.pending.delete(id); }
    })();
    this.pending.set(id, p);
    return p;
  }

  async ensureBuiltin(id) {
    if (this.buffers.has(id)) return this.buffers.get(id);
    if (this.pending.has(id)) return this.pending.get(id);
    const p = (async () => {
      let buf = null;
      // synthesised audio is cached in IndexedDB so each track is only generated once per device
      try {
        const c = await Storage.getMeta('synth:' + SYNTH_VER + ':' + id);
        if (c?.ch?.length) { buf = new AudioBuffer({ length: c.ch[0].length, numberOfChannels: c.ch.length, sampleRate: c.sr }); c.ch.forEach((d, i) => buf.copyToChannel(d, i)); }
      } catch {}
      if (!buf) {
        if (id.startsWith('music:')) buf = await renderMusic(id.slice(6));
        else if (id.startsWith('sfx:')) buf = await renderSfx(id.slice(4));
        if (buf) { try { Storage.setMeta('synth:' + SYNTH_VER + ':' + id, { sr: buf.sampleRate, ch: Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i).slice()) }); } catch {} }
      }
      if (buf) this.buffers.set(id, buf);
      this.pending.delete(id);
      return buf;
    })();
    this.pending.set(id, p);
    return p;
  }

  /** Waveform peaks (0..1), `perSec` bins per second. */
  peaks(id, perSec = 40) {
    const key = id + ':' + perSec;
    if (this.peaksCache.has(key)) return this.peaksCache.get(key);
    const buf = this.buffers.get(id);
    if (!buf) return null;
    const n = Math.max(1, Math.ceil(buf.duration * perSec));
    const out = new Float32Array(n);
    const d = buf.getChannelData(0);
    const d2 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : d;
    const step = Math.max(1, Math.floor(d.length / n));
    for (let i = 0; i < n; i++) {
      let m = 0;
      const s = i * step, e = Math.min(d.length, s + step);
      const stride = Math.max(1, Math.floor((e - s) / 64));
      for (let j = s; j < e; j += stride) { const v = Math.max(Math.abs(d[j]), Math.abs(d2[j])); if (v > m) m = v; }
      out[i] = m;
    }
    this.peaksCache.set(key, out);
    return out;
  }

  /** RMS envelope in dBFS, one value per `win` seconds. */
  rmsDb(id, win = 0.05) {
    const key = 'rms:' + id + ':' + win;
    if (this.actCache.has(key)) return this.actCache.get(key);
    const buf = this.buffers.get(id);
    if (!buf) return null;
    const d = buf.getChannelData(0);
    const n = Math.max(1, Math.floor(buf.duration / win));
    const w = Math.floor(win * buf.sampleRate);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const a = i * w;
      for (let j = 0; j < w; j += 2) { const v = d[a + j] || 0; s += v * v; }
      out[i] = 10 * Math.log10(s / (w / 2) + 1e-12);
    }
    const r = { db: out, win };
    this.actCache.set(key, r);
    return r;
  }

  /** Spans of speech/sound in source seconds (relative threshold, so it adapts to the recording level). */
  activity(id) {
    const r = this.rmsDb(id, 0.05);
    if (!r) return [];
    const sorted = [...r.db].sort((a, b) => a - b);
    const loud = sorted[Math.floor(sorted.length * 0.95)] ?? -30;
    const thr = Math.max(-48, loud - 18);
    const spans = [];
    let cur = null;
    r.db.forEach((v, i) => {
      const t = i * r.win;
      if (v > thr) { if (cur && t - cur[1] < 0.35) cur[1] = t + r.win; else { cur = [t, t + r.win]; spans.push(cur); } }
    });
    return spans;
  }

  /** Silent spans in source seconds. thresholdDb is absolute dBFS. */
  silences(id, thresholdDb = -36, minLen = 0.4) {
    const r = this.rmsDb(id, 0.02);
    if (!r) return [];
    const spans = [];
    let start = null;
    r.db.forEach((v, i) => {
      const t = i * r.win;
      if (v < thresholdDb) { if (start == null) start = t; }
      else if (start != null) { if (t - start >= minLen) spans.push([start, t]); start = null; }
    });
    if (start != null) { const t = r.db.length * r.win; if (t - start >= minLen) spans.push([start, t]); }
    return spans;
  }
}

export const builtinMedia = {
  music(id) {
    const d = MUSIC.find((m) => m.id === id);
    return { id: 'music:' + id, kind: 'audio', name: d.name, duration: musicDuration(d), builtin: true, hasAudio: true };
  },
  sfx(id) {
    const d = SFX.find((m) => m.id === id);
    return { id: 'sfx:' + id, kind: 'audio', name: d.name, duration: d.dur, builtin: true, hasAudio: true };
  },
};

/**
 * Schedule every audio-bearing clip into `ctx`.
 * Timeline time `from` maps to context time `t0`. Returns {stop(), master}.
 */
export function scheduleAudio(ctx, project, bank, from, t0, dest, opts = {}) {
  const sources = [];
  const master = ctx.createGain();
  master.gain.value = opts.gain ?? 1;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3; limiter.knee.value = 4; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.15;
  master.connect(limiter).connect(dest);
  const ctxT = (tl) => t0 + (tl - from);
  const hasSolo = project.tracks.some((t) => t.solo);

  // voice activity on the timeline (for ducking)
  const voice = [];
  for (const tr of project.tracks) {
    if (tr.muted) continue;
    for (const c of tr.clips) {
      if (c.kind !== 'video' || c.mute || !bank.has(c.mediaId)) continue;
      for (const [a, b] of bank.activity(c.mediaId)) {
        const tl0 = c.start + (a - c.in) / c.speed, tl1 = c.start + (b - c.in) / c.speed;
        const s = Math.max(tl0, c.start), e = Math.min(tl1, c.start + c.dur);
        if (e > s) voice.push([s, e]);
      }
    }
  }
  voice.sort((a, b) => a[0] - b[0]);
  const mergedVoice = [];
  for (const v of voice) { const l = mergedVoice[mergedVoice.length - 1]; if (l && v[0] - l[1] < 0.3) l[1] = Math.max(l[1], v[1]); else mergedVoice.push([...v]); }

  for (const tr of project.tracks) {
    if (tr.muted || (hasSolo && !tr.solo)) continue;
    for (const c of tr.clips) {
      if (c.kind !== 'video' && c.kind !== 'audio') continue;
      if (c.mute) continue;
      const buf = bank.buffer(c.mediaId);
      if (!buf) continue;
      const cEnd = c.start + c.dur;
      if (cEnd <= from + 1e-3) continue;
      const startTl = Math.max(from, c.start);
      const skip = startTl - c.start;
      let off = c.in + skip * c.speed;
      const remainingTl = cEnd - startTl;
      if (!c.loop && off >= buf.duration) continue;

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = c.speed;
      const g = ctx.createGain();
      const vol = clamp(c.vol ?? 1, 0, 4);
      const envAt = (rel) => { // rel: seconds from clip start (timeline)
        let e = 1;
        if (c.fadeIn > 0) e = Math.min(e, rel / c.fadeIn);
        if (c.fadeOut > 0) e = Math.min(e, (c.dur - rel) / c.fadeOut);
        return clamp(e, 0, 1);
      };
      const when = ctxT(startTl);
      g.gain.setValueAtTime(vol * envAt(skip), Math.max(0, when));
      if (c.fadeIn > 0 && skip < c.fadeIn) g.gain.linearRampToValueAtTime(vol, ctxT(c.start + c.fadeIn));
      if (c.fadeOut > 0) {
        const fo = c.start + c.dur - c.fadeOut;
        if (fo > startTl) { g.gain.setValueAtTime(vol, ctxT(fo)); }
        g.gain.linearRampToValueAtTime(0, ctxT(cEnd));
      }
      src.connect(g);
      let tail = g;
      if (c.duck && mergedVoice.length) {
        const dg = ctx.createGain();
        const hi = 1, lo = 0.26;
        dg.gain.setValueAtTime(hi, Math.max(0, when));
        let cur = hi;
        for (const [a, b] of mergedVoice) {
          if (b < startTl - 0.5 || a > cEnd) continue;
          const t1 = ctxT(Math.max(a - 0.15, startTl)), t2 = ctxT(Math.max(a + 0.05, startTl)), t3 = ctxT(Math.max(b, startTl)), t4 = ctxT(Math.max(b + 0.55, startTl));
          if (t1 < when) continue;
          dg.gain.setValueAtTime(cur, t1);
          dg.gain.linearRampToValueAtTime(lo, t2);
          dg.gain.setValueAtTime(lo, t3);
          dg.gain.linearRampToValueAtTime(hi, t4);
          cur = hi;
        }
        g.connect(dg); tail = dg;
      }
      tail.connect(master);
      if (c.loop) {
        src.loop = true; src.loopStart = 0; src.loopEnd = buf.duration;
        src.start(Math.max(0, when), off % buf.duration);
        src.stop(when + remainingTl);
      } else {
        src.start(Math.max(0, when), off, remainingTl * c.speed);
      }
      sources.push(src);
    }
  }
  return {
    master,
    stop() { for (const s of sources) { try { s.stop(); } catch {} try { s.disconnect(); } catch {} } sources.length = 0; try { master.disconnect(); } catch {} },
  };
}

/** Render the whole timeline's audio to an AudioBuffer (stereo) for export. */
export async function renderMix(project, bank, duration, sampleRate = 48000, normalize = false) {
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
  scheduleAudio(ctx, project, bank, 0, 0, ctx.destination);
  const buf = await ctx.startRendering();
  if (normalize) {
    let sum = 0, peak = 0, n = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i += 4) { const v = d[i]; sum += v * v; n++; const a = Math.abs(v); if (a > peak) peak = a; }
    }
    const rms = Math.sqrt(sum / Math.max(1, n));
    if (rms > 0.001) {
      const target = Math.pow(10, -16 / 20);
      let gain = Math.min(target / rms, 0.97 / Math.max(peak, 1e-3), 5);
      if (gain > 1.02 || gain < 0.98) for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= gain; }
    }
  }
  return buf;
}

export function hasAnyAudio(project, bank) {
  for (const tr of project.tracks) if (!tr.muted) for (const c of tr.clips) if ((c.kind === 'video' || c.kind === 'audio') && !c.mute && bank.has(c.mediaId)) return true;
  return false;
}
