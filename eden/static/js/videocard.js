// Video cards + player dialog, shared by Create (results) and Saved videos.
import { api } from './api.js';
import { $, $$, esc, icon, fmtDur, fmtSize, timeAgo, plural, openModal, toast, confirmDialog, copyText } from './ui.js';

export const IN_FLIGHT = new Set(['queued', 'running']);

function ratio(v) {
  const r = (v.width || 9) / (v.height || 16);
  return Math.max(0.7, r);
}

export function cardHtml(v) {
  const done = v.status === 'done';
  const flying = IN_FLIGHT.has(v.status);
  const failed = v.status === 'failed' || v.status === 'cancelled';
  const thumb = v.thumb_url
    ? `<img src="${esc(v.thumb_url)}?t=${v.finished_at || 0}" alt="" loading="lazy">`
    : `<div class="empty">${icon('film', 'width="34" height="34"')}</div>`;
  const thumbEl = done
    ? `<button class="vthumb" data-act="play" aria-label="Play ${esc(v.title)}" style="aspect-ratio:${ratio(v)}">${thumb}
         <span class="play"><span>${icon('play')}</span></span><span class="dur tc">${fmtDur(v.duration)}</span>
         <span class="plat">${esc(v.platform_label)}</span></button>`
    : `<div class="vthumb" style="aspect-ratio:${ratio(v)}">${thumb}<span class="plat">${esc(v.platform_label)}</span></div>`;

  let body = '';
  if (flying) {
    body = `<div class="vprog" data-prog>
        <div class="row"><b data-stage>${esc(v.stage || 'Queued')}</b><span class="num" data-pct>${Math.round(v.progress || 0)}%</span></div>
        <div class="bar${v.status === 'queued' ? ' indet' : ''}"><i style="width:${Math.max(3, v.progress || 0)}%"></i></div>
      </div>
      <div class="vactions"><button class="btn ghost sm" data-act="cancel">${icon('stop')}Cancel</button></div>`;
  } else if (failed) {
    body = `${v.message ? `<p class="vmsg">${esc(v.message)}</p>` : `<p class="muted small">${v.status === 'cancelled' ? 'Cancelled before it finished.' : ''}</p>`}
      <div class="vactions"><button class="btn sm" data-act="retry">${icon('refresh')}Retry</button>
      <button class="icon-btn danger" data-act="delete" aria-label="Remove">${icon('trash')}</button></div>`;
  } else {
    const warn = (v.warnings || []).length;
    body = `<div class="sub"><span>${esc(v.style_label)}</span><span>·</span><span>${fmtSize(v.size)}</span>
        ${warn ? `<span class="pill warn" title="${esc(v.warnings.join(' '))}">${plural(warn, 'note')}</span>` : ''}</div>
      <div class="vactions">
        <a class="btn sm" href="${esc(v.download_url)}" download>${icon('download')}Download</a>
        <a class="icon-btn" href="#/edit/${esc(v.id)}" aria-label="Fine-tune" title="Fine-tune this edit">${icon('scissors')}</a>
        <button class="icon-btn" data-act="details" aria-label="Details">${icon('info')}</button>
        <button class="icon-btn danger" data-act="delete" aria-label="Delete">${icon('trash')}</button>
      </div>`;
  }
  return `<article class="vcard" data-id="${esc(v.id)}" data-sig="${esc(v.status)}|${esc(v.title)}|${v.finished_at || ''}">
    ${thumbEl}
    <div class="vbody"><div class="title">${esc(v.title)}</div>
      <div class="sub">${timeAgo(v.created_at)}${v.project_name && v.project_name !== v.title ? ` · ${esc(v.project_name)}` : ''}</div>
      ${body}</div></article>`;
}

// Update a grid in place so playing hover states and focus survive polling.
export function syncGrid(grid, videos, { emptyHtml = '' } = {}) {
  const existing = new Map($$('.vcard', grid).map((el) => [el.dataset.id, el]));
  const wanted = new Set(videos.map((v) => v.id));
  existing.forEach((el, id) => { if (!wanted.has(id)) el.remove(); });
  let prev = null;
  videos.forEach((v) => {
    let el = existing.get(v.id);
    const sig = `${v.status}|${v.title}|${v.finished_at || ''}`;
    if (!el) {
      const t = document.createElement('div');
      t.innerHTML = cardHtml(v);
      el = t.firstElementChild;
      grid.insertBefore(el, prev ? prev.nextSibling : grid.firstChild);
    } else if (el.dataset.sig !== sig) {
      const t = document.createElement('div');
      t.innerHTML = cardHtml(v);
      el.replaceWith(t.firstElementChild);
      el = t.firstElementChild;
    } else if (IN_FLIGHT.has(v.status)) {
      const s = $('[data-stage]', el), p = $('[data-pct]', el), bar = $('.bar', el), fill = $('.bar > i', el);
      if (s) s.textContent = v.stage || 'Working';
      if (p) p.textContent = `${Math.round(v.progress || 0)}%`;
      if (bar) bar.classList.toggle('indet', v.status === 'queued');
      if (fill) fill.style.width = `${Math.max(3, v.progress || 0)}%`;
    }
    prev = el;
  });
  if (!videos.length && emptyHtml) grid.innerHTML = emptyHtml;
}

