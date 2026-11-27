// Clip inspector: transform / keyframes / speed / audio / look / adjust / effects / animation / mask / chroma / text.
import { h, clamp, EASE, fmtDur } from '../util.js';
import { icon } from './icons.js';
import { evalKF, end } from '../model.js';
import { FILTERS, EFFECTS, BLENDS, MASKS, ANIM_IN, ANIM_OUT, ANIM_LOOP, effectById, effectDefaults, filterById } from '../effects.js';
import { FONTS, TEXT_PRESETS } from '../textrender.js';
import { GENERATORS } from '../generators.js';

export function slider({ min, max, step, value, onInput, onChange }) {
  const el = h('input', { type: 'range', min, max, step: step || (max - min) / 200, value });
  const upd = () => el.style.setProperty('--p', ((el.value - min) / (max - min)) * 100 + '%');
  upd();
  el.addEventListener('input', () => { upd(); onInput?.(+el.value); });
  el.addEventListener('change', () => onChange?.(+el.value));
  el.setValue = (v) => { el.value = v; upd(); };
  return el;
}
const sw = (on, fn) => { const b = h('button.switch' + (on ? '.on' : ''), { role: 'switch', on: { click: () => { const v = !b.classList.contains('on'); b.classList.toggle('on', v); fn(v); } } }); return b; };
const seg = (opts, cur, fn) => { const el = h('div.seg'); const draw = (c) => el.replaceChildren(...opts.map(([id, n]) => h('button' + (c === id ? '.on' : ''), { on: { click: () => { fn(id); draw(id); } } }, n))); draw(cur); return el; };
const selectEl = (opts, cur, fn) => h('select.field', { on: { change: (e) => fn(e.target.value) } }, opts.map(([v, n]) => h('option', { value: v, selected: v === cur }, n)));
const color = (v, fn) => h('input.swatch', { type: 'color', value: v, on: { input: (e) => fn(e.target.value) } });

const SECTIONS = {
  transform: ['Transform', 'canvas'], speed: ['Speed', 'speed'], audio: ['Audio', 'volume'], look: ['Filter', 'filters'], adjust: ['Adjust', 'adjust'], effects: ['Effects', 'effects'],
  anim: ['Animation', 'anim'], mask: ['Mask', 'mask'], chroma: ['Chroma key', 'chroma'], blend: ['Blend', 'blend'], crop: ['Crop', 'crop'], trans: ['Transition', 'transitions'],
  text: ['Text', 'text'], sticker: ['Sticker', 'sticker'], fxlayer: ['Effect layer', 'effects'], gen: ['B-roll', 'broll'],
};

export class Inspector {
  constructor(root, app) {
    this.root = root; this.app = app; this.busy = false;
    this.open = new Set(['text', 'transform', 'fxlayer', 'speed', 'audio', 'sticker']);
    this.focus = null;
  }
  get store() { return this.app.store; }

  /** Run an edit without triggering a full re-render of this panel. */
  edit(fn, opts = {}) { this.busy = true; try { this.store.edit(fn, opts); } finally { this.busy = false; } }

  show(focus = null) { this.focus = focus; if (focus) this.open.add(focus); this.render(); }

  render() {
    const body = this.root.querySelector('.pb'); if (!body) return;
    const top = body.scrollTop;
    body.replaceChildren();
    const store = this.store;
    if (store.sel.size === 0) { body.append(this._none()); return; }
    if (store.sel.size > 1) { body.append(h('div.hint', `${store.sel.size} clips selected`), h('div.pill-row', h('button.btn.sm', { on: { click: () => store.duplicate() } }, icon('copy', 15), 'Duplicate'), h('button.btn.sm.danger', { on: { click: () => store.remove() } }, icon('trash', 15), 'Delete'))); return; }
    const { clip: c } = store.selected;
    this.c = c;
    const ids = this._sectionsFor(c);
    const list = this.focus && ids.includes(this.focus) && this.app.isMobile ? [this.focus] : ids;
    for (const id of list) body.append(this._section(id, c));
    body.scrollTop = top;
    if (this.focus && !this.app.isMobile) { const el = body.querySelector(`[data-sec="${this.focus}"]`); el?.scrollIntoView({ block: 'nearest' }); }
  }

