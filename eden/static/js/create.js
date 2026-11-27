import { api } from './api.js';
import { $, $$, esc, icon, fmtDur, fmtSize, plural, toast, confirmDialog, timeAgo, prefs } from './ui.js';
import { syncGrid, wireGrid, IN_FLIGHT } from './videocard.js';
import { dropzoneHtml, wireDropzone } from './dropzone.js';

const LANGS = [['auto', 'Detect automatically'], ['en', 'English'], ['es', 'Spanish'], ['de', 'German'], ['fr', 'French'], ['it', 'Italian'],
  ['pt', 'Portuguese'], ['nl', 'Dutch'], ['pl', 'Polish'], ['tr', 'Turkish'], ['ru', 'Russian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'], ['ar', 'Arabic'], ['hi', 'Hindi']];
const LEVELS = [['subtle', 'Subtle', 0.22], ['balanced', 'Balanced', 0.35], ['present', 'Present', 0.5]];
const BROLL = [['off', 'Off'], ['low', 'Light'], ['medium', 'Balanced'], ['high', 'Lots']];

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
      <p>Upload a clip. Eden will offer a one-click edit with pauses cut, captions, music and b-roll.</p></div></div>
    ${dropzoneHtml(ctx, { title: 'Drag a video here' })}
    ${projects.length ? `<div class="section-title"><h2 class="h-sec">Continue with a previous upload</h2></div>
      <div class="recent" id="recent">${projects.map(projectCard).join('')}</div>` : ''}`;
  const stop = wireDropzone(root);
  $('#recent', root)?.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (!del) return;
    const ok = await confirmDialog({ title: 'Delete this upload?', body: 'The original file and every video made from it will be removed.' });
    if (!ok) return;
    try { await api(`/projects/${del.dataset.del}`, { method: 'DELETE' }); toast('Upload deleted'); ctx.navigate(); }
    catch (err) { toast(err.message, 'err'); }
  });
  return stop;
}

function projectCard(p) {
  return `<div style="position:relative"><a href="#/create/${esc(p.id)}">
    <div class="th" style="${p.thumb_url ? `background-image:url('${esc(p.thumb_url)}')` : ''}"><span class="tc">${fmtDur(p.duration)}</span></div>
    <div class="meta"><b>${esc(p.name)}</b><span>${timeAgo(p.created_at)} · ${fmtSize(p.size)}</span></div></a>
    <button class="icon-btn danger del" data-del="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">${icon('trash')}</button></div>`;
}

/* --------------------------------------------------------------- configure */
function sw(name, title, desc, on, disabled = false) {
  return `<label class="switch"><div class="txt"><b>${esc(title)}</b><small>${desc}</small></div>
    <input type="checkbox" data-sw="${name}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="track"></span></label>`;
}
function seg(key, items, value, label) {
  return `<div class="seg" role="group" aria-label="${esc(label)}">${items.map(([k, l]) => `<button type="button" data-seg="${key}" data-val="${esc(k)}" aria-pressed="${k === value}">${esc(l)}</button>`).join('')}</div>`;
}
function acc(key, ico, title, summaryId, body) {
  return `<details class="acc" data-acc="${key}"><summary><span class="ai">${icon(ico)}</span>
    <span class="at"><b>${esc(title)}</b><span id="${summaryId}"></span></span>${icon('chevron', 'class="chev"')}</summary><div class="abody">${body}</div></details>`;
}

