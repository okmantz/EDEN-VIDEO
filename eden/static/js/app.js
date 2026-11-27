// EDEN VIDEO - app shell and hash router.
import { api } from './api.js';
import { $, esc, icon, applyTheme, initTheme, toggleTheme } from './ui.js';
import { home } from './home.js';
import { create } from './create.js';
import { edit } from './editor.js';
import { saved } from './saved.js';
import { library } from './library.js';
import { music } from './music.js';
import { brand } from './brand.js';
import { settings } from './settings.js';

// `group` puts a quiet label above a run of links; `opt` hides a link in the compact mobile bar.
const ROUTES = {
  '': { title: 'Home', icon: 'home', page: home },
  create: { title: 'Create', icon: 'create', page: create },
  saved: { title: 'Videos', icon: 'film', page: saved },
  brand: { title: 'Brand kit', icon: 'palette', page: brand, group: 'Your brand' },
  music: { title: 'Music', icon: 'music', page: music },
  library: { title: 'B-roll', icon: 'layers', page: library, opt: true },
  settings: { title: 'Settings', icon: 'settings', page: settings, group: 'Setup' },
};

const ctx = { meta: null, health: null, settings: null, maxUploadMb: 0, navigate: () => render(), refreshBrand: () => drawBrandCard() };
let cleanup = null;
let navToken = 0;

function drawNav(active, processing = 0) {
  $('#nav').innerHTML = Object.entries(ROUTES).map(([key, r]) => `${r.group ? `<div class="nav-label">${esc(r.group)}</div>` : ''}
    <a href="#/${key}" class="${r.opt ? 'opt' : ''}" ${key === active ? 'aria-current="page"' : ''}>${icon(r.icon)}<span>${esc(r.title)}</span>
      ${key === 'saved' && processing ? `<span class="badge" title="Processing">${processing}</span>` : ''}</a>`).join('');
}

export function drawBrandCard() {
  const s = ctx.settings || {};
  const el = $('#railBrand');
  if (!el) return;
  const name = (s.brand_name || '').trim();
  const mark = s.logo_url ? `<img src="${esc(s.logo_url)}" alt="">` : esc((name || 'E').slice(0, 1).toUpperCase());
  el.innerHTML = `<span class="bc-mark">${mark}</span><span class="bc-text"><b>${esc(name || 'Set up your brand')}</b><span>${name ? 'Brand kit' : 'Colors, logo, fonts'}</span></span>`;
  applyTheme(s);
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
  const route = seg === 'edit' ? { title: 'Fine-tune', page: edit } : (ROUTES[seg] || ROUTES['']);
  const key = seg === 'edit' ? 'saved' : (ROUTES[seg] ? seg : '');
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

function showSetupBanner() {
  const h = ctx.health;
  let msg = '';
  if (!h.ffmpeg) {
    msg = `<b>One thing left to set up: FFmpeg.</b> Eden needs it to edit videos.${h.ffmpeg_fix
      ? ` Run this in a terminal, then restart Eden: <code>${esc(h.ffmpeg_fix)}</code>` : ' Install it, then restart Eden.'}`;
  } else if (h.captions_ok === false) {
    msg = '<b>This FFmpeg cannot draw captions.</b> Install a full FFmpeg build (libass) to get burned-in captions.';
  }
  const el = $('#setupBanner');
  if (!el) return;
  el.hidden = !msg;
  el.innerHTML = msg;
}

async function boot() {
  initTheme();
  try {
    [ctx.meta, ctx.health, ctx.settings] = await Promise.all([api('/meta'), api('/health'), api('/settings')]);
  } catch (err) {
    $('#view').innerHTML = `<div class="empty-state"><h2>Eden could not start</h2><p>${esc(err.message)}</p></div>`;
    return;
  }
  ctx.maxUploadMb = ctx.meta.max_upload_mb || 0;
  const themeIcon = () => (document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun');
  $('#railFoot').innerHTML = `<span>v${esc(ctx.meta.version)}</span><button class="theme-btn" id="themeBtn" aria-label="Switch light or dark theme" title="Light / dark">${icon(themeIcon())}</button>`;
  $('#themeBtn').addEventListener('click', () => { toggleTheme(ctx.settings); $('#themeBtn').innerHTML = icon(themeIcon()); });
  drawBrandCard();
  showSetupBanner();
  window.addEventListener('hashchange', render);
  setInterval(refreshBadge, 5000);
  render();
}
boot();
