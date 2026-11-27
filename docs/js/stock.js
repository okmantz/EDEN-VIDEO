// Optional stock b-roll from Pexels (free API key, set in Brand > Integrations). Used by the one-click editor
// when a key is present; every failure falls back to the built-in animated scenes, so an edit never breaks.
const API = 'https://api.pexels.com/videos/search';

const withTimeout = (ms) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return { signal: c.signal, done: () => clearTimeout(t) }; };

/** Check a key and return {ok, message}. */
export async function testKey(key) {
  if (!key || key.length < 20) return { ok: false, message: 'That does not look like a Pexels API key.' };
  const to = withTimeout(9000);
  try {
    const r = await fetch(`${API}?query=nature&per_page=1`, { headers: { Authorization: key.trim() }, signal: to.signal });
    if (r.status === 401 || r.status === 403) return { ok: false, message: 'Pexels rejected this key.' };
    if (!r.ok) return { ok: false, message: `Pexels answered ${r.status}.` };
    const j = await r.json();
    return j.videos?.length ? { ok: true, message: 'Connected. Stock footage is on.' } : { ok: true, message: 'Connected.' };
  } catch (e) { return { ok: false, message: e.name === 'AbortError' ? 'Pexels did not answer in time.' : 'Could not reach Pexels. Check your connection.' }; }
  finally { to.done(); }
}

/** Download one short, relevant clip. Returns a File or null. */
export async function fetchStockFile(query, { key, portrait = true, maxMB = 18 } = {}) {
  if (!key || !query) return null;
  const to = withTimeout(9000);
  let hit = null;
  try {
    const r = await fetch(`${API}?query=${encodeURIComponent(query)}&per_page=8&orientation=${portrait ? 'portrait' : 'landscape'}&size=medium`, { headers: { Authorization: key.trim() }, signal: to.signal });
    if (!r.ok) return null;
    const j = await r.json();
    for (const v of j.videos || []) {
      if (v.duration < 3) continue;
      const files = (v.video_files || []).filter((f) => f.file_type === 'video/mp4' && f.width && f.height && Math.min(f.width, f.height) >= 480 && Math.min(f.width, f.height) <= 1100);
      files.sort((a, b) => Math.abs(Math.min(a.width, a.height) - 720) - Math.abs(Math.min(b.width, b.height) - 720));
      if (files[0]) { hit = { file: files[0], id: v.id }; break; }
    }
  } catch { return null; } finally { to.done(); }
  if (!hit) return null;
  const dl = withTimeout(25000);
  try {
    const r = await fetch(hit.file.link, { signal: dl.signal });
    if (!r.ok) return null;
    const blob = await r.blob();
    if (!blob.size || blob.size > maxMB * 1e6) return null;
    return new File([blob], `stock-${query.replace(/\W+/g, '-')}-${hit.id}.mp4`, { type: 'video/mp4' });
  } catch { return null; } finally { dl.done(); }
}
