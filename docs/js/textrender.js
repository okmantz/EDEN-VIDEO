// Text, caption and sticker rasterisation to canvases (uploaded as GL textures by the compositor).
const SHAPES = {
  star: (c, s) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? s * 0.22 : s * 0.5; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); },
  heart: (c, s) => { const k = s / 2; c.beginPath(); c.moveTo(0, k * 0.9); c.bezierCurveTo(-k * 1.35, k * 0.1, -k * 0.75, -k * 0.95, 0, -k * 0.4); c.bezierCurveTo(k * 0.75, -k * 0.95, k * 1.35, k * 0.1, 0, k * 0.9); c.closePath(); },
  circle: (c, s) => { c.beginPath(); c.arc(0, 0, s / 2, 0, Math.PI * 2); },
  rect: (c, s) => { c.beginPath(); c.roundRect(-s / 2, -s / 2, s, s, s * 0.12); },
  triangle: (c, s) => { c.beginPath(); c.moveTo(0, -s * 0.5); c.lineTo(s * 0.5, s * 0.4); c.lineTo(-s * 0.5, s * 0.4); c.closePath(); },
  arrow: (c, s) => { c.beginPath(); c.moveTo(-s / 2, -s * 0.14); c.lineTo(s * 0.1, -s * 0.14); c.lineTo(s * 0.1, -s * 0.36); c.lineTo(s / 2, 0); c.lineTo(s * 0.1, s * 0.36); c.lineTo(s * 0.1, s * 0.14); c.lineTo(-s / 2, s * 0.14); c.closePath(); },
  burst: (c, s) => { c.beginPath(); for (let i = 0; i < 24; i++) { const a = (i * Math.PI) / 12; const r = i % 2 ? s * 0.34 : s * 0.5; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); },
  ring: (c, s) => { c.beginPath(); c.arc(0, 0, s * 0.42, 0, Math.PI * 2); },
  bubble: (c, s) => { c.beginPath(); c.roundRect(-s / 2, -s * 0.36, s, s * 0.62, s * 0.2); c.moveTo(-s * 0.1, s * 0.26); c.lineTo(-s * 0.26, s * 0.46); c.lineTo(s * 0.06, s * 0.26); },
};
export const SHAPE_LIST = Object.keys(SHAPES);

export const FONTS = [
  { id: 'Inter', name: 'Inter', w: 800 }, { id: 'Montserrat', name: 'Montserrat', w: 800 }, { id: 'Poppins', name: 'Poppins', w: 700 },
  { id: 'Bebas Neue', name: 'Bebas Neue', w: 400 }, { id: 'Anton', name: 'Anton', w: 400 }, { id: 'Oswald', name: 'Oswald', w: 700 },
  { id: 'Archivo Black', name: 'Archivo Black', w: 400 }, { id: 'Space Grotesk', name: 'Space Grotesk', w: 600 },
  { id: 'Playfair Display', name: 'Playfair', w: 700 }, { id: 'DM Serif Display', name: 'DM Serif', w: 400 }, { id: 'Cinzel', name: 'Cinzel', w: 700 },
  { id: 'Pacifico', name: 'Pacifico', w: 400 }, { id: 'Lobster', name: 'Lobster', w: 400 }, { id: 'Caveat', name: 'Caveat', w: 700 },
  { id: 'Permanent Marker', name: 'Marker', w: 400 }, { id: 'Bangers', name: 'Bangers', w: 400 }, { id: 'Orbitron', name: 'Orbitron', w: 700 }, { id: 'Righteous', name: 'Righteous', w: 400 },
];

export const TEXT_DEFAULT = () => ({
  content: 'Your text', font: 'Inter', weight: 800, size: 0.06, color: '#ffffff', align: 'center', spacing: 0, lineH: 1.15, upper: false, italic: false,
  stroke: { on: false, color: '#000000', w: 0.12 }, shadow: { on: true, color: '#000000', blur: 0.25, x: 0, y: 0.05, a: 0.55 },
  bg: { on: false, color: '#000000', a: 0.6, pad: 0.35, radius: 0.35 }, glow: { on: false, color: '#7cf5c8', amt: 0.6 },
  hl: { on: false, color: '#ffe24a' }, maxW: 0.86,
});

