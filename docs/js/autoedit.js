// One-click edit: planning (pure, testable) and building (writes clips into the project).
//
//   1. find dead air from the audio itself (adaptive threshold, so quiet speakers are not clipped)
//   2. cut filler words ("um", "uh") and accidental repeats ("the the") using the transcript
//   3. rebuild the main track from the kept segments, with gentle punch-in zooms
//   4. word-by-word captions in the chosen look, tinted with the brand
//   5. a quiet music bed that fades in/out and ducks under the voice
//   6. b-roll cutaways (animated backgrounds + a keyword card), 7. handle + logo
import { uid, deep } from './util.js';
import { TEXT_PRESETS, mergeText, TEXT_DEFAULT } from './textrender.js';
import { videoClip, genClip, textClip, baseClip, audioClip, end, projectDuration } from './model.js';
import { GENERATORS } from './generators.js';
import { MUSIC } from './synth.js';
import { builtinMedia } from './audio.js';

/* ------------------------------------------------------------------ looks */
// Caption looks = the text presets, plus how many words appear at a time.
export const LOOKS = [
  { name: 'Viral Pop', words: 3, chars: 18, tag: 'Bold, uppercase, word by word' },
  { name: 'Bold Impact', words: 2, chars: 14, tag: 'Huge words that hit hard' },
  { name: 'Clean Pro', words: 6, chars: 34, tag: 'Understated and polished' },
  { name: 'Podcast Box', words: 6, chars: 34, tag: 'Readable on a soft dark box' },
  { name: 'Tag', words: 4, chars: 24, tag: 'Bright label, brand colored' },
  { name: 'Neon', words: 4, chars: 22, tag: 'Glowing futuristic' },
  { name: 'Cinematic', words: 6, chars: 32, tag: 'Elegant serif, slow fade' },
  { name: 'Elegant', words: 5, chars: 28, tag: 'Spaced serif with warmth' },
  { name: 'Comic', words: 3, chars: 18, tag: 'Playful and loud' },
  { name: 'Handwritten', words: 5, chars: 26, tag: 'Warm and personal' },
  { name: 'Marker', words: 4, chars: 22, tag: 'Rough and energetic' },
  { name: 'Classic', words: 6, chars: 34, tag: 'Simple white text' },
];
export const BRAND_LOOK = { name: 'Your brand', words: 4, chars: 24, tag: 'Your font and colors' };
export const BG_MUSIC = ['ambient', 'lofi', 'piano', 'corporate', 'ukulele'];   // gentle enough to sit under speech
export const MUSIC_LEVELS = { subtle: 0.14, balanced: 0.22, present: 0.34 };
export const CARDS_PER_MIN = { off: 0, low: 2, medium: 4, high: 6 };

/* ------------------------------------------------------------------ audio analysis */
/** Pick a silence threshold from the recording itself: noise floor + a third of the way to speech level. */
export function adaptiveThreshold(db) {
  if (!db || db.length < 20) return { threshold: -38, floor: null, speech: null, adaptive: false };
  const s = Float32Array.from(db).sort();
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  const floor = q(0.1), speech = q(0.92);
  if (speech - floor < 10) return { threshold: -38, floor, speech, adaptive: false };
  const thr = Math.max(-52, Math.min(-26, floor + 0.33 * (speech - floor)));
  return { threshold: +thr.toFixed(1), floor, speech, adaptive: true };
}

export const PACING = {
  relaxed: { minSilence: 0.7, keep: 0.28 },
  balanced: { minSilence: 0.45, keep: 0.18 },
  tight: { minSilence: 0.32, keep: 0.1 },
};

/** Spans [s,e] of silence, at least `minLen` long, from an RMS dB envelope. */
export function silencesFrom(db, win, thr, minLen) {
  const spans = []; let start = null;
  for (let i = 0; i < db.length; i++) {
    const t = i * win;
    if (db[i] < thr) { if (start == null) start = t; }
    else if (start != null) { if (t - start >= minLen) spans.push([start, t]); start = null; }
  }
  if (start != null) { const t = db.length * win; if (t - start >= minLen) spans.push([start, t]); }
  return spans;
}

