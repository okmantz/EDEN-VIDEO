// Music & sounds library: background tracks and short sound effects.
import { api, uploadFile } from './api.js';
import { $, esc, icon, fmtDur, toast, confirmDialog } from './ui.js';

const ACCEPT = 'audio/*,.mp3,.wav,.m4a,.ogg,.oga,.flac,.aac,.wma';

function section(kind, title, blurb, emptyBlurb) {
  return `
    <section class="panel" style="margin-bottom:22px" aria-label="${esc(title)}">
      <div class="page-head" style="margin-bottom:6px"><div><h2 class="h-sec">${esc(title)}</h2>
        <p>${blurb}</p></div>
        <label class="btn" style="cursor:pointer">${icon('upload')}Add<input type="file" data-add="${kind}" accept="${ACCEPT}" multiple hidden></label></div>
      <div data-busy="${kind}"></div>
      <div class="tracks" data-list="${kind}"></div>
      <div data-empty="${kind}"></div>
    </section>`;
}

export async function music(root, ctx) {
  root.innerHTML = `
    <div class="page-head"><div><h1 class="h-page">Music & sounds</h1>
      <p>Your own tracks and effects. Eden never generates audio — everything here is a file you uploaded.</p></div></div>
    ${section('music', 'Background music',
      'Longer tracks Eden can lay under a video. It ducks the music under your voice automatically, so speech always stays on top.',
      'No music yet. Add an MP3 or WAV you have the rights to use — lo-fi beds and acoustic tracks work well under talking.')}
    ${section('sfx', 'Sound effects',
      'Short sounds for accents: a <b>whoosh</b> on punch-in zooms, a <b>pop</b> on emphasized caption words. Pick them when you create a video.',
      'No sound effects yet. Add short whooshes, pops or risers (a second or two each).')}`;

  async function load(kind, emptyBlurb) {
    const items = await api(`/${kind}`);
    const list = $(`[data-list="${kind}"]`, root), empty = $(`[data-empty="${kind}"]`, root);
    list.innerHTML = items.map((t) => `
      <div class="track" data-id="${esc(t.id)}">
        <span class="tico">${icon(kind === 'music' ? 'music' : 'volume')}</span>
        <div class="tbody"><b title="${esc(t.name)}">${esc(t.name)}</b><span class="muted small">${fmtDur(t.duration)}</span>
          <audio controls preload="none" src="${esc(t.file_url)}" style="width:100%;margin-top:6px"></audio></div>
        <input type="text" value="${esc(t.name)}" aria-label="Name for ${esc(t.name)}" data-name style="max-width:180px">
        <button class="icon-btn danger" data-del aria-label="Delete ${esc(t.name)}">${icon('trash')}</button>
      </div>`).join('');
    empty.innerHTML = items.length ? '' : `<div class="empty-state"><h2>Nothing here yet</h2><p>${emptyBlurb}</p></div>`;
  }
  const loadAll = () => Promise.all([
    load('music', 'No music yet. Add an MP3 or WAV you have the rights to use.'),
    load('sfx', 'No sound effects yet. Add short whooshes, pops or risers.'),
  ]);

  root.addEventListener('change', async (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const kind = add.dataset.add, files = [...add.files];
      add.value = '';
      const busy = $(`[data-busy="${kind}"]`, root);
      for (const [i, f] of files.entries()) {
        busy.innerHTML = `<div class="notice" style="margin-bottom:14px">${icon('upload')}<div>Uploading ${esc(f.name)} (${i + 1} of ${files.length})…</div></div>`;
        try { await uploadFile(`/${kind}`, f, {}); }
        catch (err) { toast(`${f.name}: ${err.message}`, 'err'); }
      }
      busy.innerHTML = '';
      if (files.length) toast(files.length === 1 ? 'Added' : `${files.length} added`);
      load(kind);
      return;
    }
    const nm = e.target.closest('[data-name]');
    if (nm) {
      const card = nm.closest('.track'), kind = card.closest('section').querySelector('[data-add]').dataset.add;
      try { await api(`/${kind}/${card.dataset.id}`, { method: 'PATCH', body: { name: nm.value } }); toast('Renamed'); }
      catch (err) { toast(err.message, 'err'); }
    }
  });
  root.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]'); if (!del) return;
    const card = del.closest('.track'), kind = card.closest('section').querySelector('[data-add]').dataset.add;
    const ok = await confirmDialog({ title: 'Delete this sound?', body: 'Videos you have already made are not affected.' });
    if (!ok) return;
    try { await api(`/${kind}/${card.dataset.id}`, { method: 'DELETE' }); toast('Deleted'); load(kind); }
    catch (err) { toast(err.message, 'err'); }
  });
  await loadAll();
}
