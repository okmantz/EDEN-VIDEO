import assert from 'node:assert/strict';
import * as A from '../../docs/js/autoedit.js';

let pass = 0; const t = (name, fn) => { try { fn(); pass++; console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '\n    ', e.message); process.exitCode = 1; } };
const W = (text, start, end) => ({ text, start, end });
const near = (a, b, eps = 0.06) => Math.abs(a - b) <= eps;

// ---- synthetic speech envelope: frames of 20 ms. words at given spans are loud (-20 dB), the rest is room tone (-60 dB)
const env = (dur, loud, floor = -60, level = -20) => { const win = 0.02; const db = new Float32Array(Math.ceil(dur / win)).fill(floor); for (const [s, e] of loud) for (let k = Math.round(s / win); k < Math.round(e / win); k++) db[k] = level; return { db, win }; };

t('adaptiveThreshold sits between floor and speech', () => {
  const { db } = env(20, [[0, 8], [10, 18]]);
  const r = A.adaptiveThreshold(db);
  assert.ok(r.adaptive && r.threshold > -60 && r.threshold < -20, JSON.stringify(r));
});

t('keepSegments inverts cuts', () => {
  const k = A.keepSegments(10, [[2, 3], [5, 6]]);
  assert.deepEqual(k, [[0, 2], [3, 5], [6, 10]]);
});

t('filler words are cut', () => {
  const ws = [W('So', 0, .3), W('um', .5, .9), W('this', 1.0, 1.3), W('works.', 1.35, 1.8)];
  const r = A.findWordCuts(ws);
  assert.equal(r.fillerN, 1); assert.ok(r.removed.has(1));
});

t('"the the" stutter is cut, emphasis "very very" is not', () => {
  const ws = [W('I', 0, .2), W('think', .25, .5), W('the', .6, .75), W('the', .8, .95), W('plan', 1, 1.3), W('is', 1.4, 1.5), W('very', 1.6, 1.8), W('very', 1.85, 2.0), W('good', 2.05, 2.4)];
  const r = A.findWordCuts(ws);
  assert.equal(r.repeatN, 1, 'only the stutter');
  assert.ok(r.removed.has(2) && !r.removed.has(3) && !r.removed.has(6) && !r.removed.has(7));
});

t('false start: earlier take removed, later kept', () => {
  const ws = [W('So', 0, .2), W('what', .25, .45), W('I', .5, .6), W('want', .65, .85), W('so', 1.4, 1.55), W('what', 1.6, 1.8), W('I', 1.85, 1.95), W('want', 2.0, 2.2), W('to', 2.25, 2.35), W('say', 2.4, 2.7)];
  const r = A.findWordCuts(ws);
  assert.equal(r.retakeN, 1, JSON.stringify([...r.removed]));
  assert.deepEqual([...r.removed].sort(), [0, 1, 2, 3]);
});

t('a legitimate repeated sentence across a full stop is not a retake', () => {
  const ws = [W('Go', 0, .2), W('now.', .25, .5), W('Go', .9, 1.1), W('now.', 1.15, 1.4)];
  assert.equal(A.findWordCuts(ws).retakeN, 0);
});

t('pause cuts never clip a spoken word (loose energy + tight words)', () => {
  // the room is noisy enough that "silence" detection fires late: it thinks speech continues until 1.9 s although the word ends at 1.5 s
  const ws = [W('hello', 0.2, 0.7), W('there', 0.8, 1.5), W('friend', 3.2, 3.7)];
  const e = env(4, [[0.2, 0.7], [0.8, 1.5], [3.2, 3.7]]);
  const { keep, words } = A.planEdit({ dur: 4, db: e.db, win: e.win, words: ws, plan: { pacing: 'balanced', cutPauses: true, cutFillers: true } });
  const inKeep = (t) => keep.some(([s, en]) => t >= s - 1e-6 && t <= en + 1e-6);
  for (const w of words) { assert.ok(inKeep(w.start + 0.02) && inKeep(w.end - 0.02), `word ${w.text} clipped: ${JSON.stringify(keep)}`); }
  const total = keep.reduce((a, [s, e]) => a + (e - s), 0);
  assert.ok(total < 3.0, 'dead air should be removed, total ' + total);
});