/* ------------------------------------------------------------------ transcript-based cuts */
const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'uhm', 'er', 'erm', 'ah', 'hm', 'hmm', 'mm', 'mhm', 'eh']);
const STUTTER = new Set(['i', 'a', 'the', 'and', 'but', 'so', 'we', 'it', 'to', 'of', 'in', 'is', 'my', 'you', 'that', 'this', 'if', 'or', 'on', 'for', 'at', 'he', 'she', 'they']);
const norm = (w) => String(w || '').toLowerCase().replace(/[^a-z']/g, '');

/** Spans to remove because of filler words and accidental repeats ("I I think", "the the"). */
export function findWordCuts(words, { fillers = true, repeats = true } = {}) {
  const cuts = [];
  let fillerN = 0, repeatN = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i], n = norm(w.text);
    if (fillers && FILLERS.has(n)) { cuts.push([w.start - 0.02, w.end + 0.02]); fillerN++; continue; }
    const nx = words[i + 1];
    if (repeats && nx && n && n === norm(nx.text) && STUTTER.has(n) && nx.start - w.end < 0.7 && !/[.!?;]$/.test(w.text)) {
      cuts.push([w.start - 0.01, nx.start - 0.03]); repeatN++;
    }
  }
  return { cuts: cuts.filter(([s, e]) => e - s > 0.06), fillerN, repeatN };
}

/** Merge cut spans and invert them into the segments to keep. */
export function keepSegments(duration, cuts, minKeep = 0.15) {
  const sorted = cuts.map(([s, e]) => [Math.max(0, s), Math.min(duration, e)]).filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const c of sorted) { const l = merged[merged.length - 1]; if (l && c[0] <= l[1] + 0.02) l[1] = Math.max(l[1], c[1]); else merged.push([...c]); }
  const keep = []; let cur = 0;
  for (const [s, e] of merged) { if (s - cur >= minKeep) keep.push([cur, s]); cur = Math.max(cur, e); }
  if (duration - cur >= minKeep) keep.push([cur, duration]);
  return keep.length ? keep : [[0, duration]];
}

/** Silences become cuts that leave a small natural pause (`keep` seconds) at each side. */
export function silenceCuts(silences, keep) {
  return silences.map(([s, e]) => [s + keep, e - keep]).filter(([s, e]) => e - s > 0.05);
}

/** Source time -> timeline time for words inside kept segments (null when the word was cut). */
export function makeTimeMap(keep) {
  const starts = []; let t = 0;
  for (const [s, e] of keep) { starts.push(t); t += e - s; }
  const total = t;
  const at = (src) => {
    for (let i = 0; i < keep.length; i++) if (src >= keep[i][0] - 1e-6 && src <= keep[i][1] + 1e-6) return starts[i] + (src - keep[i][0]);
    return null;
  };
  return { at, total, starts };
}

/** Words that survive the cuts, with timeline times. */
export function mapWords(words, keep) {
  const m = makeTimeMap(keep);
  const out = [];
  for (const w of words) {
    const mid = (w.start + w.end) / 2;
    const a = m.at(Math.min(Math.max(w.start, 0), w.end)), b = m.at(w.end);
    if (m.at(mid) == null) continue;
    const s = a ?? m.at(mid) - (w.end - w.start) / 2, e = b ?? m.at(mid) + (w.end - w.start) / 2;
    if (e - s > 0.01) out.push({ text: w.text, start: s, end: Math.max(e, s + 0.06) });
  }
  return out;
}

/* ------------------------------------------------------------------ captions */
/** Group words into on-screen caption chunks. */
export function chunkWords(words, maxWords, maxChars) {
  const out = []; let cur = [];
  const flush = () => { if (cur.length) { out.push(cur); cur = []; } };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const len = [...cur, w].map((x) => x.text).join(' ').length;
    const gap = cur.length ? w.start - cur[cur.length - 1].end : 0;
    if (cur.length && (cur.length >= maxWords || len > maxChars || gap > 0.9)) flush();
    cur.push(w);
    if (/[.!?]$/.test(w.text.trim())) flush();
  }
  flush();
  return out;
}

