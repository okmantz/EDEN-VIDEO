import { api, uploadFile } from './api.js';
import { $, $$, esc, icon, fmtDur, fmtSize, plural, toast, confirmDialog, timeAgo } from './ui.js';
import { syncGrid, wireGrid, IN_FLIGHT } from './videocard.js';

const ACCEPT = '.mp4,.mov,.m4v,.mkv,.webm,.avi,.mpg,.mpeg,.mts,.m2ts,.wmv,.flv,.3gp,.ts,video/*';
const SCENES = {
  viral_pop: 'linear-gradient(160deg,#5b3df5,#ff5fa2)',
  clean_pro: 'linear-gradient(160deg,#2f6d86,#0f2a33)',
  podcast_clip: 'linear-gradient(160deg,#4a3b5e,#17121f)',
  bold_impact: 'linear-gradient(160deg,#ff8a4c,#6b1d4a)',
  cinematic: 'linear-gradient(160deg,#315b64,#d79b57 130%)',
};
const LANGS = [['auto', 'Detect automatically'], ['en', 'English'], ['es', 'Spanish'], ['de', 'German'], ['fr', 'French'], ['it', 'Italian'],
  ['pt', 'Portuguese'], ['nl', 'Dutch'], ['pl', 'Polish'], ['tr', 'Turkish'], ['ru', 'Russian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'], ['ar', 'Arabic'], ['hi', 'Hindi']];

export async function create(root, ctx, params) {
  const [pid, sub] = params;
  if (!pid) return uploadView(root, ctx);
  if (sub === 'results') return resultsView(root, ctx, pid);
  return configureView(root, ctx, pid);
}

/* ------------------------------------------------------------------ upload */
async function uploadView(root, ctx) {
  const projects = await api('/projects');
  root.innerHTML = `
    <div class="page-head"><div><h1 class="h-page">Create a video</h1>
      <p>Upload a short clip or a long recording. Eden handles the edit.</p></div></div>
    <div class="drop" id="drop" tabindex="0" role="button" aria-label="Choose a video to upload">
      <div id="dropIdle" style="display:grid;gap:12px;justify-items:center">
        <div class="ico">${icon('upload')}</div>
        <h2>Drag a video here</h2>
        <p>or choose a file from your computer. Short form and long form both work, up to ${ctx.maxUploadMb >= 1024 ? Math.round(ctx.maxUploadMb / 1024) + ' GB' : (ctx.maxUploadMb || 4096) + ' MB'}.</p>
        <button class="btn" id="pick" type="button">${icon('plus')}Choose video</button>
      </div>
      <div class="upload-state" id="dropBusy" hidden>
        <b id="upName" style="word-break:break-all"></b>
        <div class="bar" id="upBar"><i></i></div>
        <div class="muted small" id="upText">Uploading…</div>
      </div>
      <input type="file" id="file" accept="${ACCEPT}">
    </div>
    ${projects.length ? `<div class="section-title"><h2 class="h-sec">Continue with a previous upload</h2></div>
      <div class="recent" id="recent">${projects.map(projectCard).join('')}</div>` : ''}`;

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
    const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('video/') || /\.(mp4|mov|m4v|mkv|webm|avi|mpe?g|mts|m2ts|wmv|flv|3gp|ts)$/i.test(x.name));
    if (!f) return toast('That is not a video file. Try an MP4, MOV, MKV or WebM.', 'err');
    start(f);
  });
  // Dropping a file anywhere else on the page should not navigate the browser away.
  const stray = (e) => { if (!drop.contains(e.target)) e.preventDefault(); };
  window.addEventListener('dragover', stray); window.addEventListener('drop', stray);

  $('#recent', root)?.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (!del) return;
    const ok = await confirmDialog({ title: 'Delete this upload?', body: 'The original file and every video made from it will be removed.' });
    if (!ok) return;
    try { await api(`/projects/${del.dataset.del}`, { method: 'DELETE' }); toast('Upload deleted'); ctx.navigate(); }
    catch (err) { toast(err.message, 'err'); }
  });
  return () => { window.removeEventListener('dragover', stray); window.removeEventListener('drop', stray); };
}

