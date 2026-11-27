// "Edit for me": the one-click flow. Pick a video, review a short plan, press one button.
import { h, fmtDur } from './util.js';
import { icon } from './ui/icons.js';
import { loadBrand, isConfigured, brandDialog, logoFile, brandPreview, fontWeight } from './brand.js';
import { LOOKS, BRAND_LOOK, BG_MUSIC, applyOneClick, lookStyle } from './autoedit.js';
import { transcribe, wordsFromSubtitles, MODELS } from './asr.js';
import { MUSIC } from './synth.js';
import { loadFonts, FONTS } from './textrender.js';

const KEY = 'eden.oneclick.v1';
const DEFAULTS = {
  cutPauses: true, pacing: 'balanced', cutFillers: true, captions: true, look: 'Viral Pop', captionPos: 'bottom', captionScale: 1,
  music: 'auto', musicLevel: 'balanced', broll: 'medium', cards: true, zoom: true, model: 'accurate', ratio: 'auto', applyBrand: true,
};
const load = () => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; } };
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

/** Open the plan dialog for a chosen file. */
export function oneClickDialog(app, file) {
  const o = load();
  const brand = loadBrand();
  let subtitle = null;                       // optional .srt/.vtt text
  const body = h('div.oc');

  const row = (ico, title, sub, toggle, extra) => {
    const r = h('section.ocrow', h('div.ocr-h', h('span.ci', icon(ico, 19)), h('div.t', h('b', title), h('small', sub)), toggle || null), extra ? h('div.ocr-b', extra) : null);
    return r;
  };

  /* look picker: each chip shows the font in the brand's colors */
  const lookGrid = h('div.looks');
  loadFonts(FONTS);
  const drawLooks = () => {
    const list = [...(isConfigured(brand) ? [BRAND_LOOK] : []), ...LOOKS];
    lookGrid.replaceChildren(...list.map((l) => {
      const st = lookStyle(l.name, brand, o.applyBrand);
      const hl = st.hl?.on ? st.hl.color : null;
      const boxed = st.bg?.on ? { background: st.bg.color, padding: '2px 8px', borderRadius: '6px' } : {};
      const words = ['MAKE', 'EVERY', 'SECOND'];
      const mk = h('div.lk-prev', { style: { fontFamily: `"${st.font}", sans-serif`, fontWeight: st.weight, color: st.color, ...boxed,
        textShadow: st.glow?.on ? `0 0 10px ${st.glow.color}, 0 0 20px ${st.glow.color}` : (st.stroke?.on ? `-1px -1px 0 ${st.stroke.color}, 1px -1px 0 ${st.stroke.color}, -1px 1px 0 ${st.stroke.color}, 1px 1px 0 ${st.stroke.color}` : '0 1px 3px rgba(0,0,0,.7)') } },
        (st.upper ? words : ['Make', 'every', 'second']).map((w, i) => h('span', { style: hl && i === 1 ? { color: hl } : {} }, w + ' ')));
      return h('button.look' + (o.look === l.name ? '.on' : ''), { type: 'button', on: { click: () => { o.look = l.name; drawLooks(); } } }, h('div.shot', mk), h('b', l.name), h('small', l.tag));
    }));
  };
  drawLooks();

  const musicChoices = [['auto', 'Auto-pick'], ...BG_MUSIC.map((id) => [id, MUSIC.find((m) => m.id === id)?.name || id]), ['none', 'No music']];
  const musicSel = h('select.field', { 'aria-label': 'Music track', on: { change: (e) => { o.music = e.target.value; } } },
    musicChoices.map(([v, l]) => h('option', { value: v, selected: v === o.music }, l)));

  const srtIn = h('input', { type: 'file', accept: '.srt,.vtt,text/vtt,application/x-subrip', hidden: true, on: { change: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const txt = await f.text(); const w = wordsFromSubtitles(txt);
    if (!w.length) { app.toast('No captions found in that file', 'err'); return; }
    subtitle = w; srtNote.textContent = `Using ${f.name} (${w.length} words)`; modelWrap.hidden = true;
  } } });
  const srtNote = h('small.srtnote', '');
  const modelSel = h('select.field', { 'aria-label': 'Speech model', on: { change: (e) => { o.model = e.target.value; } } },
    Object.entries(MODELS).map(([k, m]) => h('option', { value: k, selected: k === o.model }, m.label)));
  const modelWrap = h('div.fld', h('span', 'Speech recognition'), modelSel);

  const brandSum = h('div.brandsum');
  const drawBrand = () => {
    const b = loadBrand(); Object.assign(brand, b);
    brandSum.replaceChildren(isConfigured(b)
      ? h('div.bs', h('div.sws', [b.primary, b.secondary, b.text].map((c) => h('i', { style: { background: c } }))), h('div', h('b', b.name || 'Your brand'), h('small', [b.handle && '@' + b.handle.replace(/^@/, ''), b.logo && 'logo'].filter(Boolean).join(' · ') || 'Colors and font')),
        h('button.btn.sm.ghost', { type: 'button', on: { click: () => brandDialog(app, () => { drawBrand(); drawLooks(); }) } }, 'Edit'))
      : h('div.bs', h('div', h('b', 'No brand set up yet'), h('small', 'Add your name, colors, font and logo once.')),
        h('button.btn.sm', { type: 'button', on: { click: () => brandDialog(app, () => { drawBrand(); drawLooks(); }) } }, icon('plus', 15), 'Set up')));
  };
  drawBrand();

  body.append(
    h('div.oc-file', icon('film', 18), h('b', file.name), h('span', (file.size / 1e6).toFixed(1) + ' MB')),
    row('silence', 'Cut the dead air', 'Pauses, “um”, “uh” and stutters. Eden measures your audio, so quiet speakers are not clipped.', sw(() => o.cutPauses, (v) => { o.cutPauses = v; o.cutFillers = v; }, 'Cut dead air'),
      seg([['relaxed', 'Relaxed'], ['balanced', 'Balanced'], ['tight', 'Tight']], () => o.pacing, (v) => { o.pacing = v; })),
    row('captions', 'Captions', 'Word-by-word, timed to your voice.', sw(() => o.captions, (v) => { o.captions = v; }, 'Captions'),
      h('div', lookGrid,
        h('div.row2', h('div.fld', h('span', 'Position'), seg([['bottom', 'Bottom'], ['center', 'Middle'], ['top', 'Top']], () => o.captionPos, (v) => { o.captionPos = v; })),
          h('div.fld', h('span', 'Size'), seg([[0.85, 'S'], [1, 'M'], [1.2, 'L']], () => o.captionScale, (v) => { o.captionScale = v; })), modelWrap),
        h('div.srt', h('button.btn.sm.ghost', { type: 'button', on: { click: () => srtIn.click() } }, icon('upload', 15), 'I have a caption file (.srt)'), srtNote, srtIn))),
    row('audio', 'Quiet background music', 'A soft track that fades in and out and ducks under your voice.', sw(() => o.music !== 'none', (v) => { o.music = v ? 'auto' : 'none'; musicSel.value = o.music; }, 'Music'),
      h('div.row2', h('div.fld', h('span', 'Track'), musicSel), h('div.fld', h('span', 'Level'), seg([['subtle', 'Subtle'], ['balanced', 'Balanced'], ['present', 'Present']], () => o.musicLevel, (v) => { o.musicLevel = v; })))),
    row('broll', 'B-roll cutaways', 'Animated backgrounds with a keyword card, matched to what you say.', null,
      h('div.row2', seg([['off', 'Off'], ['low', 'Light'], ['medium', 'Balanced'], ['high', 'Lots']], () => o.broll, (v) => { o.broll = v; }),
        h('label.inl', sw(() => o.cards, (v) => { o.cards = v; }, 'Keyword cards'), h('span', 'Keyword cards')))),
    row('shield', 'Your brand', 'Colors on captions and cards, plus your handle and logo.', sw(() => o.applyBrand, (v) => { o.applyBrand = v; drawLooks(); }, 'Apply brand'), brandSum),
    row('ratio', 'Format', 'Match your video, or pick a size for where it is going.', null,
      seg([['auto', 'Match video'], ['9:16', '9:16'], ['1:1', '1:1'], ['4:5', '4:5'], ['16:9', '16:9']], () => o.ratio, (v) => { o.ratio = v; })));

  const m = app.modal({ title: 'Edit for me', lead: 'Review the plan, then press the button. You can fine-tune everything in the editor afterwards.', body, wide: true,
    actions: [{ label: 'Cancel', ghost: true }, { label: 'Edit for me', primary: true, onClick: () => { save(o); runOneClick(app, file, { ...o, brand: loadBrand(), words: subtitle }); } }] });
  m.box.classList.add('ocbox');
  return m;
}