export const TEXT_PRESETS = [
  { name: 'Classic', text: { font: 'Inter', weight: 800, size: 0.06, color: '#ffffff', stroke: { on: false }, shadow: { on: true } } },
  { name: 'Viral Pop', text: { font: 'Montserrat', weight: 800, size: 0.062, color: '#ffffff', upper: true, stroke: { on: true, color: '#000000', w: 0.16 }, shadow: { on: true }, hl: { on: true, color: '#ffe24a' } } },
  { name: 'Bold Impact', text: { font: 'Anton', weight: 400, size: 0.085, color: '#ffffff', upper: true, spacing: 0.02, stroke: { on: true, color: '#ff3d71', w: 0.14 }, shadow: { on: true } } },
  { name: 'Clean Pro', text: { font: 'Inter', weight: 700, size: 0.043, color: '#ffffff', stroke: { on: false }, shadow: { on: true, blur: 0.3 } } },
  { name: 'Podcast Box', text: { font: 'Poppins', weight: 700, size: 0.044, color: '#ffffff', stroke: { on: false }, shadow: { on: false }, bg: { on: true, color: '#101418', a: 0.85, pad: 0.4, radius: 0.3 } } },
  { name: 'Cinematic', text: { font: 'Cinzel', weight: 700, size: 0.045, color: '#f4efe6', spacing: 0.12, stroke: { on: false }, shadow: { on: true } } },
  { name: 'Neon', text: { font: 'Orbitron', weight: 700, size: 0.06, color: '#e8fffb', stroke: { on: false }, shadow: { on: false }, glow: { on: true, color: '#22f0c8', amt: 1 } } },
  { name: 'Retro Script', text: { font: 'Pacifico', weight: 400, size: 0.075, color: '#ffd24a', stroke: { on: true, color: '#c2185b', w: 0.1 }, shadow: { on: true } } },
  { name: 'Marker', text: { font: 'Permanent Marker', weight: 400, size: 0.07, color: '#ffffff', stroke: { on: false }, shadow: { on: true } } },
  { name: 'Elegant', text: { font: 'Playfair Display', weight: 700, size: 0.058, color: '#fff7ea', stroke: { on: false }, shadow: { on: true } } },
  { name: 'Comic', text: { font: 'Bangers', weight: 400, size: 0.08, color: '#ffe14a', spacing: 0.03, stroke: { on: true, color: '#1a1a1a', w: 0.18 }, shadow: { on: true, y: 0.09, blur: 0 } } },
  { name: 'Handwritten', text: { font: 'Caveat', weight: 700, size: 0.075, color: '#fff3c4', stroke: { on: false }, shadow: { on: true } } },
  { name: 'Tag', text: { font: 'Space Grotesk', weight: 600, size: 0.042, color: '#0b0f14', stroke: { on: false }, shadow: { on: false }, bg: { on: true, color: '#7cf5c8', a: 1, pad: 0.45, radius: 0.5 } } },
  { name: 'Warning', text: { font: 'Archivo Black', weight: 400, size: 0.06, color: '#111111', upper: true, stroke: { on: false }, shadow: { on: false }, bg: { on: true, color: '#ffd400', a: 1, pad: 0.3, radius: 0.12 } } },
  // ---- caption-first looks (added in v4)
  { name: 'Hormozi', text: { font: 'Montserrat', weight: 800, size: 0.066, color: '#ffffff', upper: true, stroke: { on: true, color: '#000000', w: 0.22 }, shadow: { on: true }, hl: { on: true, color: '#ffd400' } } },
  { name: 'Karaoke', text: { font: 'Poppins', weight: 700, size: 0.05, color: '#ffffff', stroke: { on: false }, shadow: { on: false }, bg: { on: true, color: '#0b0f14', a: 0.78, pad: 0.4, radius: 0.35 }, hl: { on: true, color: '#7cf5c8' } } },
  { name: 'Subtitle', text: { font: 'Inter', weight: 700, size: 0.04, color: '#ffffff', stroke: { on: false }, shadow: { on: false }, bg: { on: true, color: '#000000', a: 0.6, pad: 0.28, radius: 0.1 } } },
  { name: 'Street', text: { font: 'Oswald', weight: 700, size: 0.074, color: '#ffffff', upper: true, spacing: 0.02, stroke: { on: true, color: '#000000', w: 0.18 }, shadow: { on: true }, hl: { on: true, color: '#ff3b30' } } },
  { name: 'Soft Glow', text: { font: 'Poppins', weight: 700, size: 0.052, color: '#ffffff', stroke: { on: false }, shadow: { on: false }, glow: { on: true, color: '#ffffff', amt: 0.75 } } },
  { name: 'Minimal', text: { font: 'Space Grotesk', weight: 600, size: 0.038, color: '#ffffff', stroke: { on: false }, shadow: { on: true, blur: 0.35 } } },
  { name: 'Pop Outline', text: { font: 'Archivo Black', weight: 400, size: 0.066, color: '#ffffff', upper: true, stroke: { on: true, color: '#7c5cff', w: 0.24 }, shadow: { on: true, y: 0.08, blur: 0 }, hl: { on: true, color: '#ffe24a' } } },
];

