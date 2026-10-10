import { api } from './api.js';
import { $, esc, icon, fmtDur, plural } from './ui.js';
import { syncGrid, wireGrid } from './videocard.js';

// One illustrative clip: speech, pauses and "um"s. Weights are relative durations.
const CLIP = [['s', 8], ['f', 1.1], ['s', 6], ['g', 5], ['s', 10], ['f', 1], ['s', 7], ['g', 6.5], ['s', 8], ['f', 1.2], ['s', 9], ['g', 4], ['s', 7]];
const RAW_SECONDS = 134;

function bars(n, seed, cls = '') {
  let x = seed, out = '';
  for (let i = 0; i < n; i++) {
    x = (x * 9301 + 49297) % 233280;
    const h = 22 + Math.round((x / 233280) * 68);
    out += `<i style="height:${h}%"></i>`;
  }
  return out;
}

function timeline() {
  const total = CLIP.reduce((a, [, w]) => a + w, 0);
  const keep = CLIP.filter(([t]) => t === 's').reduce((a, [, w]) => a + w, 0);
  const edited = Math.round(RAW_SECONDS * keep / total);
  const blocks = CLIP.map(([t, w], i) => {
    const sec = (w / total) * RAW_SECONDS;
    const style = `flex-grow:${w}; flex-basis:0`;
    if (t === 's') return `<div class="blk speech" style="${style}">${bars(Math.round(w * 2.2), i * 7 + 3)}</div>`;
    if (t === 'f') return `<div class="blk filler" style="${style}"><span class="tag">um</span>${bars(3, i * 5 + 1)}</div>`;
    return `<div class="blk gap" style="${style}"><span class="tag">${sec.toFixed(1)}s</span></div>`;
  }).join('');
  return { html: blocks, raw: RAW_SECONDS, edited };
}

export async function home(root, ctx) {
  const [stats, videos] = await Promise.all([api('/stats'), api('/videos')]);
  const tl = timeline();
  const name = ctx.settings.display_name;
  const recent = videos.filter((v) => v.status === 'done').slice(0, 4);
  root.innerHTML = `
    <section class="hero">
      <div>
        ${name ? `<p class="muted" style="margin-bottom:12px">Welcome back, ${esc(name)}.</p>` : ''}
        <h1 class="h-display">Drop in raw footage.<br>Get a finished edit.</h1>
      </div>
      <p class="lede">Eden cuts the silence and the ums, adds captions and cutaways, and exports a version for every platform you post to.</p>
      <div class="hero-actions">
        <a class="btn lg" href="#/create">${icon('upload')}Create a video</a>
        <a class="btn ghost lg" href="#/saved">${icon('film')}Saved videos</a>
      </div>
    </section>

    <section class="tl-wrap" aria-label="Example of an automatic edit">
      <div class="tl-top">
        <div class="tl-times"><div class="before">Raw footage <span class="tc">${fmtDur(tl.raw)}</span></div>
          <div class="after">Edited <span class="tc">${fmtDur(tl.edited)}</span></div></div>
      </div>
      <div class="tl" id="tl" role="img" aria-label="A timeline where pauses and filler words collapse, leaving only speech">${tl.html}</div>
      <div class="tl-legend">
        <span><i class="l-s"></i>Speech kept</span><span><i class="l-g"></i>Pause removed</span><span><i class="l-f"></i>Filler word removed</span>
        <button class="btn ghost sm" id="replay">${icon('refresh')}Replay</button>
      </div>
    </section>

    ${stats.videos ? `<div class="totals" aria-label="Your totals">
      <div><b>${stats.videos}</b>${plural(stats.videos, 'video')} finished</div>
      <div><b>${fmtDur(stats.time_saved)}</b>of dead air removed</div>
      <div><b>${stats.fillers_removed}</b>filler words cut</div></div>` : ''}

    <div class="steps">
      <div class="step"><div class="n">1</div><h3>Upload your video</h3><p>Drag in a short clip or a long recording. MP4, MOV, MKV and WebM all work.</p></div>
      <div class="step"><div class="n">2</div><h3>Pick a style and platforms</h3><p>Choose how it should feel, then tick Instagram, TikTok, Facebook or YouTube.</p></div>
      <div class="step"><div class="n">3</div><h3>Download the results</h3><p>Each platform gets its own correctly framed, captioned video, usually in a few minutes.</p></div>
    </div>

    ${recent.length ? `<div class="section-title"><h2 class="h-sec">Recently finished</h2><a class="muted small" href="#/saved">See all</a></div>
      <div class="vgrid" id="recent"></div>` : ''}
  `;

  const el = $('#tl', root);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer;
  const play = () => {
    el.classList.remove('is-cut');
    clearTimeout(timer);
    if (reduce) { el.classList.add('is-cut'); return; }
    timer = setTimeout(() => el.classList.add('is-cut'), 900);
  };
  play();
  $('#replay', root).addEventListener('click', () => { el.classList.remove('is-cut'); void el.offsetWidth; play(); });

  if (recent.length) {
    const grid = $('#recent', root);
    syncGrid(grid, recent);
    wireGrid(grid, { getVideo: (id) => recent.find((v) => v.id === id), onChange: () => ctx.navigate() });
  }
  return () => clearTimeout(timer);
}
