// Royalty-free music and sound effects, synthesised in the browser with Web Audio (OfflineAudioContext).
// Nothing is downloaded: every track is generated deterministically from the definitions below.
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
const SR = 44100;

let noiseCache = new WeakMap();
function noiseBuf(ctx) {
  if (noiseCache.has(ctx)) return noiseCache.get(ctx);
  const b = ctx.createBuffer(1, SR * 2, SR);
  const d = b.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < d.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = (seed / 4294967296) * 2 - 1; }
  noiseCache.set(ctx, b);
  return b;
}
function noise(ctx, t, dur) { const s = ctx.createBufferSource(); s.buffer = noiseBuf(ctx); s.loop = true; s.start(t, Math.random() * 0.5); s.stop(t + dur); return s; }
function adsr(g, t, a, d, s, r, peak, dur) {
  dur = Math.max(dur, a + d + 0.01);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * s), t + a + d);
  g.gain.setValueAtTime(Math.max(0.0001, peak * s), t + dur);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + r);
  return t + dur + r;
}

// ---------------------------------------------------------------- drum + instrument voices
const V = {
  kick(ctx, bus, t, v = 1, o = {}) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.frequency.setValueAtTime(o.f0 || 165, t); osc.frequency.exponentialRampToValueAtTime(o.f1 || 44, t + 0.11);
    g.gain.setValueAtTime(0.95 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + (o.len || 0.34));
    osc.connect(g).connect(bus); osc.start(t); osc.stop(t + 0.4);
  },
  kick808(ctx, bus, t, v = 1, o = {}) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    const f = o.f || 48;
    osc.frequency.setValueAtTime(f * 2.4, t); osc.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    g.gain.setValueAtTime(0.9 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + (o.len || 0.9));
    osc.connect(g).connect(bus); osc.start(t); osc.stop(t + (o.len || 0.9) + 0.05);
  },
  snare(ctx, bus, t, v = 1) {
    const n = noise(ctx, t, 0.25), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7;
    g.gain.setValueAtTime(0.55 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
    n.connect(bp).connect(g).connect(bus);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    og.gain.setValueAtTime(0.4 * v, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og).connect(bus); o.start(t); o.stop(t + 0.12);
  },
  clap(ctx, bus, t, v = 1) {
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.012;
      const n = noise(ctx, tt, 0.2), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 1.1;
      g.gain.setValueAtTime(0.4 * v, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + (i === 2 ? 0.16 : 0.03));
      n.connect(bp).connect(g).connect(bus);
    }
  },
  hat(ctx, bus, t, v = 1, o = {}) {
    const len = o.open ? 0.22 : 0.045;
    const n = noise(ctx, t, len + 0.02), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 7500;
    g.gain.setValueAtTime(0.22 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    n.connect(hp).connect(g).connect(bus);
  },
  shaker(ctx, bus, t, v = 1) {
    const n = noise(ctx, t, 0.1), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 6000; bp.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16 * v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(bp).connect(g).connect(bus);
  },
  tom(ctx, bus, t, v = 1, o = {}) {
    const osc = ctx.createOscillator(), g = ctx.createGain(); const f = o.f || 90;
    osc.frequency.setValueAtTime(f * 1.9, t); osc.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    g.gain.setValueAtTime(0.9 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + (o.len || 0.7));
    osc.connect(g).connect(bus); osc.start(t); osc.stop(t + (o.len || 0.7) + 0.05);
    const n = noise(ctx, t, 0.08), ng = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    ng.gain.setValueAtTime(0.3 * v, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07); n.connect(lp).connect(ng).connect(bus);
  },
  bass(ctx, bus, t, dur, midi, v = 1, o = {}) {
    const osc = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    osc.type = o.type || 'sawtooth'; osc.frequency.value = hz(midi);
    f.type = 'lowpass'; f.Q.value = 3; f.frequency.setValueAtTime(o.cut || 700, t); f.frequency.exponentialRampToValueAtTime(Math.max(120, (o.cut || 700) * 0.3), t + Math.max(0.1, dur));
    const end = adsr(g, t, 0.006, 0.12, 0.6, 0.08, 0.34 * v, dur);
    osc.connect(f).connect(g).connect(bus); osc.start(t); osc.stop(end + 0.02);
    if (o.sub) { const s = ctx.createOscillator(), sg = ctx.createGain(); s.frequency.value = hz(midi); sg.gain.value = 0.22 * v; const e2 = adsr(sg, t, 0.01, 0.1, 0.8, 0.08, 0.22 * v, dur); s.connect(sg).connect(bus); s.start(t); s.stop(e2 + 0.02); }
  },
  sub(ctx, bus, t, dur, midi, v = 1, o = {}) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.frequency.setValueAtTime(hz(midi) * 1.5, t); osc.frequency.exponentialRampToValueAtTime(hz(midi), t + 0.04);
    const end = adsr(g, t, 0.004, 0.1, 0.85, 0.1, 0.55 * v, dur);
    osc.connect(g).connect(bus); osc.start(t); osc.stop(end + 0.02);
  },
  pad(ctx, bus, t, dur, midi, v = 1, o = {}) {
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(o.cut || 900, t); f.frequency.linearRampToValueAtTime((o.cut || 900) * 1.8, t + dur * 0.6); f.Q.value = 0.6;
    const end = adsr(g, t, o.attack || 0.6, 0.4, 0.8, o.release || 0.9, 0.09 * v, dur);
    for (const det of [-9, 0, 9]) { const osc = ctx.createOscillator(); osc.type = o.type || 'sawtooth'; osc.frequency.value = hz(midi); osc.detune.value = det; osc.connect(f); osc.start(t); osc.stop(end + 0.02); }
    f.connect(g).connect(bus);
  },
  keys(ctx, bus, t, dur, midi, v = 1, o = {}) {
    const g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.cut || 2600;
    const end = adsr(g, t, 0.004, o.decay || 0.5, 0.18, 0.35, 0.2 * v, Math.min(dur, 1.6));
    [[1, 'sine', 1], [2, 'triangle', 0.32], [4, 'sine', 0.08]].forEach(([m, ty, a]) => { const osc = ctx.createOscillator(), og = ctx.createGain(); osc.type = ty; osc.frequency.value = hz(midi) * m; og.gain.value = a; osc.connect(og).connect(f); osc.start(t); osc.stop(end + 0.02); });
    if (o.trem) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 4.6; lg.gain.value = 0.35 * 0.2 * v; l.connect(lg).connect(g.gain); l.start(t); l.stop(end); }
    f.connect(g).connect(bus);
  },
  pluck(ctx, bus, t, dur, midi, v = 1, o = {}) {
    const osc = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    osc.type = o.type || 'triangle'; osc.frequency.value = hz(midi);
    f.type = 'lowpass'; f.frequency.setValueAtTime(o.cut || 4200, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.35);
    const end = adsr(g, t, 0.003, 0.3, 0.08, 0.15, 0.24 * v, Math.min(dur, 0.5));
    osc.connect(f).connect(g).connect(bus); osc.start(t); osc.stop(end + 0.02);
  },
  lead(ctx, bus, t, dur, midi, v = 1, o = {}) {
    const osc = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    osc.type = o.type || 'sawtooth'; osc.frequency.value = hz(midi); f.type = 'lowpass'; f.frequency.value = o.cut || 3200; f.Q.value = 1.2;
    const end = adsr(g, t, 0.01, 0.1, 0.55, 0.14, 0.16 * v, dur);
    if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.2; lg.gain.value = 9; l.connect(lg).connect(osc.detune); l.start(t); l.stop(end); }
    osc.connect(f).connect(g).connect(bus); osc.start(t); osc.stop(end + 0.02);
  },
  bell(ctx, bus, t, dur, midi, v = 1) {
    const g = ctx.createGain(); const end = adsr(g, t, 0.003, 1.2, 0.05, 0.6, 0.14 * v, 0.5);
    [[1, 1], [2.76, 0.4], [5.4, 0.18]].forEach(([m, a]) => { const osc = ctx.createOscillator(), og = ctx.createGain(); osc.frequency.value = hz(midi) * m; og.gain.value = a; osc.connect(og).connect(g); osc.start(t); osc.stop(end + 0.02); });
    g.connect(bus);
  },
  strings(ctx, bus, t, dur, midi, v = 1, o = {}) {
    const g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.cut || 1800;
    const end = adsr(g, t, o.attack || 0.35, 0.3, 0.85, 0.5, 0.07 * v, dur);
    for (const det of [-12, -4, 5, 13]) { const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = hz(midi); osc.detune.value = det; osc.connect(f); osc.start(t); osc.stop(end + 0.02); }
    const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5; lg.gain.value = 0.012; l.connect(lg).connect(g.gain); l.start(t); l.stop(end);
    f.connect(g).connect(bus);
  },
  cowbell(ctx, bus, t, v = 1) {
    const g = ctx.createGain(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 1.4;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32 * v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    for (const f of [562, 845]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(bp); o.start(t); o.stop(t + 0.3); }
    bp.connect(g).connect(bus);
  },
  rim(ctx, bus, t, v = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.02);
    g.gain.setValueAtTime(0.5 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.07);
    const n = noise(ctx, t, 0.03), hp = ctx.createBiquadFilter(), ng = ctx.createGain(); hp.type = 'highpass'; hp.frequency.value = 3000; ng.gain.setValueAtTime(0.25 * v, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.025); n.connect(hp).connect(ng).connect(bus);
  },
  conga(ctx, bus, t, v = 1, o = {}) {
    const osc = ctx.createOscillator(), g = ctx.createGain(); const f = o.f || 330;
    osc.frequency.setValueAtTime(f * 1.25, t); osc.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    g.gain.setValueAtTime(0.7 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22); osc.connect(g).connect(bus); osc.start(t); osc.stop(t + 0.25);
    const n = noise(ctx, t, 0.02), bp = ctx.createBiquadFilter(), ng = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = 1800; ng.gain.setValueAtTime(0.2 * v, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.02); n.connect(bp).connect(ng).connect(bus);
  },
  stab(ctx, bus, t, dur, midi, v = 1, o = {}) {
    const f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(o.cut || 3000, t); f.frequency.exponentialRampToValueAtTime(Math.max(300, (o.cut || 3000) * 0.18), t + 0.25);
    const end = adsr(g, t, 0.004, 0.2, 0.2, 0.12, 0.13 * v, Math.min(dur, 0.35));
    for (const det of [-8, 0, 8]) { const osc = ctx.createOscillator(); osc.type = o.type || 'sawtooth'; osc.frequency.value = hz(midi); osc.detune.value = det; osc.connect(f); osc.start(t); osc.stop(end + 0.02); }
    f.connect(g).connect(bus);
  },
  riser(ctx, bus, t, dur, v = 1) {
    const n = noise(ctx, t, dur + 0.1), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * v, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    n.connect(f).connect(g).connect(bus);
  },
  crash(ctx, bus, t, v = 1) {
    const n = noise(ctx, t, 2.2), hp = ctx.createBiquadFilter(), g = ctx.createGain(); hp.type = 'highpass'; hp.frequency.value = 3500;
    g.gain.setValueAtTime(0.32 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 2); n.connect(hp).connect(g).connect(bus);
  },
};