function projectCard(p) {
  return `<div style="position:relative"><a href="#/create/${esc(p.id)}">
    <div class="th" style="${p.thumb_url ? `background-image:url('${esc(p.thumb_url)}')` : ''}"><span class="tc">${fmtDur(p.duration)}</span></div>
    <div class="meta"><b>${esc(p.name)}</b><span>${timeAgo(p.created_at)} · ${fmtSize(p.size)}</span></div></a>
    <button class="icon-btn danger" data-del="${esc(p.id)}" aria-label="Delete ${esc(p.name)}" style="position:absolute;top:6px;left:6px;background:rgba(8,14,15,.72)">${icon('trash')}</button></div>`;
}

/* --------------------------------------------------------------- configure */
function capPreview(style) {
  const c = style.caption;
  const outline = Math.max(0, c.outline) / 5;
  const sh = outline ? `text-shadow:${[[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 2]].map(([x, y]) => `${x * outline}px ${y * outline}px 0 ${c.outline_color}`).join(',')};` : '';
  const second = c.word_highlight ? `color:${c.highlight}` : '';
  const text = `<span>${esc('This')}</span> <span style="${second}">${esc('changes')}</span>`;
  const inner = c.box ? `<span class="box" style="background:${c.box_color || '#000'}">${text}</span>` : text;
  return `<div class="cap ${c.position}" style="font-size:calc(${c.size} * 100cqh * 1.3);color:${c.color};${c.uppercase ? 'text-transform:uppercase;' : ''}${c.bold ? '' : 'font-weight:500;'}${sh}">${inner}</div>`;
}

