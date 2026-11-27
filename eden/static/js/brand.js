// Brand kit: name, handle, colors, font and logo, with a live preview rendered by the real caption engine.
import { api } from './api.js';
import { $, $$, esc, icon, toast, debounce, applyTheme } from './ui.js';

const SWATCHES = ['#2EE6A6', '#7C5CFF', '#FF5C8A', '#FFB020', '#3B82F6', '#22D3EE', '#F97316', '#EF4444', '#A3E635', '#E5E7EB'];
const POS = [['top_left', 'Top left'], ['top_right', 'Top right'], ['bottom_left', 'Bottom left'], ['bottom_right', 'Bottom right']];

function loadFontFaces(fonts) {
  if (document.getElementById('brandFonts')) return;
  const st = document.createElement('style');
  st.id = 'brandFonts';
  st.textContent = fonts.map((f) => `@font-face{font-family:"ef-${f.key}";src:url("/static/fonts/${f.key}.woff2") format("woff2");font-display:swap}`).join('\n');
  document.head.appendChild(st);
}
const hexOk = (v) => /^#[0-9a-f]{6}$/i.test(v || '');

export async function brand(root, ctx) {
  let s = await api('/settings');
  const fonts = ctx.meta.caption_fonts;
  loadFontFaces(fonts);
  const toggle = (name, title, desc, on, disabled = false) => `<label class="switch"><div class="txt"><b>${esc(title)}</b><small>${esc(desc)}</small></div>
    <input type="checkbox" data-k="${name}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="track"></span></label>`;
  const colorField = (key, label, hint) => `<div class="colorf"><span>${label}</span>
      <div class="cin"><input type="color" data-color="${key}" value="${esc(s[key])}" aria-label="${label}"><input type="text" data-hex="${key}" value="${esc(s[key])}" maxlength="7" aria-label="${label} hex code" spellcheck="false"></div>
      <small>${hint}</small></div>`;
  const groups = {};
  fonts.forEach((f) => (groups[f.group] ||= []).push(f));

  root.innerHTML = `
    <div class="page-head"><div><h1 class="h-page">Brand kit</h1>
      <p>Set this up once. Eden uses it for caption colors, keyword cards, your handle and your logo on every video.</p></div>
      <span class="saved-flag" id="flag" aria-live="polite">${icon('check', 'width="14" height="14" style="vertical-align:-2px"')} Saved</span></div>
    <div class="brand-grid">
      <div class="brand-col">
        <section class="panel"><div class="panel-head"><h2 class="h-sec">Identity</h2></div>
          <div class="form-grid">
            <label class="field"><span>Brand name</span><input type="text" data-k="brand_name" value="${esc(s.brand_name)}" maxlength="60" placeholder="e.g. Eden Studio"><small>Helps Eden spell your name right in captions.</small></label>
            <label class="field"><span>Handle</span><input type="text" data-k="brand_handle" value="${esc(s.brand_handle)}" maxlength="40" placeholder="@yourhandle"><small>Shown small in a corner of the video.</small></label>
          </div>
          ${toggle('show_handle', 'Show my handle on videos', 'A small, tidy watermark so people know where the video came from.', s.show_handle)}
        </section>

        <section class="panel"><div class="panel-head"><h2 class="h-sec">Colors</h2><p>Primary is the one that matters most.</p></div>
          <div class="colors">
            ${colorField('brand_color', 'Primary', 'Highlighted words, accents, keyword cards.')}
            ${colorField('brand_secondary', 'Background', 'Caption boxes and card backgrounds.')}
            ${colorField('brand_text', 'Text', 'Main caption text.')}
          </div>
          <div style="margin-top:14px"><div class="sub-label" style="margin-bottom:8px">Quick picks for the primary color</div>
            <div class="swatches" id="swatches">${SWATCHES.map((c) => `<button type="button" data-sw="${c}" style="background:${c}" aria-label="Use ${c}" aria-pressed="${c.toLowerCase() === s.brand_color.toLowerCase()}"></button>`).join('')}</div></div>
        </section>

        <section class="panel"><div class="panel-head"><h2 class="h-sec">Font</h2><p>Used for your keyword cards and the “Your brand” caption look.</p></div>
          ${Object.entries(groups).map(([g, list]) => `<div class="sub-label" style="margin:14px 0 8px">${esc(g)}</div>
            <div class="fontpick">${list.map((f) => `<button type="button" data-font="${esc(f.key)}" aria-pressed="${f.key === s.brand_font}">
              <span class="fs" style="font-family:'ef-${esc(f.key)}',sans-serif">${esc(s.brand_name || 'Your brand')}</span><small>${esc(f.label)}</small></button>`).join('')}</div>`).join('')}
        </section>

        <section class="panel"><div class="panel-head"><h2 class="h-sec">Logo</h2></div>
          <div class="logo-box">
            <div class="prev">${s.logo_url ? `<img src="${esc(s.logo_url)}?t=${Date.now()}" alt="Your logo">` : '<span class="muted small">No logo</span>'}</div>
            <div style="display:grid;gap:8px">
              <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn ghost sm" style="cursor:pointer">${icon('upload')}${s.logo_url ? 'Replace logo' : 'Upload logo'}<input type="file" id="logoIn" accept="image/png,image/jpeg,image/webp" hidden></label>
              ${s.logo_url ? `<button class="btn danger sm" id="logoRm" type="button">Remove</button>` : ''}</div>
              <small class="muted">A PNG with a transparent background looks best.</small></div>
          </div>
          ${s.logo_url ? `<div class="form-grid" style="margin-top:18px">
            <div class="field"><span>Position</span><div class="posgrid" id="posgrid">${POS.map(([k, l]) => `<button type="button" data-pos="${k}" aria-label="${l}" aria-pressed="${k === s.logo_position}"></button>`).join('')}</div></div>
            <div class="field"><span>Size</span><div class="seg" id="sizeseg">${[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']].map(([k, l]) => `<button type="button" data-size="${k}" aria-pressed="${k === s.logo_size}">${l}</button>`).join('')}</div></div>
          </div>${toggle('logo_enabled', 'Add my logo to every video', 'You can still turn it off for a single video.', s.logo_enabled)}` : ''}
        </section>

        <section class="panel"><div class="panel-head"><h2 class="h-sec">How Eden uses it</h2></div>
          ${toggle('apply_brand', 'Apply my brand to every video', 'Tints captions and keyword cards with your colors and adds your handle. Turn off to use each caption look as designed.', s.apply_brand)}
          ${toggle('brand_theme', 'Use my primary color in the Eden app too', 'Changes the accent color of buttons and highlights in this app.', s.brand_theme)}
        </section>
      </div>

      <aside class="preview-wrap" aria-label="Live preview">
        <div class="phone-prev" id="phone"><div class="scr"><img id="prevImg" alt="Preview of a captioned video with your brand"></div></div>
        <div class="cap">Live preview, rendered by the same engine as your videos</div>
        <a class="btn ghost sm" href="#/create" style="justify-self:center">${icon('wand')}Try it on a video</a>
      </aside>
    </div>`;

  /* ---------- saving ---------- */
  const flag = () => $('#flag', root);
  async function save(patch) {
    try {
      s = await api('/settings', { method: 'PUT', body: patch });
      Object.assign(ctx.settings, s);
      ctx.refreshBrand?.();
      applyTheme(ctx.settings);
      const f = flag(); f.classList.add('show'); setTimeout(() => f.classList.remove('show'), 1500);
      refreshPreview();
      return true;
    } catch (err) { toast(err.message, 'err'); return false; }
  }
  const saveSoon = debounce(save, 450);
  let previewSeq = 0;
  function refreshPreview() {
    const img = $('#prevImg', root), seq = ++previewSeq;
    const url = `/api/preview/caption.png?preset=brand&show_brand=1&brand=1&text=${encodeURIComponent((s.brand_name ? `${s.brand_name} makes every second count` : 'Make every second count'))}&v=${Date.now()}`;
    $('#phone', root).classList.add('loading');
    const probe = new Image();
    probe.onload = () => { if (seq === previewSeq) { img.src = url; $('#phone', root).classList.remove('loading'); } };
    probe.onerror = () => { if (seq === previewSeq) $('#phone', root).classList.remove('loading'); };
    probe.src = url;
  }
  const refreshFontSamples = () => $$('.fontpick .fs', root).forEach((el) => { el.textContent = s.brand_name || 'Your brand'; });

  /* ---------- events ---------- */
  $$('[data-k]', root).forEach((el) => {
    const k = el.dataset.k;
    el.addEventListener('change', () => save({ [k]: el.type === 'checkbox' ? el.checked : el.value }).then(() => { if (k === 'brand_name') refreshFontSamples(); }));
    if (el.type === 'text') el.addEventListener('input', () => saveSoon({ [k]: el.value }));
  });
  $$('[data-color]', root).forEach((el) => {
    const key = el.dataset.color, hex = $(`[data-hex="${key}"]`, root);
    el.addEventListener('input', () => { hex.value = el.value.toUpperCase(); });
    el.addEventListener('change', () => { hex.value = el.value.toUpperCase(); save({ [key]: el.value.toUpperCase() }); markSwatch(); });
  });
  $$('[data-hex]', root).forEach((el) => {
    const key = el.dataset.hex, pick = $(`[data-color="${key}"]`, root);
    el.addEventListener('change', () => {
      let v = el.value.trim(); if (v && v[0] !== '#') v = '#' + v;
      if (!hexOk(v)) { toast('Use a hex color like #7C5CFF.', 'err'); el.value = s[key]; return; }
      pick.value = v; el.value = v.toUpperCase(); save({ [key]: v.toUpperCase() }); markSwatch();
    });
  });
  const markSwatch = () => $$('#swatches button', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sw.toLowerCase() === $('[data-hex="brand_color"]', root).value.toLowerCase())));
  $('#swatches', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-sw]'); if (!b) return;
    $('[data-color="brand_color"]', root).value = b.dataset.sw; $('[data-hex="brand_color"]', root).value = b.dataset.sw;
    markSwatch(); save({ brand_color: b.dataset.sw });
  });
  root.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-font]');
    if (f) { $$('[data-font]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === f))); save({ brand_font: f.dataset.font }); return; }
    const p = e.target.closest('[data-pos]');
    if (p) { $$('[data-pos]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === p))); save({ logo_position: p.dataset.pos }); return; }
    const z = e.target.closest('[data-size]');
    if (z) { $$('[data-size]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === z))); save({ logo_size: z.dataset.size }); return; }
    if (e.target.closest('#logoRm')) {
      try { s = await api('/settings/logo', { method: 'DELETE' }); Object.assign(ctx.settings, s); ctx.refreshBrand?.(); ctx.navigate(); } catch (err) { toast(err.message, 'err'); }
    }
  });
  $('#logoIn', root).addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try { s = await api('/settings/logo', { method: 'POST', form: fd }); Object.assign(ctx.settings, s); ctx.refreshBrand?.(); toast('Logo uploaded'); ctx.navigate(); }
    catch (err) { toast(err.message, 'err'); }
  });
  refreshPreview();
}
