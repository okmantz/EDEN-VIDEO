// Left-hand library panels: media, B-roll, audio, text, stickers, effects, transitions, filters, captions, canvas.
import { h, fmtTime, fmtDur } from '../util.js';
import { icon } from './icons.js';
import { lazyThumb } from '../thumbs.js';
import { GENRES, GENERATORS } from '../generators.js';
import { EFFECTS, TRANSITIONS, FILTERS } from '../effects.js';
import { MUSIC, SFX } from '../synth.js';
import { builtinMedia } from '../audio.js';
import { TEXT_PRESETS, SHAPE_LIST } from '../textrender.js';
import { RATIOS } from '../model.js';

export const TOOLS = [
  { id: 'media', name: 'Media', icon: 'media' }, { id: 'broll', name: 'B-roll', icon: 'broll' }, { id: 'audio', name: 'Audio', icon: 'audio' },
  { id: 'text', name: 'Text', icon: 'text' }, { id: 'stickers', name: 'Stickers', icon: 'sticker' }, { id: 'effects', name: 'Effects', icon: 'effects' },
  { id: 'transitions', name: 'Transitions', icon: 'transitions' }, { id: 'filters', name: 'Filters', icon: 'filters' }, { id: 'captions', name: 'Captions', icon: 'captions' },
  { id: 'canvas', name: 'Canvas', icon: 'canvas' },
];

const EMOJI = {
  Faces: '😀 😂 🤣 😍 🥰 😎 🤩 😭 😱 🤯 🥳 😴 🤔 🙄 😈 🤡 👻 💀',
  Hands: '👍 👎 👏 🙌 🙏 💪 ✌️ 🤞 👌 🤙 👀 🫶 ☝️ 👉 👈',
  Hype: '🔥 💯 ⚡ 💥 ✨ 🌟 ⭐ 🎉 🎊 🏆 👑 💎 💰 🚀 📈 ❗ ❓ ✅ ❌',
  Love: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💕 💖 💘 💝 😘 🌹',
  Fun: '🎵 🎶 🎤 🎧 🎬 📸 🍕 🍔 🍿 ☕ 🍻 🎮 ⚽ 🏀 🌈 ☀️ 🌙 🌊',
};
const SHAPE_COLORS = ['#ffd24a', '#7cf5c8', '#ff5d8f', '#5fd0ff', '#ffffff', '#9d8cff', '#ff8a3d'];

const toast = (m, k) => window.EDEN?.toast(m, k);

export class Panels {
  constructor(app) { this.app = app; this.state = { genre: 'all', audioTab: 'music', fxCat: 'All', trCat: 'All', flCat: 'All' }; }

  build(id) {
    const fn = this['p_' + id];
    return fn ? fn.call(this) : h('div');
  }
  titleOf(id) { return TOOLS.find((t) => t.id === id)?.name || ''; }