/** Text style for a look, tinted by the brand. */
export function lookStyle(lookName, brand, applyBrand) {
  const base = TEXT_DEFAULT();
  if (lookName === BRAND_LOOK.name) {
    return mergeText(base, {
      font: brand.font, weight: brand.fontWeight || 800, size: 0.06, color: brand.text, upper: true,
      stroke: { on: true, color: '#000000', w: 0.14 }, shadow: { on: true }, hl: { on: true, color: brand.primary },
    });
  }
  const preset = TEXT_PRESETS.find((p) => p.name === lookName) || TEXT_PRESETS[1];
  const t = mergeText(base, preset.text);
  if (applyBrand) {
    if (t.hl?.on) t.hl = { ...t.hl, color: brand.primary };
    if (t.glow?.on) t.glow = { ...t.glow, color: brand.primary };
    if (t.bg?.on) t.bg = { ...t.bg, color: t.bg.a >= 0.99 ? brand.primary : brand.secondary };
    if (t.bg?.on && t.bg.a >= 0.99) t.color = inkFor(brand.primary);
    if (!t.hl?.on && !t.bg?.on && !t.glow?.on && t.stroke?.on === false) { /* simple looks stay neutral */ }
  }
  return t;
}

export function inkFor(hex) {
  const n = parseInt((hex || '#000000').replace('#', '').padEnd(6, '0'), 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.6 ? '#0b0f14' : '#ffffff';
}

/* ------------------------------------------------------------------ b-roll */
const KEYWORDS = {
  tech: ['software', 'app', 'code', 'data', 'ai', 'computer', 'digital', 'online', 'internet', 'website', 'automation', 'technology', 'system', 'algorithm', 'startup', 'business', 'marketing', 'sales', 'money', 'growth', 'profit', 'revenue', 'strategy', 'trading', 'market', 'invest', 'investing', 'productivity'],
  space: ['space', 'universe', 'galaxy', 'planet', 'future', 'infinite', 'vision', 'cosmic'],
  nature: ['nature', 'forest', 'ocean', 'water', 'sky', 'tree', 'garden', 'weather', 'rain', 'snow', 'calm', 'peace', 'morning', 'sunrise', 'sunset'],
  city: ['city', 'night', 'street', 'drive', 'driving', 'traffic', 'downtown', 'urban', 'speed', 'fast'],
  fitness: ['workout', 'gym', 'fitness', 'training', 'energy', 'power', 'strong', 'strength', 'run', 'running', 'health', 'discipline', 'hustle'],
  food: ['coffee', 'food', 'cooking', 'recipe', 'dinner', 'breakfast', 'eat', 'kitchen', 'cozy'],
  music: ['music', 'song', 'party', 'dance', 'concert', 'beat'],
  edu: ['learn', 'learning', 'study', 'school', 'lesson', 'tutorial', 'teach', 'education', 'knowledge', 'idea', 'ideas', 'tip', 'tips', 'step', 'steps'],
  travel: ['travel', 'trip', 'beach', 'mountain', 'adventure', 'journey', 'road', 'explore', 'vacation'],
  romance: ['love', 'heart', 'relationship', 'together', 'wedding'],
  lifestyle: ['style', 'beauty', 'skin', 'fashion', 'routine', 'lifestyle', 'self', 'confidence', 'mindset', 'happy', 'life'],
  cinema: ['story', 'film', 'movie', 'epic', 'dream', 'journey', 'moment', 'remember'],
  gaming: ['game', 'gaming', 'level', 'play', 'retro'],
  fun: ['fun', 'celebrate', 'surprise', 'free', 'win', 'winning', 'success'],
  dark: ['fear', 'dark', 'danger', 'mistake', 'mistakes', 'warning', 'risk', 'lose', 'losing', 'fail', 'failure'],
};
const STOP = new Set('the and for that this with have from your about what when they them then than just like really very into over only also more most some make made been were will would could should there their because'.split(' '));
const GENRE_DEFAULT = ['tech', 'cinema', 'lifestyle', 'nature'];

const kwIndex = (() => { const m = new Map(); for (const [g, list] of Object.entries(KEYWORDS)) for (const k of list) if (!m.has(k)) m.set(k, g); return m; })();
const genFor = (genre, seed) => {
  const list = GENERATORS.filter((g) => g.genre === genre);
  return list.length ? list[seed % list.length] : GENERATORS[seed % GENERATORS.length];
};

/** Choose cutaway moments. Keyword hits win; gaps are filled evenly. Returns [{t, dur, gen, word}] on the timeline. */
export function pickBroll(words, total, density, { cutaway = 2.6, minGap = 6 } = {}) {
  const budget = Math.floor((total / 60) * (CARDS_PER_MIN[density] ?? 0) + (density === 'off' ? 0 : 0.5));
  if (!budget || total < 8) return [];
  const spots = [];
  const ok = (t) => t > 2.2 && t + cutaway < total - 1.2 && spots.every((s) => Math.abs(s.t - t) >= minGap);
  let seed = 0;
  // 1. spoken keywords, in order, spread out
  for (const w of words) {
    if (spots.length >= budget) break;
    const k = norm(w.text);
    if (k.length < 3 || STOP.has(k)) continue;
    const genre = kwIndex.get(k);
    if (genre && ok(w.start)) spots.push({ t: Math.max(0, w.start - 0.1), dur: cutaway, gen: genFor(genre, seed++).id, word: k });
  }
  // 2. even gaps, using the strongest nouns nearby when there are any
  const slots = Math.max(0, budget - spots.length);
  for (let i = 1; i <= slots; i++) {
    let t = (total * i) / (slots + 1);
    for (let tries = 0; tries < 8 && !ok(t); tries++) t += 1.5;
    if (!ok(t)) continue;
    const near = words.filter((w) => Math.abs(w.start - t) < 3 && norm(w.text).length > 4 && !STOP.has(norm(w.text))).sort((a, b) => norm(b.text).length - norm(a.text).length)[0];
    spots.push({ t, dur: cutaway, gen: genFor(GENRE_DEFAULT[seed % GENRE_DEFAULT.length], seed++).id, word: near ? norm(near.text) : '' });
  }
  return spots.sort((a, b) => a.t - b.t);
}

/* ------------------------------------------------------------------ building */
const POS_Y = { bottom: 0.3, center: 0, top: -0.32 };      // tf.y is the offset from the middle (positive = lower on screen)
const LOGO_POS = { top_left: [-1, -1], top_right: [1, -1], bottom_left: [-1, 1], bottom_right: [1, 1] };

/**
 * Apply a one-click edit to the open project.
 * `ctx` = { store, bank, lib }; `plan` = options; `words` = transcript ([{text,start,end}] in source seconds).
 * Returns stats for the summary screen.
 */
export async function applyOneClick(ctx, plan, words, progress = () => {}) {
  const { store, bank } = ctx;
  const stats = { silence: 0, fillers: 0, repeats: 0, captions: 0, broll: 0, music: '', brand: false, from: 0, to: 0 };
  const main = store.mainTrack;
  const src = main.clips.find((c) => c.kind === 'video');
  if (!src) throw new Error('Add a video first.');
  const media = store.project.media[src.mediaId];
  const dur = src.dur;
  stats.from = dur;

  /* ---- cuts ---- */
  progress('cut');
  let cuts = [];
  if (plan.cutPauses && bank.has(src.mediaId)) {
    const r = bank.rmsDb(src.mediaId, 0.02);
    if (r) {
      const t = adaptiveThreshold(r.db);
      const pace = PACING[plan.pacing] || PACING.balanced;
      const sil = silencesFrom(r.db, r.win, t.threshold, pace.minSilence);
      const sc = silenceCuts(sil, pace.keep);
      stats.silence = sc.reduce((a, [s, e]) => a + (e - s), 0);
      cuts.push(...sc);
    }
  }
  if (plan.cutFillers && words?.length) {
    const w = findWordCuts(words, { fillers: true, repeats: true });
    stats.fillers = w.fillerN; stats.repeats = w.repeatN;
    cuts.push(...w.cuts);
  }
  const keep = keepSegments(dur, cuts.map(([s, e]) => [s - src.in * 0, e]));
  const pieces = keep.length;
  store.commit(() => {
    const tr = main;
    tr.clips = tr.clips.filter((x) => x.id !== src.id);
    let t = src.start;
    keep.forEach(([s, e], i) => {
      const n = deep(src); n.id = uid('clp'); n.in = src.in + s * src.speed; n.dur = (e - s) / src.speed; n.start = t; n.transIn = null; n.kf = {};
      if (plan.zoom && pieces > 1 && i % 2 === 1) { n.tf.s = 1.08; }      // gentle punch-in on every other cut keeps it lively
      t += n.dur; tr.clips.push(n);
    });
    store.sel.clear();
  });
  const total = keep.reduce((a, [s, e]) => a + (e - s), 0) / src.speed;
  stats.to = total;

  /* ---- captions ---- */
  const brand = plan.brand;
  const applyBrand = plan.applyBrand && brand;
  let mapped = [];
  if (words?.length) mapped = mapWords(words, keep);
  if (plan.captions && mapped.length) {
    progress('captions');
    const look = plan.look === BRAND_LOOK.name ? BRAND_LOOK : (LOOKS.find((l) => l.name === plan.look) || LOOKS[0]);
    const style = lookStyle(look.name, brand, applyBrand);
    const chunks = chunkWords(mapped, look.words, look.chars);
    const y = POS_Y[plan.captionPos] ?? POS_Y.bottom;
    const scale = plan.captionScale || 1;
    store.commit((p) => {
      const tr = store.addTrack('text'); tr.name = 'Captions';
      chunks.forEach((chunk, i) => {
        const t0 = chunk[0].start;
        const next = chunks[i + 1];
        const t1 = Math.max(chunk[chunk.length - 1].end + 0.12, t0 + 0.35);
        const endT = next ? Math.min(t1, next[0].start - 0.01) : Math.min(t1, total);
        const c = textClip(t0, Math.max(0.3, endT - t0), { ...style, content: chunk.map((w) => w.text).join(' '), size: style.size * scale });
        c.name = c.text.content.slice(0, 24);
        c.tf.y = y;
        c.animIn = { id: look.words <= 3 ? 'pop' : 'fade', dur: look.words <= 3 ? 0.18 : 0.14 };
        if (style.hl?.on) c.words = chunk.map((w) => ({ t0: w.start - t0, t1: w.end - t0 }));
        tr.clips.push(c);
      });
      stats.captions = chunks.length;
    });
  }

  /* ---- b-roll cutaways ---- */
  if (plan.broll !== 'off' && total > 8) {
    progress('broll');
    const spots = pickBroll(mapped, total, plan.broll);
    if (spots.length) {
      const brandColor = applyBrand ? brand.primary : '#ffffff';
      store.commit(() => {
        const tr = store.addTrack('video');
        const txt = store.addTrack('text'); txt.name = 'Cards';
        for (const s of spots) {
          const g = GENERATORS.find((x) => x.id === s.gen);
          if (!g) continue;
          const c = genClip(g, s.t, s.dur);
          c.animIn = { id: 'fade', dur: 0.25 };
          c.animOut = { id: 'fade', dur: 0.25 };
          c.look = { id: 'none', amt: 1 }; c.bgblur = false;
          tr.clips.push(c);
          if (plan.cards && s.word) {
            const style = mergeText(TEXT_DEFAULT(), {
              font: applyBrand ? brand.font : 'Montserrat', weight: 800, size: 0.095, color: '#ffffff', upper: true, spacing: 0.04,
              stroke: { on: false }, shadow: { on: true, blur: 0.4, a: 0.7 }, content: s.word, glow: { on: false },
              bg: { on: true, color: applyBrand ? brand.secondary : '#101418', a: 0.72, pad: 0.45, radius: 0.3 },
            });
            const tcl = textClip(s.t + 0.15, s.dur - 0.3, style);
            tcl.tf.y = -0.02; tcl.animIn = { id: 'pop', dur: 0.3 }; tcl.name = s.word;
            txt.clips.push(tcl);
            // brand colored accent bar under the keyword
            const bar = textClip(s.t + 0.15, s.dur - 0.3, mergeText(TEXT_DEFAULT(), {
              content: '▬▬▬', size: 0.05, color: brandColor, stroke: { on: false }, shadow: { on: false }, font: 'Inter', weight: 800 }));
            bar.tf.y = 0.07; bar.animIn = { id: 'fade', dur: 0.3 }; bar.name = 'accent';
            txt.clips.push(bar);
          }
          stats.broll++;
        }
      });
    }
  }

  /* ---- music ---- */
  if (plan.music && plan.music !== 'none') {
    progress('music');
    const id = plan.music === 'auto' ? (plan.pacing === 'tight' ? 'lofi' : 'ambient') : plan.music;
    const def = MUSIC.find((m) => m.id === id) || MUSIC.find((m) => m.id === 'ambient');
    if (def) {
      const m = builtinMedia.music(def.id);
      await bank.ensureBuiltin(m.id).catch(() => {});
      store.commit((p) => {
        p.media[m.id] = m;
        const c = audioClip(m, 0, { loop: true, duck: true, vol: MUSIC_LEVELS[plan.musicLevel] ?? MUSIC_LEVELS.balanced, fadeIn: 1.5, fadeOut: 2.5 });
        c.dur = Math.max(1, projectDuration(p));
        store.trackFor('audio', 0, c.dur).clips.push(c);
      });
      stats.music = def.name;
    }
  }

  /* ---- brand: handle + logo ---- */
  if (applyBrand) {
    progress('brand');
    const total2 = projectDuration(store.project);
    const pos = LOGO_POS[brand.logoPos] || LOGO_POS.top_right;
    if (brand.handle && brand.showHandle) {
      store.commit(() => {
        const tr = store.addTrack('text'); tr.name = 'Brand';
        const left = pos[0] > 0 || !brand.logo;          // keep the handle opposite the logo
        const c = textClip(0, total2, mergeText(TEXT_DEFAULT(), {
          content: '@' + brand.handle.replace(/^@/, ''), size: 0.026, color: '#ffffff', font: 'Inter', weight: 700, stroke: { on: false },
          shadow: { on: true, blur: 0.4, a: 0.8 } }));
        c.name = 'Handle'; c.tf.x = left ? -0.3 : 0.3; c.tf.y = -0.42;
        c.animIn = { id: 'fade', dur: 0.6 };
        tr.clips.push(c);
      });
      stats.brand = true;
    }
    if (brand.logo && ctx.logoMedia) {
      store.commit((p) => {
        const m = ctx.logoMedia; p.media[m.id] = m;
        const tr = store.addTrack('video'); tr.name = 'Logo';
        const c = videoClip(m, 0); c.dur = total2; c.name = 'Logo';
        const frac = { small: 0.12, medium: 0.17, large: 0.24 }[brand.logoSize] || 0.17;
        const ar = (m.w || 1) / (m.h || 1);
        c.bgblur = false; c.tf.fit = 'fit'; c.tf.s = frac * 0.9 / Math.max(0.5, Math.min(2, ar));
        c.tf.x = pos[0] * 0.34; c.tf.y = pos[1] * 0.4; c.tf.op = 0.92;
        tr.clips.push(c);
      });
      stats.brand = true;
    }
  }
  return stats;
}

export { baseClip, end };
