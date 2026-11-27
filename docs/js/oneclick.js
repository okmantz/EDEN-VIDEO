// "Edit for me": pick a video, choose a style, press one button.
import { h, fmtDur } from './util.js';
import { icon } from './ui/icons.js';
import { loadBrand, isConfigured, logoFile } from './brand.js';
import { STYLE_PRESETS, BG_MUSIC, applyOneClick, adaptiveThreshold } from './autoedit.js';
import { transcribe, wordsFromSubtitles, MODELS, LANGUAGES } from './asr.js';
import { cleanWords, parseGlossary, wordsToLines, alignEdited } from './transcript.js';
import { fetchStockFile, keysOf, hasStock } from './stock.js';
import { MUSIC } from './synth.js';
import { lookPicker } from './ui/looks.js';
import { RATIOS } from './model.js';

const KEY = 'eden.oneclick.v2';
const DEFAULTS = {
  style: 'viral', plan: null, captionPos: 'bottom', captionScale: 1, model: 'accurate', ratio: 'auto', applyBrand: true, outro: false, stock: true,
  review: true, glossary: '', language: 'auto',
};
const preset = (id) => STYLE_PRESETS.find((s) => s.id === id) || STYLE_PRESETS[0];
const load = () => {
  let o = {}; try { o = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* ignore */ }
  o = { ...DEFAULTS, ...o };
  o.plan = { ...preset(o.style).plan, ...(o.plan || {}) };
  return o;
};
const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* ignore */ } };

const seg = (items, get, set) => {
  const el = h('div.seg');
  const draw = () => el.replaceChildren(...items.map(([k, l]) => h('button' + (get() === k ? '.on' : ''), { type: 'button', on: { click: () => { set(k); draw(); } } }, l)));
  draw(); return el;
};
const sw = (get, set, label) => {
  const input = h('input', { type: 'checkbox', checked: !!get(), 'aria-label': label, on: { change: () => set(input.checked) } });
  return h('label.sw.mini', input, h('span.trk'));
};
const fld = (label, el) => h('div.fld', h('span', label), el);

