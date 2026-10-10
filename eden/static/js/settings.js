import { api } from './api.js';
import { $, $$, esc, icon, toast, debounce } from './ui.js';

const MODELS = [['tiny', 'Tiny: fastest, least accurate'], ['base', 'Base: fast, good for clear speech'], ['small', 'Small: balanced (recommended)'],
  ['medium', 'Medium: accurate, slower'], ['large-v3', 'Large v3: most accurate, needs a strong computer']];
const LANGS = [['auto', 'Detect automatically'], ['en', 'English'], ['es', 'Spanish'], ['de', 'German'], ['fr', 'French'], ['it', 'Italian'],
  ['pt', 'Portuguese'], ['nl', 'Dutch'], ['pl', 'Polish'], ['tr', 'Turkish'], ['ru', 'Russian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'], ['ar', 'Arabic'], ['hi', 'Hindi']];

const toggle = (name, title, desc, on) => `<label class="switch"><div class="txt"><b>${esc(title)}</b><small>${esc(desc)}</small></div>
  <input type="checkbox" data-k="${name}" ${on ? 'checked' : ''}><span class="track"></span></label>`;

export async function settings(root, ctx) {
  let s = await api('/settings');
  const health = await api('/health');
  const meta = ctx.meta;

  const draw = () => {
    root.innerHTML = `
    <div class="page-head"><div><h1 class="h-page">Settings</h1><p>Changes save automatically and apply to your next video.</p></div>
      <span class="saved-flag" id="flag" aria-live="polite">${icon('check', 'width="14" height="14" style="vertical-align:-2px"')} Saved</span></div>
    <div class="set-grid">
      <nav class="set-nav" aria-label="Settings sections">
        ${[['profile', 'Profile'], ['brand', 'Branding'], ['defaults', 'Editing defaults'], ['speech', 'Speech recognition'], ['ai', 'AI assist'], ['stock', 'Stock footage'], ['system', 'System status']]
          .map(([id, l]) => `<a href="#/settings" data-jump="${id}">${l}</a>`).join('')}
      </nav>
      <div class="set-sections">
        <section class="panel" id="profile"><div class="panel-head"><h2 class="h-sec">Profile</h2></div>
          <label class="field"><span>Your name</span><input type="text" data-k="display_name" value="${esc(s.display_name)}" maxlength="80" placeholder="Shown on the home page"></label>
          <p class="muted small" style="margin-top:10px">Eden runs on your own computer, so there is no account to sign in to. Your videos and settings stay in the data folder.</p>
        </section>

        <section class="panel" id="brand"><div class="panel-head"><h2 class="h-sec">Branding</h2></div>
          <div class="form-grid">
            <label class="field"><span>Highlight colour</span><div style="display:flex;gap:10px;align-items:center"><input type="color" data-k="brand_color" value="${esc(s.brand_color)}"><code class="small">${esc(s.brand_color)}</code></div></label>
            <label class="field"><span>Caption font</span><input type="text" data-k="caption_font" value="${esc(s.caption_font)}" maxlength="60"><small>Must be installed on this computer. Falls back to a default if not.</small></label>
            <div class="full">${toggle('use_brand_color', 'Use my colour for highlighted words', 'Replaces the style’s highlight colour in word-by-word caption styles.', s.use_brand_color)}</div>
          </div>
          <div class="logo-box" style="margin-top:14px">
            <div class="prev">${s.logo_url ? `<img src="${esc(s.logo_url)}?t=${Date.now()}" alt="Your logo">` : '<span class="muted small">No logo</span>'}</div>
            <div style="display:grid;gap:8px">
              <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn ghost sm" style="cursor:pointer">${icon('upload')}${s.logo_url ? 'Replace logo' : 'Upload logo'}<input type="file" id="logoIn" accept="image/png,image/jpeg,image/webp" hidden></label>
              ${s.logo_url ? `<button class="btn danger sm" id="logoRm">Remove</button>` : ''}</div>
              <small class="muted">PNG with a transparent background works best.</small></div>
          </div>
          ${s.logo_url ? toggle('logo_enabled', 'Add my logo to every video', 'You can still turn it off per video.', s.logo_enabled) : ''}
        </section>

        <section class="panel" id="defaults"><div class="panel-head"><h2 class="h-sec">Editing defaults</h2></div>
          <div class="form-grid">
            <label class="field"><span>Default style</span><select data-k="default_style">${meta.styles.map((x) => `<option value="${esc(x.key)}" ${x.key === s.default_style ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
            <label class="field"><span>Loudness target</span><select data-k="loudness">
              ${[[-14, '−14 LUFS: social media standard'], [-16, '−16 LUFS: quieter, good for podcasts'], [-12, '−12 LUFS: louder']].map(([v, l]) => `<option value="${v}" ${Number(s.loudness) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <div class="field full"><span>Platforms selected by default</span><div class="chips" id="defPlats">
              ${meta.platforms.map((p) => `<button class="chip" type="button" data-plat="${esc(p.key)}" aria-pressed="${s.default_platforms.includes(p.key)}">${esc(p.label)}</button>`).join('')}</div></div>
          </div>
        </section>

        <section class="panel" id="speech"><div class="panel-head"><h2 class="h-sec">Speech recognition</h2></div>
          <p class="muted small" style="margin-bottom:14px">Used for captions and for finding “um” and “uh”. It runs entirely on this computer with Whisper. The first run downloads the model once.</p>
          <div class="form-grid">
            <label class="field"><span>Model</span><select data-k="whisper_model">${MODELS.map(([k, l]) => `<option value="${k}" ${k === s.whisper_model ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label class="field"><span>Spoken language</span><select data-k="language">${LANGS.map(([k, l]) => `<option value="${k}" ${k === s.language ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          </div>
        </section>

        <section class="panel" id="ai"><div class="panel-head"><h2 class="h-sec">AI assist with Ollama</h2><span class="pill">Optional</span></div>
          <p class="muted small" style="margin-bottom:6px">Ollama lets Eden suggest a title, description and hashtags, and choose which words to emphasise. Eden is fully functional without it, and falls back on its built-in logic if Ollama is off or unreachable. Your transcript goes only to the Ollama address below.</p>
          ${toggle('ollama_enabled', 'Turn on AI assist', 'Adds an “AI assist” option when you create a video.', s.ollama_enabled)}
          <div class="form-grid">
            <label class="field"><span>Ollama address</span><input type="url" data-k="ollama_url" value="${esc(s.ollama_url)}" placeholder="http://127.0.0.1:11434"></label>
            <label class="field"><span>Model</span><input type="text" data-k="ollama_model" value="${esc(s.ollama_model)}" placeholder="llama3.2"></label>
          </div>
          <div style="display:flex;gap:12px;align-items:center;margin-top:14px;flex-wrap:wrap"><button class="btn ghost sm" id="testOllama">Test connection</button><span class="small" id="ollamaRes" aria-live="polite"></span></div>
        </section>

        <section class="panel" id="stock"><div class="panel-head"><h2 class="h-sec">Stock footage</h2><span class="pill">Optional</span></div>
          <p class="muted small" style="margin-bottom:14px">With a free <a href="https://www.pexels.com/api/" target="_blank" rel="noopener" style="color:var(--amber)">Pexels API key</a>, Eden can fetch short stock clips for B-roll when your library is small. Only a search word leaves this computer.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
            <label class="field" style="flex:1;min-width:240px"><span>API key ${s.pexels_key_set ? '<span class="pill ok">Saved</span>' : ''}</span>
              <input type="password" id="pexKey" autocomplete="off" placeholder="${s.pexels_key_set ? 'Enter a new key to replace it' : 'Paste your key'}"></label>
            <button class="btn ghost" id="pexSave">Save key</button>${s.pexels_key_set ? '<button class="btn danger" id="pexRm">Remove key</button>' : ''}
          </div>
        </section>

        <section class="panel" id="system"><div class="panel-head"><h2 class="h-sec">System status</h2></div>
          <div class="status-list">
            ${statusRow('FFmpeg', 'Renders every video.', !!health.ffmpeg, health.ffmpeg ? 'Installed' : 'Not found')}
            ${statusRow('Speech engine', 'Captions and filler-word removal.', health.whisper, health.whisper ? 'Ready' : 'Not installed', health.whisper ? '' : 'Run pip install faster-whisper, then restart Eden. You can still attach .srt files.')}
            ${statusRow('Ollama', 'Optional AI assist.', s.ollama_enabled, s.ollama_enabled ? 'On' : 'Off', '', 'neutral')}
            ${statusRow('Pexels stock footage', 'Optional B-roll source.', s.pexels_key_set, s.pexels_key_set ? 'Key saved' : 'Off', '', 'neutral')}
            <div class="status-row"><div><b>Version</b></div><span class="muted tc">${esc(health.version)}</span></div>
          </div>
        </section>
      </div>
    </div>`;
    wire();
  };

  const flag = () => $('#flag', root);
  async function save(patch) {
    try {
      s = await api('/settings', { method: 'PUT', body: patch });
      Object.assign(ctx.settings, s);
      const f = flag(); f.classList.add('show'); setTimeout(() => f.classList.remove('show'), 1600);
      return true;
    } catch (err) { toast(err.message, 'err'); return false; }
  }
  const saveSoon = debounce(save, 500);

  function wire() {
    $$('[data-k]', root).forEach((el) => {
      const k = el.dataset.k;
      el.addEventListener('change', async () => {
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (k === 'loudness') v = Number(v);
        await save({ [k]: v });
        if (k === 'brand_color') { const c = el.parentElement.querySelector('code'); if (c) c.textContent = v; }
      });
      if (el.type === 'text' || el.type === 'url') el.addEventListener('input', () => { if (el.value.trim() || k === 'display_name') saveSoon({ [k]: el.value }); });
    });
    $('#defPlats', root).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-plat]'); if (!b) return;
      const set = new Set(s.default_platforms);
      set.has(b.dataset.plat) ? set.delete(b.dataset.plat) : set.add(b.dataset.plat);
      if (!set.size) return toast('Keep at least one platform selected.', 'err');
      if (await save({ default_platforms: [...set] })) b.setAttribute('aria-pressed', String(set.has(b.dataset.plat)));
    });
    $('#logoIn', root).addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      try { s = await api('/settings/logo', { method: 'POST', form: fd }); Object.assign(ctx.settings, s); toast('Logo uploaded'); draw(); }
      catch (err) { toast(err.message, 'err'); }
    });
    $('#logoRm', root)?.addEventListener('click', async () => {
      s = await api('/settings/logo', { method: 'DELETE' }); Object.assign(ctx.settings, s); draw();
    });
    $('#testOllama', root).addEventListener('click', async () => {
      const out = $('#ollamaRes', root);
      out.textContent = 'Checking…'; out.className = 'small muted';
      try {
        const r = await api('/ollama/test', { method: 'POST', body: { url: $('[data-k="ollama_url"]', root).value, model: $('[data-k="ollama_model"]', root).value } });
        if (!r.reachable) { out.textContent = 'Could not reach Ollama at that address. Is it running?'; out.style.color = 'var(--danger)'; }
        else if (!r.model_installed) { out.textContent = `Connected, but that model is not installed. Run: ollama pull ${$('[data-k="ollama_model"]', root).value}`; out.style.color = 'var(--amber)'; }
        else { out.textContent = 'Connected. The model is ready.'; out.style.color = 'var(--leaf)'; }
      } catch (err) { out.textContent = err.message; out.style.color = 'var(--danger)'; }
    });
    $('#pexSave', root).addEventListener('click', async () => {
      const v = $('#pexKey', root).value.trim();
      if (!v) return toast('Paste a key first.', 'err');
      if (await save({ pexels_key: v })) { toast('Key saved'); draw(); }
    });
    $('#pexRm', root)?.addEventListener('click', async () => { if (await save({ pexels_key: '' })) { toast('Key removed'); draw(); } });
    $$('[data-jump]', root).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); $('#' + a.dataset.jump, root).scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  }
  draw();
}

function statusRow(name, desc, ok, label, hint = '', neutral = '') {
  const cls = neutral ? (ok ? 'ok' : '') : (ok ? 'ok' : 'bad');
  return `<div class="status-row"><div><b>${esc(name)}</b><small>${esc(desc)}${hint ? ' ' + esc(hint) : ''}</small></div><span class="pill ${cls}">${esc(label)}</span></div>`;
}
