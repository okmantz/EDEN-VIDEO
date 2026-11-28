// EDEN Studio tools: version history, Script-to-Video, SRT export and Magic Resize.
// Everything here runs on the device and respects the signed-in account (versions are stored per account).
import { h, deep, uid, downloadBlob, safeName, fmtTime } from './util.js';
import { Storage, idbPut, idbDel, idbAll } from './media.js';
import { Session, currentUid } from './session.js';
import { Accounts } from './accounts.js';
import { RATIOS, genClip, textClip, projectDuration } from './model.js';
import { GENERATORS } from './generators.js';
import { TEXT_PRESETS } from './textrender.js';

const MAX_VERSIONS = 30;
const AUTO_EVERY = 5 * 60 * 1000;

/* ------------------------------------------------------------------------------------------ versions */
export async function saveVersion(project, label = 'Manual save', auto = false) {
  const snap = deep({ canvas: project.canvas, tracks: project.tracks, media: project.media, name: project.name });
  await idbPut('versions', { id: uid('ver'), pid: project.id, uid: currentUid() || null, at: Date.now(), label, auto, snap });
  const mine = await listVersions(project.id);
  for (const v of mine.slice(MAX_VERSIONS)) await idbDel('versions', v.id);
}
export async function listVersions(pid) {
  const u = currentUid() || null;
  return (await idbAll('versions')).filter((v) => v.pid === pid && (v.uid || null) === u).sort((a, b) => b.at - a.at);
}