async function configureView(root, ctx, pid) {
  let project;
  try { project = await api(`/projects/${pid}`); }
  catch { toast('That upload could not be found.', 'err'); location.hash = '#/create'; return; }
  const { meta, health, settings } = ctx;
  const [musicLib, sfxLib] = await Promise.all([api('/music').catch(() => []), api('/sfx').catch(() => [])]);
  const styles = Object.fromEntries(meta.styles.map((s) => [s.key, s]));
  const st = {
    style: styles[settings.default_style] ? settings.default_style : meta.styles[0].key,
    platforms: new Set((settings.default_platforms || []).filter((p) => meta.platforms.some((m) => m.key === p))),
    broll: null, pacing: null, framing: 'fill', zoomTouched: false, brollTouched: false,
  };
  if (!st.platforms.size) st.platforms.add(meta.platforms[0].key);
  st.broll = styles[st.style].broll;

  const groups = {};
  meta.platforms.forEach((p) => (groups[p.group] ||= []).push(p));
  const aiReady = settings.ollama_enabled;
  const logoReady = !!settings.logo_url;

  root.innerHTML = `
    <div class="page-head"><div><h1 class="h-page">Choose a look</h1>
      <p>Pick a style and where the video is going. Eden does the rest.</p></div>
      <a class="btn ghost" href="#/create">${icon('upload')}Use a different video</a></div>
    <div class="create-grid">
      <aside class="sticky">
        <div class="player"><video controls preload="metadata" playsinline src="${esc(project.source_url)}" ${project.thumb_url ? `poster="${esc(project.thumb_url)}"` : ''}></video></div>
        <div class="file-meta"><span><b>${esc(project.filename)}</b></span>
          <span><b class="tc">${fmtDur(project.duration)}</b> long</span><span>${project.width}×${project.height}</span><span>${fmtSize(project.size)}</span></div>
        <section class="panel" style="margin-top:18px" aria-labelledby="paceH">
          <div class="panel-head"><h2 class="h-sec" id="paceH">Dead air in this video</h2></div>
          <div id="pace"><div class="skel" style="width:80%"></div><div class="skel" style="width:60%;margin-top:10px"></div><div class="skel" style="width:70%;margin-top:10px"></div></div>
        </section>
        <section class="panel" id="speechPanel" aria-labelledby="spH"></section>
      </aside>

      <div>
        <section class="panel" aria-labelledby="styH">
          <div class="panel-head"><h2 class="h-sec" id="styH">Style</h2><p>Sets pacing, captions and colour.</p></div>
          <div class="styles" id="styles">
            ${meta.styles.map((s) => `<button class="style-card" type="button" data-style="${esc(s.key)}" aria-pressed="${s.key === st.style}">
              <div class="phone" style="--scene:radial-gradient(circle at 50% 36%,rgba(255,255,255,.26) 0 13%,transparent 14%),radial-gradient(ellipse at 50% 80%,rgba(255,255,255,.2) 0 30%,transparent 31%),${SCENES[s.key] || SCENES.clean_pro}">${capPreview(s)}</div>
              <div><b>${esc(s.label)}</b><small>${esc(s.tagline)}</small></div></button>`).join('')}
          </div>
        </section>

        <section class="panel" aria-labelledby="plH">
          <div class="panel-head"><h2 class="h-sec" id="plH">Post to</h2><p>One finished video per platform.</p></div>
          ${Object.entries(groups).map(([g, list]) => `<div class="plat-group"><b>${esc(g)}</b><div class="chips">
            ${list.map((p) => `<button class="chip" type="button" data-plat="${esc(p.key)}" aria-pressed="${st.platforms.has(p.key)}">
              <span class="ar" style="height:16px;width:${Math.round(16 * p.width / p.height)}px"></span>${esc(shortLabel(p, g))}<small>${esc(p.note.split(' ')[0])}</small></button>`).join('')}
          </div></div>`).join('')}
          <p class="muted small" id="lenHint" style="margin-top:10px" hidden></p>
        </section>

        <section class="panel" aria-labelledby="opH">
          <div class="panel-head"><h2 class="h-sec" id="opH">What Eden should do</h2></div>
          ${sw('remove_silence', 'Remove silence', 'Shorten long pauses to a natural beat.', true)}
          ${sw('remove_fillers', 'Remove filler words', 'Cut “um”, “uh”, “er” and similar sounds. Needs a transcript.', true)}
          ${sw('captions', 'Add captions', 'Burn styled captions into the video. A separate .srt file is saved too.', true)}
          ${sw('zoom', 'Punch-in zooms', 'Alternate framing at each cut so talking-head footage stays lively.', styles[st.style].zoom)}
          ${sw('clean_audio', 'Clean up the audio', 'Reduce background hiss and even out the loudness.', true)}
          <div class="switch" style="cursor:default"><div class="txt"><b>B-roll cutaways</b>
            <small>Eden cuts to your B-roll library when a clip’s tag is spoken, and fills long talking stretches. <a href="#/library" style="color:var(--amber)">Manage library</a></small>
            <div style="margin-top:10px" class="seg" id="brollSeg" role="group" aria-label="B-roll amount">
              ${[['off', 'Off'], ['low', 'Light'], ['medium', 'Balanced'], ['high', 'Lots']].map(([k, l]) => `<button type="button" data-seg="broll" data-val="${k}" aria-pressed="${k === st.broll}">${l}</button>`).join('')}
            </div></div></div>

          <div class="switch" style="cursor:default"><div class="txt"><b>Background music</b>
            <small>Lays a track under the video and ducks it under your voice automatically. <a href="#/music" style="color:var(--amber)">Manage music & sounds</a></small>
            <div style="margin-top:10px;display:flex;gap:12px;flex-wrap:wrap;align-items:end">
              <label class="field" style="min-width:200px;flex:1"><span>Track</span>
                <select id="optMusic"><option value="">No music</option>
                  ${musicLib.map((t) => `<option value="${esc(t.id)}">${esc(t.name)} (${fmtDur(t.duration)})</option>`).join('')}</select></label>
              <label class="field" style="min-width:150px"><span>Music volume</span>
                <input type="range" id="optMusicVol" min="0" max="100" value="35"></label>
            </div></div></div>

          <details class="more"><summary>${icon('chevron')}More options</summary>
            <div class="form-grid">
              <label class="field full"><span>Title</span><input type="text" id="optTitle" maxlength="140" value="${esc(project.name)}"></label>
              <div class="field"><span>Pacing</span><div class="seg" id="paceSeg" role="group" aria-label="Pacing">
                ${[['', 'Match style'], ['relaxed', 'Relaxed'], ['balanced', 'Balanced'], ['tight', 'Tight']].map(([k, l]) => `<button type="button" data-seg="pacing" data-val="${k}" aria-pressed="${k === ''}">${l}</button>`).join('')}</div></div>
              <div class="field"><span>Framing for wider footage</span><div class="seg" id="frameSeg" role="group" aria-label="Framing">
                <button type="button" data-seg="framing" data-val="fill" aria-pressed="true">Fill the frame</button>
                <button type="button" data-seg="framing" data-val="fit" aria-pressed="false">Fit with blurred backdrop</button></div></div>
              <label class="field" id="focusWrap"><span>Crop position <span class="muted" id="focusVal">Centre</span></span><input type="range" id="optFocus" min="0" max="100" value="50"></label>
              <label class="field"><span>Spoken language</span><select id="optLang">${LANGS.map(([k, l]) => `<option value="${k}" ${k === (settings.language || 'auto') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
              <label class="field"><span>Whoosh on punch-in zooms</span><select id="optWhoosh"><option value="">None</option>
                ${sfxLib.map((t) => `<option value="${esc(t.id)}">${esc(t.name)} (${fmtDur(t.duration)})</option>`).join('')}</select></label>
              <label class="field"><span>Pop on emphasized words</span><select id="optPop"><option value="">None</option>
                ${sfxLib.map((t) => `<option value="${esc(t.id)}">${esc(t.name)} (${fmtDur(t.duration)})</option>`).join('')}</select></label>
              ${sw('remove_filler_phrases', 'Also cut “you know” and “I mean”', 'Off by default because they are sometimes real content.', false, 'full')}
              ${sw('use_ai', 'AI assist (Ollama)', aiReady ? 'Writes a title, description and hashtags, and picks emphasis words. Falls back automatically if Ollama is unreachable.' : 'Turn on Ollama in Settings to enable this. Everything else works without it.', false, 'full', !aiReady)}
              ${sw('logo', 'Add my logo', logoReady ? 'Places your logo in the top corner.' : 'Upload a logo in Settings to use this.', !!settings.logo_enabled && logoReady, 'full', !logoReady)}
            </div></details>
        </section>
      </div>
    </div>
    <div class="actionbar"><div class="sum" id="sum"></div><button class="btn lg" id="go">${icon('sparkle')}Create video</button></div>`;

  const $v = (sel) => $(sel, root);
  const checked = (name) => $v(`[data-sw="${name}"]`).checked;

  function refresh() {
    const n = st.platforms.size;
    const labels = meta.platforms.filter((p) => st.platforms.has(p.key)).map((p) => p.label);
    $v('#sum').innerHTML = n
      ? `<b>${plural(n, 'video')}</b> · ${esc(styles[st.style].label)} · ${esc(labels.length > 2 ? `${labels.slice(0, 2).join(', ')} +${labels.length - 2}` : labels.join(', '))}`
      : 'Choose at least one platform';
    $v('#go').disabled = n === 0;
    const over = meta.platforms.filter((p) => st.platforms.has(p.key) && p.recommended_max_s && project.duration > p.recommended_max_s);
    const hint = $v('#lenHint');
    hint.hidden = !over.length;
    if (over.length) hint.textContent = `Your original is ${fmtDur(project.duration)}. ${over.map((p) => p.label).join(' and ')} work${over.length === 1 ? 's' : ''} best at ${fmtDur(Math.min(...over.map((p) => p.recommended_max_s)))} or under. Trimming silence helps, and you can still export it as is.`;
    $v('#focusWrap').hidden = st.framing === 'fit';
    drawPace();
  }

  function drawPace() {
    const a = project.analysis;
    const box = $v('#pace');
    if (!a) return;
    if (!a.has_audio) { box.innerHTML = '<p class="muted small">This video has no audio, so there are no pauses to trim.</p>'; return; }
    const active = st.pacing || styles[st.style].pacing;
    const names = { relaxed: 'Relaxed', balanced: 'Balanced', tight: 'Tight' };
    box.innerHTML = `<p class="muted small" style="margin-bottom:6px">Pauses Eden can trim at each pacing level. Your pick is highlighted.</p>
      <div class="pace">${Object.entries(a.pacing).map(([k, v]) => `<div class="pace-row ${k === active ? 'on' : ''}"><span>${names[k]}</span>
        <div class="bar"><i style="width:${Math.min(100, (v.removed / project.duration) * 100 * 2.2)}%"></i></div><span class="num tc">−${v.removed.toFixed(1)}s</span></div>`).join('')}</div>`;
  }

  function drawSpeech() {
    const p = $v('#speechPanel');
    const src = project.transcript_source;
    const engine = health.whisper;
    p.innerHTML = `<div class="panel-head"><h2 class="h-sec" id="spH">Captions and filler words</h2></div>
      ${src === 'srt'
        ? `<p style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="pill ok">${icon('check', 'width="13" height="13"')}Using your caption file</span>
           <button class="btn ghost sm" id="rmSrt">Remove</button></p>`
        : engine
          ? `<p><span class="pill ok">${icon('check', 'width="13" height="13"')}Speech engine ready</span></p>
             <p class="muted small" style="margin-top:8px">Eden transcribes the audio on this computer using Whisper (${esc(settings.whisper_model)} model). Nothing is sent online.</p>`
          : `<div class="notice">${icon('alert')}<div>The speech engine is not installed, so Eden cannot make captions on its own. Run <code>pip install faster-whisper</code>, restart Eden, or attach an .srt or .vtt file below.</div></div>`}
      <p style="margin-top:12px"><label class="btn ghost sm" style="cursor:pointer">${icon('captions')}${src === 'srt' ? 'Replace caption file' : 'Attach .srt or .vtt'}
        <input type="file" id="srtIn" accept=".srt,.vtt,text/vtt,application/x-subrip" hidden></label></p>`;
    $v('#srtIn').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      try { const r = await api(`/projects/${pid}/transcript`, { method: 'POST', form: fd }); project = r.project; toast(`Captions attached (${r.words} words)`); drawSpeech(); }
      catch (err) { toast(err.message, 'err'); }
    });
    $v('#rmSrt')?.addEventListener('click', async () => {
      try { project = await api(`/projects/${pid}/transcript`, { method: 'DELETE' }); drawSpeech(); toast('Caption file removed'); }
      catch (err) { toast(err.message, 'err'); }
    });
  }

  root.addEventListener('click', (e) => {
    const sc = e.target.closest('[data-style]');
    if (sc) {
      st.style = sc.dataset.style;
      $$('[data-style]', root).forEach((b) => b.setAttribute('aria-pressed', String(b === sc)));
      if (!st.zoomTouched) $v('[data-sw="zoom"]').checked = styles[st.style].zoom;
      if (!st.brollTouched) { st.broll = styles[st.style].broll; syncSeg('broll', st.broll); }
      refresh();
      return;
    }
    const pc = e.target.closest('[data-plat]');
    if (pc) {
      const k = pc.dataset.plat;
      st.platforms.has(k) ? st.platforms.delete(k) : st.platforms.add(k);
      pc.setAttribute('aria-pressed', String(st.platforms.has(k)));
      refresh();
      return;
    }
    const sg = e.target.closest('[data-seg]');
    if (sg) {
      const key = sg.dataset.seg, val = sg.dataset.val;
      if (key === 'broll') { st.broll = val; st.brollTouched = true; }
      if (key === 'pacing') st.pacing = val || null;
      if (key === 'framing') st.framing = val;
      syncSeg(key, val);
      refresh();
    }
  });
  function syncSeg(key, val) { $$(`[data-seg="${key}"]`, root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.val === val))); }
  $v('[data-sw="zoom"]').addEventListener('change', () => { st.zoomTouched = true; });
  $v('#optFocus').addEventListener('input', (e) => {
    const v = +e.target.value;
    $v('#focusVal').textContent = v < 35 ? 'Left' : v > 65 ? 'Right' : 'Centre';
  });

  $v('#go').addEventListener('click', async () => {
    const btn = $v('#go');
    const title = $v('#optTitle').value.trim();
    const lang = $v('#optLang').value;
    const options = {
      style: st.style, title: title && title !== project.name ? title : null,
      remove_silence: checked('remove_silence'), remove_fillers: checked('remove_fillers'),
      remove_filler_phrases: checked('remove_filler_phrases'), captions: checked('captions'),
      broll: st.broll, zoom: st.zoomTouched ? checked('zoom') : null, pacing: st.pacing,
      framing: st.framing, focus: +$v('#optFocus').value / 100, clean_audio: checked('clean_audio'),
      language: lang === 'auto' ? null : lang, use_ai: aiReady && checked('use_ai'),
      logo: logoReady ? checked('logo') : null,
      music_id: $v('#optMusic').value || null, music_volume: +$v('#optMusicVol').value / 100,
      whoosh_sfx_id: $v('#optWhoosh').value || null, pop_sfx_id: $v('#optPop').value || null,
    };
    btn.disabled = true;
    try {
      const vids = await api(`/projects/${pid}/render`, { method: 'POST', body: { platforms: [...st.platforms], options } });
      sessionStorage.setItem(`eden.jobs.${pid}`, JSON.stringify(vids.map((v) => v.id)));
      location.hash = `#/create/${pid}/results`;
    } catch (err) { toast(err.message, 'err'); btn.disabled = false; }
  });

  drawSpeech();
  refresh();
  if (!project.analysis) {
    api(`/projects/${pid}/analyze`, { method: 'POST' }).then((a) => { project.analysis = a; drawPace(); })
      .catch(() => { $v('#pace').innerHTML = '<p class="muted small">Could not measure pauses. The edit will still work.</p>'; });
  }
}

