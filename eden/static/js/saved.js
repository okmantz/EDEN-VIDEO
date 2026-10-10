import { api } from './api.js';
import { $, $$, esc, icon, debounce } from './ui.js';
import { syncGrid, wireGrid, IN_FLIGHT } from './videocard.js';

const FILTERS = [['all', 'All'], ['done', 'Ready'], ['active', 'Processing'], ['issue', 'Needs attention']];

export async function saved(root, ctx) {
  const state = { q: '', platform: '', status: 'all' };
  root.innerHTML = `
    <div class="page-head"><div><h1 class="h-page">Saved videos</h1>
      <p>Everything Eden has made. Play it, download it, or edit it again.</p></div>
      <a class="btn" href="#/create">${icon('plus')}Create a video</a></div>
    <div class="toolbar">
      <input class="grow" type="search" id="q" placeholder="Search by title" aria-label="Search by title">
      <select id="plat" aria-label="Platform"><option value="">All platforms</option>
        ${ctx.meta.platforms.map((p) => `<option value="${esc(p.key)}">${esc(p.label)}</option>`).join('')}</select>
      <div class="seg" id="status" role="group" aria-label="Status">${FILTERS.map(([k, l]) => `<button type="button" data-val="${k}" aria-pressed="${k === 'all'}">${l}</button>`).join('')}</div>
    </div>
    <div class="vgrid" id="grid"></div>
    <div id="empty"></div>`;
  const grid = $('#grid', root), empty = $('#empty', root);
  let all = [], timer, stopped = false;

  const visible = () => all.filter((v) =>
    (!state.q || v.title.toLowerCase().includes(state.q)) &&
    (!state.platform || v.platform === state.platform) &&
    (state.status === 'all' || (state.status === 'done' && v.status === 'done') ||
      (state.status === 'active' && IN_FLIGHT.has(v.status)) ||
      (state.status === 'issue' && (v.status === 'failed' || v.status === 'cancelled'))));

  function draw() {
    const list = visible();
    syncGrid(grid, list);
    if (list.length) { empty.innerHTML = ''; return; }
    empty.innerHTML = all.length
      ? `<div class="empty-state"><h2>No videos match</h2><p>Try a different search or filter.</p></div>`
      : `<div class="empty-state"><h2>Nothing saved yet</h2><p>Upload a video and Eden will turn it into a finished edit. Your results will appear here.</p>
         <a class="btn" href="#/create">${icon('upload')}Create your first video</a></div>`;
  }
  async function load() {
    if (stopped) return;
    try {
      all = await api('/videos');
      draw();
      clearTimeout(timer);
      if (all.some((v) => IN_FLIGHT.has(v.status))) timer = setTimeout(load, 1500);
    } catch { timer = setTimeout(load, 4000); }
  }
  wireGrid(grid, { getVideo: (id) => all.find((v) => v.id === id), onChange: load });
  $('#q', root).addEventListener('input', debounce((e) => { state.q = e.target.value.trim().toLowerCase(); draw(); }, 150));
  $('#plat', root).addEventListener('change', (e) => { state.platform = e.target.value; draw(); });
  $('#status', root).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.status = b.dataset.val;
    $$('#status button', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  await load();
  return () => { stopped = true; clearTimeout(timer); };
}