  _none() {
    return h('div', { style: { padding: '10px 2px' } }, h('div.empty', icon('wand', 24), h('div', { style: { marginTop: '8px', fontWeight: 700, color: 'var(--text)' } }, 'Nothing selected'), h('div', 'Tap a clip on the timeline to edit it.')),
      h('div.sub.desktop-only', 'Shortcuts'),
      h('div.hint.desktop-only', 'Space play · S split · Del delete · Ctrl+Z undo · Ctrl+D duplicate · ←/→ step frame · +/− zoom'));
  }

  _sectionsFor(c) {
    const k = c.kind;
    if (k === 'text') return ['text', 'transform', 'anim', 'look', 'adjust', 'effects', 'blend', 'mask'];
    if (k === 'sticker') return ['sticker', 'transform', 'anim', 'effects', 'blend'];
    if (k === 'fx') return ['fxlayer'];
    if (k === 'audio') return ['audio', 'speed'];
    if (k === 'gen') return ['gen', 'transform', 'trans', 'look', 'adjust', 'effects', 'anim', 'blend', 'mask', 'crop'];
    return ['transform', 'speed', 'audio', 'trans', 'look', 'adjust', 'effects', 'anim', 'mask', 'chroma', 'blend', 'crop'].filter((x) => !(x === 'audio' && k === 'image') && !(x === 'speed' && k === 'image'));
  }

  _section(id, c) {
    const [title, ic] = SECTIONS[id];
    const sec = h('div.sect' + (this.open.has(id) || (this.focus === id && this.app.isMobile) ? '.open' : ''), { 'data-sec': id });
    const hd = h('button.sh', { on: { click: () => { const o = sec.classList.toggle('open'); o ? this.open.add(id) : this.open.delete(id); } } }, icon(ic, 18), title, icon('chevdown', 16, 'chev'));
    const sb = h('div.sb');
    sec.append(hd, sb);
    try { sb.append(...[].concat(this['s_' + id](c))); } catch (e) { console.error(e); }
    return sec;
  }

