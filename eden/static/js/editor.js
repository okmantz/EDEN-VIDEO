// Fine-tune editor: tweak the automatic edit, then re-render.
// Segments (keep/cut + trims) are in source time; captions and b-roll in output time.
import { api } from './api.js';
import { $, $$, esc, icon, fmtDur, toast } from './ui.js';

function splitWords(text, n) {
  const toks = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return null;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.round((i * toks.length) / n), b = Math.round(((i + 1) * toks.length) / n);
    out.push(toks.slice(a, Math.max(b, a + 1)).join(' ') || toks[Math.min(a, toks.length - 1)]);
  }
  return out;
}

export async function edit(root, ctx, params) {
  const vid = params[0];
  let plan;
  try { plan = await api(`/videos/${vid}/plan`); }
  catch (err) { root.innerHTML = `<div class="empty-state"><h2>Could not open the editor</h2><p>${esc(err.message)}</p></div>`; return; }
  const v = plan.video;
  const [musicLib, sfxLib, brollLib] = await Promise.all([api('/music'), api('/sfx'), api('/broll')]);
  const opts = plan.options || {};

  const segs = plan.segments.map(([s, e]) => ({ s, e, keep: true }));
  const dropBroll = new Set();
  const addBroll = [];

  const opt = (list, val, none) => `<option value="">${none}</option>` +
    list.map((t) => `<option value="${esc(t.id)}" ${t.id === val ? 'selected' : ''}>${esc(t.name)} (${fmtDur(t.duration)})</option>`).join('');

  root.innerHTML = `
    <div class="page-head"><div><h1 class="h-page">Fine-tune</h1>
      <p>${esc(v.title)} · ${esc(v.platform_label)}. Tweak the automatic edit, then re-render. Your original settings are kept.</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn ghost" href="#/saved">${icon('film')}Back to videos</a></div></div>
    <div class="create-grid">
      <aside class="sticky">
        <div class="player"><video controls preload="metadata" playsinline src="${esc(v.file_url)}" ${v.thumb_url ? `poster="${esc(v.thumb_url)}"` : ''}></video></div>
        <section class="panel" style="margin-top:18px" aria-labelledby="sndH">
          <div class="panel-head"><h2 class="h-sec" id="sndH">Sound for the re-render</h2></div>
          <div class="form-grid">
            <label class="field"><span>Background music</span><select id="eMusic">${opt(musicLib, opts.music_id, 'No music')}</select></label>
            <label class="field"><span>Music volume</span><input type="range" id="eMusicVol" min="0" max="100" value="${Math.round((opts.music_volume ?? 0.35) * 100)}"></label>
            <label class="field"><span>Whoosh on punch-in zooms</span><select id="eWhoosh">${opt(sfxLib, opts.whoosh_sfx_id, 'None')}</select></label>
            <label class="field"><span>Pop on emphasized words</span><select id="ePop">${opt(sfxLib, opts.pop_sfx_id, 'None')}</select></label>
          </div>
          <p class="muted small">Music is ducked under your voice automatically. Add tracks in <a href="#/music" style="color:var(--amber)">Music & sounds</a>.</p>
        </section>
      </aside>
      <div>
        <section class="panel" aria-labelledby="segH">
          <div class="panel-head"><h2 class="h-sec" id="segH">Segments</h2><p>Untick to cut a segment, or nudge the trim points. Times are in the original video.</p></div>
          <div id="segList">${segs.map(segRow).join('')}</div>
        </section>
        <section class="panel" aria-labelledby="capH">
          <div class="panel-head"><h2 class="h-sec" id="capH">Captions</h2><p>Fix any misheard words. Each line re-times to its words when you re-render.</p></div>
          <div id="capList">${plan.chunks.length ? plan.chunks.map((c) => `
            <div class="caprow"><span class="tc muted small">${fmtT(c.start)}</span>
              <textarea data-chunk="${c.chunk}" rows="1">${esc(c.text)}</textarea></div>`).join('')
            : '<p class="muted small">This video has no captions to edit.</p>'}</div>
        </section>
        <section class="panel" aria-labelledby="brH">
          <div class="panel-head"><h2 class="h-sec" id="brH">B-roll cutaways</h2><p>Untick to remove a cutaway, or add your own at an exact moment.</p></div>
          <div id="brList">${plan.broll.length ? plan.broll.map((p) => `
            <label class="segrow"><input type="checkbox" data-br="${p.index}" checked>
              <span class="tc">${fmtT(p.start)}–${fmtT(p.end)}</span><b>${esc(p.clip)}</b><span class="muted small">${esc(p.reason || '')}</span></label>`).join('')
            : '<p class="muted small">No cutaways in this edit.</p>'}</div>
          <div class="form-grid" style="margin-top:14px">
            <label class="field"><span>Cut to at (seconds)</span><input type="number" id="addAt" min="0" step="0.1" placeholder="e.g. 4.5"></label>
            <label class="field"><span>Clip</span><select id="addClip">${brollLib.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${fmtDur(c.duration)})</option>`).join('')}</select></label>
            <div class="field"><span>&nbsp;</span><button class="btn ghost sm" id="addBr" type="button">${icon('plus')}Add cutaway</button></div>
          </div>
          <div id="addList" style="margin-top:8px"></div>
        </section>
      </div>
    </div>
    <div class="actionbar"><div class="sum" id="eSum"></div><button class="btn lg" id="rerender">${icon('refresh')}Re-render with these edits</button></div>`;

  function segRow(g, i) {
    return `<div class="segrow" data-seg="${i}"><input type="checkbox" data-keep ${g.keep ? 'checked' : ''} aria-label="Keep segment ${i + 1}">
      <input type="number" data-s min="0" max="${plan.source_duration}" step="0.1" value="${g.s.toFixed(1)}" aria-label="Segment start">
      <span class="muted">→</span>
      <input type="number" data-e min="0" max="${plan.source_duration}" step="0.1" value="${g.e.toFixed(1)}" aria-label="Segment end">
      <span class="tc muted small" data-dur>${fmtDur(g.e - g.s)}</span></div>`;
  }
  function fmtT(t) { const m = Math.floor(t / 60), s = (t % 60).toFixed(1); return `${m}:${s.padStart(4, '0')}`; }

  function refresh() {
    const kept = segs.filter((g) => g.keep);
    const total = kept.reduce((a, g) => a + Math.max(0, g.e - g.s), 0);
    $('#eSum', root).innerHTML = kept.length === segs.length
      ? `<b>${segs.length} segments</b> · ${fmtDur(total)} kept`
      : `<b>${kept.length} of ${segs.length} segments</b> · ${fmtDur(total)} kept`;
    $('#rerender', root).disabled = !kept.length;
  }

  root.addEventListener('change', (e) => {
    const row = e.target.closest('[data-seg]');
    if (row) {
      const g = segs[+row.dataset.seg];
      if (e.target.hasAttribute('data-keep')) g.keep = e.target.checked;
      if (e.target.hasAttribute('data-s')) g.s = Math.max(0, +e.target.value || 0);
      if (e.target.hasAttribute('data-e')) g.e = Math.max(g.s + 0.12, +e.target.value || 0);
      $('[data-dur]', row).textContent = fmtDur(Math.max(0, g.e - g.s));
      refresh(); return;
    }
    const br = e.target.closest('[data-br]');
    if (br) { e.target.checked ? dropBroll.delete(+br.dataset.br) : dropBroll.add(+br.dataset.br); }
  });

  $('#addBr', root).addEventListener('click', () => {
    const at = +$('#addAt', root).value, clipId = $('#addClip', root).value;
    const clip = brollLib.find((c) => c.id === clipId);
    if (!clip || !(at >= 0)) return toast('Pick a time and a clip first.', 'err');
    addBroll.push({ at, clipId, name: clip.name });
    $('#addList', root).innerHTML = addBroll.map((a, i) =>
      `<p class="muted small" style="margin:4px 0">${icon('check', 'width="12" height="12"')} Cutaway at ${a.at.toFixed(1)}s → ${esc(a.name)}
        <button class="icon-btn danger" data-rmadd="${i}" aria-label="Remove">${icon('x')}</button></p>`).join('');
    $('#addAt', root).value = '';
  });
  root.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rmadd]');
    if (rm) { addBroll.splice(+rm.dataset.rmadd, 1); rm.closest('p').remove(); }
  });

  $('#rerender', root).addEventListener('click', async () => {
    const btn = $('#rerender', root);
    const kept = segs.filter((g) => g.keep).sort((a, b) => a.s - b.s);
    if (!kept.length) return toast('Keep at least one segment.', 'err');
    const caption_edits = {};
    $$('#capList [data-chunk]', root).forEach((ta) => {
      const c = plan.chunks[+ta.dataset.chunk];
      const words = splitWords(ta.value, c.word_end - c.word_start);
      if (!words) return;
      const orig = plan.words.slice(c.word_start, c.word_end).map((w) => w.text);
      words.forEach((w, k) => { if (w !== orig[k]) caption_edits[c.word_start + k] = w; });
    });
    btn.disabled = true;
    try {
      const nv = await api(`/videos/${vid}/remix`, { method: 'POST', body: {
        plan: {
          segments: kept.map((g) => [+g.s.toFixed(2), +g.e.toFixed(2)]),
          caption_edits, drop_broll: [...dropBroll],
          add_broll: addBroll.map((a) => ({ start: a.at, clip_id: a.clipId, length: 2.5 })),
        },
        music_id: $('#eMusic', root).value || null,
        music_volume: +$('#eMusicVol', root).value / 100,
        whoosh_sfx_id: $('#eWhoosh', root).value || null,
        pop_sfx_id: $('#ePop', root).value || null,
      } });
      toast('Re-render started — find it in Saved videos.');
      location.hash = '#/saved';
    } catch (err) { toast(err.message, 'err'); btn.disabled = false; }
  });

  refresh();
}