/** Run the whole edit with a progress dialog. `opts.words` skips speech recognition (used for captions files and tests). */
export async function runOneClick(app, file, opts) {
  const needAsr = (opts.captions || opts.cutFillers) && !opts.words;
  const steps = [['import', 'Reading your video'], ...(needAsr ? [['listen', 'Listening to what you say']] : []), ['cut', 'Cutting the dead air'],
    ...(opts.captions ? [['captions', 'Adding captions']] : []), ...(opts.broll !== 'off' ? [['broll', 'Finding b-roll']] : []),
    ...(opts.music !== 'none' ? [['music', 'Mixing quiet music']] : []), ...(opts.applyBrand ? [['brand', 'Applying your brand']] : [])];
  const bar = h('i'); const note = h('small.pnote', '');
  const list = h('ul.psteps', steps.map(([k, l]) => h('li', { 'data-k': k }, h('span.dot'), l)));
  const dlg = app.modal({ title: 'Editing your video', lead: 'This stays on your device. Keep this tab open.', body: h('div', h('div.pbar', bar), list, note), dismiss: false });
  let done = 0;
  const mark = (key) => {
    list.querySelectorAll('li').forEach((li) => { const i = steps.findIndex((s) => s[0] === li.dataset.k); li.className = i < steps.findIndex((s) => s[0] === key) ? 'done' : i === steps.findIndex((s) => s[0] === key) ? 'now' : ''; });
    done = Math.max(0, steps.findIndex((s) => s[0] === key)); bar.style.width = Math.round(((done + 0.3) / steps.length) * 100) + '%';
  };
  const fail = (e) => { console.error(e); dlg.close(); app.toast(e.message || 'Something went wrong', 'err', 6000); };
  try {
    mark('import');
    await app.startFromFiles([file]);
    if (opts.ratio && opts.ratio !== 'auto') { const R = (await import('./model.js')).RATIOS.find((x) => x.id === opts.ratio); if (R) { app.store.setCanvas(R.id, R.w, R.h); } }
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
          words = await transcribe(app.bank.buffer(src.mediaId), { model: opts.model, onProgress: (p, label) => { note.textContent = label + (p ? ` ${Math.round(p * 100)}%` : ''); } });
          note.textContent = '';
          if (!words.length) warnings.push('No speech was found in this video.');
        } catch (e) {
          console.warn('speech recognition failed', e);
          words = null;
          warnings.push('Captions need the speech model, which could not be loaded (it downloads once, so you must be online the first time). The rest of the edit was applied. You can add captions later from a caption file.');
        }
      }
    }
    const logoMedia = opts.brand?.logo && opts.applyBrand ? await app.lib.importFile(await logoFile(opts.brand)).catch(() => null) : null;
    const stats = await applyOneClick({ store: st, bank: app.bank, lib: app.lib, logoMedia },
      { ...opts, brand: opts.brand, applyBrand: opts.applyBrand && isConfigured(opts.brand), cutPauses: opts.cutPauses && media.hasAudio }, words, (k) => mark(k));
    bar.style.width = '100%';
    st.flush(); app.timeline.fit(); app.engine.seek(0);
    dlg.close();
    summary(app, stats, warnings);
    return stats;
  } catch (e) { fail(e); return null; }
}