// ---------------------------------------------------------------- music definitions
const N = (name) => ({ C: 60, 'C#': 61, Db: 61, D: 62, Eb: 63, E: 64, F: 65, 'F#': 66, G: 67, Ab: 68, A: 69, Bb: 70, B: 71 }[name]);
const maj = (r) => [r, r + 4, r + 7], min = (r) => [r, r + 3, r + 7], maj7 = (r) => [r, r + 4, r + 7, r + 11], min7 = (r) => [r, r + 3, r + 7, r + 10], dom7 = (r) => [r, r + 4, r + 7, r + 10], min9 = (r) => [r, r + 3, r + 7, r + 10, r + 14], sus2 = (r) => [r, r + 2, r + 7];

export const MUSIC = [
  { id: 'lofi', name: 'Lo-Fi Chill', mood: 'Chill', bpm: 78, bars: 8, swing: 0.16, color: '#8b7cf6', prog: [min9(N('A') - 12 + 12), maj7(N('F') - 12 + 12), min9(N('D')), dom7(N('E') - 12 + 12)],
    layers: [
      { v: 'kick', pat: 'x.....x..x......', vel: 0.8 }, { v: 'snare', pat: '....x.......x...', vel: 0.55 }, { v: 'hat', pat: 'x.x.x.x.x.x.x.xx', vel: 0.5 },
      { v: 'bass', pat: 'x.....x.x.......', oct: -24, o: { type: 'sine', cut: 500, sub: true } },
      { v: 'keys', pat: 'x.....x...x.....', oct: 0, o: { trem: true, cut: 2200 }, vel: 0.9 }, { v: 'pad', pat: 'x...............', oct: 0, o: { cut: 700, attack: 1.0 }, vel: 0.6 },
    ], vinyl: true },
  { id: 'pop', name: 'Upbeat Pop', mood: 'Happy', bpm: 118, bars: 8, swing: 0, prog: [maj(N('C')), maj(N('G') - 12), min(N('A') - 12), maj(N('F') - 12)],
    layers: [
      { v: 'kick', pat: 'x...x...x...x...', vel: 0.85 }, { v: 'clap', pat: '....x.......x...', vel: 0.7 }, { v: 'hat', pat: '..x...x...x...x.', vel: 0.6, o: { open: true } }, { v: 'hat', pat: 'x.x.x.x.x.x.x.x.', vel: 0.35 },
      { v: 'bass', pat: 'x..x..x.x..x..x.', oct: -24, o: { type: 'sawtooth', cut: 900 } }, { v: 'pluck', pat: 'x.x.x.x.x.x.x.x.', oct: 12, arp: true, vel: 0.8 },
      { v: 'pad', pat: 'x...............', oct: 0, o: { cut: 1400, attack: 0.1 }, vel: 0.5 }, { v: 'lead', pat: '....x.......x.x.', oct: 12, o: { type: 'square', cut: 2600 }, vel: 0.7, melody: [4, 2, 0] },
    ] },
  { id: 'cinematic', name: 'Cinematic Rise', mood: 'Epic', bpm: 90, bars: 8, swing: 0, prog: [min(N('A') - 12), maj(N('F') - 12), maj(N('C')), maj(N('G') - 12)],
    layers: [
      { v: 'strings', pat: 'x...............', oct: 0, o: { attack: 1.2, cut: 1600 }, vel: 1 }, { v: 'strings', pat: 'x...............', oct: -12, o: { attack: 1.0, cut: 1000 }, vel: 0.9 },
      { v: 'tom', pat: 'x.......x.x.....', vel: 0.8, o: { f: 70, len: 1 }, from: 2 }, { v: 'kick', pat: 'x.......x.......', vel: 0.7, o: { f0: 110, f1: 38, len: 0.6 }, from: 2 },
      { v: 'bell', pat: 'x.......x.......', oct: 12, arp: true, vel: 0.6 }, { v: 'riser', every: 4 }, { v: 'crash', pat: 'x...............', every: 4, from: 4 },
    ] },
  { id: 'ambient', name: 'Ambient Calm', mood: 'Calm', bpm: 60, bars: 8, swing: 0, prog: [maj7(N('C')), maj7(N('A') - 12), maj7(N('F') - 12), sus2(N('G') - 12)],
    layers: [
      { v: 'pad', pat: 'x...............', oct: 0, o: { attack: 1.8, release: 1.8, cut: 1100, type: 'triangle' }, vel: 1.1 }, { v: 'pad', pat: 'x...............', oct: -12, o: { attack: 2.0, release: 2, cut: 600, type: 'sine' }, vel: 1.0 },
      { v: 'bell', pat: 'x.....x.....x...', oct: 12, arp: true, vel: 0.7 },
    ] },
  { id: 'techhouse', name: 'Tech House', mood: 'Energy', bpm: 124, bars: 8, swing: 0, prog: [min7(N('A') - 12), min7(N('A') - 12), min7(N('G') - 12), min7(N('F') - 12)],
    layers: [
      { v: 'kick', pat: 'x...x...x...x...', vel: 0.95 }, { v: 'hat', pat: '..x...x...x...x.', vel: 0.7, o: { open: true } }, { v: 'hat', pat: 'xxxxxxxxxxxxxxxx', vel: 0.25 }, { v: 'clap', pat: '....x.......x...', vel: 0.6 },
      { v: 'bass', pat: '.x.x.xx..x.x.xx.', oct: -24, o: { type: 'sawtooth', cut: 600, sub: true } }, { v: 'keys', pat: 'x..x..x...x..x..', oct: 0, o: { cut: 1800, decay: 0.12 }, vel: 0.8 }, { v: 'lead', pat: 'x.x...x.x.x.....', oct: 12, arp: true, o: { type: 'square', cut: 1600 }, vel: 0.5 },
    ] },
  { id: 'trap', name: 'Trap Beat', mood: 'Hype', bpm: 140, bars: 8, swing: 0, prog: [min(N('C') - 12), min(N('G') - 12), maj(N('Ab') - 12), maj(N('Bb') - 12)],
    layers: [
      { v: 'kick808', pat: 'x.....x...x.....', vel: 1, o: { f: 46, len: 1.1 } }, { v: 'snare', pat: '........x.......', vel: 0.8 }, { v: 'clap', pat: '........x.......', vel: 0.5 },
      { v: 'hat', pat: 'x.x.x.x.x.x.xxxx', vel: 0.55 }, { v: 'hat', pat: '.......x......x.', vel: 0.6, o: { open: true } },
      { v: 'keys', pat: 'x.....x...x.....', oct: 0, o: { cut: 1500 }, vel: 0.9 }, { v: 'bell', pat: 'x..x..x...x..x..', oct: 12, arp: true, vel: 0.6 },
    ] },
  { id: 'ukulele', name: 'Happy Strum', mood: 'Fun', bpm: 108, bars: 8, swing: 0.08, prog: [maj(N('C')), maj(N('F') - 12), maj(N('G') - 12), maj(N('C'))],
    layers: [
      { v: 'pluck', pat: 'x.xxx.xxx.xxx.xx', oct: 0, strum: true, o: { type: 'triangle', cut: 3600 }, vel: 0.8 }, { v: 'bass', pat: 'x.......x.......', oct: -24, o: { type: 'sine', cut: 500, sub: true } },
      { v: 'kick', pat: 'x.......x.......', vel: 0.6 }, { v: 'shaker', pat: 'x.xxx.xxx.xxx.xx', vel: 0.8 }, { v: 'clap', pat: '....x.......x...', vel: 0.5 }, { v: 'bell', pat: '..x.....x.x.....', oct: 24, arp: true, vel: 0.5 },
    ] },
  { id: 'synthwave', name: 'Synthwave Drive', mood: 'Retro', bpm: 100, bars: 8, swing: 0, prog: [min(N('F') - 12), maj(N('Db') - 12), maj(N('Ab') - 12), maj(N('Eb') - 12)],
    layers: [
      { v: 'kick', pat: 'x...x...x...x...', vel: 0.9 }, { v: 'snare', pat: '....x.......x...', vel: 0.8 }, { v: 'hat', pat: 'x.x.x.x.x.x.x.x.', vel: 0.4 },
      { v: 'bass', pat: 'xxxxxxxxxxxxxxxx', oct: -24, o: { type: 'sawtooth', cut: 500 }, vel: 0.8 }, { v: 'lead', pat: 'xxxxxxxxxxxxxxxx', oct: 12, arp: true, o: { type: 'sawtooth', cut: 2200 }, vel: 0.45 },
      { v: 'pad', pat: 'x...............', oct: 0, o: { cut: 1200, attack: 0.5 }, vel: 0.8 },
    ] },
  { id: 'corporate', name: 'Corporate Inspire', mood: 'Uplifting', bpm: 100, bars: 8, swing: 0, prog: [maj(N('C')), maj(N('G') - 12), min(N('A') - 12), maj(N('F') - 12)],
    layers: [
      { v: 'keys', pat: 'x.x.x.x.x.x.x.x.', oct: 0, arp: true, o: { cut: 3000, decay: 0.4 }, vel: 0.8 }, { v: 'pad', pat: 'x...............', oct: -12, o: { cut: 900, attack: 0.8, type: 'triangle' }, vel: 0.9 },
      { v: 'bass', pat: 'x.......x.......', oct: -24, o: { type: 'sine', cut: 500, sub: true } }, { v: 'kick', pat: 'x.......x.......', vel: 0.55, from: 2 }, { v: 'shaker', pat: 'x.x.x.x.x.x.x.x.', vel: 0.5, from: 2 }, { v: 'clap', pat: '........x.......', vel: 0.4, from: 4 },
      { v: 'strings', pat: 'x...............', oct: 0, o: { attack: 0.6 }, vel: 0.8, from: 4 },
    ] },
  { id: 'suspense', name: 'Dark Suspense', mood: 'Tense', bpm: 70, bars: 8, swing: 0, prog: [min(N('C') - 12), [N('Ab') - 12, N('Ab') - 12 + 4, N('Ab') - 12 + 7], min(N('C') - 12), [N('G') - 12, N('G') - 12 + 3, N('G') - 12 + 6]],
    layers: [
      { v: 'pad', pat: 'x...............', oct: -12, o: { attack: 1.5, release: 1.5, cut: 500 }, vel: 1.3 }, { v: 'strings', pat: 'x...............', oct: 0, o: { attack: 2, cut: 900 }, vel: 0.7 },
      { v: 'kick', pat: 'x..x............', vel: 0.9, o: { f0: 90, f1: 38, len: 0.5 } }, { v: 'bell', pat: '......x.........', oct: 12, arp: true, vel: 0.45, every: 2 },
    ] },
  { id: 'piano', name: 'Gentle Piano', mood: 'Emotional', bpm: 72, bars: 8, swing: 0, prog: [maj(N('C')), min(N('A') - 12), maj(N('F') - 12), maj(N('G') - 12)],
    layers: [
      { v: 'keys', pat: 'x.x.x.x.x.x.x.x.', oct: 0, arp: true, o: { cut: 2800, decay: 0.9 }, vel: 0.85 }, { v: 'keys', pat: 'x...............', oct: -12, o: { cut: 1200, decay: 1.2 }, vel: 0.8 },
      { v: 'pad', pat: 'x...............', oct: 0, o: { attack: 1.2, cut: 800, type: 'triangle' }, vel: 0.6 },
    ] },
  { id: 'trailer', name: 'Epic Trailer', mood: 'Intense', bpm: 100, bars: 8, swing: 0, prog: [min(N('D') - 12), min(N('Bb') - 12 + 0), maj(N('F') - 12), min(N('A') - 12)],
    layers: [
      { v: 'strings', pat: 'xxxxxxxxxxxxxxxx', oct: 0, o: { attack: 0.03, cut: 1500 }, vel: 0.9, short: true }, { v: 'tom', pat: 'x..x..x.x.x.x...', vel: 0.9, o: { f: 62, len: 0.9 } }, { v: 'kick', pat: 'x...x...x...x...', vel: 0.7, o: { f0: 120, f1: 36, len: 0.6 } },
      { v: 'bass', pat: 'xxxxxxxxxxxxxxxx', oct: -24, o: { type: 'sawtooth', cut: 400 }, vel: 0.8 }, { v: 'riser', every: 4 }, { v: 'crash', pat: 'x...............', every: 4 },
    ] },
  { id: 'house', name: 'House Groove', mood: 'Energy', bpm: 126, bars: 8, swing: 0, prog: [min7(N('A') - 12), min7(N('F') - 12 + 0), maj7(N('C')), min7(N('G') - 12)],
    layers: [
      { v: 'kick', pat: 'x...x...x...x...', vel: 0.95 }, { v: 'hat', pat: '..x...x...x...x.', vel: 0.65, o: { open: true } }, { v: 'clap', pat: '....x.......x...', vel: 0.6 }, { v: 'shaker', pat: 'xxxxxxxxxxxxxxxx', vel: 0.5, from: 1 },
      { v: 'bass', pat: '.x..x..x.x..x..x', oct: -24, o: { type: 'sawtooth', cut: 520, sub: true } }, { v: 'stab', pat: 'x..x..x...x..x..', oct: 0, o: { cut: 3200 }, vel: 0.9, from: 2 },
      { v: 'pad', pat: 'x...............', oct: 0, o: { cut: 1100, attack: 0.5 }, vel: 0.55 }, { v: 'riser', every: 4 },
    ] },
  { id: 'boombap', name: 'Boom Bap', mood: 'Chill', bpm: 90, bars: 8, swing: 0.14, prog: [min7(N('D') - 12), min7(N('G') - 12), dom7(N('C')), maj7(N('F') - 12)],
    layers: [
      { v: 'kick', pat: 'x.....x..x......', vel: 0.9 }, { v: 'snare', pat: '....x.......x...', vel: 0.75 }, { v: 'hat', pat: 'x.xxx.x.x.xxx.x.', vel: 0.5 },
      { v: 'bass', pat: 'x.....x..x......', oct: -24, o: { type: 'sine', cut: 450, sub: true } }, { v: 'keys', pat: 'x..x....x.......', oct: 0, o: { cut: 2000, decay: 0.6, trem: true }, vel: 0.85 }, { v: 'bell', pat: '......x.........', oct: 12, arp: true, vel: 0.5, from: 2 },
    ], vinyl: true },
  { id: 'latin', name: 'Latin Heat', mood: 'Fun', bpm: 102, bars: 8, swing: 0.05, prog: [min(N('A') - 12), min(N('D')), dom7(N('E') - 12), min(N('A') - 12)],
    layers: [
      { v: 'conga', pat: 'x..x..x.x..x..x.', vel: 0.8, o: { f: 330 } }, { v: 'conga', pat: '..x...x...x...x.', vel: 0.6, o: { f: 250 } }, { v: 'rim', pat: '..x..x..x..x..x.', vel: 0.5 }, { v: 'cowbell', pat: 'x...x...x...x...', vel: 0.5, from: 2 },
      { v: 'shaker', pat: 'xxxxxxxxxxxxxxxx', vel: 0.55 }, { v: 'kick', pat: 'x.......x.......', vel: 0.7 }, { v: 'bass', pat: 'x..x..x.x..x..x.', oct: -24, o: { type: 'sine', cut: 500, sub: true } },
      { v: 'pluck', pat: 'x.xx.xx.x.xx.xx.', oct: 0, strum: true, o: { type: 'triangle', cut: 3200 }, vel: 0.7 },
    ] },
  { id: 'acoustic', name: 'Sunny Acoustic', mood: 'Happy', bpm: 96, bars: 8, swing: 0.06, prog: [maj(N('G') - 12), maj(N('D')), min(N('E') - 12), maj(N('C'))],
    layers: [
      { v: 'pluck', pat: 'x.x.xx.xx.x.xx.x', oct: 0, strum: true, o: { type: 'triangle', cut: 3800 }, vel: 0.85 }, { v: 'kick', pat: 'x.......x.......', vel: 0.5, from: 1 }, { v: 'shaker', pat: 'x.x.x.x.x.x.x.x.', vel: 0.6, from: 1 },
      { v: 'bass', pat: 'x.......x.......', oct: -24, o: { type: 'sine', cut: 480, sub: true } }, { v: 'bell', pat: '....x.......x...', oct: 24, arp: true, vel: 0.4, from: 2 }, { v: 'clap', pat: '....x.......x...', vel: 0.4, from: 2 },
    ] },
  { id: 'funk', name: 'Funky Groove', mood: 'Fun', bpm: 108, bars: 8, swing: 0.1, prog: [dom7(N('E') - 12), dom7(N('A') - 12), dom7(N('E') - 12), dom7(N('B') - 12)],
    layers: [
      { v: 'kick', pat: 'x..x..x...x..x..', vel: 0.9 }, { v: 'snare', pat: '....x.......x...', vel: 0.7 }, { v: 'hat', pat: 'xxxxxxxxxxxxxxxx', vel: 0.35 },
      { v: 'bass', pat: 'x.xx..x.x.xx..xx', oct: -24, o: { type: 'sawtooth', cut: 800, sub: true } }, { v: 'stab', pat: '..x...x...x..x..', oct: 0, o: { cut: 2600, type: 'square' }, vel: 0.85 }, { v: 'cowbell', pat: 'x...x...x...x...', vel: 0.35, from: 4 },
    ] },
  { id: 'dnb', name: 'Drum & Bass', mood: 'Energy', bpm: 172, bars: 8, swing: 0, prog: [min(N('F') - 12), maj(N('Db') - 12), maj(N('Ab') - 12), min(N('Eb') - 12 + 0)],
    layers: [
      { v: 'kick', pat: 'x.........x.....', vel: 0.95 }, { v: 'snare', pat: '....x.......x...', vel: 0.85 }, { v: 'hat', pat: 'x.x.x.x.x.x.x.xx', vel: 0.45 }, { v: 'hat', pat: '.......x.......x', vel: 0.55, o: { open: true } },
      { v: 'sub', pat: 'x.....x..x......', oct: -24, vel: 0.9 }, { v: 'pad', pat: 'x...............', oct: 0, o: { cut: 1500, attack: 0.3 }, vel: 0.7 }, { v: 'bell', pat: 'x..x..x...x.....', oct: 12, arp: true, vel: 0.45, from: 2 },
    ] },
  { id: 'futurebass', name: 'Future Bass', mood: 'Uplifting', bpm: 150, bars: 8, swing: 0, prog: [maj7(N('Eb') - 12), maj7(N('Bb') - 12), min7(N('C')), maj7(N('Ab') - 12)],
    layers: [
      { v: 'kick', pat: 'x.......x.......', vel: 0.9 }, { v: 'clap', pat: '....x.......x...', vel: 0.75 }, { v: 'hat', pat: 'x.x.x.x.x.x.x.xx', vel: 0.4 }, { v: 'snare', pat: '........x.......', vel: 0.5, from: 2 },
      { v: 'stab', pat: 'x..x..x...x.x...', oct: 0, o: { cut: 5000 }, vel: 1, from: 1 }, { v: 'pad', pat: 'x...............', oct: 0, o: { cut: 1800, attack: 0.1 }, vel: 0.7 },
      { v: 'sub', pat: 'x.......x.......', oct: -24, vel: 0.8 }, { v: 'lead', pat: 'x.x.x.x.x.x.x.x.', oct: 12, arp: true, o: { type: 'square', cut: 3000 }, vel: 0.35, from: 4 },
    ] },
  { id: 'chillwave', name: 'Sunset Chillwave', mood: 'Dreamy', bpm: 84, bars: 8, swing: 0, prog: [maj7(N('F') - 12), min7(N('D') - 12 + 0), maj7(N('Bb') - 12), dom7(N('C'))],
    layers: [
      { v: 'pad', pat: 'x...............', oct: 0, o: { cut: 1300, attack: 0.9, release: 1.2 }, vel: 1 }, { v: 'lead', pat: 'x.x.x.x.x.x.x.x.', oct: 12, arp: true, o: { type: 'triangle', cut: 2400, vib: true }, vel: 0.5 },
      { v: 'kick', pat: 'x.......x.......', vel: 0.7 }, { v: 'snare', pat: '....x.......x...', vel: 0.5 }, { v: 'hat', pat: 'x.x.x.x.x.x.x.x.', vel: 0.35 }, { v: 'bass', pat: 'x.....x.x.......', oct: -24, o: { type: 'sine', cut: 450, sub: true } },
    ] },
  { id: 'jazz', name: 'Smooth Jazz', mood: 'Chill', bpm: 92, bars: 8, swing: 0.24, prog: [maj7(N('C')), min7(N('A') - 12), min7(N('D')), dom7(N('G') - 12)],
    layers: [
      { v: 'keys', pat: 'x.....x...x.....', oct: 0, o: { cut: 2400, decay: 0.9 }, vel: 0.85 }, { v: 'bass', pat: 'x..x..x.x..x..x.', oct: -24, o: { type: 'sine', cut: 600, sub: true } },
      { v: 'hat', pat: 'x..xx..xx..xx..x', vel: 0.35 }, { v: 'kick', pat: 'x...........x...', vel: 0.4 }, { v: 'rim', pat: '....x.......x...', vel: 0.45 }, { v: 'bell', pat: '..x.....x.x.....', oct: 12, arp: true, vel: 0.45, from: 2 },
    ] },
  { id: 'horror', name: 'Horror Drone', mood: 'Tense', bpm: 58, bars: 8, swing: 0, prog: [min(N('E') - 12), [N('E') - 12, N('F') - 12, N('B') - 12], min(N('E') - 12), [N('D') - 12 + 1, N('D') - 12 + 4, N('D') - 12 + 7]],
    layers: [
      { v: 'pad', pat: 'x...............', oct: -12, o: { attack: 2, release: 2, cut: 400, type: 'sawtooth' }, vel: 1.5 }, { v: 'strings', pat: 'x...............', oct: 12, o: { attack: 2.4, cut: 1400 }, vel: 0.5, from: 2 },
      { v: 'tom', pat: 'x.x.............', vel: 0.8, o: { f: 48, len: 0.9 } }, { v: 'bell', pat: '.....x.......x..', oct: 24, arp: true, vel: 0.35, every: 2 }, { v: 'riser', every: 4 },
    ] },
  { id: 'epic', name: 'Heroic Anthem', mood: 'Epic', bpm: 118, bars: 8, swing: 0, prog: [min(N('C') - 12), maj(N('Ab') - 12), maj(N('Eb')), maj(N('Bb') - 12)],
    layers: [
      { v: 'strings', pat: 'x...............', oct: 0, o: { attack: 0.5, cut: 1800 }, vel: 1 }, { v: 'strings', pat: 'xxxxxxxxxxxxxxxx', oct: -12, o: { attack: 0.02, cut: 1100 }, vel: 0.55, short: true, from: 2 },
      { v: 'tom', pat: 'x..x..x.x..x....', vel: 0.9, o: { f: 66, len: 0.8 } }, { v: 'kick', pat: 'x...x...x...x...', vel: 0.8, from: 2 }, { v: 'lead', pat: 'x.....x.x.......', oct: 12, o: { type: 'sawtooth', cut: 2800, vib: true }, vel: 0.7, melody: [4, 3, 1], from: 2 },
      { v: 'crash', pat: 'x...............', every: 4 }, { v: 'riser', every: 4 },
    ] },
  { id: 'vlog', name: 'Vlog Daydream', mood: 'Happy', bpm: 112, bars: 8, swing: 0.04, prog: [maj(N('F') - 12), maj(N('C')), min(N('D')), maj(N('Bb') - 12)],
    layers: [
      { v: 'pluck', pat: 'x.x.x.x.x.x.x.x.', oct: 12, arp: true, o: { type: 'triangle', cut: 4200 }, vel: 0.75 }, { v: 'kick', pat: 'x.......x.......', vel: 0.7 }, { v: 'clap', pat: '....x.......x...', vel: 0.55 }, { v: 'shaker', pat: 'xxxxxxxxxxxxxxxx', vel: 0.4 },
      { v: 'bass', pat: 'x..x....x..x....', oct: -24, o: { type: 'sine', cut: 500, sub: true } }, { v: 'keys', pat: 'x...x...x...x...', oct: 0, o: { cut: 2800, decay: 0.3 }, vel: 0.6, from: 2 },
    ] },
  { id: 'sadpiano', name: 'Rainy Piano', mood: 'Emotional', bpm: 64, bars: 8, swing: 0, prog: [min(N('A') - 12), maj(N('F') - 12), maj(N('C')), maj(N('G') - 12)],
    layers: [
      { v: 'keys', pat: 'x.x.x.x.x.x.x.x.', oct: 0, arp: true, o: { cut: 2400, decay: 1.1 }, vel: 0.85 }, { v: 'keys', pat: 'x...............', oct: -12, o: { cut: 900, decay: 1.4 }, vel: 0.8 },
      { v: 'strings', pat: 'x...............', oct: 0, o: { attack: 1.6, cut: 1000 }, vel: 0.6, from: 4 },
    ] },
  { id: 'phonk', name: 'Phonk Drift', mood: 'Hype', bpm: 132, bars: 8, swing: 0, prog: [min(N('F') - 12), min(N('Db') - 12 + 0), min(N('Bb') - 12), min(N('C'))],
    layers: [
      { v: 'kick808', pat: 'x..x..x...x..x..', vel: 1, o: { f: 44, len: 0.7 } }, { v: 'snare', pat: '....x.......x...', vel: 0.75 }, { v: 'cowbell', pat: 'x.x.x..xx.x.x..x', vel: 0.6 },
      { v: 'hat', pat: 'x.x.x.x.x.xxxxxx', vel: 0.45 }, { v: 'bell', pat: 'x..x..x...x..x..', oct: 12, arp: true, vel: 0.55 }, { v: 'pad', pat: 'x...............', oct: -12, o: { cut: 700, attack: 0.1 }, vel: 0.6, from: 2 },
    ] },
];

