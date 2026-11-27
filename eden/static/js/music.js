// Music & sounds library: background tracks and short sound effects.
import { api, uploadFile } from './api.js';
import { $, $$, esc, icon, fmtDur, toast, confirmDialog } from './ui.js';

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
      <p>Eden includes royalty-free background tracks, and you can add your own. Music always ducks under your voice.</p></div></div>
    <section class="panel" style="margin-bottom:22px" aria-label="Built-in tracks">
      <div class="panel-head"><div><h2 class="h-sec">Built-in tracks</h2><p>Made by Eden, free to use in anything you post. Seamless loops that fit under speech.</p></div><span class="pill accent">${icon('sparkle', 'width="13" height="13"')}Included</span></div>
      <div class="bgrid" id="builtin"></div><audio id="aud" preload="none" hidden></audio>
    </section>
    ${section('music', 'Your music',
      'Tracks you upload. Pick them when you edit a video. Only add music you have the rights to use.',
      'No music yet. Add an MP3 or WAV you have the rights to use.')}
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
  // built-in tracks with a play button each
  const aud = $('#aud', root);
  try {
    const list = await api('/music/builtin');
    $('#builtin', root).innerHTML = list.map((t) => `<div class="btrack"><button class="pbtn" type="button" data-bplay="${esc(t.key)}" aria-label="Play ${esc(t.label)}">${icon('play')}</button>
      <div><b>${esc(t.label)}</b><small>${esc(t.mood)} · ${t.bpm} BPM · ${esc(t.blurb)}</small></div><span class="pill">${fmtDur(t.duration)}</span></div>`).join('');
  } catch (err) { $('#builtin', root).innerHTML = `<p class="muted small">${esc(err.message)}</p>`; }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bplay]'); if (!b) return;
    const key = b.dataset.bplay;
    $$('[data-bplay]', root).forEach((x) => { x.innerHTML = icon('play'); });
    if (!aud.paused && aud.dataset.key === key) { aud.pause(); return; }
    aud.dataset.key = key; aud.src = `/api/music/builtin/${key}/file`;
    b.innerHTML = icon('pause');
    aud.play().catch(() => { b.innerHTML = icon('play'); toast('Could not play the preview.', 'err'); });
    aud.onended = () => { b.innerHTML = icon('play'); };
  });
  await loadAll();
  return () => aud.pause();
}