export function wireGrid(grid, { getVideo, onChange }) {
  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = btn.closest('.vcard');
    const id = card?.dataset.id;
    const v = id && getVideo(id);
    if (!v) return;
    const act = btn.dataset.act;
    try {
      if (act === 'play' || act === 'details') openPlayer(v, { onChange });
      else if (act === 'cancel') { await api(`/videos/${id}/cancel`, { method: 'POST' }); onChange?.(); }
      else if (act === 'retry') { await api(`/videos/${id}/retry`, { method: 'POST' }); toast('Back in the queue'); onChange?.(); }
      else if (act === 'delete') {
        const ok = await confirmDialog({ title: 'Delete this video?', body: `“${v.title}” will be removed from your saved videos. This cannot be undone.` });
        if (ok) { await api(`/videos/${id}`, { method: 'DELETE' }); toast('Video deleted'); onChange?.(); }
      }
    } catch (err) { toast(err.message, 'err'); }
  });
}

export function openPlayer(v, { onChange } = {}) {
  const st = v.stats || {}, meta = v.meta || {};
  const kv = [
    ['Length', fmtDur(v.duration)], ['Original', fmtDur(st.source_duration)],
    ['Silence removed', `${(st.silence_removed || 0).toFixed(1)}s`], ['Filler words cut', st.fillers_removed ?? 0],
    ['Cuts made', st.cuts ?? 0], ['B-roll cutaways', st.broll_count ?? 0],
  ].map(([k, val]) => `<div>${k}<b class="num">${esc(val)}</b></div>`).join('');
  const hashtags = (meta.hashtags || []).join(' ');
  const row = (label, value) => value ? `<div class="copyrow"><div class="lab">${label}
      <button class="btn ghost sm" data-copy="${esc(value)}">${icon('copy')}Copy</button></div><div class="val">${esc(value)}</div></div>` : '';
  const notes = [...(v.warnings || []), ...(meta.notes || [])];
  const m = openModal(`
    <div class="modal-head"><h3>${esc(v.title)}</h3><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="pv">
      <div class="stage"><video controls autoplay playsinline src="${esc(v.file_url)}" poster="${esc(v.thumb_url || '')}"></video></div>
      <div class="info">
        <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="pill">${esc(v.platform_label)}</span><span class="pill">${esc(v.style_label)}</span>
          <span class="pill">${v.width}×${v.height}</span></div>
        <div class="kv">${kv}</div>
        ${notes.length ? `<div class="notice">${icon('info')}<div>${notes.map(esc).join('<br>')}</div></div>` : ''}
        <label class="field"><span>Title</span><div style="display:flex;gap:8px"><input type="text" id="pvTitle" value="${esc(v.title)}" maxlength="140"><button class="btn ghost" id="pvSave">Save</button></div></label>
        ${row('Description', meta.description)}${row('Hashtags', hashtags)}
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <a class="btn" href="${esc(v.download_url)}" download>${icon('download')}Download video</a>
          ${v.srt_url ? `<a class="btn ghost" href="${esc(v.srt_url)}" download>${icon('captions')}Captions (.srt)</a>` : ''}
          <a class="btn ghost" href="#/create/${esc(v.project_id)}" data-close>${icon('scissors')}Edit again</a>
        </div>
      </div>
    </div>`);
  $$('[data-copy]', m.el).forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy)));
  $('#pvSave', m.el).addEventListener('click', async () => {
    const title = $('#pvTitle', m.el).value.trim();
    if (!title) return toast('Give the video a title first.', 'err');
    try { await api(`/videos/${v.id}`, { method: 'PATCH', body: { title } }); toast('Title saved'); onChange?.(); }
    catch (err) { toast(err.message, 'err'); }
  });
}