t('refineWordTimes pulls loose Whisper times onto the audio', () => {
  const e = env(3, [[1.0, 1.5]]);
  const ws = [W('word', 0.86, 1.62)];     // 140 ms early, 120 ms late
  const r = A.refineWordTimes(ws, e.db, e.win, -40)[0];
  assert.ok(near(r.start, 1.0, 0.05), 'start ' + r.start);
  assert.ok(near(r.end, 1.5, 0.08), 'end ' + r.end);
});

t('hesitation ("uh" missing from transcript) is detected, steady voiced run only', () => {
  const win = 0.02; const n = 200; const db = new Float32Array(n).fill(-60); const zcr = new Float32Array(n).fill(9000);
  // words 0-1.0 and 2.0-3.0 are speech; between them a 0.6 s steady voiced hum at 1.2-1.8
  for (let k = 0; k < 50; k++) { db[k] = -20 + (k % 5); zcr[k] = 1500; }
  for (let k = 100; k < 150; k++) { db[k] = -20 + (k % 5); zcr[k] = 1500; }
  for (let k = 60; k < 90; k++) { db[k] = -28 + (k % 2) * 0.5; zcr[k] = 900; }
  const ws = [W('start', 0, 1.0), W('end', 2.0, 3.0)];
  const h = A.findHesitations({ db, zcr, win }, ws, -40);
  assert.equal(h.length, 1, JSON.stringify(h));
  assert.ok(h[0][0] >= 1.2 - 0.05 && h[0][1] <= 1.8 + 0.05);
  // breath: noisy -> not a hesitation
  for (let k = 60; k < 90; k++) zcr[k] = 8000;
  assert.equal(A.findHesitations({ db, zcr, win }, ws, -40).length, 0);
});

t('snapQuiet moves an edge to the quietest frame', () => {
  const db = new Float32Array(100).fill(-20); db[52] = -55;
  const s = A.snapQuiet(1.0, db, 0.02, 0.05);
  assert.ok(near(s, 52 * 0.02 + 0.01, 0.02), String(s));
});

t('mapWords keeps order and drops cut words', () => {
  const ws = [W('a', 0, .5), W('b', 1.0, 1.4), W('c', 4.0, 4.5)];
  const out = A.mapWords(ws, [[0, 0.6], [3.9, 5]]);
  assert.equal(out.length, 2 + 0 || 2);
  assert.equal(out[0].text, 'a'); assert.equal(out.at(-1).text, 'c');
  assert.ok(near(out.at(-1).start, 0.6 + 0.1, 0.01), JSON.stringify(out));
});

t('chunkWords respects size, sentences and orphans', () => {
  const ws = 'This is the first sentence. And here is another one that keeps going for a bit longer today'.split(' ').map((x, i) => W(x, i * 0.3, i * 0.3 + 0.25));
  const ch = A.chunkWords(ws, 3, 22);
  assert.ok(ch.every((c) => c.length <= 4));
  assert.ok(ch.every((c) => c.length > 1 || /[.!?]$/.test(c[0].text)), 'no orphan words: ' + JSON.stringify(ch.map((c) => c.map((w) => w.text).join(' '))));
  const first = ch.findIndex((c) => /sentence\.$/.test(c.at(-1).text)); assert.ok(first >= 0);
});

t('pickBroll puts cutaways on keywords with spacing and genre', () => {
  const ws = [];
  const say = (txt, t0) => txt.split(' ').forEach((x, i) => ws.push(W(x, t0 + i * 0.35, t0 + i * 0.35 + 0.3)));
  say('today I want to talk about money and marketing for your business', 3);
  say('then we go to the gym for a real workout and discipline', 20);
  say('finally the beach and the mountain on a long trip', 40);
  const spots = A.pickBroll(ws, 60, 'medium');
  assert.ok(spots.length >= 3, 'spots ' + spots.length);
  for (let i = 1; i < spots.length; i++) assert.ok(spots[i].t - spots[i - 1].t >= 6);
  assert.ok(spots.some((s) => s.genre === 'fitness' || s.genre === 'travel' || s.genre === 'tech'));
});

t('every look names a real text preset and every style preset names a real look', async () => {
  const { TEXT_PRESETS } = await import('../../docs/js/textrender.js');
  for (const l of A.LOOKS) assert.ok(TEXT_PRESETS.some((p) => p.name === l.name), l.name);
  for (const p of A.STYLE_PRESETS) assert.ok(A.LOOKS.some((l) => l.name === p.plan.look), p.id);
});

console.log(pass + ' passed');