function shortLabel(p, group) {
  if (p.label === group) return 'Video';
  return p.label.startsWith(group + ' ') ? p.label.slice(group.length + 1) : p.label;
}

function sw(name, title, desc, on, cls = '', disabled = false) {
  return `<label class="switch ${cls}"><div class="txt"><b>${esc(title)}</b><small>${esc(desc)}</small></div>
    <input type="checkbox" data-sw="${name}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="track"></span></label>`;
}

/* ----------------------------------------------------------------- results */
async function resultsView(root, ctx, pid) {
  let ids = [];
  try { ids = JSON.parse(sessionStorage.getItem(`eden.jobs.${pid}`) || '[]'); } catch { ids = []; }
  if (!ids.length) { location.hash = `#/create/${pid}`; return; }
  root.innerHTML = `
    <div class="page-head"><div><h1 class="h-page" id="resTitle">Making your videos</h1>
      <p id="resSub">This usually takes a few minutes. You can leave this page. Finished videos are always in Saved videos.</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn ghost" href="#/create/${esc(pid)}">${icon('scissors')}Make another version</a>
      <a class="btn ghost" href="#/saved">${icon('film')}Saved videos</a></div></div>
    <div class="vgrid" id="grid"></div>`;
  const grid = $('#grid', root);
  let videos = [];
  let timer, stopped = false;
  wireGrid(grid, { getVideo: (id) => videos.find((v) => v.id === id), onChange: tick });
  async function tick() {
    if (stopped) return;
    try {
      const all = await Promise.all(ids.map((id) => api(`/videos/${id}`).catch(() => null)));
      videos = all.filter(Boolean);
      syncGrid(grid, videos);
      const busy = videos.some((v) => IN_FLIGHT.has(v.status));
      const ok = videos.filter((v) => v.status === 'done').length;
      $('#resTitle', root).textContent = busy ? 'Making your videos' : (ok ? (ok === 1 ? 'Your video is ready' : 'Your videos are ready') : 'Nothing finished');
      if (!busy) $('#resSub', root).textContent = ok ? 'Play, download, or open details for the title, hashtags and caption file.' : 'See the messages below, then retry or change your settings.';
      clearTimeout(timer);
      if (busy) timer = setTimeout(tick, 1200);
    } catch { timer = setTimeout(tick, 3000); }
  }
  await tick();
  return () => { stopped = true; clearTimeout(timer); };
}
