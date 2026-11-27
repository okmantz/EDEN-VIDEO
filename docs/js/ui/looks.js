// Caption look picker: every chip shows the look's real font, colors and highlight, tinted with the brand when asked.
import { h } from '../util.js';
import { LOOKS, BRAND_LOOK, lookStyle } from '../autoedit.js';
import { isConfigured } from '../brand.js';
import { loadFonts, FONTS } from '../textrender.js';

let fontsAsked = false;
const SAMPLE = ['Make', 'every', 'second'];

/** The sample text of one look, styled like the real caption. */
export function lookSample(name, brand, applyBrand, words = SAMPLE) {
  const st = lookStyle(name, brand, applyBrand);
  const hl = st.hl?.on ? st.hl.color : null;
  const boxed = st.bg?.on ? { background: st.bg.color, padding: '2px 8px', borderRadius: '6px' } : {};
  const edge = st.stroke?.on ? `-1px -1px 0 ${st.stroke.color}, 1px -1px 0 ${st.stroke.color}, -1px 1px 0 ${st.stroke.color}, 1px 1px 0 ${st.stroke.color}` : '0 1px 3px rgba(0,0,0,.7)';
  return h('div.lk-prev', { style: { fontFamily: `"${st.font}", sans-serif`, fontWeight: st.weight, color: st.color, ...boxed,
    textShadow: st.glow?.on ? `0 0 10px ${st.glow.color}, 0 0 20px ${st.glow.color}` : edge } },
  (st.upper ? words.map((w) => w.toUpperCase()) : words).map((w, i) => h('span', { style: hl && i === 1 ? { color: hl } : {} }, w + ' ')));
}

/**
 * @param {{brand:object, applyBrand?:()=>boolean, get:()=>string, set:(name:string)=>void, compact?:boolean}} o
 * @returns {HTMLElement & {redraw:()=>void}}
 */
export function lookPicker({ brand, applyBrand = () => true, get, set, compact = false }) {
  if (!fontsAsked) { fontsAsked = true; loadFonts(FONTS); }
  const grid = h('div.looks' + (compact ? '.compact' : ''));
  const draw = () => {
    const list = [...(isConfigured(brand) ? [BRAND_LOOK] : []), ...LOOKS];
    grid.replaceChildren(...list.map((l) => h('button.look' + (get() === l.name ? '.on' : ''), { type: 'button', title: l.tag, on: { click: () => { set(l.name); draw(); } } },
      h('div.shot', lookSample(l.name, brand, applyBrand())), h('b', l.name), compact ? null : h('small', l.tag))));
  };
  draw();
  grid.redraw = draw;
  return grid;
}
