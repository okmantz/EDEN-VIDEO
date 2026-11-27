// One-click edit: planning (pure, testable in Node) and building (writes clips into the project).
//
//   1. listen   : word times from the speech model, then snapped to the real audio so cuts and captions line up
//   2. cut      : dead air (from the audio AND the transcript), filler words, hesitations, stutters and re-takes,
//                 never cutting inside a spoken word, with edges placed on quiet moments so nothing clicks
//   3. rebuild  : the main track from the kept segments, 12 ms audio fades at every join, gentle punch-ins, colour look
//   4. captions : phrase-aware chunks in the chosen look, tinted with the brand
//   5. b-roll   : keyword-matched cutaways (stock footage when a key is set, animated scenes otherwise)
//   6. music    : a quiet bed that fades in/out and ducks under the voice
//   7. brand    : handle, logo and an optional end card
import { uid, deep } from './util.js';
import { TEXT_PRESETS, mergeText, TEXT_DEFAULT, FONTS } from './textrender.js';
import { videoClip, genClip, textClip, baseClip, audioClip, end, projectDuration } from './model.js';
import { GENERATORS } from './generators.js';
import { MUSIC } from './synth.js';
import { builtinMedia } from './audio.js';

/* ------------------------------------------------------------------ looks */
// Caption looks = text presets, plus how many words appear at a time. `plain` strips trailing punctuation (the "social" look).
export const LOOKS = [
  { name: 'Viral Pop', words: 3, chars: 18, tag: 'Bold, uppercase, word by word', plain: true },
  { name: 'Hormozi', words: 3, chars: 18, tag: 'Heavy white, yellow active word', plain: true },
  { name: 'Bold Impact', words: 2, chars: 14, tag: 'Huge words that hit hard', plain: true },
  { name: 'Street', words: 3, chars: 18, tag: 'Condensed, red active word', plain: true },
  { name: 'Karaoke', words: 5, chars: 28, tag: 'Dark box, glowing active word' },
  { name: 'Podcast Box', words: 6, chars: 34, tag: 'Readable on a soft dark box' },
  { name: 'Clean Pro', words: 6, chars: 34, tag: 'Understated and polished' },
  { name: 'Subtitle', words: 7, chars: 38, tag: 'Classic movie subtitles' },
  { name: 'Minimal', words: 6, chars: 34, tag: 'Small, quiet, modern' },
  { name: 'Tag', words: 4, chars: 24, tag: 'Bright label, brand colored' },
  { name: 'Neon', words: 4, chars: 22, tag: 'Glowing futuristic', plain: true },
  { name: 'Soft Glow', words: 5, chars: 28, tag: 'Dreamy white glow' },
  { name: 'Pop Outline', words: 3, chars: 18, tag: 'Purple outline, yellow pop', plain: true },
  { name: 'Cinematic', words: 6, chars: 32, tag: 'Elegant serif, slow fade' },
  { name: 'Elegant', words: 5, chars: 28, tag: 'Spaced serif with warmth' },
  { name: 'Comic', words: 3, chars: 18, tag: 'Playful and loud', plain: true },
  { name: 'Handwritten', words: 5, chars: 26, tag: 'Warm and personal' },
  { name: 'Marker', words: 4, chars: 22, tag: 'Rough and energetic' },
  { name: 'Classic', words: 6, chars: 34, tag: 'Simple white text' },
];
export const BRAND_LOOK = { name: 'Your brand', words: 4, chars: 24, tag: 'Your font and colors', plain: true };
export const BG_MUSIC = ['ambient', 'lofi', 'piano', 'corporate', 'ukulele'];   // gentle enough to sit under speech
export const MUSIC_LEVELS = { subtle: 0.14, balanced: 0.22, present: 0.34 };
export const CARDS_PER_MIN = { off: 0, low: 2, medium: 4, high: 6 };
export const GRADES = [['none', 'Original'], ['clean', 'Clean'], ['vivid', 'Vivid'], ['cinema', 'Cinema'], ['warm', 'Warm'], ['moody', 'Moody']];

