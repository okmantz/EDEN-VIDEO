import { api } from './api.js';
import { $, esc, icon, fmtDur, plural } from './ui.js';
import { dropzoneHtml, wireDropzone } from './dropzone.js';
import { syncGrid, wireGrid } from './videocard.js';

export async function home(root, ctx) {
  const [stats, videos] = await Promise.all([api('/stats'), api('/videos')]);
  const s = ctx.settings;
  const name = (s.display_name || '').trim();
  const brandReady = !!(s.brand_name || s.logo_url || s.brand_handle);
  const recent = videos.filter((v) => v.status === 'done').slice(0, 4);

  root.innerHTML = `
    <section class="hero">
      <span class="eyebrow">${name ? `Welcome back, ${esc(name)}` : 'One-click editor'}</span>
      <h1 class="h-display">Upload a video.<br>Get a finished edit.</h1>
      <p class="lede">Eden cuts the pauses and filler words, adds captions, quiet background music and b-roll, and puts your brand on it. One click.</p>
      ${dropzoneHtml(ctx)}
      <div class="promise" aria-label="What Eden does">
        <div><span class="pi">${icon('scissors')}</span><div><b>Cuts the dead air</b>Pauses, ums and stutters, tuned to your audio.</div></div>
        <div><span class="pi">${icon('captions')}</span><div><b>Captions that pop</b>11 looks, in your brand colors.</div></div>
        <div><span class="pi">${icon('music')}</span><div><b>Quiet music</b>A soft bed that ducks under your voice.</div></div>
        <div><span class="pi">${icon('image')}</span><div><b>Relevant b-roll</b>Your clips, stock footage or keyword cards.</div></div>
      </div>
    </section>

    ${brandReady ? '' : `<div class="onboard">
      <div class="sw"><i style="background:${esc(s.brand_color)}"></i><i style="background:#fff"></i><i style="background:#14181f"></i></div>
      <div class="t"><b>Make every video look like yours</b><span>Add your brand name, colors, font and logo once. Eden applies them to every edit.</span></div>
      <a class="btn ghost" href="#/brand">${icon('palette')}Set up brand kit</a></div>`}

    ${stats.videos ? `<div class="totals" aria-label="Your totals">
      <div><b>${stats.videos}</b>${plural(stats.videos, 'video')} finished</div>
      <div><b>${fmtDur(stats.time_saved)}</b>of dead air removed</div>
      <div><b>${stats.fillers_removed}</b>filler words cut</div></div>` : ''}

    ${recent.length ? `<div class="section-title"><h2 class="h-sec">Recently finished</h2><a class="lnk small" href="#/saved">See all</a></div>
      <div class="vgrid" id="recent"></div>` : ''}`;

  const stop = wireDropzone(root);
  if (recent.length) {
    const grid = $('#recent', root);
    syncGrid(grid, recent);
    wireGrid(grid, { getVideo: (id) => recent.find((v) => v.id === id), onChange: () => ctx.navigate() });
  }
  return stop;
}
