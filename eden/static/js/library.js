import { api, uploadFile } from './api.js';
import { $, $$, esc, icon, fmtDur, toast, confirmDialog } from './ui.js';

export async function library(root, ctx) {
  root.innerHTML = `
    <div class="page-head"><div><h1 class="h-page">B-roll library</h1>
      <p>Cutaway clips Eden can drop in while you talk. Tag a clip with words like <b>coffee, office</b> and Eden cuts to it when you say them. Untagged clips fill long stretches of talking.</p></div>
      <label class="btn" style="cursor:pointer">${icon('upload')}Add clips<input type="file" id="add" accept="video/*,.mp4,.mov,.m4v,.mkv,.webm" multiple hidden></label></div>
    <div id="busy"></div>
    <div class="clips" id="clips"></div>
    <div id="empty"></div>`;
  const grid = $('#clips', root), empty = $('#empty', root), busy = $('#busy', root);

  async function load() {
    const clips = await api('/broll');
    grid.innerHTML = clips.map((c) => `<article class="clip" data-id="${esc(c.id)}">
      <div class="th" style="${c.thumb_url ? `background-image:url('${esc(c.thumb_url)}')` : ''}"><span class="tc">${fmtDur(c.duration)}</span></div>
      <div class="body"><b title="${esc(c.name)}">${esc(c.name)}</b>
        <input type="text" value="${esc(c.tags)}" placeholder="Tags, separated by commas" aria-label="Tags for ${esc(c.name)}" data-tags>
        <div class="foot"><span>${c.width}×${c.height}</span>
          <button class="icon-btn danger" data-del aria-label="Delete ${esc(c.name)}">${icon('trash')}</button></div></div></article>`).join('');
    empty.innerHTML = clips.length ? '' : `<div class="empty-state"><h2>No B-roll yet</h2>
      <p>Add short clips of your product, your workspace, screen recordings or anything that supports what you say. Eden works without them too, using punch-in zooms. If you add a free Pexels key in Settings, it can also fetch stock footage.</p></div>`;
  }

  $('#add', root).addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const [i, f] of files.entries()) {
      busy.innerHTML = `<div class="notice" style="margin-bottom:18px">${icon('upload')}<div>Uploading ${esc(f.name)} (${i + 1} of ${files.length})…</div></div>`;
      try { await uploadFile('/broll', f, {}); }
      catch (err) { toast(`${f.name}: ${err.message}`, 'err'); }
    }
    busy.innerHTML = '';
    if (files.length) toast(files.length === 1 ? 'Clip added' : `${files.length} clips added`);
    load();
  });
  grid.addEventListener('change', async (e) => {
    const input = e.target.closest('[data-tags]'); if (!input) return;
    const id = input.closest('.clip').dataset.id;
    try { await api(`/broll/${id}`, { method: 'PATCH', body: { tags: input.value } }); toast('Tags saved'); }
    catch (err) { toast(err.message, 'err'); }
  });
  grid.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]'); if (!del) return;
    const card = del.closest('.clip');
    const ok = await confirmDialog({ title: 'Delete this clip?', body: 'Videos you have already made are not affected.' });
    if (!ok) return;
    try { await api(`/broll/${card.dataset.id}`, { method: 'DELETE' }); toast('Clip deleted'); load(); }
    catch (err) { toast(err.message, 'err'); }
  });
  await load();
}