/** One-tap style bundles. Each one sets every option of the plan; people can still fine-tune afterwards. */
export const STYLE_PRESETS = [
  { id: 'viral', name: 'Viral Short', icon: 'bolt', blurb: 'Tight cuts, punchy captions, plenty of b-roll.',
    plan: { pacing: 'tight', cutPauses: true, cutFillers: true, cutRetakes: true, captions: true, look: 'Viral Pop', music: 'auto', musicLevel: 'subtle', broll: 'high', cards: true, zoom: true, grade: 'vivid' } },
  { id: 'authority', name: 'Authority', icon: 'trending', blurb: 'Big bold words with a yellow active word.',
    plan: { pacing: 'tight', cutPauses: true, cutFillers: true, cutRetakes: true, captions: true, look: 'Hormozi', music: 'corporate', musicLevel: 'subtle', broll: 'medium', cards: true, zoom: true, grade: 'clean' } },
  { id: 'clean', name: 'Clean Pro', icon: 'sparkle', blurb: 'Polished and calm. Good for business.',
    plan: { pacing: 'balanced', cutPauses: true, cutFillers: true, cutRetakes: true, captions: true, look: 'Clean Pro', music: 'corporate', musicLevel: 'subtle', broll: 'low', cards: false, zoom: false, grade: 'clean' } },
  { id: 'podcast', name: 'Podcast', icon: 'mic', blurb: 'Natural pace, readable box captions, no b-roll.',
    plan: { pacing: 'relaxed', cutPauses: true, cutFillers: true, cutRetakes: true, captions: true, look: 'Podcast Box', music: 'ambient', musicLevel: 'subtle', broll: 'off', cards: false, zoom: true, grade: 'none' } },
  { id: 'cinematic', name: 'Cinematic', icon: 'film', blurb: 'Slow, elegant and moody.',
    plan: { pacing: 'relaxed', cutPauses: true, cutFillers: true, cutRetakes: true, captions: true, look: 'Cinematic', music: 'piano', musicLevel: 'balanced', broll: 'low', cards: false, zoom: false, grade: 'cinema' } },
];

const fontWeightOf = (id) => FONTS.find((f) => f.id === id)?.w || 800;

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
  relaxed: { minSilence: 0.7, keep: 0.28, lead: 0.3, tail: 0.6 },
  balanced: { minSilence: 0.45, keep: 0.18, lead: 0.18, tail: 0.45 },
  tight: { minSilence: 0.32, keep: 0.1, lead: 0.1, tail: 0.3 },
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

/** Per-frame loudness (dB) and zero-crossing rate (crossings per second) of mono samples. Voiced vowels cross rarely, breaths and hiss often. */
export function frameStats(samples, rate, win = 0.02) {
  const n = Math.max(1, Math.floor(rate * win));
  const frames = Math.floor(samples.length / n);
  const db = new Float32Array(frames), zcr = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0, cross = 0, prev = samples[f * n];
    for (let i = 0; i < n; i++) {
      const v = samples[f * n + i];
      sum += v * v;
      if ((v >= 0) !== (prev >= 0)) cross++;
      prev = v;
    }
    db[f] = 10 * Math.log10(sum / n + 1e-12);
    zcr[f] = cross / win;
  }
  return { db, zcr, win };
}

/* ------------------------------------------------------------------ word timing */
/** Whisper's word times can be 100 to 200 ms loose. Snap each edge to where the audio really starts and stops. */
export function refineWordTimes(words, db, win, thr) {
  if (!db || !db.length) return words.map((w) => ({ ...w }));
  const at = (t) => Math.min(db.length - 1, Math.max(0, Math.round(t / win)));
  const out = words.map((w) => ({ ...w }));
  for (let i = 0; i < out.length; i++) {
    const w = out[i], prev = out[i - 1], next = out[i + 1];
    const len = w.end - w.start;
    // start: the first loud frame that follows a quieter one (a real onset). Whisper usually starts early, so look forward more than back.
    const lo = Math.max(prev ? prev.end : 0, w.start - 0.14), hi = Math.min(w.end - Math.min(0.08, len / 2), w.start + 0.22);
    for (let k = at(lo); k <= at(hi); k++) {
      if (db[k] >= thr && (k === 0 || db[k - 1] < thr)) { w.start = Math.max(lo, k * win - 0.04); break; }
    }
    // end: the last loud frame near the end. If the stated end is already silent, pull it back to the last sound; otherwise let it run on a little.
    const back = at(Math.max(w.start + 0.05, w.end - 0.25)), fwdLimit = Math.min(next ? next.start : Infinity, w.end + 0.16, db.length * win - win);
    let last = -1;
    for (let k = at(w.end); k <= at(fwdLimit); k++) { if (db[k] >= thr) last = k; else if (last >= 0 || k > at(w.end) + 1) break; }
    if (last < 0) for (let k = at(w.end); k >= back; k--) if (db[k] >= thr) { last = k; break; }
    if (last >= 0) w.end = Math.min(fwdLimit, (last + 1) * win + 0.04);
    if (!(w.end > w.start)) w.end = w.start + 0.12;
    if (next && w.end > next.start) w.end = Math.max(w.start + 0.05, next.start);
  }
  return out;
}