export function mergeText(base, patch) {
  const out = { ...base, ...patch };
  for (const k of ['stroke', 'shadow', 'bg', 'glow', 'hl']) out[k] = { ...base[k], ...(patch[k] || {}) };
  return out;
}

const cache = new Map();
let lastTrim = 0;

function wrap(ctx, text, maxW) {
  const lines = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push([]); continue; }
    let cur = [];
    for (const w of words) {
      const test = [...cur, w].join(' ');
      if (cur.length && ctx.measureText(test).width > maxW) { lines.push(cur); cur = [w]; } else cur.push(w);
    }
    lines.push(cur);
  }
  return lines;
}

/**
 * Render a text clip. `scaleH` = pixel height of the output canvas (so text is crisp at any resolution).
 * extra: {type: 0..1 typewriter progress, words: 0..1 word reveal, active: index of highlighted word, time}
 */
export function renderText(clip, scaleH, scaleW, extra = {}) {
  const T = clip.text;
  const px = Math.max(8, Math.round(T.size * scaleH));
  const typeP = extra.type == null ? 1 : extra.type;
  const wordsP = extra.words == null ? 1 : extra.words;
  const active = T.hl?.on && clip.words ? extra.active ?? -1 : -1;
  const key = JSON.stringify([T, px, scaleW, typeP < 1 ? Math.round(typeP * 200) : 1, wordsP < 1 ? Math.round(wordsP * 100) : 1, active, clip.words ? 1 : 0]);
  let hit = cache.get(key);
  if (hit) { hit.used = performance.now(); return hit; }

  let content = T.content || '';
  if (T.upper) content = content.toUpperCase();
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = `${T.italic ? 'italic ' : ''}${T.weight} ${px}px "${T.font}", Inter, system-ui, sans-serif`;
  ctx.font = font;
  try { ctx.letterSpacing = `${(T.spacing || 0) * px}px`; } catch {}
  const maxW = Math.max(px * 2, T.maxW * scaleW);
  const lines = wrap(ctx, content, maxW);
  // typewriter / word reveal limits
  const allWords = lines.flat();
  const totalChars = content.replace(/\s/g, '').length;
  let charsLeft = typeP < 1 ? Math.floor(totalChars * typeP) : Infinity;
  const wordsShown = wordsP < 1 ? Math.max(1, Math.ceil(allWords.length * wordsP)) : Infinity;
  const lh = px * T.lineH;
  const spaceW = ctx.measureText(' ').width;
  const lineW = lines.map((l) => (l.length ? ctx.measureText(l.join(' ')).width : 0));
  const textW = Math.max(...lineW, px);
  const textH = lh * Math.max(1, lines.length);
  const pad = px * (T.bg?.on ? T.bg.pad : 0.1);
  const strokeW = T.stroke?.on ? T.stroke.w * px : 0;
  const glowPad = T.glow?.on ? px * 1.2 : 0;
  const shadowPad = T.shadow?.on ? px * (T.shadow.blur + Math.abs(T.shadow.y) + Math.abs(T.shadow.x) + 0.1) : 0;
  const m = Math.ceil(Math.max(glowPad, shadowPad, strokeW) + px * 0.15);
  const W = Math.ceil(textW + pad * 2 + m * 2);
  const H = Math.ceil(textH + pad * 2 + m * 2);
  c.width = W; c.height = H;
  ctx.font = font;
  try { ctx.letterSpacing = `${(T.spacing || 0) * px}px`; } catch {}
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  if (T.bg?.on) {
    ctx.save();
    ctx.globalAlpha = T.bg.a;
    ctx.fillStyle = T.bg.color;
    ctx.beginPath();
    ctx.roundRect(m, m, W - m * 2, H - m * 2, Math.min((H - m * 2) / 2, T.bg.radius * px));
    ctx.fill();
    ctx.restore();
  }
  const cx = W / 2;
  let wi = 0;
  const drawLines = (pass) => {
    wi = 0; let cl = charsLeft;
    lines.forEach((l, li) => {
      const y = m + pad + lh * li + lh / 2;
      const lw = lineW[li];
      let x = T.align === 'left' ? m + pad : T.align === 'right' ? W - m - pad - lw : cx - lw / 2;
      l.forEach((w) => {
        const ww = ctx.measureText(w).width;
        let drawW = w;
        let alpha = 1;
        if (wi >= wordsShown) alpha = 0;
        if (cl !== Infinity) { if (cl <= 0) alpha = 0; else if (cl < w.length) drawW = w.slice(0, cl); cl -= w.length; }
        if (alpha > 0) {
          const isActive = wi === active;
          if (pass === 'stroke') { if (strokeW) { ctx.lineWidth = strokeW * 2; ctx.strokeStyle = T.stroke.color; ctx.strokeText(drawW, x, y); } }
          else {
            ctx.fillStyle = isActive ? T.hl.color : T.color;
            ctx.fillText(drawW, x, y);
          }
        }
        x += ww + spaceW;
        wi++;
      });
    });
  };
  ctx.textAlign = 'left';
  // glow
  if (T.glow?.on) {
    ctx.save(); ctx.shadowColor = T.glow.color; ctx.shadowBlur = px * 0.9 * T.glow.amt; ctx.globalAlpha = 0.95;
    ctx.fillStyle = T.glow.color; drawLines('fill'); drawLines('fill'); ctx.restore();
  }
  // shadow + stroke + fill
  if (T.shadow?.on) { ctx.save(); ctx.shadowColor = `rgba(0,0,0,${T.shadow.a})`; ctx.shadowBlur = T.shadow.blur * px; ctx.shadowOffsetX = T.shadow.x * px; ctx.shadowOffsetY = T.shadow.y * px; if (strokeW) drawLines('stroke'); else drawLines('fill'); ctx.restore(); }
  if (strokeW) drawLines('stroke');
  drawLines('fill');

  hit = { canvas: c, w: W, h: H, version: key, used: performance.now() };
  cache.set(key, hit);
  if (cache.size > 120 && performance.now() - lastTrim > 500) {
    lastTrim = performance.now();
    const arr = [...cache.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < arr.length - 80; i++) cache.delete(arr[i][0]);
  }
  return hit;
}