async function configureView(root, ctx, pid) {
  let project;
  try { project = await api(`/projects/${pid}`); }
  catch { toast('That upload could not be found.', 'err'); location.hash = '#/create'; return; }
  const { meta, health } = ctx;
  const settings = ctx.settings;
  const [uploaded, sfxLib] = await Promise.all([api('/music').catch(() => []), api('/sfx').catch(() => [])]);
  const styles = Object.fromEntries(meta.styles.map((s) => [s.key, s]));
  const presets = Object.fromEntries(meta.caption_presets.map((p) => [p.key, p]));
  const tracks = Object.fromEntries(meta.music_tracks.map((t) => [t.key, t]));
  const saved = prefs.get();
  const brandReady = !!(settings.brand_name || settings.logo_url || settings.brand_handle);

  const validPlats = (saved.platforms || settings.default_platforms || []).filter((p) => meta.platforms.some((m) => m.key === p));
  const st = {
    style: styles[saved.style] ? saved.style : (styles[settings.default_style] ? settings.default_style : meta.styles[0].key),
    platforms: new Set(validPlats.length ? validPlats : [meta.platforms[0].key]),
    captions: true, preset: null, position: '', scale: 100,
    music: 'auto', level: saved.level || 'balanced',
    broll: null, cards: true, pacing: '', framing: 'fill', zoom: null,
    touched: new Set(),
  };
  st.preset = null;      // null = follow the style
  st.broll = styles[st.style].broll;
  const presetKey = () => st.preset || styles[st.style].caption_preset;

  const groups = {};
  meta.platforms.forEach((p) => (groups[p.group] ||= []).push(p));
  const aiReady = settings.ollama_enabled;
  const logoReady = !!settings.logo_url;
  const canTranscribe = () => health.whisper || project.transcript_source === 'srt';

  const platChips = Object.entries(groups).map(([g, list]) => `<div class="plat-group"><b>${esc(g)}</b><div class="chips">
    ${list.map((p) => `<button class="chip" type="button" data-plat="${esc(p.key)}" aria-pressed="${st.platforms.has(p.key)}">
      <span class="ar" style="height:15px;width:${Math.round(15 * p.width / p.height)}px"></span>${esc(shortLabel(p, g))}</button>`).join('')}</div></div>`).join('');

  const lookCards = [...meta.caption_presets.map((p) => [p.key, p.label, p.tagline]),
    ...(brandReady ? [['brand', 'Your brand', 'Your font and colors']] : [])];
  const trackRow = (id, ico, name, sub, play) => `<div class="tpick" role="button" tabindex="0" data-music="${esc(id)}" aria-pressed="false">
      <span class="tico">${icon(ico)}</span><div><b>${esc(name)}</b><small>${esc(sub)}</small></div>
      ${play ? `<button type="button" class="pbtn" data-play="${esc(play)}" aria-label="Preview ${esc(name)}">${icon('play')}</button>` : '<span></span>'}</div>`;

  root.innerHTML = `
    <div class="page-head"><div><h1 class="h-page">Edit your video</h1>
      <p>One click does the whole edit. Everything below is optional.</p></div>
      <a class="btn ghost" href="#/create">${icon('upload')}Use a different video</a></div>
    <div class="create-grid">
      <aside class="sticky">
        <div class="player"><video controls preload="metadata" playsinline src="${esc(project.source_url)}" ${project.thumb_url ? `poster="${esc(project.thumb_url)}"` : ''}></video></div>
        <div class="file-meta"><span><b>${esc(project.filename)}</b></span>
          <span><b class="tc">${fmtDur(project.duration)}</b></span><span>${project.width}×${project.height}</span><span>${fmtSize(project.size)}</span></div>
        <section class="panel" style="margin-top:18px" aria-labelledby="paceH">
          <div class="panel-head" style="margin-bottom:0"><h2 class="h-sec" id="paceH">Audio check</h2></div>
          <div id="pace"><div class="skel" style="width:80%;margin-top:14px"></div><div class="skel" style="width:60%;margin-top:10px"></div></div>
        </section>
        <section class="panel" id="speechPanel" aria-labelledby="spH"></section>
      </aside>

      <div>
        <section class="oneclick" aria-labelledby="ocH">
          <h2 id="ocH">${icon('wand')}Edit for me</h2>
          <p>Eden will do all of this automatically:</p>
          <div class="plan" id="plan"></div>
          <div class="postto"><b>Post to</b>${platChips}</div>
          <p class="muted small" id="lenHint" style="margin-top:8px" hidden></p>
          <div class="oc-foot" style="margin-top:18px">
            <button class="btn xl" id="go" type="button">${icon('sparkle')}Edit for me</button>
            <div class="sum" id="sum"></div>
          </div>
        </section>

        <div class="customize-head"><h2 class="h-sec">Make it yours</h2><p>Optional. Open any section to change it. Your choices are remembered.</p></div>

        ${acc('cuts', 'scissors', 'Cuts & pacing', 'sCuts', `
          ${sw('remove_silence', 'Cut pauses', 'Shortens long silences. Eden measures your audio so quiet speakers are not clipped.', true)}
          ${sw('remove_fillers', 'Remove “um”, “uh” and stutters', 'Needs a transcript. Also removes accidental repeats like “the the”.', true)}
          ${sw('remove_filler_phrases', 'Also cut “you know” and “I mean”', 'Off by default because they are sometimes real content.', false)}
          <div class="field"><span>Pacing</span>${seg('pacing', [['', 'Match style'], ['relaxed', 'Relaxed'], ['balanced', 'Balanced'], ['tight', 'Tight']], '', 'Pacing')}
            <div id="paceDetail" class="muted small"></div></div>`)}

        ${acc('captions', 'captions', 'Captions', 'sCaps', `
          ${sw('captions', 'Add captions', 'Burned into the video. A separate .srt file is saved too.', true)}
          <div id="capBody">
            <div class="sub-label" style="margin-bottom:10px">Choose a look. These previews are rendered with your brand.</div>
            <div class="looks" id="looks">${lookCards.map(([k, l, t]) => `<button class="look" type="button" data-look="${esc(k)}" aria-pressed="false">
              <div class="shot"><img alt="" data-src="${esc(k)}"></div><b>${esc(l)}</b><small>${esc(t)}</small></button>`).join('')}</div>
            <div class="row2" style="margin-top:16px">
              <div class="field"><span>Position</span>${seg('position', [['', 'Look default'], ['top', 'Top'], ['center', 'Middle'], ['bottom', 'Bottom']], '', 'Caption position')}</div>
              <label class="field"><span>Size <span class="muted" id="scaleVal">100%</span></span><input type="range" id="optScale" min="60" max="160" step="5" value="100"></label>
            </div>
          </div>`)}

        ${acc('music', 'music', 'Music & sound', 'sMusic', `
          <div class="tracks-pick" id="trackList">
            ${trackRow('auto', 'sparkle', 'Auto-pick for this style', 'Eden chooses a quiet built-in track that fits (recommended)', '')}
            ${trackRow('none', 'x', 'No music', 'Just your voice', '')}
            ${meta.music_tracks.map((t) => trackRow(t.id, 'music', t.label, `${t.mood} · ${t.blurb}`, t.id)).join('')}
            ${uploaded.map((t) => trackRow(t.id, 'music', t.name, `Your upload · ${fmtDur(t.duration)}`, '')).join('')}
          </div>
          <div class="field"><span>Music level</span>${seg('level', LEVELS.map(([k, l]) => [k, l]), st.level, 'Music level')}
            <small>Music always ducks under your voice. Subtle is barely there; Present is noticeable.</small></div>
          <div class="form-grid">
            <label class="field"><span>Whoosh on punch-in zooms</span><select id="optWhoosh"><option value="">None</option>
              ${sfxLib.map((t) => `<option value="${esc(t.id)}">${esc(t.name)} (${fmtDur(t.duration)})</option>`).join('')}</select></label>
            <label class="field"><span>Pop on emphasized words</span><select id="optPop"><option value="">None</option>
              ${sfxLib.map((t) => `<option value="${esc(t.id)}">${esc(t.name)} (${fmtDur(t.duration)})</option>`).join('')}</select></label>
          </div>
          ${sw('clean_audio', 'Clean up the voice', 'Reduces hiss and evens out loudness so you sound clear.', true)}
          <audio id="auditioner" preload="none" hidden></audio>`)}

        ${acc('broll', 'image', 'B-roll', 'sBroll', `
          <div class="field"><span>How much b-roll</span>${seg('broll', BROLL, st.broll, 'B-roll amount')}</div>
          ${sw('broll_cards', 'Use keyword cards when there is no footage', 'Short animated cards in your brand colors that show a key word. Great when you have no clips.', true)}
          <p class="muted small">Cutaways come from <a href="#/library">your B-roll library</a> first${settings.pexels_key_set ? ', then free stock footage from Pexels' : ` (add a free <a href="#/settings">Pexels key</a> to also fetch stock footage)`}.</p>`)}

        ${acc('brand', 'palette', 'Brand', 'sBrand', `
          ${sw('brand', 'Apply my brand', brandReady ? 'Your colors tint the captions and cards, and your handle is added.' : 'Set up your brand kit first, then Eden can apply it automatically.', brandReady)}
          ${sw('logo', 'Add my logo', logoReady ? 'Placed in the corner you picked in the brand kit.' : 'Upload a logo in the brand kit to use this.', !!settings.logo_enabled && logoReady, !logoReady)}
          <a class="btn ghost sm" href="#/brand" style="justify-self:start">${icon('palette')}${brandReady ? 'Edit brand kit' : 'Set up brand kit'}</a>`)}

        ${acc('look', 'sliders', 'Style & framing', 'sLook', `
          <div class="styles" id="styles">${meta.styles.map((s) => `<button class="style-card" type="button" data-style="${esc(s.key)}" aria-pressed="${s.key === st.style}">
            <b>${esc(s.label)}</b><small>${esc(s.tagline)}</small></button>`).join('')}</div>
          ${sw('zoom', 'Punch-in zooms', 'Alternate framing at each cut so talking-head footage stays lively.', styles[st.style].zoom)}
          <div class="field"><span>Framing for wider footage</span>${seg('framing', [['fill', 'Fill the frame'], ['fit', 'Fit with blurred backdrop']], 'fill', 'Framing')}</div>
          <label class="field" id="focusWrap"><span>Crop position <span class="muted" id="focusVal">Centre</span></span><input type="range" id="optFocus" min="0" max="100" value="50"></label>`)}

        ${acc('more', 'info', 'More', 'sMore', `
          <div class="form-grid">
            <label class="field full"><span>Title</span><input type="text" id="optTitle" maxlength="140" value="${esc(project.name)}"></label>
            <label class="field"><span>Spoken language</span><select id="optLang">${LANGS.map(([k, l]) => `<option value="${k}" ${k === (settings.language || 'auto') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          </div>
          ${sw('use_ai', 'AI assist (Ollama)', aiReady ? 'Writes a title, description and hashtags, and picks emphasis words.' : 'Turn on Ollama in Settings to enable this. Everything else works without it.', false, !aiReady)}`)}
      </div>
    </div>
    <div class="actionbar"><div class="sum" id="barSum"></div><button class="btn lg" id="go2" type="button">${icon('wand')}Edit for me</button></div>`;

  const $v = (sel) => $(sel, root);
  const checked = (name) => $v(`[data-sw="${name}"]`).checked;
  const audition = $v('#auditioner');

  /* ---------- derived text ---------- */
  const musicName = () => {
    if (st.music === 'none') return null;
    if (st.music === 'auto') { const t = tracks[styles[st.style].music]; return t ? t.label : 'Auto'; }
    const b = meta.music_tracks.find((t) => t.id === st.music);
    if (b) return b.label;
    return uploaded.find((t) => t.id === st.music)?.name || 'Your track';
  };
  const lookName = () => (presetKey() === 'brand' ? 'Your brand' : (presets[presetKey()]?.label || 'Captions'));
  const level = () => LEVELS.find((l) => l[0] === st.level) || LEVELS[1];
  const pacingKey = () => st.pacing || styles[st.style].pacing;

  function drawPlan() {
    const a = project.analysis;
    const cutsOn = checked('remove_silence') || checked('remove_fillers');
    let cutSub = 'Pauses, filler words and stutters';
    if (a?.has_audio && a.pacing?.[pacingKey()] && checked('remove_silence')) cutSub = `About ${a.pacing[pacingKey()].removed.toFixed(1)}s of dead air, plus ums and stutters`;
    else if (a && !a.has_audio) cutSub = 'No audio to trim';
    const capsOn = checked('captions') && canTranscribe();
    const mName = musicName();
    const bOn = st.broll !== 'off';
    const brandOn = brandReady && checked('brand');
    const items = [
      [cutsOn, 'scissors', 'Cut the dead air', cutSub, 'cuts'],
      [capsOn, 'captions', capsOn ? `${lookName()} captions` : 'Captions off', capsOn ? 'Word-by-word, perfectly timed' : (checked('captions') ? 'Needs the speech engine or an .srt file' : 'Turned off'), 'captions'],
      [!!mName, 'music', mName ? 'Quiet background music' : 'No music', mName ? `${mName} · ${level()[1].toLowerCase()}, ducks under your voice` : 'Just your voice', 'music'],
      [bOn, 'image', bOn ? 'Relevant b-roll' : 'No b-roll', bOn ? `Your clips${settings.pexels_key_set ? ', stock footage' : ''}${checked('broll_cards') ? ' and keyword cards' : ''}` : 'Turned off', 'broll'],
      [brandOn, 'palette', brandOn ? (settings.brand_name || 'Your brand') : 'Brand not applied', brandOn ? 'Colors, font and handle on every edit' : (brandReady ? 'Turned off' : 'Set up your brand kit to use it'), 'brand'],
      [checked('clean_audio'), 'volume', checked('clean_audio') ? 'Clean, balanced sound' : 'Original sound', checked('clean_audio') ? 'Less hiss, even loudness' : 'No audio cleanup', 'music'],
    ];
    $v('#plan').innerHTML = items.map(([on, ico, t, sub, target]) => `<button type="button" class="plan-item ${on ? '' : 'off'}" data-open="${target}">
      <span class="pi">${icon(ico)}</span><div><b>${esc(t)}</b><span>${esc(sub)}</span></div>${icon('check', 'class="mk"')}</button>`).join('');
    const set = (id, t) => { const el = $v('#' + id); if (el) el.textContent = t; };
    set('sCuts', `${checked('remove_silence') ? 'Pauses' : 'Pauses kept'} · ${checked('remove_fillers') ? 'fillers & stutters' : 'fillers kept'} · ${(st.pacing || 'matches style')}`);
    set('sCaps', checked('captions') ? `${lookName()}${st.position ? ` · ${st.position === 'center' ? 'middle' : st.position}` : ''}${st.scale !== 100 ? ` · ${st.scale}%` : ''}` : 'Off');
    set('sMusic', mName ? `${mName} · ${level()[1]}` : 'No music');
    set('sBroll', bOn ? `${BROLL.find((b) => b[0] === st.broll)[1]}${checked('broll_cards') ? ' · keyword cards on' : ''}` : 'Off');
    set('sBrand', brandOn ? `${settings.brand_name || 'Brand'} applied${checked('logo') && logoReady ? ' · logo' : ''}` : (brandReady ? 'Not applied' : 'Not set up yet'));
    set('sLook', `${styles[st.style].label} · ${st.framing === 'fit' ? 'blurred backdrop' : 'fill frame'}`);
    set('sMore', [$v('#optLang').selectedOptions[0].text, checked('use_ai') ? 'AI assist' : ''].filter(Boolean).join(' · '));
  }

  function refresh() {
    const n = st.platforms.size;
    const labels = meta.platforms.filter((p) => st.platforms.has(p.key)).map((p) => p.label);
    const text = n ? `<b>${plural(n, 'video')}</b> · ${esc(labels.length > 2 ? `${labels.slice(0, 2).join(', ')} +${labels.length - 2}` : labels.join(', '))}` : 'Choose where to post';
    $v('#sum').innerHTML = n ? `Makes ${text}` : text;
    $v('#barSum').innerHTML = text;
    $v('#go').disabled = $v('#go2').disabled = n === 0;
    const over = meta.platforms.filter((p) => st.platforms.has(p.key) && p.recommended_max_s && project.duration > p.recommended_max_s);
    const hint = $v('#lenHint');
    hint.hidden = !over.length;
    if (over.length) hint.textContent = `Your original is ${fmtDur(project.duration)}. ${over.map((p) => p.label).join(' and ')} work${over.length === 1 ? 's' : ''} best at ${fmtDur(Math.min(...over.map((p) => p.recommended_max_s)))} or under. Trimming silence helps, and you can still export it as is.`;
    $v('#focusWrap').hidden = st.framing === 'fit';
    $v('#capBody').hidden = !checked('captions');
    $$('[data-music]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.music === st.music)));
    $$('[data-look]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.look === presetKey())));
    drawPlan();
    drawPace();
  }

  function drawPace() {
    const a = project.analysis, box = $v('#pace'), det = $v('#paceDetail');
    if (!a) return;
    if (!a.has_audio) { box.innerHTML = '<p class="muted small" style="margin-top:12px">This video has no audio, so there are no pauses to trim.</p>'; return; }
    const active = pacingKey();
    const names = { relaxed: 'Relaxed', balanced: 'Balanced', tight: 'Tight' };
    const q = a.audio?.quality;
    const qText = { clean: 'Clean recording. Pauses are easy to find.', good: 'Good recording. Pauses are detected reliably.', noisy: 'Some background noise. Eden adapts its pause detection to it.' }[q];
    box.innerHTML = `${qText ? `<div class="quality ${q === 'noisy' ? 'noisy' : ''}"><i></i>${esc(qText)}</div>` : ''}
      <div class="pace">${Object.entries(a.pacing).map(([k, v]) => `<div class="pace-row ${k === active ? 'on' : ''}"><span>${names[k]}</span>
        <div class="bar"><i style="width:${Math.min(100, (v.removed / project.duration) * 100 * 2.2)}%"></i></div><span class="num tc">−${v.removed.toFixed(1)}s</span></div>`).join('')}</div>`;
    det.textContent = `With ${names[active]} pacing, about ${a.pacing[active].removed.toFixed(1)}s of ${fmtDur(project.duration)} would be removed.`;
  }

  function drawSpeech() {
    const p = $v('#speechPanel');
    const src = project.transcript_source;
    p.innerHTML = `<div class="panel-head" style="margin-bottom:10px"><h2 class="h-sec" id="spH">Captions source</h2></div>
      ${src === 'srt'
        ? `<p style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="pill ok">${icon('check', 'width="13" height="13"')}Using your caption file</span>
           <button class="btn ghost sm" id="rmSrt">Remove</button></p>`
        : health.whisper
          ? `<p><span class="pill ok">${icon('check', 'width="13" height="13"')}Speech engine ready</span></p>
             <p class="muted small" style="margin-top:8px">Eden transcribes the audio on this computer with Whisper (${esc(settings.whisper_model)} model). Nothing is sent online.</p>`
          : `<div class="notice">${icon('alert')}<div>The speech engine is not installed, so Eden cannot caption on its own. Run <code>pip install faster-whisper</code> and restart Eden, or attach an .srt or .vtt file.</div></div>`}
      <p style="margin-top:12px"><label class="btn ghost sm" style="cursor:pointer">${icon('captions')}${src === 'srt' ? 'Replace caption file' : 'Attach .srt or .vtt'}
        <input type="file" id="srtIn" accept=".srt,.vtt,text/vtt,application/x-subrip" hidden></label></p>`;
    $v('#srtIn').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      try { const r = await api(`/projects/${pid}/transcript`, { method: 'POST', form: fd }); project = r.project; toast(`Captions attached (${r.words} words)`); drawSpeech(); refresh(); }
      catch (err) { toast(err.message, 'err'); }
    });
    $v('#rmSrt')?.addEventListener('click', async () => {
      try { project = await api(`/projects/${pid}/transcript`, { method: 'DELETE' }); drawSpeech(); refresh(); toast('Caption file removed'); }
      catch (err) { toast(err.message, 'err'); }
    });
  }

  /* ---------- caption preview images (rendered lazily, once the section is opened) ---------- */
  const brandStamp = `${settings.brand_color}${settings.brand_secondary}${settings.brand_font}${settings.logo_url || ''}${settings.apply_brand}`;
  function loadLooks() {
    const brandOn = brandReady && checked('brand');
    const q = `position=${st.position || ''}&scale=${(st.scale / 100).toFixed(2)}&brand=${brandOn ? 1 : 0}&v=${encodeURIComponent(brandStamp)}`;
    $$('#looks img', root).forEach((img) => {
      const src = `/api/preview/caption.png?preset=${encodeURIComponent(img.dataset.src)}&${q}`;
      if (img.dataset.loaded === src) return;
      img.dataset.loaded = src;
      img.classList.remove('ok');
      img.onload = () => img.classList.add('ok');
      img.onerror = () => { img.closest('.shot').insertAdjacentHTML('beforeend', `<span class="none">${icon('captions')}</span>`); };
      img.src = src;
    });
  }
  const reloadLooks = () => { if ($v('[data-acc="captions"]').open) loadLooks(); };
  $v('[data-acc="captions"]').addEventListener('toggle', () => reloadLooks());

  /* ---------- events ---------- */
  root.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) {
      const d = $v(`[data-acc="${open.dataset.open}"]`);
      d.open = true;
      d.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const sc = e.target.closest('[data-style]');
    if (sc) {
      st.style = sc.dataset.style;
      $$('[data-style]', root).forEach((b) => b.setAttribute('aria-pressed', String(b === sc)));
      if (!st.touched.has('zoom')) $v('[data-sw="zoom"]').checked = styles[st.style].zoom;
      if (!st.touched.has('broll')) { st.broll = styles[st.style].broll; syncSeg('broll', st.broll); }
      prefs.set({ style: st.style });
      reloadLooks(); refresh();
      return;
    }
    const pc = e.target.closest('[data-plat]');
    if (pc) {
      const k = pc.dataset.plat;
      st.platforms.has(k) ? st.platforms.delete(k) : st.platforms.add(k);
      pc.setAttribute('aria-pressed', String(st.platforms.has(k)));
      prefs.set({ platforms: [...st.platforms] });
      refresh();
      return;
    }
    const lk = e.target.closest('[data-look]');
    if (lk) { st.preset = lk.dataset.look; refresh(); return; }
    const play = e.target.closest('[data-play]');
    if (play) {
      e.stopPropagation();
      const key = play.dataset.play.replace('builtin:', '');
      if (!audition.paused && audition.dataset.key === key) { audition.pause(); return; }
      audition.dataset.key = key; audition.src = `/api/music/builtin/${key}/file`;
      audition.play().catch(() => toast('Could not play the preview.', 'err'));
      return;
    }
    const tp = e.target.closest('[data-music]');
    if (tp) { st.music = tp.dataset.music; refresh(); return; }
    const sg = e.target.closest('[data-seg]');
    if (sg) {
      const key = sg.dataset.seg, val = sg.dataset.val;
      if (key === 'broll') { st.broll = val; st.touched.add('broll'); }
      else if (key === 'pacing') st.pacing = val;
      else if (key === 'framing') st.framing = val;
      else if (key === 'level') { st.level = val; prefs.set({ level: val }); }
      else if (key === 'position') { st.position = val; reloadLooks(); }
      syncSeg(key, val);
      refresh();
    }
  });
  root.addEventListener('keydown', (e) => {
    const tp = e.target.closest?.('[data-music]');
    if (tp && (e.key === 'Enter' || e.key === ' ') && e.target === tp) { e.preventDefault(); st.music = tp.dataset.music; refresh(); }
  });
  const syncSeg = (key, val) => $$(`[data-seg="${key}"]`, root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.val === val)));
  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-sw]')) {
      if (e.target.dataset.sw === 'zoom') st.touched.add('zoom');
      if (e.target.dataset.sw === 'brand') reloadLooks();
      refresh();
    }
    if (e.target.id === 'optLang') refresh();
  });
  $v('#optScale').addEventListener('input', (e) => { st.scale = +e.target.value; $v('#scaleVal').textContent = `${st.scale}%`; });
  $v('#optScale').addEventListener('change', () => { reloadLooks(); refresh(); });
  $v('#optFocus').addEventListener('input', (e) => {
    const v = +e.target.value;
    $v('#focusVal').textContent = v < 35 ? 'Left' : v > 65 ? 'Right' : 'Centre';
  });

  async function go(btn) {
    if (!st.platforms.size) return;
    const title = $v('#optTitle').value.trim();
    const lang = $v('#optLang').value;
    const capsOn = checked('captions');
    const options = {
      style: st.style, title: title && title !== project.name ? title : null,
      remove_silence: checked('remove_silence'), remove_fillers: checked('remove_fillers'),
      remove_filler_phrases: checked('remove_filler_phrases'),
      captions: capsOn, caption_preset: capsOn ? presetKey() : null,
      caption_position: st.position || null, caption_scale: st.scale / 100,
      brand: brandReady ? checked('brand') : false, broll: st.broll, broll_cards: checked('broll_cards'),
      zoom: st.touched.has('zoom') ? checked('zoom') : null, pacing: st.pacing || null,
      framing: st.framing, focus: +$v('#optFocus').value / 100, clean_audio: checked('clean_audio'),
      language: lang === 'auto' ? null : lang, use_ai: aiReady && checked('use_ai'),
      logo: logoReady ? checked('logo') : null,
      music_id: st.music === 'none' ? null : st.music, music_volume: level()[2],
      whoosh_sfx_id: $v('#optWhoosh').value || null, pop_sfx_id: $v('#optPop').value || null,
    };
    $$('#go, #go2', root).forEach((b) => { b.disabled = true; });
    try {
      const vids = await api(`/projects/${pid}/render`, { method: 'POST', body: { platforms: [...st.platforms], options } });
      sessionStorage.setItem(`eden.jobs.${pid}`, JSON.stringify(vids.map((v) => v.id)));
      location.hash = `#/create/${pid}/results`;
    } catch (err) { toast(err.message, 'err'); refresh(); }
  }
  $v('#go').addEventListener('click', (e) => go(e.currentTarget));
  $v('#go2').addEventListener('click', (e) => go(e.currentTarget));

  drawSpeech();
  refresh();
  if (!project.analysis) {
    api(`/projects/${pid}/analyze`, { method: 'POST' }).then((a) => { project.analysis = a; refresh(); })
      .catch(() => { $v('#pace').innerHTML = '<p class="muted small" style="margin-top:12px">Could not measure pauses. The edit will still work.</p>'; });
  }
  return () => audition.pause();
}