/* ------------------------------------------------------------------ transcript-based cuts */
const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'uhm', 'er', 'erm', 'ah', 'hm', 'hmm', 'mm', 'mhm', 'eh', 'ehm', 'uhhh', 'ummm']);
const STUTTER = new Set(['i', 'a', 'the', 'and', 'but', 'so', 'we', 'it', 'to', 'of', 'in', 'is', 'my', 'you', 'that', 'this', 'if', 'or', 'on', 'for', 'at', 'he', 'she', 'they', 'with', 'are', 'was', 'have', 'can']);
export const norm = (w) => String(w || '').toLowerCase().replace(/[^a-z0-9']/g, '');
const endsSentence = (t) => /[.!?]["')\]]?$/.test(String(t).trim());

/**
 * Filler words, accidental repeats ("the the", "I I") and false starts ("so what I want to, so what I want to say").
 * For false starts the EARLIER try is removed and the later, usually cleaner, one is kept.
 * Returns {cuts, fillerN, repeatN, retakeN, removed:Set(index)}.
 */
export function findWordCuts(words, { fillers = true, repeats = true, retakes = true } = {}) {
  const cuts = []; const removed = new Set();
  let fillerN = 0, repeatN = 0, retakeN = 0;
  const N = words.map((w) => norm(w.text));
  const drop = (a, b, pad = 0.01) => {              // remove words a..b inclusive
    for (let k = a; k <= b; k++) removed.add(k);
    const nx = words[b + 1];
    cuts.push([words[a].start - pad, Math.min(words[b].end + pad, nx ? nx.start - 0.01 : Infinity)]);
  };
  for (let i = 0; i < words.length; i++) {
    if (removed.has(i)) continue;
    if (fillers && FILLERS.has(N[i])) { drop(i, i, 0.02); fillerN++; continue; }
    if (!(repeats || retakes)) continue;
    // multi-word false starts: the same 2..6 words straight after each other
    let done = false;
    if (retakes) {
      for (let n = 6; n >= 2 && !done; n--) {
        if (i + 2 * n > words.length) continue;
        let same = true;
        for (let k = 0; k < n; k++) if (!N[i + k] || N[i + k] !== N[i + n + k]) { same = false; break; }
        if (!same) continue;
        const gap = words[i + n].start - words[i + n - 1].end;
        if (gap > 1.4 || endsSentence(words[i + n - 1].text)) continue;
        if (N.slice(i, i + n).every((x) => STUTTER.has(x)) && n < 3) continue;
        drop(i, i + n - 1, 0.01); retakeN++; done = true; i += n - 1;
      }
    }
    if (done) continue;
    const nx = words[i + 1];
    if (repeats && nx && N[i] && N[i] === N[i + 1] && STUTTER.has(N[i]) && nx.start - words[i].end < 0.7 && !/[.!?;]$/.test(words[i].text)) {
      drop(i, i, 0.01); repeatN++;
    }
  }
  return { cuts: cuts.filter(([s, e]) => e - s > 0.06), fillerN, repeatN, retakeN, removed };
}

/** Pauses between spoken words, straight from the transcript (catches noisy pauses that the loudness meter calls "speech"). */
export function gapCuts(words, pace, removed = new Set()) {
  const kept = words.filter((_, i) => !removed.has(i));
  const cuts = [];
  for (let i = 0; i + 1 < kept.length; i++) {
    const gap = kept[i + 1].start - kept[i].end;
    if (gap >= pace.minSilence + 0.08) cuts.push([kept[i].end + pace.keep, kept[i + 1].start - pace.keep]);
  }
  return cuts.filter(([s, e]) => e - s > 0.06);
}

/** Take away the parts of `cuts` that overlap a spoken word (with a little margin), so a pause cut can never clip speech. */
export function protectWords(cuts, words, removed = new Set(), padBefore = 0.04, padAfter = 0.07) {
  const spans = words.filter((_, i) => !removed.has(i)).map((w) => [w.start - padBefore, w.end + padAfter]);
  let out = cuts.map((c) => [...c]);
  for (const [ps, pe] of spans) {
    const next = [];
    for (const [s, e] of out) {
      if (pe <= s || ps >= e) { next.push([s, e]); continue; }
      if (ps > s) next.push([s, ps]);
      if (pe < e) next.push([pe, e]);
    }
    out = next;
  }
  return out.filter(([s, e]) => e - s > 0.05);
}

/**
 * "Um" and "uh" that the speech model left out of the transcript: a steady, low-crossing, voiced sound
 * that sits between two words (or before the first / after the last) for 0.22 to 1.4 s.
 */
export function findHesitations({ db, zcr, win }, words, thr, { minLen = 0.22, maxLen = 1.4 } = {}) {
  if (!db || !zcr || !words?.length) return [];
  const gaps = [];
  let t = 0;
  for (const w of words) { if (w.start - t > minLen + 0.12) gaps.push([t, w.start]); t = Math.max(t, w.end); }
  const total = db.length * win;
  if (total - t > minLen + 0.12) gaps.push([t, total]);
  const out = [];
  for (const [g0, g1] of gaps) {
    const a = Math.ceil((g0 + 0.05) / win), b = Math.floor((g1 - 0.05) / win);
    let run = [];
    const flush = () => {
      if (run.length) {
        const len = run.length * win;
        if (len >= minLen && len <= maxLen) {
          const vals = run.map((k) => db[k]); const mean = vals.reduce((x, y) => x + y, 0) / vals.length;
          const sd = Math.sqrt(vals.reduce((x, y) => x + (y - mean) ** 2, 0) / vals.length);
          if (sd < 5) out.push([run[0] * win + 0.02, (run[run.length - 1] + 1) * win - 0.02]);
        }
      }
      run = [];
    };
    for (let k = a; k <= b && k < db.length; k++) {
      if (db[k] > thr + 3 && zcr[k] < 2500) run.push(k); else flush();
    }
    flush();
  }
  return out;
}

/** Move a time to the quietest moment within +-radius, so an edit lands in a gap in the sound instead of mid-waveform. */
export function snapQuiet(t, db, win, radius = 0.03) {
  if (!db || !db.length) return t;
  const lo = Math.max(0, Math.round((t - radius) / win)), hi = Math.min(db.length - 1, Math.round((t + radius) / win));
  let best = Math.round(t / win), bv = Infinity;
  for (let k = lo; k <= hi; k++) if (db[k] < bv - 0.5) { bv = db[k]; best = k; }
  return Math.min(Math.max(0, best * win + win / 2), db.length * win);
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

/**
 * The whole decision, as pure data. Input: clip length, loudness envelope, words (source seconds) and the plan.
 * Output: segments to keep, the refined words and counts for the summary.
 */
export function planEdit({ dur, db = null, win = 0.02, words = null, zcr = null, plan }) {
  const pace = PACING[plan.pacing] || PACING.balanced;
  const t = adaptiveThreshold(db);
  const stats = { silence: 0, fillers: 0, repeats: 0, retakes: 0, hesitations: 0, threshold: t.threshold, adaptive: t.adaptive };
  const ws = words?.length ? refineWordTimes(words, db, win, t.threshold) : null;
  const cuts = [];
  let removed = new Set();
  if (ws && (plan.cutFillers || plan.cutRetakes)) {
    const w = findWordCuts(ws, { fillers: !!plan.cutFillers, repeats: !!plan.cutFillers, retakes: plan.cutRetakes !== false });
    removed = w.removed; stats.fillers = w.fillerN; stats.repeats = w.repeatN; stats.retakes = w.retakeN;
    cuts.push(...w.cuts);
  }
  if (plan.cutPauses) {
    let pauses = [];
    if (db) pauses.push(...silenceCuts(silencesFrom(db, win, t.threshold, pace.minSilence), pace.keep));
    if (ws) {
      pauses.push(...gapCuts(ws, pace, removed));
      const kept = ws.filter((_, i) => !removed.has(i));
      if (kept.length) {                                   // trim dead air before the first word and after the last
        const a = kept[0].start - pace.lead, b = kept[kept.length - 1].end + pace.tail;
        if (a > 0.12) pauses.push([0, a]);
        if (dur - b > 0.2) pauses.push([b, dur]);
      }
      pauses = protectWords(pauses, ws, removed);
    }
    stats.silence = 0;
    cuts.push(...pauses);
  }
  if (ws && plan.cutFillers && db && zcr) {
    const hes = findHesitations({ db, zcr, win }, ws.filter((_, i) => !removed.has(i)), t.threshold);
    stats.hesitations = hes.length; cuts.push(...hes);
  }
  // land every edge on a quiet moment, then rebuild the segments
  const snapped = cuts.map(([s, e]) => [db ? snapQuiet(s, db, win) : s, db ? snapQuiet(e, db, win) : e]).filter(([s, e]) => e - s > 0.04);
  const keep = keepSegments(dur, snapped, 0.12);
  const kept = keep.reduce((a, [s, e]) => a + (e - s), 0);
  stats.silence = Math.max(0, dur - kept);
  return { keep, words: ws, stats };
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
  // a word must never run into the next one
  for (let i = 0; i + 1 < out.length; i++) if (out[i].end > out[i + 1].start) out[i].end = Math.max(out[i].start + 0.05, out[i + 1].start);
  return out;
}

/* ------------------------------------------------------------------ captions */
/** Group words into on-screen caption chunks. Breaks at sentence ends, long pauses and the look's size; never leaves a lone last word. */
export function chunkWords(words, maxWords, maxChars) {
  const out = []; let cur = [];
  const flush = () => { if (cur.length) { out.push(cur); cur = []; } };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const len = [...cur, w].map((x) => x.text).join(' ').length;
    const gap = cur.length ? w.start - cur[cur.length - 1].end : 0;
    if (cur.length && (cur.length >= maxWords || len > maxChars || gap > 0.9)) flush();
    cur.push(w);
    if (/[.!?]["')\]]?$/.test(w.text.trim())) flush();
  }
  flush();
  // fold a one-word tail back into the previous chunk when it belongs to the same sentence
  const res = [];
  for (const ch of out) {
    const prev = res[res.length - 1];
    if (prev && ch.length === 1 && !endsSentence(prev[prev.length - 1].text) && prev.length <= maxWords && ch[0].start - prev[prev.length - 1].end < 0.5
      && [...prev, ...ch].map((x) => x.text).join(' ').length <= maxChars * 1.25) prev.push(ch[0]);
    else res.push(ch);
  }
  return res;
}

/** Text style for a look, tinted by the brand. */
export function lookStyle(lookName, brand, applyBrand) {
  const base = TEXT_DEFAULT();
  if (lookName === BRAND_LOOK.name) {
    return mergeText(base, {
      font: brand.font, weight: fontWeightOf(brand.font), size: 0.06, color: brand.text, upper: true,
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
  }
  return t;
}

export function inkFor(hex) {
  const n = parseInt((hex || '#000000').replace('#', '').padEnd(6, '0'), 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.6 ? '#0b0f14' : '#ffffff';
}

/* ------------------------------------------------------------------ b-roll */
export const KEYWORDS = {
  tech: ['software', 'app', 'apps', 'code', 'coding', 'data', 'ai', 'computer', 'digital', 'online', 'internet', 'website', 'automation', 'technology', 'system', 'systems', 'algorithm', 'startup', 'business', 'marketing', 'sales', 'money', 'growth', 'profit', 'revenue', 'strategy', 'trading', 'market', 'markets', 'invest', 'investing', 'investment', 'productivity', 'customers', 'customer', 'clients', 'client', 'company', 'brand', 'content', 'social', 'followers', 'audience', 'email', 'leads', 'funnel', 'ads', 'budget', 'price', 'pricing', 'cash', 'income', 'wealth', 'finance', 'stocks', 'crypto', 'platform', 'tool', 'tools', 'agency', 'team', 'meeting', 'office', 'work', 'job', 'career'],
  space: ['space', 'universe', 'galaxy', 'planet', 'future', 'infinite', 'vision', 'cosmic', 'stars', 'moon', 'orbit', 'rocket'],
  nature: ['nature', 'forest', 'ocean', 'water', 'sky', 'tree', 'trees', 'garden', 'weather', 'rain', 'snow', 'calm', 'peace', 'peaceful', 'morning', 'sunrise', 'sunset', 'river', 'lake', 'flowers', 'grass', 'earth', 'wind', 'green', 'outside', 'outdoors'],
  city: ['city', 'night', 'street', 'drive', 'driving', 'traffic', 'downtown', 'urban', 'speed', 'fast', 'car', 'cars', 'building', 'lights', 'bus', 'train', 'commute'],
  fitness: ['workout', 'gym', 'fitness', 'training', 'energy', 'power', 'strong', 'strength', 'run', 'running', 'health', 'healthy', 'discipline', 'hustle', 'muscle', 'weights', 'sweat', 'sport', 'sports', 'exercise', 'body'],
  food: ['coffee', 'food', 'cooking', 'cook', 'recipe', 'dinner', 'lunch', 'breakfast', 'eat', 'eating', 'kitchen', 'cozy', 'pizza', 'chicken', 'sauce', 'bake', 'baking', 'tea', 'drink', 'meal'],
  music: ['music', 'song', 'party', 'dance', 'concert', 'beat', 'sing', 'singing', 'guitar', 'band', 'rhythm'],
  edu: ['learn', 'learning', 'study', 'school', 'lesson', 'tutorial', 'teach', 'education', 'knowledge', 'idea', 'ideas', 'tip', 'tips', 'step', 'steps', 'book', 'books', 'read', 'reading', 'course', 'class', 'students', 'skill', 'skills', 'mistake', 'secret', 'secrets', 'lesson', 'lessons', 'question'],
  travel: ['travel', 'trip', 'beach', 'mountain', 'mountains', 'adventure', 'journey', 'road', 'explore', 'vacation', 'holiday', 'flight', 'airport', 'hotel', 'island', 'world', 'country'],
  romance: ['love', 'heart', 'relationship', 'together', 'wedding', 'marriage', 'family', 'friends', 'kiss'],
  lifestyle: ['style', 'beauty', 'skin', 'fashion', 'routine', 'lifestyle', 'self', 'confidence', 'mindset', 'happy', 'happiness', 'life', 'habit', 'habits', 'sleep', 'home', 'clothes', 'hair', 'wellness', 'balance'],
  cinema: ['story', 'film', 'movie', 'epic', 'dream', 'dreams', 'moment', 'moments', 'remember', 'memory', 'memories', 'history', 'legend'],
  gaming: ['game', 'games', 'gaming', 'level', 'play', 'player', 'retro', 'console', 'streamer', 'esports'],
  fun: ['fun', 'celebrate', 'surprise', 'free', 'win', 'winning', 'success', 'amazing', 'incredible', 'crazy', 'insane', 'secret'],
  dark: ['fear', 'dark', 'danger', 'mistake', 'mistakes', 'warning', 'risk', 'risky', 'lose', 'losing', 'fail', 'failure', 'problem', 'problems', 'scary', 'wrong', 'stress', 'pain'],
};
const STOP = new Set(`the and for that this with have from your about what when they them then than just like really very into over only also more most some make made been were will would could should there their because
  know think going want need get got cant dont thing things well right okay yeah actually basically literally something anything everything people
  here where which while after before again always never every other still being doing does done much many even such these those through`.split(/\s+/));
const GENRE_DEFAULT = ['tech', 'cinema', 'lifestyle', 'nature'];
const GENRE_QUERY = { tech: 'business technology', space: 'galaxy stars', nature: 'nature landscape', city: 'city night', fitness: 'workout gym', food: 'cooking food', music: 'concert music', edu: 'studying books', travel: 'travel adventure', romance: 'couple love', lifestyle: 'lifestyle morning', cinema: 'cinematic landscape', gaming: 'gaming', fun: 'celebration', dark: 'dark moody' };

const kwIndex = (() => { const m = new Map(); for (const [g, list] of Object.entries(KEYWORDS)) for (const k of list) if (!m.has(k)) m.set(k, g); return m; })();
const genFor = (genre, seed) => {
  const list = GENERATORS.filter((g) => g.genre === genre);
  return list.length ? list[seed % list.length] : GENERATORS[seed % GENERATORS.length];
};

/** Choose cutaway moments. Spoken keywords win; gaps are filled evenly with the strongest nearby word. Returns [{t, dur, gen, word, query, genre}]. */
export function pickBroll(words, total, density, { cutaway = 2.6, minGap = 6 } = {}) {
  const budget = Math.floor((total / 60) * (CARDS_PER_MIN[density] ?? 0) + (density === 'off' ? 0 : 0.5));
  if (!budget || total < 8) return [];
  const spots = [];
  const ok = (t) => t > 2.2 && t + cutaway < total - 1.2 && spots.every((s) => Math.abs(s.t - t) >= minGap);
  let seed = 0;
  // rank candidate keywords by how rare they are in this video (a word said once beats a word said ten times)
  const freq = new Map(); for (const w of words) { const k = norm(w.text); freq.set(k, (freq.get(k) || 0) + 1); }
  const cands = words.filter((w) => { const k = norm(w.text); return k.length >= 3 && !STOP.has(k) && kwIndex.has(k); })
    .sort((a, b) => (freq.get(norm(a.text)) - freq.get(norm(b.text))) || (a.start - b.start));
  for (const w of cands) {
    if (spots.length >= budget) break;
    const k = norm(w.text);
    if (ok(w.start)) { const genre = kwIndex.get(k); spots.push({ t: Math.max(0, w.start - 0.1), dur: cutaway, gen: genFor(genre, seed++).id, genre, word: k, query: k }); }
  }
  // even gaps for whatever budget is left
  const slots = Math.max(0, budget - spots.length);
  for (let i = 1; i <= slots; i++) {
    let t = (total * i) / (slots + 1);
    for (let tries = 0; tries < 10 && !ok(t); tries++) t += 1.5;
    if (!ok(t)) continue;
    const near = words.filter((w) => Math.abs(w.start - t) < 3 && norm(w.text).length > 4 && !STOP.has(norm(w.text))).sort((a, b) => norm(b.text).length - norm(a.text).length)[0];
    const genre = GENRE_DEFAULT[seed % GENRE_DEFAULT.length];
    spots.push({ t, dur: cutaway, gen: genFor(genre, seed++).id, genre, word: near ? norm(near.text) : '', query: near ? norm(near.text) : GENRE_QUERY[genre] });
  }
  return spots.sort((a, b) => a.t - b.t).map((s) => ({ ...s, query: kwIndex.has(s.query) || s.query.includes(' ') ? s.query : (GENRE_QUERY[s.genre] || s.query) }));
}

/* ------------------------------------------------------------------ building */
const LOGO_POS = { top_left: [-1, -1], top_right: [1, -1], bottom_left: [-1, 1], bottom_right: [1, 1] };
/** tf.y is the offset from the middle as a fraction of the canvas height (positive = lower). Portrait leaves room for each app's buttons. */
export const captionY = (pos, aspect) => ({ bottom: aspect < 0.8 ? 0.22 : 0.33, center: 0.02, top: aspect < 0.8 ? -0.3 : -0.34 }[pos] ?? 0.22);

/**
 * Apply a one-click edit to the open project.
 * `ctx` = { store, bank, lib, logoMedia?, stock?(spot) -> Promise<media|null> }; `plan` = options; `words` = transcript ([{text,start,end}] in source seconds).
 * Returns stats for the summary screen.
 */
export async function applyOneClick(ctx, plan, words, progress = () => {}) {
  const { store, bank } = ctx;
  const stats = { silence: 0, fillers: 0, repeats: 0, retakes: 0, hesitations: 0, captions: 0, broll: 0, stock: 0, music: '', brand: false, outro: false, from: 0, to: 0 };
  const main = store.mainTrack;
  const src = main.clips.find((c) => c.kind === 'video');
  if (!src) throw new Error('Add a video first.');
  const dur = src.dur;
  stats.from = dur;
  const aspect = store.project.canvas.w / store.project.canvas.h;

  /* ---- cuts ---- */
  progress('cut');
  let env = null, zcr = null;
  if (bank.has(src.mediaId)) {
    const r = bank.rmsDb(src.mediaId, 0.02);
    if (r) {
      env = r;
      try { const buf = bank.buffer(src.mediaId); if (buf) { const fs = frameStats(buf.getChannelData(0), buf.sampleRate, r.win); if (fs.db.length) zcr = fs.zcr.subarray(0, r.db.length); } } catch { zcr = null; }
    }
  }
  const planned = planEdit({ dur, db: plan.cutPauses || words ? env?.db : null, win: env?.win || 0.02, words, zcr, plan });
  const keep = planned.keep;
  Object.assign(stats, { fillers: planned.stats.fillers, repeats: planned.stats.repeats, retakes: planned.stats.retakes, hesitations: planned.stats.hesitations, silence: planned.stats.silence });
  const pieces = keep.length;
  store.commit(() => {
    const tr = main;
    tr.clips = tr.clips.filter((x) => x.id !== src.id);
    let t = src.start;
    keep.forEach(([s, e], i) => {
      const n = deep(src); n.id = uid('clp'); n.in = src.in + s * src.speed; n.dur = (e - s) / src.speed; n.start = t; n.transIn = null; n.kf = {};
      n.fadeIn = pieces > 1 && i > 0 ? 0.012 : 0; n.fadeOut = pieces > 1 && i < pieces - 1 ? 0.012 : 0;     // no clicks at the joins
      if (plan.zoom && pieces > 1 && i % 2 === 1) n.tf.s = 1.08;                                                // gentle punch-in on every other cut keeps it lively
      if (plan.grade && plan.grade !== 'none') n.look = { id: plan.grade, amt: 0.85 };
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
  if (planned.words?.length) mapped = mapWords(planned.words, keep);
  if (plan.captions && mapped.length) {
    progress('captions');
    const look = plan.look === BRAND_LOOK.name ? BRAND_LOOK : (LOOKS.find((l) => l.name === plan.look) || LOOKS[0]);
    const style = lookStyle(look.name, brand, applyBrand);
    const shown = look.plain ? mapped.map((w) => ({ ...w, text: w.text.replace(/[.,;:!?]+["')\]]?$/g, '').replace(/^["'(\[]/, '') || w.text })) : mapped;
    const chunks = chunkWords(shown, look.words, look.chars);
    const y = captionY(plan.captionPos, aspect);
    const scale = plan.captionScale || 1;
    store.commit(() => {
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
      if (ctx.stock) for (const s of spots) { try { s.media = await ctx.stock(s); } catch { s.media = null; } }
      const brandColor = applyBrand ? brand.primary : '#ffffff';
      store.commit((p) => {
        const tr = store.addTrack('video'); tr.name = 'B-roll';
        const txt = store.addTrack('text'); txt.name = 'Cards';
        for (const s of spots) {
          let c;
          if (s.media) {
            p.media[s.media.id] = s.media;
            c = videoClip(s.media, s.t); c.dur = Math.min(s.dur, s.media.duration); c.mute = true; c.vol = 0; c.bgblur = false; c.tf.fit = 'fill';
            c.in = Math.max(0, Math.min(s.media.duration - c.dur, 0.2));
            stats.stock++;
          } else {
            const g = GENERATORS.find((x) => x.id === s.gen); if (!g) continue;
            c = genClip(g, s.t, s.dur); c.look = { id: 'none', amt: 1 }; c.bgblur = false;
          }
          c.animIn = { id: 'fade', dur: 0.25 }; c.animOut = { id: 'fade', dur: 0.25 };
          tr.clips.push(c);
          if (plan.cards && s.word && !s.media) {
            const style = mergeText(TEXT_DEFAULT(), {
              font: applyBrand ? brand.font : 'Montserrat', weight: applyBrand ? fontWeightOf(brand.font) : 800, size: 0.095, color: '#ffffff', upper: true, spacing: 0.04,
              stroke: { on: false }, shadow: { on: true, blur: 0.4, a: 0.7 }, content: s.word, glow: { on: false },
              bg: { on: true, color: applyBrand ? brand.secondary : '#101418', a: 0.72, pad: 0.45, radius: 0.3 },
            });
            const tcl = textClip(s.t + 0.15, s.dur - 0.3, style);
            tcl.tf.y = -0.02; tcl.animIn = { id: 'pop', dur: 0.3 }; tcl.name = s.word;
            txt.clips.push(tcl);
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

  /* ---- end card ---- */
  if (plan.outro && applyBrand && (brand.name || brand.handle)) { progress('brand'); addEndCard(store, brand); stats.outro = true; }

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
    if (addBrandOverlays({ store, logoMedia: ctx.logoMedia }, brand)) stats.brand = true;
  }
  return stats;
}


/** A short branded end card: animated scene, brand name, call to action and handle. Appended after everything else. */
export function addEndCard(store, brand, { dur = 2.4 } = {}) {
  store.commit(() => {
    const t0 = projectDuration(store.project), d = dur;
    const g = genFor('cinema', 1); const tr = store.addTrack('video'); tr.name = 'End card';
    const bg = genClip(g, t0, d); bg.look = { id: 'none', amt: 1 }; bg.bgblur = false; bg.animIn = { id: 'fade', dur: 0.4 };
    tr.clips.push(bg);
    const txt = store.addTrack('text'); txt.name = 'End card text';
    const fnt = brand.font || 'Montserrat', wgt = fontWeightOf(fnt);
    if (brand.name) {
      const a = textClip(t0 + 0.2, d - 0.2, mergeText(TEXT_DEFAULT(), { content: brand.name, size: 0.075, color: brand.text, font: fnt, weight: wgt, upper: true, stroke: { on: false }, shadow: { on: true, blur: 0.4 } }));
      a.tf.y = -0.06; a.animIn = { id: 'pop', dur: 0.4 }; a.name = 'Brand name'; txt.clips.push(a);
    }
    const line = brand.cta || (brand.handle ? 'Follow for more' : '');
    if (line) {
      const b = textClip(t0 + 0.45, d - 0.45, mergeText(TEXT_DEFAULT(), { content: line + (brand.handle ? '\n@' + brand.handle.replace(/^@/, '') : ''), size: 0.04, color: brand.primary, font: 'Inter', weight: 700, stroke: { on: false }, shadow: { on: true } }));
      b.tf.y = 0.07; b.animIn = { id: 'slideup', dur: 0.4 }; b.name = 'CTA'; txt.clips.push(b);
    }
  });
}

/** Handle watermark and logo over the whole project. Returns true when something was added. */
export function addBrandOverlays({ store, logoMedia }, brand) {
  let added = false;
  const total = projectDuration(store.project);
  const pos = LOGO_POS[brand.logoPos] || LOGO_POS.top_right;
  if (brand.handle && brand.showHandle) {
    store.commit(() => {
      const tr = store.addTrack('text'); tr.name = 'Brand';
      const left = pos[0] > 0 || !brand.logo;          // keep the handle opposite the logo
      const c = textClip(0, total, mergeText(TEXT_DEFAULT(), {
        content: '@' + brand.handle.replace(/^@/, ''), size: 0.026, color: '#ffffff', font: 'Inter', weight: 700, stroke: { on: false },
        shadow: { on: true, blur: 0.4, a: 0.8 } }));
      c.name = 'Handle'; c.tf.x = left ? -0.3 : 0.3; c.tf.y = -0.42;
      c.animIn = { id: 'fade', dur: 0.6 };
      tr.clips.push(c);
    });
    added = true;
  }
  if (brand.logo && logoMedia) {
    store.commit((p) => {
      const m = logoMedia; p.media[m.id] = m;
      const tr = store.addTrack('video'); tr.name = 'Logo';
      const c = videoClip(m, 0); c.dur = total; c.name = 'Logo';
      const frac = { small: 0.12, medium: 0.17, large: 0.24 }[brand.logoSize] || 0.17;
      const ar = (m.w || 1) / (m.h || 1);
      c.bgblur = false; c.tf.fit = 'fit'; c.tf.s = frac * 0.9 / Math.max(0.5, Math.min(2, ar));
      c.tf.x = pos[0] * 0.34; c.tf.y = pos[1] * 0.4; c.tf.op = 0.92;
      tr.clips.push(c);
    });
    added = true;
  }
  return added;
}

export { genFor };

export { baseClip, end };