export function renderSticker(clip, scaleH) {
  const S = clip.sticker;
  const px = Math.max(16, Math.round((S.size || 0.18) * scaleH));
  const key = JSON.stringify([S, px]);
  let hit = cache.get(key);
  if (hit) { hit.used = performance.now(); return hit; }
  const pad = Math.ceil(px * 0.14);
  const c = document.createElement('canvas');
  c.width = c.height = px + pad * 2;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  if (S.emoji) {
    ctx.font = `${Math.round(px * 0.82)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(S.emoji, 0, px * 0.04);
  } else {
    const fn = SHAPES[S.shape] || SHAPES.star;
    fn(ctx, px);
    if (S.shape === 'ring') { ctx.lineWidth = px * 0.1; ctx.strokeStyle = S.color || '#fff'; ctx.stroke(); }
    else {
      ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = px * 0.06; ctx.shadowOffsetY = px * 0.02;
      ctx.fillStyle = S.color || '#ffd24a'; ctx.fill();
      ctx.shadowColor = 'transparent';
      if (S.stroke) { ctx.lineWidth = px * 0.05; ctx.strokeStyle = S.stroke; ctx.stroke(); }
    }
  }
  hit = { canvas: c, w: c.width, h: c.height, version: key, used: performance.now() };
  cache.set(key, hit);
  return hit;
}

export async function loadFonts(list = FONTS) {
  if (!document.fonts) return;
  await Promise.all(list.map((f) => document.fonts.load(`${f.w} 40px "${f.id}"`).catch(() => {})));
}