  // ---- controls -------------------------------------------------------
  /** Slider row. opts: {get,set,min,max,step,fmt,kf:key} */
  ctl(label, o) {
    const c = this.c;
    const out = h('output');
    const cur = () => (o.kf ? evalKF(c.kf?.[o.kf], this._tRel(), o.get(), EASE) : o.get());
    const fmt = o.fmt || ((v) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2)));
    const input = slider({
      min: o.min, max: o.max, step: o.step, value: cur(),
      onInput: (v) => {
        out.textContent = fmt(v);
        if (o.kf && c.kf?.[o.kf]?.length) {
          const t = clamp(this._tRel(), 0, c.dur);
          this.edit((cl) => { const list = cl.kf[o.kf]; const i = list.findIndex((k) => Math.abs(k.t - t) < 0.04); if (i >= 0) list[i].v = v; else { list.push({ t: +t.toFixed(3), v, e: 'inout' }); list.sort((a, b) => a.t - b.t); } }, { ids: [c.id], coalesce: 'kf' + o.kf, structure: false });
        } else this.edit((cl) => o.set(cl, v), { ids: [c.id], coalesce: 'c' + label, audio: !!o.audio });
      },
    });
    out.textContent = fmt(cur());
    const row = h('div.ctl' + (o.kf ? '' : '.nokf'), h('label', label), input, out);
    if (o.kf) {
      const kfb = h('button.kf', { title: 'Keyframe', on: { click: () => { const t = clamp(this._tRel(), 0, c.dur); this.store.toggleKeyframe(c, o.kf, t, +cur().toFixed(4)); this.render(); } } }, icon('keyframe', 13));
      const t = this._tRel();
      const list = c.kf?.[o.kf];
      if (list?.length) kfb.classList.add('has');
      if (list?.some((k) => Math.abs(k.t - t) < 0.04)) kfb.classList.add('here');
      row.append(kfb);
    }
    return row;
  }
  _tRel() { return clamp(this.app.engine.t - this.c.start, 0, this.c.dur); }
  row(label, el) { return h('div.rowx', h('label', label), h('div.grow', el)); }
  pill(c, text, fn, on) { return h('button.chip' + (on ? '.on' : ''), { on: { click: fn } }, text); }

  s_transform(c) {
    const f = [];
    const isMedia = c.kind === 'video' || c.kind === 'image' || c.kind === 'gen';
    f.push(this.ctl('Position X', { kf: 'x', get: () => c.tf.x, set: (cl, v) => { cl.tf.x = v; }, min: -1, max: 1, step: 0.005 }));
    f.push(this.ctl('Position Y', { kf: 'y', get: () => c.tf.y, set: (cl, v) => { cl.tf.y = v; }, min: -1, max: 1, step: 0.005 }));
    f.push(this.ctl('Scale', { kf: 's', get: () => c.tf.s, set: (cl, v) => { cl.tf.s = v; }, min: 0.1, max: 4, step: 0.01, fmt: (v) => (v * 100).toFixed(0) + '%' }));
    f.push(this.ctl('Rotate', { kf: 'r', get: () => c.tf.r, set: (cl, v) => { cl.tf.r = v; }, min: -180, max: 180, step: 1, fmt: (v) => v.toFixed(0) + '°' }));
    f.push(this.ctl('Opacity', { kf: 'op', get: () => c.tf.op, set: (cl, v) => { cl.tf.op = v; }, min: 0, max: 1, step: 0.01, fmt: (v) => (v * 100).toFixed(0) + '%' }));
    if (isMedia && c.kind !== 'gen') f.push(this.row('Framing', seg([['fill', 'Fill'], ['fit', 'Fit']], c.tf.fit, (v) => this.store.edit((cl) => { cl.tf.fit = v; }, { ids: [c.id] }))));
    if (isMedia && c.tf.fit === 'fit') f.push(this.row('Blur backdrop', sw(c.bgblur, (v) => this.store.edit((cl) => { cl.bgblur = v; }, { ids: [c.id] }))));
    f.push(h('div.pill-row', this.pill(c, 'Flip H', () => { this.store.edit((cl) => { cl.tf.fx = !cl.tf.fx; }, { ids: [c.id] }); this.render(); }, c.tf.fx), this.pill(c, 'Flip V', () => { this.store.edit((cl) => { cl.tf.fy = !cl.tf.fy; }, { ids: [c.id] }); this.render(); }, c.tf.fy),
      this.pill(c, 'Rotate 90°', () => { this.store.edit((cl) => { cl.tf.r = ((cl.tf.r + 90 + 180) % 360) - 180; }, { ids: [c.id] }); this.render(); }), this.pill(c, 'Reset', () => { this.store.edit((cl) => { cl.tf = { x: 0, y: cl.kind === 'text' ? 0.18 : 0, s: 1, r: 0, fx: false, fy: false, op: 1, fit: cl.tf.fit }; cl.kf = {}; }, { ids: [c.id], structure: true }); this.render(); })));
    f.push(h('div.hint', 'Tap ◆ to keyframe a property at the playhead, move the playhead and change the value to animate.'));
    return f;
  }

  s_speed(c) {
    const media = this.store.project.media[c.mediaId];
    const setSpeed = (v) => this.store.edit((cl) => {
      const span = cl.dur * cl.speed; cl.speed = v; cl.dur = Math.max(0.1, span / v);
      if (!cl.loop && media && cl.kind !== 'gen') cl.dur = Math.min(cl.dur, (media.duration - cl.in) / v);
    }, { ids: [c.id], structure: true, audio: true });
    const f = [];
    f.push(h('div.pill-row', [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4].map((v) => this.pill(c, v + '×', () => { setSpeed(v); this.render(); }, Math.abs(c.speed - v) < 0.001))));
    const out = h('output', c.speed.toFixed(2) + '×');
    const s = slider({ min: -1.4, max: 1.4, step: 0.01, value: Math.log2(c.speed) / 1 * 0.7, onInput: (v) => { const sp = +(2 ** (v / 0.7)).toFixed(2); out.textContent = sp.toFixed(2) + '×'; setSpeedLive(sp); } });
    let timer; const setSpeedLive = (sp) => { clearTimeout(timer); timer = setTimeout(() => { this.busy = true; setSpeed(sp); this.busy = false; }, 40); };
    f.push(h('div.ctl.nokf', h('label', 'Custom'), s, out));
    return f;
  }

  s_audio(c) {
    const f = [];
    f.push(this.ctl('Volume', { get: () => c.vol, set: (cl, v) => { cl.vol = v; }, min: 0, max: 2, step: 0.01, fmt: (v) => (v * 100).toFixed(0) + '%', audio: true }));
    f.push(this.ctl('Fade in', { get: () => c.fadeIn, set: (cl, v) => { cl.fadeIn = v; }, min: 0, max: Math.min(5, c.dur / 2), step: 0.05, fmt: (v) => v.toFixed(1) + 's', audio: true }));
    f.push(this.ctl('Fade out', { get: () => c.fadeOut, set: (cl, v) => { cl.fadeOut = v; }, min: 0, max: Math.min(5, c.dur / 2), step: 0.05, fmt: (v) => v.toFixed(1) + 's', audio: true }));
    f.push(this.row('Mute', sw(c.mute, (v) => this.store.edit((cl) => { cl.mute = v; }, { ids: [c.id], structure: true, audio: true }))));
    if (c.kind === 'audio') {
      f.push(this.row('Loop', sw(c.loop, (v) => this.store.edit((cl) => { cl.loop = v; }, { ids: [c.id], structure: true, audio: true }))));
      f.push(this.row('Duck under voice', sw(c.duck, (v) => this.store.edit((cl) => { cl.duck = v; }, { ids: [c.id], audio: true }))));
      f.push(h('div.hint', 'Ducking lowers this track automatically while someone is speaking in your video.'));
    } else f.push(h('button.btn.sm', { on: { click: () => this.app.cutSilences() } }, icon('silence', 15), 'Remove silences'));
    return f;
  }

  s_gen(c) {
    const g = GENERATORS.find((x) => x.id === c.gen);
    return [h('div.hint', 'Animated background: ' + (g?.name || c.gen)), this.row('Style', selectEl(GENERATORS.map((x) => [x.id, x.name]), c.gen, (v) => this.store.edit((cl) => { cl.gen = v; cl.name = GENERATORS.find((x) => x.id === v)?.name; }, { ids: [c.id], structure: true }))),
      this.ctl('Time offset', { get: () => c.in, set: (cl, v) => { cl.in = v; }, min: 0, max: 60, step: 0.1, fmt: (v) => v.toFixed(1) + 's' })];
  }

  s_look(c) {
    const cur = filterById(c.look.id);
    const f = [this.row('Look', selectEl(FILTERS.map((x) => [x.id, x.name]), cur.id, (v) => { this.store.edit((cl) => { cl.look.id = v; if (cl.look.amt == null) cl.look.amt = 1; }, { ids: [c.id] }); this.render(); }))];
    f.push(this.ctl('Intensity', { get: () => c.look.amt ?? 1, set: (cl, v) => { cl.look.amt = v; }, min: 0, max: 1, step: 0.01, fmt: (v) => (v * 100).toFixed(0) + '%' }));
    f.push(h('button.btn.sm', { style: { marginTop: '4px' }, on: { click: () => this.app.openTool('filters') } }, icon('filters', 15), 'Browse looks'));
    return f;
  }

  s_adjust(c) {
    const A = (label, key, min, max, step, fmt) => this.ctl(label, { get: () => c.adj[key], set: (cl, v) => { cl.adj[key] = v; }, min, max, step, fmt });
    return [A('Exposure', 'exp', -2, 2, 0.01), A('Brightness', 'bri', -1, 1, 0.01), A('Contrast', 'con', -1, 1, 0.01), A('Saturation', 'sat', -1, 1, 0.01), A('Vibrance', 'vib', -1, 1, 0.01),
      A('Temperature', 'temp', -1, 1, 0.01), A('Tint', 'tint', -1, 1, 0.01), A('Hue', 'hue', -3.14, 3.14, 0.01, (v) => ((v * 180) / Math.PI).toFixed(0) + '°'),
      A('Highlights', 'hl', -1, 1, 0.01), A('Shadows', 'sh', -1, 1, 0.01), A('Sharpen', 'sharp', 0, 2, 0.01), A('Vignette', 'vig', 0, 1, 0.01), A('Grain', 'grain', 0, 1, 0.01),
      h('button.btn.sm', { style: { marginTop: '6px' }, on: { click: () => { this.store.edit((cl) => { for (const k of Object.keys(cl.adj)) cl.adj[k] = 0; }, { ids: [c.id] }); this.render(); } } }, 'Reset adjustments')];
  }

  s_effects(c) {
    const f = [];
    (c.fxs || []).forEach((fx, i) => {
      const def = effectById(fx.type);
      const box = h('div', { style: { padding: '8px 0', borderBottom: '1px solid var(--line)' } });
      box.append(h('div.rowx', h('b', { style: { flex: 1 } }, def?.name || fx.type), h('button.btn.ghost.sm.icon', { title: 'Remove', on: { click: () => { this.store.edit((cl) => { cl.fxs.splice(i, 1); }, { ids: [c.id], structure: true }); this.render(); } } }, icon('trash', 15))));
      for (const pd of def?.params || []) box.append(this.ctl(pd.name, { get: () => fx[pd.k] ?? pd.def, set: (cl, v) => { cl.fxs[i][pd.k] = v; }, min: pd.min, max: pd.max, step: pd.step }));
      f.push(box);
    });
    f.push(h('div.rowx', selectEl([['', 'Add effect…'], ...EFFECTS.map((e) => [e.id, `${e.cat} · ${e.name}`])], '', (v) => { if (!v) return; this.store.edit((cl) => { cl.fxs.push(effectDefaults(v)); }, { ids: [c.id], structure: true }); this.render(); })));
    f.push(h('button.btn.sm', { on: { click: () => this.app.openTool('effects') } }, icon('effects', 15), 'Browse effects'));
    return f;
  }

  s_anim(c) {
    const text = c.kind === 'text';
    const ain = ANIM_IN.filter((a) => !a.textOnly || text);
    const f = [];
    f.push(this.row('In', selectEl(ain.map((a) => [a.id, a.name]), c.animIn.id, (v) => { this.store.edit((cl) => { cl.animIn.id = v; }, { ids: [c.id] }); this.app.engine.seek(c.start + 0.02); })));
    f.push(this.ctl('In length', { get: () => c.animIn.dur, set: (cl, v) => { cl.animIn.dur = v; }, min: 0.1, max: Math.min(3, c.dur), step: 0.05, fmt: (v) => v.toFixed(2) + 's' }));
    f.push(this.row('Out', selectEl(ANIM_OUT.map((a) => [a.id, a.name]), c.animOut.id, (v) => this.store.edit((cl) => { cl.animOut.id = v; }, { ids: [c.id] }))));
    f.push(this.ctl('Out length', { get: () => c.animOut.dur, set: (cl, v) => { cl.animOut.dur = v; }, min: 0.1, max: Math.min(3, c.dur), step: 0.05, fmt: (v) => v.toFixed(2) + 's' }));
    f.push(this.row('Loop', selectEl(ANIM_LOOP.map((a) => [a.id, a.name]), c.animLoop.id, (v) => this.store.edit((cl) => { cl.animLoop.id = v; }, { ids: [c.id] }))));
    f.push(this.ctl('Loop power', { get: () => c.animLoop.amt ?? 1, set: (cl, v) => { cl.animLoop.amt = v; }, min: 0.2, max: 3, step: 0.05 }));
    return f;
  }

  s_mask(c) {
    return [this.row('Shape', selectEl(MASKS.map((m) => [m.id, m.name]), c.mask.type, (v) => this.store.edit((cl) => { cl.mask.type = v; }, { ids: [c.id] }))),
      this.ctl('Size', { get: () => c.mask.scale, set: (cl, v) => { cl.mask.scale = v; }, min: 0.1, max: 2, step: 0.01 }),
      this.ctl('Feather', { get: () => c.mask.feather, set: (cl, v) => { cl.mask.feather = v; }, min: 0, max: 0.5, step: 0.005 }),
      this.ctl('Roundness', { get: () => c.mask.round, set: (cl, v) => { cl.mask.round = v; }, min: 0, max: 0.5, step: 0.005 }),
      this.row('Invert', sw(c.mask.invert, (v) => this.store.edit((cl) => { cl.mask.invert = v; }, { ids: [c.id] })))];
  }

  s_chroma(c) {
    return [this.row('Remove colour', sw(c.chroma.on, (v) => this.store.edit((cl) => { cl.chroma.on = v; }, { ids: [c.id] }))),
      this.row('Key colour', color(c.chroma.color, (v) => this.edit((cl) => { cl.chroma.color = v; }, { ids: [c.id], coalesce: 'chroma' }))),
      this.ctl('Similarity', { get: () => c.chroma.sim, set: (cl, v) => { cl.chroma.sim = v; }, min: 0.02, max: 0.7, step: 0.005 }),
      this.ctl('Smoothness', { get: () => c.chroma.smooth, set: (cl, v) => { cl.chroma.smooth = v; }, min: 0, max: 0.4, step: 0.005 }),
      this.ctl('Spill', { get: () => c.chroma.spill, set: (cl, v) => { cl.chroma.spill = v; }, min: 0, max: 1, step: 0.01 }),
      h('div.hint', 'Green-screen: place this clip on an overlay track above a background.')];
  }

  s_blend(c) { return [this.row('Mode', selectEl(BLENDS.map((b) => [b.id, b.name]), c.blend, (v) => this.store.edit((cl) => { cl.blend = v; }, { ids: [c.id] })))]; }

  s_crop(c) {
    const C = (l, k) => this.ctl(l, { get: () => c.crop[k], set: (cl, v) => { cl.crop[k] = v; }, min: 0, max: 0.45, step: 0.005, fmt: (v) => (v * 100).toFixed(0) + '%' });
    return [C('Left', 'l'), C('Right', 'r'), C('Top', 't'), C('Bottom', 'b')];
  }

  s_trans(c) {
    const t = c.transIn;
    return [h('div.hint', t?.type ? `Currently: ${t.type} (${(t.dur || 0.6).toFixed(2)}s)` : 'No transition into this clip.'), h('button.btn.sm', { on: { click: () => this.app.openTool('transitions') } }, icon('transitions', 15), 'Choose transition')];
  }

  s_sticker(c) {
    const S = c.sticker;
    const f = [this.ctl('Size', { get: () => S.size || 0.2, set: (cl, v) => { cl.sticker.size = v; }, min: 0.05, max: 0.9, step: 0.005 })];
    if (!S.emoji) { f.push(this.row('Colour', color(S.color || '#ffd24a', (v) => this.edit((cl) => { cl.sticker.color = v; }, { ids: [c.id], coalesce: 'stc' })))); }
    return f;
  }

  s_fxlayer(c) {
    const def = effectById(c.fx.type);
    const f = [h('div.hint', 'This layer applies the effect to everything beneath it for its duration.'),
      this.row('Effect', selectEl(EFFECTS.map((e) => [e.id, `${e.cat} · ${e.name}`]), c.fx.type, (v) => { this.store.edit((cl) => { cl.fx = { ...effectDefaults(v) }; cl.name = v; }, { ids: [c.id], structure: true }); this.render(); }))];
    for (const pd of def?.params || []) f.push(this.ctl(pd.name, { get: () => c.fx[pd.k] ?? pd.def, set: (cl, v) => { cl.fx[pd.k] = v; }, min: pd.min, max: pd.max, step: pd.step }));
    f.push(this.row('Soft edges', sw(c.fx.ease !== false, (v) => this.store.edit((cl) => { cl.fx.ease = v; }, { ids: [c.id] }))));
    return f;
  }

  s_text(c) {
    const T = c.text; const f = [];
    const ta = h('textarea.field', { value: T.content, placeholder: 'Type your text', on: { input: (e) => this.edit((cl) => { cl.text.content = e.target.value; cl.name = e.target.value.split('\n')[0].slice(0, 24) || 'Text'; }, { ids: [c.id], coalesce: 'txt', structure: true }) } });
    f.push(ta);
    f.push(h('div.chips', { style: { marginTop: '8px' } }, TEXT_PRESETS.map((p) => h('button.chip', { on: { click: () => { this.store.edit((cl) => { cl.text = this.app.mergeText(cl.text, p.text); }, { ids: [c.id], structure: true }); this.render(); } } }, p.name))));
    f.push(this.row('Font', selectEl(FONTS.map((x) => [x.id, x.name]), T.font, (v) => { this.store.edit((cl) => { cl.text.font = v; cl.text.weight = FONTS.find((x) => x.id === v)?.w || 700; }, { ids: [c.id], structure: true }); })));
    f.push(this.ctl('Size', { get: () => T.size, set: (cl, v) => { cl.text.size = v; }, min: 0.02, max: 0.22, step: 0.002, fmt: (v) => (v * 100).toFixed(1) }));
    f.push(this.ctl('Spacing', { get: () => T.spacing, set: (cl, v) => { cl.text.spacing = v; }, min: -0.05, max: 0.3, step: 0.005 }));
    f.push(this.ctl('Line height', { get: () => T.lineH, set: (cl, v) => { cl.text.lineH = v; }, min: 0.8, max: 2, step: 0.01 }));
    f.push(this.row('Colour', color(T.color, (v) => this.edit((cl) => { cl.text.color = v; }, { ids: [c.id], coalesce: 'tcol' }))));
    f.push(this.row('Align', seg([['left', 'Left'], ['center', 'Center'], ['right', 'Right']], T.align, (v) => this.store.edit((cl) => { cl.text.align = v; }, { ids: [c.id] }))));
    f.push(h('div.pill-row', this.pill(c, 'UPPERCASE', () => { this.store.edit((cl) => { cl.text.upper = !cl.text.upper; }, { ids: [c.id] }); this.render(); }, T.upper), this.pill(c, 'Italic', () => { this.store.edit((cl) => { cl.text.italic = !cl.text.italic; }, { ids: [c.id] }); this.render(); }, T.italic)));
    const grp = (title, key, on, body) => { const w = h('div', { style: { borderTop: '1px solid var(--line)', marginTop: '8px', paddingTop: '4px' } }); w.append(h('div.rowx', h('b', { style: { flex: 1 } }, title), sw(on, (v) => { this.store.edit((cl) => { cl.text[key].on = v; }, { ids: [c.id] }); })), ...body); return w; };
    f.push(grp('Outline', 'stroke', T.stroke.on, [this.row('Colour', color(T.stroke.color, (v) => this.edit((cl) => { cl.text.stroke.color = v; }, { ids: [c.id], coalesce: 'tsc' }))), this.ctl('Width', { get: () => T.stroke.w, set: (cl, v) => { cl.text.stroke.w = v; }, min: 0.02, max: 0.4, step: 0.005 })]));
    f.push(grp('Background', 'bg', T.bg.on, [this.row('Colour', color(T.bg.color, (v) => this.edit((cl) => { cl.text.bg.color = v; }, { ids: [c.id], coalesce: 'tbc' }))), this.ctl('Opacity', { get: () => T.bg.a, set: (cl, v) => { cl.text.bg.a = v; }, min: 0, max: 1, step: 0.01 }), this.ctl('Padding', { get: () => T.bg.pad, set: (cl, v) => { cl.text.bg.pad = v; }, min: 0, max: 1, step: 0.01 }), this.ctl('Corners', { get: () => T.bg.radius, set: (cl, v) => { cl.text.bg.radius = v; }, min: 0, max: 1, step: 0.01 })]));
    f.push(grp('Glow', 'glow', T.glow.on, [this.row('Colour', color(T.glow.color, (v) => this.edit((cl) => { cl.text.glow.color = v; }, { ids: [c.id], coalesce: 'tgc' }))), this.ctl('Amount', { get: () => T.glow.amt, set: (cl, v) => { cl.text.glow.amt = v; }, min: 0, max: 2, step: 0.01 })]));
    f.push(grp('Shadow', 'shadow', T.shadow.on, [this.ctl('Blur', { get: () => T.shadow.blur, set: (cl, v) => { cl.text.shadow.blur = v; }, min: 0, max: 1, step: 0.01 }), this.ctl('Offset', { get: () => T.shadow.y, set: (cl, v) => { cl.text.shadow.y = v; }, min: 0, max: 0.3, step: 0.005 })]));
    if (c.words?.length) f.push(grp('Word highlight', 'hl', T.hl.on, [this.row('Colour', color(T.hl.color, (v) => this.edit((cl) => { cl.text.hl.color = v; }, { ids: [c.id], coalesce: 'thc' })))]));
    return f;
  }
}
void end; void fmtDur;