/** Open the one-click sheet for a chosen video file. */
export function oneClickDialog(app, file) {
  const o = load();
  const brand = loadBrand();
  let subtitle = null;
  const url = URL.createObjectURL(file);
  const body = h('div.oc');

  /* preview of the chosen video */
  const vid = h('video', { src: url, muted: true, playsInline: true, preload: 'metadata', controls: false });
  const meta = h('small', (file.size / 1e6).toFixed(1) + ' MB');
  vid.addEventListener('loadedmetadata', () => { meta.textContent = `${fmtDur(vid.duration)} · ${vid.videoWidth}×${vid.videoHeight} · ${(file.size / 1e6).toFixed(1)} MB`; try { vid.currentTime = Math.min(1, vid.duration / 4); } catch { /* ignore */ } });
  const head = h('div.oc-file', h('div.oc-thumb', vid), h('div', h('b', file.name), meta));

  /* style cards */
  const cards = h('div.styles');
  const drawCards = () => cards.replaceChildren(...STYLE_PRESETS.map((s) => h('button.style' + (o.style === s.id ? '.on' : ''), { type: 'button', on: { click: () => { o.style = s.id; o.plan = { ...s.plan }; drawCards(); syncAll(); } } },
    h('span.si', icon(s.icon, 20)), h('b', s.name), h('small', s.blurb))));

  /* fine tune */
  const P = o.plan;
  const looks = lookPicker({ brand, applyBrand: () => o.applyBrand, get: () => P.look, set: (n) => { P.look = n; }, compact: true });
  const musicChoices = [['auto', 'Auto-pick'], ...BG_MUSIC.map((id) => [id, MUSIC.find((m) => m.id === id)?.name || id]), ['none', 'No music']];
  const musicSel = h('select.field', { 'aria-label': 'Music track', on: { change: (e) => { P.music = e.target.value; } } }, musicChoices.map(([v, l]) => h('option', { value: v }, l)));
  const srtNote = h('small.srtnote', '');
  const modelSel = h('select.field', { 'aria-label': 'Speech model', on: { change: (e) => { o.model = e.target.value; } } },
    Object.entries(MODELS).map(([k, m]) => h('option', { value: k, selected: k === o.model }, m.label)));
  const modelWrap = fld('Speech recognition', modelSel);
  const langSel = h('select.field', { 'aria-label': 'Spoken language', on: { change: (e) => { o.language = e.target.value; } } }, LANGUAGES.map(([v, l]) => h('option', { value: v, selected: v === o.language }, l)));
  const langWrap = fld('Spoken language', langSel);
  const syncLang = () => { langWrap.hidden = MODELS[o.model]?.en !== false; };
  modelSel.addEventListener('change', syncLang); syncLang();
  const glossary = h('input.field', { value: o.glossary, placeholder: 'e.g. EDEN, T58, Alex Morgan', maxLength: 200, 'aria-label': 'Names and special words', on: { input: (e) => { o.glossary = e.target.value; } } });
  const srtIn = h('input', { type: 'file', accept: '.srt,.vtt,text/vtt,application/x-subrip', hidden: true, on: { change: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const w = wordsFromSubtitles(await f.text());
    if (!w.length) { app.toast('No captions found in that file', 'err'); return; }
    subtitle = w; srtNote.textContent = `Using ${f.name} (${w.length} words)`; modelWrap.hidden = true; langWrap.hidden = true;
  } } });

  const fine = [];
  const rows = h('div.fine-body');
  const syncAll = () => { musicSel.value = P.music; looks.redraw(); fine.forEach((f) => f()); };
  const reg = (el, redraw) => { fine.push(redraw); return el; };
  const segRow = (label, items, key) => { const s = seg(items, () => P[key], (v) => { P[key] = v; }); return reg(fld(label, s), () => { const n = seg(items, () => P[key], (v) => { P[key] = v; }); s.replaceWith(n); }); };
  const toggle = (label, key, hint) => h('label.tg', sw(() => P[key], (v) => { P[key] = v; }, label), h('span', h('b', label), hint ? h('small', hint) : null));

  rows.append(
    h('div.grp', h('h4', 'Pauses'), segRow('Pacing', [['relaxed', 'Relaxed'], ['balanced', 'Balanced'], ['tight', 'Tight']], 'pacing'),
      h('div.tgs', toggle('Cut dead air', 'cutPauses'), toggle('Remove “um” and “uh”', 'cutFillers'), toggle('Remove false starts and retakes', 'cutRetakes', 'Keeps the last, best take'))),
    h('div.grp', h('h4', 'Captions'), toggle('Show captions', 'captions'), looks,
      h('div.row2', fld('Position', seg([['bottom', 'Bottom'], ['center', 'Middle'], ['top', 'Top']], () => o.captionPos, (v) => { o.captionPos = v; })),
        fld('Size', seg([[0.85, 'S'], [1, 'M'], [1.2, 'L']], () => o.captionScale, (v) => { o.captionScale = v; })), modelWrap, langWrap),
      h('div.tgs', h('label.tg', sw(() => o.review, (v) => { o.review = v; }, 'Check captions first'), h('span', h('b', 'Check captions before applying'), h('small', 'Fix any word in seconds. Recommended.')))),
      fld('Names and special words', glossary), h('small.srtnote', 'Spelled the way you type them, so brands and names come out right.'),
      h('div.srt', h('button.btn.sm.ghost', { type: 'button', on: { click: () => srtIn.click() } }, icon('upload', 15), 'I have a caption file (.srt)'), srtNote, srtIn)),
    h('div.grp', h('h4', 'Music and b-roll'),
      h('div.row2', fld('Music track', musicSel), segRow('Music level', [['subtle', 'Subtle'], ['balanced', 'Balanced'], ['present', 'Present']], 'musicLevel')),
      segRow('B-roll', [['off', 'Off'], ['low', 'Light'], ['medium', 'Balanced'], ['high', 'Lots']], 'broll'),
      h('div.tgs', toggle('Keyword cards on b-roll', 'cards'), toggle('Slow punch-in on emphasis', 'zoom'),
        h('label.tg', sw(() => o.stock, (v) => { o.stock = v; }, 'Real stock footage'), h('span', h('b', 'Real stock footage'), h('small', hasStock(brand) ? 'Uses your stock footage key' : 'Add a free Pexels or Pixabay key in Brand to enable')))),
      segRow('Color grade', [['none', 'None'], ['clean', 'Clean'], ['vivid', 'Vivid'], ['warm', 'Warm'], ['cinema', 'Cinema']], 'grade')),
    h('div.grp', h('h4', 'Brand and format'),
      h('div.tgs', h('label.tg', sw(() => o.applyBrand, (v) => { o.applyBrand = v; looks.redraw(); }, 'Apply brand'), h('span', h('b', isConfigured(brand) ? `Apply ${brand.name || 'my brand'}` : 'Apply my brand'), h('small', isConfigured(brand) ? 'Colors, handle and logo' : 'Set it up in the Brand tab'))),
        h('label.tg', sw(() => o.outro, (v) => { o.outro = v; }, 'End card'), h('span', h('b', 'Add a branded end card')))),
      fld('Format', seg([['auto', 'Match video'], ...RATIOS.map((r) => [r.id, r.id])], () => o.ratio, (v) => { o.ratio = v; }))));

  const fineBox = h('details.fine', h('summary', icon('sliders', 17), h('b', 'Fine-tune'), h('small', 'Everything can also be changed in the editor'), icon('chevdown', 16)), rows);
  body.append(head, h('h3.oc-h', 'Pick a style'), cards, fineBox);
  drawCards(); syncAll();

  const m = app.modal({ title: 'Edit for me', lead: 'Choose a style and press the button. Your video stays on this device.', body, wide: true,
    onClose: () => URL.revokeObjectURL(url),
    actions: [{ label: 'Cancel', ghost: true }, { label: 'Edit for me', primary: true, onClick: () => { save(o); runOneClick(app, file, { ...o.plan, ...o, plan: undefined, outro: o.outro, brand: loadBrand(), words: subtitle }); } }] });
  m.box.classList.add('ocbox');
  return m;
}

