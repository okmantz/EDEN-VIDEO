// A drop zone that uploads one video and then opens the one-click editor for it.
import { uploadFile } from './api.js';
import { $, esc, icon, fmtSize, toast } from './ui.js';

export const ACCEPT = '.mp4,.mov,.m4v,.mkv,.webm,.avi,.mpg,.mpeg,.mts,.m2ts,.wmv,.flv,.3gp,.ts,video/*';
const VIDEO_RE = /\.(mp4|mov|m4v|mkv|webm|avi|mpe?g|mts|m2ts|wmv|flv|3gp|ts)$/i;

export function maxLabel(ctx) {
  const mb = ctx.maxUploadMb;
  return mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb || 4096} MB`;
}

export function dropzoneHtml(ctx, { title = 'Drop your video here', compact = false } = {}) {
  return `<div class="dropbox" id="drop" tabindex="0" role="button" aria-label="Choose a video to upload">
    <div id="dropIdle" style="display:grid;gap:10px;justify-items:center">
      <div class="ico">${icon('upload')}</div>
      <h2>${esc(title)}</h2>
      ${compact ? '' : `<p>Short clips and long recordings both work, up to ${maxLabel(ctx)}. MP4, MOV, MKV and WebM are all fine.</p>`}
      <button class="btn" id="pick" type="button">${icon('plus')}Choose a video</button>
    </div>
    <div class="upload-state" id="dropBusy" hidden>
      <b id="upName" style="word-break:break-all"></b>
      <div class="bar" id="upBar"><i></i></div>
      <div class="muted small" id="upText">Uploading…</div>
    </div>
    <input type="file" id="file" accept="${ACCEPT}">
  </div>`;
}

export function wireDropzone(root) {
  const drop = $('#drop', root), input = $('#file', root);
  let busy = false;
  const start = async (file) => {
    if (busy || !file) return;
    busy = true;
    $('#dropIdle', root).hidden = true;
    $('#dropBusy', root).hidden = false;
    $('#upName', root).textContent = file.name;
    const bar = $('#upBar', root), fill = $('#upBar > i', root), text = $('#upText', root);
    try {
      const project = await uploadFile('/projects', file, {}, (f, loaded, total) => {
        fill.style.width = `${Math.round(f * 100)}%`;
        text.textContent = f >= 1 ? 'Reading your video…' : `Uploading ${fmtSize(loaded)} of ${fmtSize(total)}`;
        if (f >= 1) bar.classList.add('indet');
      });
      location.hash = `#/create/${project.id}`;
    } catch (err) {
      toast(err.message, 'err');
      busy = false;
      $('#dropIdle', root).hidden = false;
      $('#dropBusy', root).hidden = true;
      fill.style.width = '0';
      bar.classList.remove('indet');
    }
  };
  $('#pick', root).addEventListener('click', (e) => { e.stopPropagation(); input.click(); });
  drop.addEventListener('click', (e) => { if (!busy && !e.target.closest('button')) input.click(); });
  drop.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => start(input.files[0]));
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => {
    const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('video/') || VIDEO_RE.test(x.name));
    if (!f) return toast('That is not a video file. Try an MP4, MOV, MKV or WebM.', 'err');
    start(f);
  });
  // Dropping a file elsewhere on the page must not navigate the browser away.
  const stray = (e) => { if (!drop.contains(e.target)) e.preventDefault(); };
  window.addEventListener('dragover', stray); window.addEventListener('drop', stray);
  return () => { window.removeEventListener('dragover', stray); window.removeEventListener('drop', stray); };
}
