// Transcript hygiene for captions: remove things Whisper invents, fix known names, and let a person correct the text
// without losing the word timing. Everything here is pure (no DOM, no audio), so it is covered by node tests.

export const norm = (w) => String(w || '').toLowerCase().replace(/[^a-z0-9']/g, '');

/** Levenshtein distance, early-exit once it exceeds `max`. */
export function editDistance(a, b, max = 99) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v); if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/* ------------------------------------------------------------------ what Whisper invents */
// Phrases the model likes to produce over silence or music. They are only removed where the audio really is quiet.
const GHOSTS = [
  'thanks for watching', 'thank you for watching', 'thank you so much for watching', 'please subscribe', 'subscribe to my channel', 'like and subscribe',
  'see you in the next video', 'see you next time', 'subtitles by', 'subtitles by the amaraorg community', 'transcribed by', 'translated by', 'thank you', 'thanks', 'bye', 'you',
];
const ANNOTATION = /^[\[(*♪♫♬].*[\])*♪♫♬]?$/;     // [Music]  (applause)  *laughs*  ♪

/**
 * Tidy a raw Whisper word list.
 * @param words  [{text,start,end}]
 * @param o      { db, win, thr }   loudness envelope, used to drop words said over silence
 *               { glossary: string[] } names and terms to spell correctly
 */
export function cleanWords(words, { db = null, win = 0.02, thr = -40, glossary = [] } = {}) {
  let out = words.map((w) => ({ ...w, text: String(w.text || '').trim() })).filter((w) => w.text);

  // sound-effect annotations and bare punctuation are not speech
  out = out.filter((w) => !(ANNOTATION.test(w.text) && w.text.length > 1) && /[\p{L}\p{N}]/u.test(w.text));

  // a word repeated many times in a row is the model looping, not a speaker
  const dedup = [];
  for (const w of out) {
    const n = norm(w.text); let run = 0;
    for (let k = dedup.length - 1; k >= 0 && norm(dedup[k].text) === n; k--) run++;
    if (n && run >= 3) { dedup[dedup.length - 1].end = Math.max(dedup[dedup.length - 1].end, w.end); continue; }
    dedup.push(w);
  }
  out = dedup;

  if (db && db.length) {
    const at = (t) => Math.min(db.length - 1, Math.max(0, Math.round(t / win)));
    const loud = (s, e) => { for (let k = at(s); k <= at(e); k++) if (db[k] >= thr) return true; return false; };
    // words with no sound anywhere near them
    out = out.filter((w) => loud(w.start - 0.3, w.end + 0.3));
    // known filler phrases over quiet passages (a real "thank you" is louder than the room)
    const drop = new Set();
    for (let i = 0; i < out.length; i++) {
      for (let len = 6; len >= 1; len--) {
        if (i + len > out.length) continue;
        const phrase = out.slice(i, i + len).map((w) => norm(w.text)).join(' ');
        if (!GHOSTS.includes(phrase)) continue;
        const s = out[i].start, e = out[i + len - 1].end;
        let mx = -Infinity; for (let k = at(s); k <= at(e); k++) mx = Math.max(mx, db[k]);
        if (mx < thr + 8 && (i === 0 || i + len >= out.length)) { for (let k = i; k < i + len; k++) drop.add(k); break; }
      }
    }
    if (drop.size) out = out.filter((_, i) => !drop.has(i));
  }

  out = applyGlossary(out, glossary);
  out.forEach((w) => { if (w.text === 'i') w.text = 'I'; else if (/^i'(m|ll|ve|d)$/.test(w.text)) w.text = 'I' + w.text.slice(1); });
  return out;
}

/* ------------------------------------------------------------------ names and terms */
/**
 * Replace words that sound like (are within a letter or two of) a term the person gave us.
 * Handles terms Whisper splits ("T 58" -> T58) or glues together.
 */
export function applyGlossary(words, terms) {
  const list = (terms || []).map((t) => String(t).trim()).filter(Boolean);
  if (!list.length || !words.length) return words;
  const out = [...words];
  for (const term of list) {
    const key = norm(term); if (key.length < 3) continue;
    const tol = key.length >= 8 ? 2 : key.length >= 5 ? 1 : 0;
    for (let i = 0; i < out.length; i++) {
      for (let span = 3; span >= 1; span--) {
        if (i + span > out.length) continue;
        const slice = out.slice(i, i + span);
        const joined = slice.map((w) => norm(w.text)).join('');
        if (!joined || Math.abs(joined.length - key.length) > tol) continue;
        if (joined[0] !== key[0] && tol === 0) continue;
        if (editDistance(joined, key, tol) > tol) continue;
        if (span === 1 && joined === key && slice[0].text.replace(/[^\p{L}\p{N}']/gu, '') === term) break;
        // keep trailing punctuation from the last token ("EDEN," stays "EDEN,")
        const tail = (slice[slice.length - 1].text.match(/[^\p{L}\p{N}']+$/u) || [''])[0];
        out.splice(i, span, { text: term + tail, start: slice[0].start, end: slice[slice.length - 1].end });
        break;
      }
    }
  }
  return out;
}

/** "EDEN, T58 Trading" -> ['EDEN','T58','Trading'] */
export const parseGlossary = (s) => String(s || '').split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean).flatMap((t) => (t.split(/\s+/).length > 3 ? [t] : [t]));

/* ------------------------------------------------------------------ editing text while keeping timing */
/** Break words into readable lines: at sentence ends, and at long pauses. */
export function wordsToLines(words, { maxWords = 14, pause = 0.9 } = {}) {
  const lines = []; let cur = [];
  const flush = () => { if (cur.length) { lines.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(' ') }); cur = []; } };
  words.forEach((w, i) => {
    cur.push(w);
    const nx = words[i + 1];
    if (/[.!?…]["')\]]?$/.test(w.text) || cur.length >= maxWords || (nx && nx.start - w.end > pause)) flush();
  });
  flush();
  return lines;
}

/**
 * Apply an edited transcript back onto the original words. Words that survive keep their exact timing,
 * new or replaced words share the time of what they replaced, deleted words disappear.
 */
export function alignEdited(words, editedText) {
  const toks = String(editedText || '').split(/\s+/).filter(Boolean);
  const a = words.map((w) => norm(w.text)), b = toks.map(norm);
  const n = a.length, m = b.length;
  // longest common subsequence over normalised tokens
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] && a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  pairs.push([n, m]);                                   // sentinel closes the last gap
  const out = [];
  let pi = 0, pj = 0, prevEnd = 0;
  for (const [ai, bj] of pairs) {
    const del = words.slice(pi, ai), ins = toks.slice(pj, bj);
    if (ins.length) {
      let s, e;
      if (del.length) { s = del[0].start; e = del[del.length - 1].end; }
      else { s = prevEnd; e = ai < n ? words[ai].start : s + 0.3 * ins.length; }
      if (e - s < 0.12 * ins.length) e = s + 0.12 * ins.length;
      const weights = ins.map((t) => Math.max(1, t.replace(/[^\p{L}\p{N}]/gu, '').length)); const tw = weights.reduce((x, y) => x + y, 0);
      let t = s;
      ins.forEach((tok, k) => { const d = ((e - s) * weights[k]) / tw; out.push({ text: tok, start: t, end: t + d }); t += d; });
    }
    if (ai < n) { out.push({ ...words[ai], text: toks[bj] }); prevEnd = words[ai].end; }
    pi = ai + 1; pj = bj + 1;
  }
  // tidy: monotonic, no overlaps
  for (let k = 0; k < out.length; k++) {
    if (k && out[k].start < out[k - 1].end) out[k].start = out[k - 1].end;
    if (!(out[k].end > out[k].start)) out[k].end = out[k].start + 0.1;
  }
  return out;
}