export const SFX = [
  { id: 'whoosh', name: 'Whoosh', dur: 0.9 }, { id: 'swoosh', name: 'Quick Swoosh', dur: 0.45 }, { id: 'riseup', name: 'Riser', dur: 2.2 },
  { id: 'pop', name: 'Pop', dur: 0.2 }, { id: 'click', name: 'Click', dur: 0.1 }, { id: 'ding', name: 'Ding', dur: 1.4 },
  { id: 'notify', name: 'Notification', dur: 0.8 }, { id: 'impact', name: 'Impact Hit', dur: 1.6 }, { id: 'boom', name: 'Deep Boom', dur: 2.2 },
  { id: 'glitch', name: 'Glitch Zap', dur: 0.5 }, { id: 'camera', name: 'Camera Shutter', dur: 0.35 }, { id: 'type', name: 'Keyboard Typing', dur: 1.4 },
  { id: 'sparkle', name: 'Sparkle', dur: 1.6 }, { id: 'laser', name: 'Laser', dur: 0.6 }, { id: 'coin', name: 'Coin', dur: 0.7 }, { id: 'sweep', name: 'Sweep Down', dur: 1.2 },
  { id: 'scratch', name: 'Record Scratch', dur: 0.7 }, { id: 'heartbeat', name: 'Heartbeat', dur: 1.6 }, { id: 'drumroll', name: 'Drum Roll', dur: 2 },
  { id: 'bubble', name: 'Bubble Pop', dur: 0.4 }, { id: 'levelup', name: 'Level Up', dur: 1.1 }, { id: 'error', name: 'Error Buzz', dur: 0.6 },
  { id: 'swipe', name: 'Swipe', dur: 0.3 }, { id: 'kaching', name: 'Ka-ching', dur: 1.3 }, { id: 'applause', name: 'Applause', dur: 2.6 },
  { id: 'tick', name: 'Clock Tick', dur: 1.2 }, { id: 'bassdrop', name: 'Bass Drop', dur: 2.4 }, { id: 'revcrash', name: 'Reverse Cymbal', dur: 2 },
];