/** Run the whole edit with a progress dialog. `opts.words` skips speech recognition (used for caption files and tests). */
export async function runOneClick(app, file, opts) {
  const wantsSpeech = opts.captions || opts.cutFillers || opts.cutRetakes;
  const needAsr = wantsSpeech && !opts.words;
  const steps = [['import', 'Reading your video'], ...(needAsr ? [['listen', 'Listening to what you say']] : []), ['cut', 'Cutting the dead air'],
    ...(opts.captions ? [['captions', 'Adding captions']] : []), ...(opts.broll !== 'off' ? [['broll', 'Finding b-roll']] : []),
    ...(opts.music !== 'none' ? [['music', 'Mixing quiet music']] : []), ...(opts.applyBrand ? [['brand', 'Applying your brand']] : [])];
  const bar = h('i'); const note = h('small.pnote', '');
  const list = h('ul.psteps', steps.map(([k, l]) => h('li', { 'data-k': k }, h('span.dot'), l)));
  const dlg = app.modal({ title: 'Editing your video', lead: 'This stays on your device. Keep this tab open.', body: h('div', h('div.pbar', bar), list, note), dismiss: false });
  const idx = (k) => steps.findIndex((s) => s[0] === k);
  const mark = (key) => {
    const now = idx(key); if (now < 0) return;
    list.querySelectorAll('li').forEach((li) => { const i = idx(li.dataset.k); li.className = i < now ? 'done' : i === now ? 'now' : ''; });
    bar.style.width = Math.round(((now + 0.3) / steps.length) * 100) + '%';
  };
  const fail = (e) => { console.error(e); dlg.close(); app.toast(e.message || 'Something went wrong', 'err', 6000); };
  try {
    mark('import');
    await app.startFromFiles([file]);
    if (opts.ratio && opts.ratio !== 'auto') { const R = RATIOS.find((x) => x.id === opts.ratio); if (R) app.store.setCanvas(R.id, R.w, R.h); }
    const st = app.store;
    const src = st.mainTrack.clips.find((c) => c.kind === 'video');
    if (!src) throw new Error('That file has no video track.');
    const media = st.project.media[src.mediaId];
    let words = opts.words || null;
    const warnings = [];
    if (needAsr) {
      if (!media.hasAudio) warnings.push('This video has no audio, so there are no captions or pauses to find.');
      else {
        mark('listen');
        try {
          words = await transcribe(app.bank.buffer(src.mediaId), { model: opts.model, language: opts.language, onProgress: (p, label) => { note.textContent = label + (p ? ` ${Math.round(p * 100)}%` : ''); } });
          note.textContent = '';
          const env = app.bank.has(src.mediaId) ? app.bank.rmsDb(src.mediaId, 0.02) : null;
          words = cleanWords(words, { db: env?.db || null, win: env?.win || 0.02, thr: env?.db ? adaptiveThreshold(env.db).threshold : -40, glossary: parseGlossary(opts.glossary) });
          if (!words.length) warnings.push('No speech was found in this video.');
          else if (opts.review && opts.captions) { mark('listen'); words = await reviewCaptions(app, file, words); }
        } catch (e) {
          console.warn('speech recognition failed', e);
          words = null;
          warnings.push('Captions need the speech model, which could not be loaded (it downloads once, so you must be online the first time). The rest of the edit was applied. You can add captions later from a caption file.');
        }
      }
    }
    const brand = opts.brand;
    const useBrand = opts.applyBrand && isConfigured(brand);
    const logoMedia = brand?.logo && useBrand ? await app.lib.importFile(await logoFile(brand)).catch(() => null) : null;
    const portrait = (media.h || 1) >= (media.w || 1);
    let spotN = 0;
    const stock = opts.stock && hasStock(brand) && opts.broll !== 'off'
      ? async (spot) => { const f = await fetchStockFile(spot.query || spot.word, { keys: keysOf(brand), portrait, pick: spotN++ }); return f ? app.lib.importFile(f).catch(() => null) : null; } : null;
    const stats = await applyOneClick({ store: st, bank: app.bank, lib: app.lib, logoMedia, stock },
      { ...opts, brand, applyBrand: useBrand, outro: !!opts.outro, cutPauses: opts.cutPauses && media.hasAudio }, words, (k) => mark(k));
    bar.style.width = '100%';
    st.flush(); app.timeline.fit(); app.engine.seek(0);
    dlg.close();
    summary(app, stats, warnings);
    return stats;
  } catch (e) { fail(e); return null; }
}