function summary(app, s, warnings) {
  const item = (ico, text) => h('li', icon(ico, 17), h('span', text));
  const lines = [
    item('silence', s.silence + s.fillers ? `Cut ${s.silence.toFixed(1)}s of dead air${s.fillers ? `, ${s.fillers} filler word${s.fillers === 1 ? '' : 's'}` : ''}${s.repeats ? ` and ${s.repeats} stutter${s.repeats === 1 ? '' : 's'}` : ''}` : 'No dead air needed cutting'),
    s.captions ? item('captions', `${s.captions} captions added`) : null,
    s.music ? item('audio', `${s.music} playing quietly under your voice`) : null,
    s.broll ? item('broll', `${s.broll} b-roll cutaway${s.broll === 1 ? '' : 's'}`) : null,
    s.brand ? item('shield', 'Your brand applied') : null,
  ].filter(Boolean);
  app.modal({ title: 'Your edit is ready', lead: `${fmtDur(s.from)} became ${fmtDur(s.to)}. Review it, change anything you like, then export.`,
    body: h('div', h('ul.sumlist', lines), ...warnings.map((w) => h('div.warnbox', icon('info', 17), h('span', w)))),
    actions: [{ label: 'Open editor', ghost: true }, { label: 'Export now', primary: true, onClick: () => { setTimeout(() => app.exportDialog(), 80); } }] });
}