function reverbIR(ctx, secs = 1.8, decay = 2.6) {
  const len = Math.floor(ctx.sampleRate * secs);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  let seed = 777;
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = ((seed / 4294967296) * 2 - 1) * Math.pow(1 - i / len, decay); }
  }
  return b;
}

export const MOOD_COLORS = { Chill: '#8b7cf6', Happy: '#ffb02e', Epic: '#ef5350', Calm: '#4dd0e1', Energy: '#ff5a8a', Hype: '#ff7043', Fun: '#2ee6a8', Retro: '#ec6ad8', Uplifting: '#5fa8ff', Tense: '#78909c', Emotional: '#f48fb1', Intense: '#e53935', Dreamy: '#b39ddb' };
export const moodColor = (m) => MOOD_COLORS[m.mood] || '#8b7cf6';
/** Scale a rendered buffer down when it would clip, so exports never distort. */
function limitPeak(buf, ceil) {
  let pk = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; } }
  if (pk <= ceil) return;
  const k = ceil / pk;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; }
}

export function musicDuration(def) { return (def.bars * 4 * 60) / def.bpm; }

export async function renderMusic(id) {
  const def = MUSIC.find((m) => m.id === id);
  if (!def) return null;
  const dur = musicDuration(def);
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  const master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.2;
  const dry = ctx.createGain(), wet = ctx.createGain(); dry.gain.value = 1; wet.gain.value = 0.22;
  const conv = ctx.createConvolver(); conv.buffer = reverbIR(ctx);
  const bus = ctx.createGain(); bus.connect(dry); bus.connect(conv); conv.connect(wet); dry.connect(master); wet.connect(master); master.connect(comp).connect(ctx.destination);
  const step = 60 / def.bpm / 4;
  const barLen = step * 16;
  for (let bar = 0; bar < def.bars; bar++) {
    const chord = def.prog[bar % def.prog.length];
    const bt = bar * barLen;
    for (const L of def.layers) {
      if (L.from != null && bar < L.from) continue;
      if (L.every && bar % L.every !== 0) { continue; }
      if (L.v === 'riser') { V.riser(ctx, bus, bt + barLen * 0.25, barLen * 0.7, 0.55); continue; }
      if (L.v === 'crash') { V.crash(ctx, bus, bt, 0.6); continue; }
      const pat = L.pat || '';
      const vel = L.vel ?? 1;
      for (let s = 0; s < 16; s++) {
        const ch = pat[s];
        if (!ch || ch === '.') continue;
        const swingOff = s % 2 === 1 ? step * (def.swing || 0) : 0;
        const t = bt + s * step + swingOff;
        const accent = ch === 'X' ? 1.2 : 1;
        const human = 1 + ((((bar * 16 + s) * 2654435761) >>> 0) % 100) / 100 * 0.1 - 0.05;
        const v = vel * accent * human;
        const len = step * 3.5;
        const oct = L.oct || 0;
        switch (L.v) {
          case 'kick': case 'kick808': case 'snare': case 'clap': case 'hat': case 'shaker': case 'tom': V[L.v](ctx, bus, t, v, L.o || {}); break;
          case 'bass': V.bass(ctx, bus, t, len * 0.9, chord[0] + oct, v, L.o || {}); break;
          case 'sub': V.sub(ctx, bus, t, len * 0.9, chord[0] + oct, v, L.o || {}); break;
          case 'stab': for (const n of chord.slice(0, 4)) V.stab(ctx, bus, t, step * 2, n + oct, v, L.o || {}); break;
          case 'conga': case 'rim': case 'cowbell': V[L.v](ctx, bus, t, v, L.o || {}); break;
          case 'pad': case 'strings': {
            const hold = L.short ? step * 1.6 : barLen - 0.06;
            const notes = chord.slice(0, 4);
            for (const n of notes) V[L.v](ctx, bus, t, hold, n + oct, v, L.o || {});
            break;
          }
          case 'keys': {
            if (L.arp) { const n = chord[(s / 2 + bar) % chord.length | 0]; V.keys(ctx, bus, t, step * 3, n + oct, v, L.o || {}); }
            else for (const n of chord.slice(0, 4)) V.keys(ctx, bus, t, len, n + oct, v, L.o || {});
            break;
          }
          case 'pluck': {
            if (L.strum) chord.forEach((n, i) => V.pluck(ctx, bus, t + i * 0.012, step * 2, n + oct, v * 0.8, L.o || {}));
            else { const n = chord[(s / 2) % chord.length | 0]; V.pluck(ctx, bus, t, step * 2, n + oct, v, L.o || {}); }
            break;
          }
          case 'lead': {
            let n;
            if (L.melody) n = chord[0] + oct + [0, 2, 4, 7, 9, 12][(L.melody[(s >> 2) % L.melody.length] + bar) % 6];
            else n = chord[((s >> 1) + bar) % chord.length] + oct;
            V.lead(ctx, bus, t, step * (L.melody ? 3 : 1.8), n, v, L.o || {});
            break;
          }
          case 'bell': { const n = chord[((s >> 1) + bar * 2) % chord.length] + oct; V.bell(ctx, bus, t, step * 4, n, v); break; }
          default: break;
        }
      }
    }
  }
  if (def.vinyl) {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf(ctx); n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.5; const g = ctx.createGain(); g.gain.value = 0.012;
    n.connect(bp).connect(g).connect(master); n.start(0);
  }
  const buf = await ctx.startRendering();
  limitPeak(buf, 0.93);
  // seamless loop edges
  const fade = Math.floor(SR * 0.012);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < fade; i++) { const k = i / fade; d[i] *= k; d[d.length - 1 - i] *= k; } }
  return buf;
}