function shortLabel(p, group) {
  if (p.label === group) return 'Video';
  return p.label.startsWith(group + ' ') ? p.label.slice(group.length + 1) : p.label;
}

/* ----------------------------------------------------------------- results */
async function resultsView(root, ctx, pid) {
  let ids = [];
  try { ids = JSON.parse(sessionStorage.getItem(`eden.jobs.${pid}`) || '[]'); } catch { ids = []; }
  if (!ids.length) { location.hash = `#/create/${pid}`; return; }
  root.innerHTML = `
    <div class="page-head"><div><h1 class="h-page" id="resTitle">Editing your video</h1>
      <p id="resSub">This usually takes a few minutes. You can leave this page. Finished videos are always in Videos.</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn ghost" href="#/create/${esc(pid)}">${icon('scissors')}Make another version</a>
      <a class="btn ghost" href="#/saved">${icon('film')}All videos</a></div></div>
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
      $('#resTitle', root).textContent = busy ? 'Editing your video' : (ok ? (ok === 1 ? 'Your video is ready' : 'Your videos are ready') : 'Nothing finished');
      if (!busy) $('#resSub', root).textContent = ok ? 'Play it, download it, or open Fine-tune to adjust cuts, captions and b-roll.' : 'See the messages below, then retry or change your settings.';
      clearTimeout(timer);
      if (busy) timer = setTimeout(tick, 1200);
    } catch { timer = setTimeout(tick, 3000); }
  }
  await tick();
  return () => { stopped = true; clearTimeout(timer); };
}

