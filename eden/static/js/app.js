// EDEN VIDEO - app shell and hash router.
import { api } from './api.js';
import { $, esc, icon, toast } from './ui.js';
import { home } from './home.js';
import { create } from './create.js';
import { saved } from './saved.js';
import { library } from './library.js';
import { settings } from './settings.js';

const ROUTES = {
  '': { title: 'Home', icon: 'home', page: home },
  create: { title: 'Create', icon: 'create', page: create },
  saved: { title: 'Saved videos', icon: 'film', page: saved },
  library: { title: 'B-roll library', icon: 'layers', page: library },
  settings: { title: 'Settings', icon: 'settings', page: settings },
};

const ctx = { meta: null, health: null, settings: null, maxUploadMb: 0, navigate: () => render() };
let cleanup = null;
let navToken = 0;

function drawNav(active, processing = 0) {
  $('#nav').innerHTML = Object.entries(ROUTES).map(([key, r]) => `
    <a href="#/${key}" ${key === active ? 'aria-current="page"' : ''}>${icon(r.icon)}<span>${esc(r.title)}</span>
      ${key === 'saved' && processing ? `<span class="badge" title="Processing">${processing}</span>` : ''}</a>`).join('');
}

async function refreshBadge() {
  try {
    const s = await api('/stats');
    const active = (location.hash.replace(/^#\/?/, '').split('/')[0]) || '';
    drawNav(ROUTES[active] ? active : '', s.processing);
  } catch { /* the page itself will report connection problems */ }
}

async function render() {
  const token = ++navToken;
  const [seg, ...params] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  const route = ROUTES[seg] || ROUTES[''];
  const key = ROUTES[seg] ? seg : '';
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
  cleanup = null;
  drawNav(key);
  document.title = `${route.title} · EDEN VIDEO`;
  const view = $('#view');
  const page = document.createElement('div');
  view.replaceChildren(page);
  window.scrollTo(0, 0);
  try {
    const result = await route.page(page, ctx, params);
    if (token !== navToken) { if (typeof result === 'function') result(); return; }
    cleanup = result;
  } catch (err) {
    if (token !== navToken) return;
    page.innerHTML = `<div class="empty-state"><h2>Something went wrong</h2><p>${esc(err.message)}</p>
      <button class="btn" onclick="location.reload()">${icon('refresh')}Reload</button></div>`;
  }
  refreshBadge();
}

async function boot() {
  try {
    [ctx.meta, ctx.health, ctx.settings] = await Promise.all([api('/meta'), api('/health'), api('/settings')]);
  } catch (err) {
    $('#view').innerHTML = `<div class="empty-state"><h2>Eden could not start</h2><p>${esc(err.message)}</p></div>`;
    return;
  }
  ctx.maxUploadMb = ctx.meta.max_upload_mb || 0;
  $('#railFoot').innerHTML = `<b>EDEN VIDEO</b><br>A Professional Video Editing Software<br>v${esc(ctx.meta.version)}`;
  if (!ctx.health.ffmpeg) toast('FFmpeg was not found. Install it, then restart Eden.', 'err');
  window.addEventListener('hashchange', render);
  setInterval(refreshBadge, 5000);
  render();
}
boot();
