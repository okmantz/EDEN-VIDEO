// Run: node tests/web/transcript.test.mjs
const J = new URL('../../docs/js/', import.meta.url).href;
const { cleanWords, applyGlossary, alignEdited, wordsToLines, editDistance, parseGlossary } = await import(J + 'transcript.js');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const W = (arr) => arr.map(([text, start, end]) => ({ text, start, end }));
const txt = (ws) => ws.map((w) => w.text).join(' ');

// edit distance
ok(editDistance('kitten', 'sitting') === 3, 'levenshtein');
ok(editDistance('abc', 'abc') === 0, 'levenshtein same');

// annotations, punctuation, loops, lowercase i
let r = cleanWords(W([['[Music]', 0, 1], ['i', 1, 1.2], ['think', 1.2, 1.5], ['it', 1.5, 1.6], ['it', 1.6, 1.7], ['it', 1.7, 1.8], ['it', 1.8, 1.9], ['it', 1.9, 2.0], ['works', 2.0, 2.4], ['—', 2.4, 2.5]]));
ok(txt(r) === 'I think it it it works', 'clean annotations/loops: ' + txt(r));

// ghost words over silence are dropped only where it is really quiet
const win = 0.02, db = new Float32Array(500).fill(-70);               // 10 s of silence...
for (let k = 0; k < 100; k++) db[k] = -20;                              // ...except speech in the first 2 s
r = cleanWords(W([['Hello', 0.1, 0.5], ['there', 0.5, 1.0], ['friends', 1.0, 1.9], ['Thanks', 7, 7.3], ['for', 7.3, 7.4], ['watching', 7.4, 8.0]]), { db, win, thr: -40 });
ok(txt(r) === 'Hello there friends', 'drops ghost phrase over silence: ' + txt(r));
// the same phrase over real speech is kept
const db2 = new Float32Array(500).fill(-20);
r = cleanWords(W([['Thanks', 7, 7.3], ['for', 7.3, 7.4], ['watching', 7.4, 8.0]]), { db: db2, win, thr: -40 });
ok(txt(r) === 'Thanks for watching', 'keeps spoken phrase');

// glossary
r = applyGlossary(W([['Welcome', 0, 1], ['to', 1, 1.2], ['Eden', 1.2, 1.5], ['Studio,', 1.5, 2]]), ['EDEN']);
ok(r[2].text === 'EDEN', 'glossary single: ' + txt(r));
r = applyGlossary(W([['I', 0, .2], ['love', .2, .5], ['T', .5, .6], ['58', .6, 1], ['trading', 1, 1.5]]), ['T58']);
ok(txt(r) === 'I love T58 trading', 'glossary joined: ' + txt(r));
r = applyGlossary(W([['Visit', 0, .5], ['Eden,', .5, 1]]), ['EDEN']);
ok(r[1].text === 'EDEN,', 'glossary keeps punctuation: ' + txt(r));
r = applyGlossary(W([['hidden', 0, .5], ['treasure', .5, 1]]), ['EDEN']);
ok(txt(r) === 'hidden treasure', 'glossary leaves unrelated words');
ok(parseGlossary('EDEN, T58 Trading\nOwen').length === 3, 'parse glossary');

// editing: replace, delete, insert; timing of surviving words is untouched
const orig = W([['we', 0, .2], ['gonna', .2, .6], ['edit', .6, 1], ['the', 1, 1.1], ['vidio', 1.1, 1.7], ['today', 1.7, 2.2]]);
let e = alignEdited(orig, 'we are going to edit the video today');
ok(txt(e) === 'we are going to edit the video today', 'align text: ' + txt(e));
const edit = e.find((w) => w.text === 'edit'), today = e.find((w) => w.text === 'today');
ok(edit.start === .6 && edit.end === 1, 'kept word timing');
ok(today.start === 1.7 && today.end === 2.2, 'kept last word timing');
const video = e.find((w) => w.text === 'video');
ok(video.start === 1.1 && video.end === 1.7, 'replaced word takes the old slot');
const are = e.find((w) => w.text === 'are'), going = e.find((w) => w.text === 'going');
ok(are.start >= 0.2 - 1e-9 && going.end <= .6 + 1e-9 && are.end <= going.start + 1e-9, 'inserted words share the replaced time: ' + JSON.stringify([are, going]));
e = alignEdited(orig, 'we edit the vidio');
ok(txt(e) === 'we edit the vidio', 'deletions: ' + txt(e));
e = alignEdited(orig, '');
ok(e.length === 0, 'empty edit removes everything');
e = alignEdited(orig, 'Well we gonna edit the vidio today!');
ok(txt(e) === 'Well we gonna edit the vidio today!', 'insert at start + punctuation: ' + txt(e));
ok(e[0].start >= 0 && e[0].end <= e[1].start + 1e-9, 'start insert fits before first word');
for (let k = 1; k < e.length; k++) ok(e[k].start >= e[k - 1].end - 1e-9, 'monotonic times ' + k);

// lines
const ls = wordsToLines(W([['Hi.', 0, .3], ['This', 2, 2.3], ['is', 2.3, 2.5], ['good', 2.5, 3]]));
ok(ls.length === 2 && ls[0].text === 'Hi.' && ls[1].text === 'This is good', 'lines split at sentence ends');

console.log(bad ? bad + ' FAILED' : 'transcript: all passed');
process.exit(bad ? 1 : 0);