/* ------------------------------------------------------------------------------------------ SRT */
const srtTime = (s) => { const ms = Math.round(s * 1000); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
export function captionsToSrt(project) {
  let tracks = project.tracks.filter((t) => t.kind === 'text' && /caption/i.test(t.name));
  if (!tracks.length) tracks = project.tracks.filter((t) => t.kind === 'text');
  const cues = tracks.flatMap((t) => t.clips).filter((c) => c.kind === 'text' && c.text?.content?.trim()).sort((a, b) => a.start - b.start);
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.start + c.dur)}\n${c.text.content.trim()}\n`).join('\n');
}

/* ------------------------------------------------------------------------------------------ script to video */
// Keyword -> scene. First match wins; the fallback rotates through calm scenes so a script never repeats one back to back.
const SCENES = [
  [/gold|bullion|wealth|rich|luxur/i, 'goldbars'], [/cash|dollar|money|profit|income|payout|revenue/i, 'cashstacks'], [/coin|crypto|bitcoin/i, 'goldcoins'],
  [/market|trade|trader|chart|stock|price|candle/i, 'tickerboard'], [/city|skyline|business|office|startup|company|brand/i, 'skylinemidday'],
  [/night|late|dark|nightlife|neon/i, 'aerialnight'], [/morning|sunrise|start|begin|wake/i, 'skylinesunrise'], [/ocean|sea|beach|wave|calm|peace/i, 'oceansunset'],
  [/mountain|climb|summit|goal|peak|journey/i, 'mountainsunrise'], [/storm|fear|doubt|struggle|fail|loss|risk/i, 'stormclouds'], [/tech|data|code|software|app|ai|build/i, 'datacenter'],
  [/space|future|dream|vision|universe/i, 'nebula'], [/love|wedding|together|family|home/i, 'bokehwarm'], [/forest|nature|grow|fresh/i, 'forestrays'], [/cold|winter|snow|quiet/i, 'snownight'],
];
const FALLBACK = ['skylinemist', 'aerialdusk', 'mountainday', 'oceansunset', 'bokehteal', 'marbleblack', 'satinmidnight', 'skylinemidday'];
export function planScript(text) {
  const parts = text.split(/\n+/).map((s) => s.trim()).filter(Boolean).flatMap((l) => (l.length > 90 ? l.split(/(?<=[.!?])\s+/) : [l])).filter(Boolean);
  let fb = 0, last = null;
  return parts.map((line) => {
    let gen = (SCENES.find(([re]) => re.test(line)) || [])[1];
    if (!gen || gen === last) gen = FALLBACK[fb++ % FALLBACK.length];
    last = gen;
    const words = line.split(/\s+/).length;
    return { line, gen, dur: Math.min(7, Math.max(2.4, 1.1 + words * 0.38)) };
  });
}
export function applyScript(app, text, style = 'Clean Pro') {
  const plan = planScript(text); if (!plan.length) return 0;
  const preset = TEXT_PRESETS.find((p) => p.name === style) || TEXT_PRESETS[0];
  app.store.commit((p) => {
    const main = p.tracks.find((t) => t.kind === 'video'); const tx = app.store.addTrack('text'); tx.name = 'Script';
    let t = projectDuration(p);
    for (const sc of plan) {
      const g = GENERATORS.find((x) => x.id === sc.gen) || GENERATORS[0];
      main.clips.push(genClip(g, t, sc.dur));
      const c = textClip(t + 0.2, sc.dur - 0.4, { ...preset.text, content: sc.line, size: 0.062 }); c.name = sc.line.slice(0, 24); c.tf.y = 0.02; c.animIn = { id: 'fade', dur: 0.35 }; tx.clips.push(c);
      t += sc.dur;
    }
  });
  return plan.length;
}

/* ------------------------------------------------------------------------------------------ magic resize */
async function resizeCopy(app, ratioId) {
  const R = RATIOS.find((x) => x.id === ratioId); const src = app.store.project;
  await Storage.saveProject(app.store.project, {});
  const np = deep(src); np.id = uid('prj'); np.name = `${src.name} · ${R.id}`.slice(0, 80); np.created = np.updated = Date.now();
  np.canvas = { ...np.canvas, ratio: R.id, w: R.w, h: R.h };
  let json = JSON.stringify(np);
  for (const m of Object.values(src.media || {})) {
    if (m.builtin) continue;
    const blob = await Storage.getBlob(m.id); if (!blob) continue;
    const nid = uid('med'); await Storage.putBlob(nid, np.id, blob, m.name); json = json.split(m.id).join(nid);
  }
  await Storage.saveProject(JSON.parse(json), {});
  return np.name;
}

/* ------------------------------------------------------------------------------------------ UI */
const btn = (title, sub, fn) => h('button.btn.ghost.studio-item', { type: 'button', on: { click: fn } }, h('b', title), h('small', sub));

export function studioMenu(app) {
  const m = app.modal({ title: 'Studio tools', lead: 'Extras that run on your device and stay in your account.', dismiss: true, body: h('div.studio-list',
    btn('Script to Video', 'Paste a script. Get scenes with matching b-roll and on-screen text.', () => { m.close(); scriptDialog(app); }),
    btn('Version history', 'Save a snapshot or go back to an earlier version of this project.', () => { m.close(); versionsDialog(app); }),
    btn('Magic Resize', 'Make copies of this project in other sizes (Reels, YouTube, square, portrait).', () => { m.close(); resizeDialog(app); }),
    btn('Export captions (.srt)', 'Download your caption or text track as a subtitle file.', () => { m.close(); exportSrt(app); })),
    actions: [{ label: 'Close', ghost: true }] });
}

function exportSrt(app) {
  const srt = captionsToSrt(app.store.project);
  if (!srt) { app.toast('Add captions or text first', 'err'); return; }
  downloadBlob(new Blob([srt], { type: 'application/x-subrip' }), safeName(app.store.project.name) + '.srt'); app.toast('Captions exported', 'ok');
}

function scriptDialog(app) {
  const ta = h('textarea.field', { style: { height: '190px' }, placeholder: 'One idea per line. Example:\nMost people start the day behind.\nThe ones who win start before sunrise.\nBuild the habit. The results follow.' });
  const style = h('select.field', ...['Clean Pro', 'Elegant', 'Cinematic', 'Minimal', 'Bold Impact'].filter((n) => TEXT_PRESETS.some((p) => p.name === n)).map((n) => h('option', { value: n }, n)));
  app.modal({ title: 'Script to Video', lead: 'Each line becomes a scene with matching b-roll, text and timing. Edit anything afterwards.', body: h('div', ta, h('label.sub', 'Text style'), style), dismiss: true,
    actions: [{ label: 'Cancel', ghost: true }, { label: 'Build video', primary: true, onClick: () => {
      if (!ta.value.trim()) return false;
      const n = applyScript(app, ta.value, style.value); app.engine?.seek(0); app.toast(`${n} scenes added`, 'ok'); } }] });
}

async function versionsDialog(app) {
  const p = app.store.project; const list = h('div.ver-list');
  const draw = async () => {
    const vs = await listVersions(p.id); list.replaceChildren();
    if (!vs.length) list.append(h('div.lib-empty', 'No versions yet. Save one before a big change.'));
    for (const v of vs) list.append(h('div.ver', h('div', h('b', v.label), h('small', new Date(v.at).toLocaleString() + (v.auto ? ' · auto' : ''))),
      h('div', h('button.btn.sm', { type: 'button', on: { click: () => restore(v) } }, 'Restore'), h('button.btn.ghost.sm', { type: 'button', on: { click: async () => { await idbDel('versions', v.id); draw(); } } }, 'Delete'))));
  };
  const restore = (v) => {
    saveVersion(app.store.project, 'Before restore', true).catch(() => {});
    app.store.commit((pr) => { pr.tracks = deep(v.snap.tracks); pr.canvas = deep(v.snap.canvas); pr.media = { ...pr.media, ...deep(v.snap.media) }; });
    m.close(); app.engine?.seek(0); app.toast('Version restored. Undo brings the latest back.', 'ok');
  };
  const m = app.modal({ title: 'Version history', lead: 'Snapshots of this project, stored in your account on this device.', body: list, dismiss: true,
    actions: [{ label: 'Close', ghost: true }, { label: 'Save version now', primary: true, keep: true, onClick: async () => { await saveVersion(app.store.project, 'Manual save'); app.toast('Version saved', 'ok'); draw(); } }] });
  draw();
}

function resizeDialog(app) {
  const cur = app.store.project.canvas.ratio; const picks = new Set();
  const row = (R) => { const b = h('button.chip', { type: 'button', on: { click: () => { picks.has(R.id) ? picks.delete(R.id) : picks.add(R.id); b.classList.toggle('on', picks.has(R.id)); } } }, `${R.name} · ${R.sub}`); return b; };
  app.modal({ title: 'Magic Resize', lead: 'Pick the sizes you need. Each becomes its own project copy with all your media. Check text and framing after.', dismiss: true,
    body: h('div.studio-list', ...RATIOS.filter((R) => R.id !== cur).map(row)),
    actions: [{ label: 'Cancel', ghost: true }, { label: 'Make copies', primary: true, onClick: async () => {
      if (!picks.size) return false;
      try { for (const id of picks) await resizeCopy(app, id); app.toast(`${picks.size} cop${picks.size > 1 ? 'ies' : 'y'} added to your projects`, 'ok'); } catch (e) { console.error(e); app.toast('Could not resize that project', 'err'); } } }] });
}

/** Wires auto snapshots to the editor's save event. Call once after the store exists. */
export function installStudio(app) {
  let last = 0;
  app.store.on('saved', () => {
    const u = Session.user; if (!u || u.prefs?.autoVersions === false) return;
    const now = Date.now(); if (now - last < AUTO_EVERY || !projectDuration(app.store.project)) return;
    last = now; saveVersion(app.store.project, 'Auto snapshot', true).catch(() => {});
  });
}