function summary(app, s, warnings) {
  const item = (ico, text) => h('li', icon(ico, 17), h('span', text));
  const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const cut = [s.fillers && pl(s.fillers, 'filler word'), s.repeats && pl(s.repeats, 'stutter'), s.retakes && pl(s.retakes, 'retake'), s.hesitations && pl(s.hesitations, 'hesitation')].filter(Boolean);
  const lines = [
    s.silence > 0.05 || cut.length ? item('silence', `Cut ${s.silence.toFixed(1)}s of dead air${cut.length ? ' plus ' + cut.join(', ') : ''}`) : item('silence', 'No dead air needed cutting'),
    s.captions ? item('captions', `${pl(s.captions, 'caption')} added`) : null,
    s.music ? item('audio', `${s.music} playing quietly under your voice`) : null,
    s.broll ? item('broll', `${pl(s.broll, 'b-roll cutaway')}${s.stock ? ` (${s.stock} real footage)` : ''}`) : null,
    s.brand ? item('shield', 'Your brand applied') : null,
    s.outro ? item('film', 'End card added') : null,
  ].filter(Boolean);
  app.modal({ title: 'Your edit is ready', lead: `${fmtDur(s.from)} became ${fmtDur(s.to)}. Review it, change anything you like, then export.`,
    body: h('div', h('ul.sumlist', lines), ...warnings.map((w) => h('div.warnbox', icon('info', 17), h('span', w)))),
    actions: [{ label: 'Open editor', ghost: true }, { label: 'Export now', primary: true, onClick: () => { setTimeout(() => app.exportDialog(), 80); } }] });
}


/**
 * Let the person read and fix the transcript before it becomes captions and cuts.
 * Each line has a play button, so a doubtful word can be checked against the sound. Returns the (possibly edited) words.
 */
function reviewCaptions(app, file, words) {
  return new Promise((resolve) => {
    const lines = wordsToLines(words);
    const url = URL.createObjectURL(file);
    const vid = h('video', { src: url, playsInline: true, preload: 'auto', style: { display: 'none' } });
    let stopAt = 0;
    vid.addEventListener('timeupdate', () => { if (stopAt && vid.currentTime >= stopAt) { vid.pause(); stopAt = 0; } });
    const rows = lines.map((ln) => {
      const ta = h('textarea.field.rv-text', { rows: Math.max(1, Math.ceil(ln.text.length / 34)), value: ln.text, 'aria-label': 'Caption text', spellcheck: true });
      const play = h('button.btn.icon.sm.rv-play', { type: 'button', title: 'Hear this line', on: { click: () => {
        if (!vid.paused) { vid.pause(); return; }
        vid.currentTime = Math.max(0, ln.start - 0.15); stopAt = ln.end + 0.2; vid.play().catch(() => {});
      } } }, icon('play', 15));
      return { ln, ta, el: h('div.rv-row', h('span.rv-time', fmtDur(ln.start)), play, ta) };
    });
    const count = h('small', `${words.length} words`);
    const done = (edited) => { vid.pause(); URL.revokeObjectURL(url); m.close(); resolve(edited); };
    const apply = () => {
      const text = rows.map((r) => r.ta.value.trim()).filter(Boolean).join('\n');
      const edited = alignEdited(words, text);
      done(edited.length ? edited : words);
    };
    const m = app.modal({ title: 'Check your captions', lead: 'Fix any word that was heard wrong. Timing stays in sync automatically. Tap a play button to hear a line.', wide: true, dismiss: false,
      body: h('div.rv', vid, h('div.rv-list', ...rows.map((r) => r.el)), count),
      actions: [{ label: 'Skip', ghost: true, onClick: () => { done(words); return false; } }, { label: 'Looks good', primary: true, onClick: () => { apply(); return false; } }] });
    m.box.classList.add('rvbox');
  });
}