  // ------------------------------------------------------------ media
  p_media() {
    const { app } = this; const p = app.store.project;
    const wrap = h('div');
    const pick = h('input', { type: 'file', accept: 'video/*,image/*,audio/*,.mp4,.mov,.m4v,.webm,.mp3,.wav,.m4a', multiple: true, hidden: true, on: { change: (e) => { app.importFiles([...e.target.files]); e.target.value = ''; } } });
    const drop = h('div.drop', { on: { click: () => pick.click() } }, icon('upload', 26), h('b', 'Import videos, photos & audio'), h('span', 'Tap to browse · or drop files here'));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); app.importFiles([...e.dataTransfer.files]); });
    wrap.append(pick, drop, h('div.hint', 'Everything stays on your device. Nothing is uploaded.'));
    const items = Object.values(p.media).filter((m) => !m.builtin);
    if (!items.length) { wrap.append(h('div.sub', 'Your media'), h('div.empty', 'Imported files appear here.')); return wrap; }
    wrap.append(h('div.sub', `Your media · ${items.length}`));
    const grid = h('div.grid.g3');
    for (const m of items) {
      const im = h('div.im.sq');
      if (m.kind === 'audio') { im.style.background = 'linear-gradient(135deg,#12403a,#0d2a2a)'; im.append(h('div', { style: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#7cf5c8' } }, icon('audio', 26))); }
      else app.lib.thumbs(m, 1, 120).then((f) => { if (f[0]) { im.style.backgroundImage = `url(${f[0].canvas.toDataURL('image/jpeg', .7)})`; } });
      const card = h('button.card', { title: 'Add to timeline', on: { click: () => app.store.appendMedia(m) } }, im,
        h('span.tag', m.kind === 'image' ? 'PHOTO' : fmtDur(m.duration)), h('span.add', icon('plus', 15)), h('div.lb', m.name));
      if (m.kind !== 'audio') card.append(h('span', { style: { position: 'absolute', left: '6px', top: '6px', width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(6,8,11,.75)', display: 'grid', placeItems: 'center' }, title: 'Add as overlay (picture-in-picture)', on: { click: (e) => { e.stopPropagation(); app.addOverlay(m); } } }, icon('layers', 14)));
      grid.append(card);
    }
    wrap.append(grid);
    return wrap;
  }

  // ------------------------------------------------------------ b-roll
  p_broll() {
    const { app, state } = this;
    const wrap = h('div');
    const chips = h('div.chips');
    const list = h('div.grid.g3');
    const draw = () => {
      chips.replaceChildren(...[{ id: 'all', name: 'All' }, ...GENRES].map((g) => h('button.chip' + (state.genre === g.id ? '.on' : ''), { on: { click: () => { state.genre = g.id; draw(); } } }, g.name)));
      list.replaceChildren();
      const gens = GENERATORS.filter((g) => state.genre === 'all' || g.genre === state.genre);
      for (const g of gens) {
        const im = lazyThumb(h('div.im'), 'gen', g.id);
        list.append(h('button.card', { title: g.name, on: { click: () => { app.store.addGenerator(g, 5); toast(g.name + ' added', 'ok'); } } }, im, h('span.add', icon('plus', 15)), h('div.lb', g.name)));
      }
    };
    draw();
    wrap.append(h('div.hint', `${GENERATORS.length} animated backgrounds across ${GENRES.length} genres. Rendered live in any aspect ratio, royalty-free, and they loop.`), chips, list);
    return wrap;
  }

  // ------------------------------------------------------------ audio
  p_audio() {
    const { app, state } = this;
    const wrap = h('div');
    const pick = h('input', { type: 'file', accept: 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac', multiple: true, hidden: true, on: { change: async (e) => { const fs = [...e.target.files]; e.target.value = ''; for (const f of fs) { const m = await app.importAudioFile(f); if (m) app.store.addAudio(m, { loop: false, vol: 0.9 }); } state.audioTab = 'mine'; app.refreshPanel(); } } });
    const seg = h('div.seg', ...[['music', 'Music'], ['sfx', 'Sound FX'], ['mine', 'My audio']].map(([id, n]) => h('button' + (state.audioTab === id ? '.on' : ''), { on: { click: () => { state.audioTab = id; app.refreshPanel(); } } }, n)));
    wrap.append(pick, h('button.btn.primary', { style: { width: '100%', marginBottom: '12px' }, on: { click: () => pick.click() } }, icon('upload', 18), 'Upload your music'), seg, h('div', { style: { height: '12px' } }));
    const body = h('div');
    wrap.append(body);
    if (state.audioTab === 'music') {
      body.append(h('div.hint', 'Original royalty-free tracks generated in your browser. They loop under your video and can duck beneath speech.'));
      for (const m of MUSIC) body.append(this._audioRow(builtinMedia.music(m.id), m.color, `${m.mood} · ${m.bpm} BPM`, { loop: true, vol: 0.55, duck: true }));
    } else if (state.audioTab === 'sfx') {
      for (const s of SFX) body.append(this._audioRow(builtinMedia.sfx(s.id), '#5fd0ff', fmtDur(s.dur), { vol: 1 }));
    } else {
      const mine = Object.values(app.store.project.media).filter((m) => m.kind === 'audio' && !m.builtin);
      if (!mine.length) body.append(h('div.empty', 'Upload an MP3, WAV or M4A to use it as background music.'));
      for (const m of mine) body.append(this._audioRow(m, '#7cf5c8', fmtDur(m.duration), { loop: false, vol: 0.9 }));
    }
    return wrap;
  }
  _audioRow(media, color, sub, extra) {
    const { app } = this;
    const play = h('button.btn.icon.sm', { title: 'Preview', on: { click: async (e) => { e.stopPropagation(); play.replaceChildren(icon(await app.previewAudio(media) ? 'pause' : 'play', 15)); } } }, icon('play', 15));
    app.onPreviewEnd = () => { document.querySelectorAll('.row-item .btn.icon.sm').forEach((b) => b.replaceChildren(icon('play', 15))); };
    return h('div.row-item', { style: { cursor: 'pointer' }, on: { click: () => app.addAudioMedia(media, extra) } },
      h('div.pic', { style: { background: color } }, icon('audio', 20)), h('div', h('b', media.name), h('span', sub)),
      h('div.go', play, h('button.btn.icon.sm.primary', { title: 'Add to timeline' }, icon('plus', 15))));
  }

  // ------------------------------------------------------------ text
  p_text() {
    const { app } = this;
    const wrap = h('div');
    wrap.append(h('button.btn.primary', { style: { width: '100%' }, on: { click: () => app.store.addText({}) } }, icon('text', 18), 'Add text'), h('div.sub', 'Styles'));
    const grid = h('div.grid.g2');
    for (const pr of TEXT_PRESETS) {
      const t = pr.text;
      const prev = h('div.im.wide', { style: { display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#1c2432,#0f141b)', overflow: 'hidden' } },
        h('span', { style: { fontFamily: `'${t.font}'`, fontWeight: t.weight, fontSize: '22px', color: t.color, textTransform: t.upper ? 'uppercase' : 'none', letterSpacing: (t.spacing || 0) + 'em', padding: t.bg?.on ? '3px 10px' : 0, borderRadius: '8px', background: t.bg?.on ? t.bg.color : 'none', WebkitTextStroke: t.stroke?.on ? '1px ' + t.stroke.color : 0, textShadow: t.glow?.on ? `0 0 12px ${t.glow.color}, 0 0 24px ${t.glow.color}` : t.shadow?.on ? '0 2px 6px rgba(0,0,0,.7)' : 'none', paintOrder: 'stroke fill' } }, 'Aa Text'));
      grid.append(h('button.card', { on: { click: () => app.store.addText(t) } }, prev, h('div.lb', pr.name)));
    }
    wrap.append(grid);
    return wrap;
  }

  // ------------------------------------------------------------ stickers
  p_stickers() {
    const { app } = this; const wrap = h('div');
    wrap.append(h('div.sub', 'Shapes'));
    const shapes = h('div.grid.g4');
    SHAPE_LIST.forEach((s, i) => {
      const col = SHAPE_COLORS[i % SHAPE_COLORS.length];
      shapes.append(h('button.card', { on: { click: () => app.store.addSticker({ shape: s, color: col, size: 0.2 }) } }, h('div.im.sq', { style: { display: 'grid', placeItems: 'center' } }, h('div', { style: { width: '54%', height: '54%', background: col, borderRadius: s === 'circle' || s === 'ring' ? '50%' : s === 'rect' ? '12%' : '0', clipPath: { star: 'polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)', heart: 'polygon(50% 90%,0 40%,10% 10%,35% 5%,50% 22%,65% 5%,90% 10%,100% 40%)', triangle: 'polygon(50% 5%,95% 90%,5% 90%)', arrow: 'polygon(0 35%,60% 35%,60% 10%,100% 50%,60% 90%,60% 65%,0 65%)', burst: 'polygon(50% 0,60% 20%,80% 10%,78% 32%,100% 40%,82% 55%,95% 78%,72% 76%,65% 100%,50% 82%,35% 100%,28% 76%,5% 78%,18% 55%,0 40%,22% 32%,20% 10%,40% 20%)', bubble: 'polygon(0 10%,100% 10%,100% 70%,40% 70%,20% 95%,22% 70%,0 70%)' }[s] || 'none', border: s === 'ring' ? '5px solid ' + col : 0, background: s === 'ring' ? 'transparent' : col } }))));
    });
    wrap.append(shapes);
    for (const [cat, list] of Object.entries(EMOJI)) {
      wrap.append(h('div.sub', cat));
      const g = h('div.grid.g4');
      for (const e of list.split(' ')) g.append(h('button.card', { on: { click: () => app.store.addSticker({ emoji: e, size: 0.2 }) } }, h('div.im.sq', { style: { display: 'grid', placeItems: 'center', fontSize: '30px' } }, e)));
      wrap.append(g);
    }
    return wrap;
  }

  // ------------------------------------------------------------ effects
  _catChips(list, key) {
    const cats = ['All', ...new Set(list.map((x) => x.cat))];
    return h('div.chips', cats.map((c) => h('button.chip' + (this.state[key] === c ? '.on' : ''), { on: { click: () => { this.state[key] = c; this.app.refreshPanel(); } } }, c)));
  }
  p_effects() {
    const { app, state } = this; const wrap = h('div');
    const c = app.store.selected;
    wrap.append(h('div.hint', c && c.kind !== 'audio' && c.clip.kind !== 'fx' ? 'Tap an effect to apply it to the selected clip. Long-press or use + for a timeline effect layer.' : 'Select a clip to apply an effect to it, or add an effect layer that covers everything beneath it.'), this._catChips(EFFECTS, 'fxCat'));
    const grid = h('div.grid.g3');
    for (const e of EFFECTS.filter((x) => state.fxCat === 'All' || x.cat === state.fxCat)) {
      const card = h('button.card', { title: e.name, on: { click: () => app.applyEffect(e.id, false) } }, lazyThumb(h('div.im'), 'effect', e.id), h('div.lb', e.name),
        h('span.add', { title: 'Add as effect layer', on: { click: (ev) => { ev.stopPropagation(); app.applyEffect(e.id, true); } } }, icon('layers', 14)));
      grid.append(card);
    }
    wrap.append(grid);
    return wrap;
  }

  // ------------------------------------------------------------ transitions
  p_transitions() {
    const { app, state } = this; const wrap = h('div');
    const tid = app.transTarget;
    const target = tid ? app.store.selected : null;
    const sel = app.currentTransitionClip();
    wrap.append(h('div.hint', sel ? `Transition into “${sel.name || sel.kind}”.` : 'Select a clip (not the first) to set the transition into it, or tap the + between two clips on the timeline.'));
    if (sel) {
      const cur = sel.transIn?.type;
      wrap.append(h('div.ctl.nokf', h('label', 'Duration'), this.app.slider({ min: 0.1, max: 2.5, step: 0.05, value: sel.transIn?.dur || 0.6, onInput: (v) => app.setTransition(sel.id, cur || 'fade', v) }), h('output', ((sel.transIn?.dur || 0.6)).toFixed(2) + 's')));
      if (cur) wrap.append(h('button.btn.sm.danger', { style: { margin: '6px 0 4px' }, on: { click: () => app.setTransition(sel.id, null) } }, icon('trash', 15), 'Remove transition'));
    }
    wrap.append(this._catChips(TRANSITIONS, 'trCat'));
    const grid = h('div.grid.g3');
    for (const t of TRANSITIONS.filter((x) => state.trCat === 'All' || x.cat === state.trCat)) {
      const on = sel?.transIn?.type === t.id;
      grid.append(h('button.card' + (on ? '.on' : ''), { title: t.name, on: { click: () => app.setTransition(sel?.id, t.id, sel?.transIn?.dur || 0.6) } }, lazyThumb(h('div.im'), 'transition', t.id), h('div.lb', t.name)));
    }
    wrap.append(grid);
    void target;
    return wrap;
  }

  // ------------------------------------------------------------ filters
  p_filters() {
    const { app, state } = this; const wrap = h('div');
    const c = app.store.selected;
    wrap.append(h('div.hint', c ? 'Tap a look to apply it to the selected clip.' : 'Select a clip to colour grade it.'), this._catChips(FILTERS, 'flCat'));
    const grid = h('div.grid.g3');
    for (const f of FILTERS.filter((x) => state.flCat === 'All' || x.cat === state.flCat)) {
      grid.append(h('button.card' + (c?.clip.look?.id === f.id ? '.on' : ''), { on: { click: () => app.applyFilter(f.id) } }, lazyThumb(h('div.im'), 'filter', f.id), h('div.lb', f.name)));
    }
    wrap.append(grid);
    return wrap;
  }

  // ------------------------------------------------------------ captions
  p_captions() {
    const { app } = this; const wrap = h('div');
    const pick = h('input', { type: 'file', accept: '.srt,.vtt,text/vtt,application/x-subrip', hidden: true, on: { change: async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) app.importSubtitles(await f.text(), f.name); } } });
    wrap.append(pick,
      h('div.row-item', { style: { cursor: 'pointer' }, on: { click: () => pick.click() } }, h('div.pic', { style: { background: 'var(--grad)' } }, icon('captions', 20)), h('div', h('b', 'Import subtitles'), h('span', '.srt or .vtt → styled caption clips')), h('div.go', icon('chevron', 18))),
      h('div.row-item', { style: { cursor: 'pointer' }, on: { click: () => app.pasteCaptions() } }, h('div.pic', { style: { background: '#9d8cff' } }, icon('text', 20)), h('div', h('b', 'Type or paste captions'), h('span', 'One line per caption, split across the clip')), h('div.go', icon('chevron', 18))),
      h('div.row-item', { style: { cursor: 'pointer' }, on: { click: () => app.cutSilences() } }, h('div.pic', { style: { background: '#ffcf5c' } }, icon('silence', 20)), h('div', h('b', 'Remove silences'), h('span', 'Auto-cuts dead air from the selected clip')), h('div.go', icon('chevron', 18))),
      h('div.hint', 'Tip: generate a transcript with any free tool (e.g. YouTube Studio or your phone’s transcript), export .srt, then import it here and pick a caption style.'));
    return wrap;
  }

  // ------------------------------------------------------------ canvas
  p_canvas() {
    const { app } = this; const p = app.store.project; const wrap = h('div');
    wrap.append(h('div.sub', 'Aspect ratio'));
    const g = h('div.ratio-grid');
    for (const r of RATIOS) {
      const k = 30 / Math.max(r.w, r.h);
      g.append(h('button.ratio' + (p.canvas.ratio === r.id ? '.on' : ''), { on: { click: () => app.setRatio(r) } }, h('i', { style: { width: Math.round(r.w * k) + 'px', height: Math.round(r.h * k) + 'px' } }), r.name, h('small', r.sub)));
    }
    wrap.append(g, h('div.sub', 'Background colour'));
    const sw = ['#000000', '#ffffff', '#101418', '#1b2a5a', '#3a1f5e', '#0d3b32', '#7a1f3d', '#e9795c'];
    wrap.append(h('div.pill-row', sw.map((c) => h('button.swatch', { style: { background: c, outline: p.canvas.bg === c ? '2px solid var(--accent)' : 'none' }, on: { click: () => { app.store.commit((pp) => { pp.canvas.bg = c; }, { audio: false }); app.refreshPanel(); } } })),
      h('input.swatch', { type: 'color', value: p.canvas.bg, on: { input: (e) => { app.store.commit((pp) => { pp.canvas.bg = e.target.value; }, { coalesce: 'bg', audio: false, structure: false }); } } })));
    wrap.append(h('div.hint', 'Clips set to “Fit” show a blurred copy of themselves behind them. Choose “Fill” for full-bleed.'));
    return wrap;
  }
}