export async function renderSfx(id) {
  const def = SFX.find((s) => s.id === id);
  if (!def) return null;
  const ctx = new OfflineAudioContext(2, Math.ceil(def.dur * SR), SR);
  const bus = ctx.createGain(); bus.gain.value = 0.9; bus.connect(ctx.destination);
  const t = 0.01;
  const sweepNoise = (f0, f1, dur, peakAt, q = 1.2, amp = 0.8) => {
    const n = noise(ctx, t, dur + 0.1), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(amp, t + dur * peakAt); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f).connect(g).connect(bus);
  };
  switch (id) {
    case 'whoosh': sweepNoise(250, 4200, 0.8, 0.5, 1.0, 1.1); break;
    case 'swoosh': sweepNoise(500, 6500, 0.4, 0.4, 1.4, 1.0); break;
    case 'riseup': V.riser(ctx, bus, t, 2.0, 0.9); break;
    case 'pop': { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(700, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.08); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.15); break; }
    case 'click': { const n = noise(ctx, t, 0.03), hp = ctx.createBiquadFilter(), g = ctx.createGain(); hp.type = 'highpass'; hp.frequency.value = 2500; g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03); n.connect(hp).connect(g).connect(bus); break; }
    case 'ding': V.bell(ctx, bus, t, 1, 88, 2.2); V.bell(ctx, bus, t + 0.01, 1, 95, 1.2); break;
    case 'notify': V.bell(ctx, bus, t, 0.4, 84, 2); V.bell(ctx, bus, t + 0.14, 0.5, 91, 2); break;
    case 'impact': V.kick(ctx, bus, t, 1.2, { f0: 90, f1: 32, len: 1.2 }); V.crash(ctx, bus, t, 0.5); V.tom(ctx, bus, t, 1, { f: 50, len: 1.3 }); break;
    case 'boom': V.kick808(ctx, bus, t, 1.2, { f: 36, len: 2 }); sweepNoise(1500, 100, 1.4, 0.05, 0.6, 0.9); break;
    case 'glitch': for (let i = 0; i < 7; i++) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = i % 2 ? 'square' : 'sawtooth'; o.frequency.value = 200 + ((i * 7919) % 1800); const tt = t + i * 0.055; g.gain.setValueAtTime(0.3, tt); g.gain.setValueAtTime(0.0001, tt + 0.045); o.connect(g).connect(bus); o.start(tt); o.stop(tt + 0.05); } break;
    case 'camera': { for (const [dt, f] of [[0, 3500], [0.07, 1800]]) { const n = noise(ctx, t + dt, 0.06), bp = ctx.createBiquadFilter(), g = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = f; g.gain.setValueAtTime(0.9, t + dt); g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.05); n.connect(bp).connect(g).connect(bus); } break; }
    case 'type': for (let i = 0; i < 14; i++) { const tt = t + i * 0.09 + ((i * 37) % 10) * 0.004; const n = noise(ctx, tt, 0.03), bp = ctx.createBiquadFilter(), g = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = 2200 + (i % 3) * 700; g.gain.setValueAtTime(0.6, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.03); n.connect(bp).connect(g).connect(bus); } break;
    case 'sparkle': for (let i = 0; i < 9; i++) V.bell(ctx, bus, t + i * 0.07, 0.3, 96 + ((i * 5) % 12), 0.7); break;
    case 'laser': { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(2400, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.4); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.5); break; }
    case 'coin': { for (const [dt, m] of [[0, 83], [0.08, 88]]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = hz(m); g.gain.setValueAtTime(0.0001, t + dt); g.gain.linearRampToValueAtTime(0.25, t + dt + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + dt + (dt ? 0.5 : 0.08)); o.connect(g).connect(bus); o.start(t + dt); o.stop(t + dt + 0.55); } break; }
    case 'sweep': sweepNoise(6000, 200, 1.0, 0.1, 1.0, 0.9); break;
    case 'scratch': { const n = noise(ctx, t, 0.6), bp = ctx.createBiquadFilter(), g = ctx.createGain(); bp.type = 'bandpass'; bp.Q.value = 4;
      bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(3200, t + 0.12); bp.frequency.linearRampToValueAtTime(600, t + 0.26); bp.frequency.linearRampToValueAtTime(2600, t + 0.4); bp.frequency.exponentialRampToValueAtTime(200, t + 0.62);
      g.gain.setValueAtTime(0.9, t); g.gain.setValueAtTime(0.6, t + 0.26); g.gain.exponentialRampToValueAtTime(0.001, t + 0.64); n.connect(bp).connect(g).connect(bus); break; }
    case 'heartbeat': for (let i = 0; i < 2; i++) { V.kick808(ctx, bus, t + i * 0.8, 1.1, { f: 52, len: 0.3 }); V.kick808(ctx, bus, t + i * 0.8 + 0.2, 0.8, { f: 46, len: 0.3 }); } break;
    case 'drumroll': for (let i = 0; i < 36; i++) { const tt = t + i * 0.052; V.snare(ctx, bus, tt, 0.25 + (i / 36) * 0.75); } V.crash(ctx, bus, t + 1.7, 0.6); break;
    case 'bubble': { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(380, t); o.frequency.exponentialRampToValueAtTime(1100, t + 0.09); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.6, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.2); break; }
    case 'levelup': [72, 76, 79, 84, 88].forEach((m, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = hz(m); const tt = t + i * 0.08; g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.22, tt + 0.005); g.gain.exponentialRampToValueAtTime(0.001, tt + (i === 4 ? 0.6 : 0.12)); o.connect(g).connect(bus); o.start(tt); o.stop(tt + 0.65); }); break;
    case 'error': for (let i = 0; i < 2; i++) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = 130; const tt = t + i * 0.2; g.gain.setValueAtTime(0.35, tt); g.gain.setValueAtTime(0.0001, tt + 0.15); o.connect(g).connect(bus); o.start(tt); o.stop(tt + 0.17); } break;
    case 'swipe': sweepNoise(1200, 7000, 0.22, 0.5, 2, 0.9); break;
    case 'kaching': { for (const [dt, m] of [[0, 83], [0.09, 88]]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = hz(m); g.gain.setValueAtTime(0.0001, t + 0.12 + dt); g.gain.linearRampToValueAtTime(0.2, t + 0.125 + dt); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12 + dt + 0.5); o.connect(g).connect(bus); o.start(t + 0.12 + dt); o.stop(t + 0.7 + dt); }
      sweepNoise(3000, 800, 0.1, 0.2, 1, 0.8); V.bell(ctx, bus, t + 0.14, 1, 96, 1.4); break; }
    case 'applause': for (let i = 0; i < 70; i++) { const tt = t + ((i * 7919) % 2200) / 1000 * (0.35 + (i % 7) / 12) + (i % 5) * 0.01; const n = noise(ctx, tt, 0.05), bp = ctx.createBiquadFilter(), g = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = 1500 + ((i * 313) % 3000); bp.Q.value = 0.8; const env = Math.sin(Math.min(1, tt / 2.2) * Math.PI); g.gain.setValueAtTime(0.5 * Math.max(0.15, env), tt); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.045); n.connect(bp).connect(g).connect(bus); } break;
    case 'tick': for (let i = 0; i < 4; i++) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = i % 2 ? 1500 : 1900; const tt = t + i * 0.3; g.gain.setValueAtTime(0.5, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.03); o.connect(g).connect(bus); o.start(tt); o.stop(tt + 0.04); } break;
    case 'bassdrop': { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(34, t + 1.1); g.gain.setValueAtTime(0.95, t); g.gain.setValueAtTime(0.95, t + 1.0); g.gain.exponentialRampToValueAtTime(0.001, t + 2.2); o.connect(g).connect(bus); o.start(t); o.stop(t + 2.3); sweepNoise(2500, 80, 0.8, 0.05, 0.6, 0.5); break; }
    case 'revcrash': { const n = noise(ctx, t, 2), hp = ctx.createBiquadFilter(), g = ctx.createGain(); hp.type = 'highpass'; hp.frequency.setValueAtTime(1500, t); hp.frequency.exponentialRampToValueAtTime(6500, t + 1.9); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 1.9); g.gain.linearRampToValueAtTime(0, t + 1.97); n.connect(hp).connect(g).connect(bus); break; }
    default: break;
  }
  const out = await ctx.startRendering();
  limitPeak(out, 0.95);
  return out;
}
