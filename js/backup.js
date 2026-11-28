// Account backup: everything an account owns in one `.edenpack` file you can keep, or restore on another device.
// Layout: "EDENPACK" · version byte · header length (uint32, little-endian) · header JSON · media bytes, back to back.
// The media is attached as Blob slices, so even a large library is never loaded into memory at once.
import { Session } from './session.js';
import { db, idbAll, idbGet, idbPut, Storage } from './media.js';
import { loadBrand, saveBrand } from './brand.js';
import { uid } from './util.js';

const MAGIC = 'EDENPACK';
const VERSION = 1;

const blobsOf = async (pid) => {
  const d = await db();
  return new Promise((res, rej) => { const r = d.transaction('blobs', 'readonly').objectStore('blobs').index('pid').getAll(pid); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); });
};

/** Build the backup. `onProgress(label, 0..1)` keeps the UI honest on big libraries. */
export async function exportAccount(onProgress = () => {}) {
  const user = Session.user;
  const header = { v: VERSION, created: Date.now(), app: 'eden-studio', account: { display: user.display, username: user.username, color: user.color }, brand: { ...loadBrand(), pexelsKey: '', pixabayKey: '' }, projects: [], blobs: [], assets: [], templates: [] };
  const parts = []; let off = 0;
  const attach = (blob) => { parts.push(blob); const at = off; off += blob.size; return at; };

  const owned = (await idbAll('projects')).filter((r) => r.uid === user.id);
  let i = 0;
  for (const r of owned) {
    onProgress(`Packing “${r.name}”`, i++ / Math.max(1, owned.length));
    const { uid: _u, ...rec } = r; void _u;
    header.projects.push(rec);
    for (const b of await blobsOf(r.id)) {
      if (!b.blob) continue;
      header.blobs.push({ id: b.id, pid: b.pid, name: b.name, type: b.type || b.blob.type, size: b.blob.size, off: attach(b.blob) });
    }
  }
  for (const a of (await idbAll('assets')).filter((x) => x.uid === user.id)) {
    const { blob, uid: _u, ...meta } = a; void _u;
    header.assets.push({ ...meta, size: blob?.size || 0, off: blob ? attach(blob) : -1 });
  }
  header.templates = (await idbAll('usertpl')).filter((x) => x.uid === user.id).map(({ uid: _u, ...t }) => { void _u; return t; });

  const hb = new TextEncoder().encode(JSON.stringify(header));
  const lenBuf = new ArrayBuffer(4); new DataView(lenBuf).setUint32(0, hb.length, true);
  onProgress('Finishing', 1);
  return { blob: new Blob([MAGIC, new Uint8Array([VERSION]), lenBuf, hb, ...parts], { type: 'application/octet-stream' }), counts: { projects: header.projects.length, media: header.blobs.length, assets: header.assets.length, templates: header.templates.length } };
}

async function readHeader(file) {
  const head = new Uint8Array(await file.slice(0, 13).arrayBuffer());
  if (new TextDecoder().decode(head.slice(0, 8)) !== MAGIC) throw new Error('That file is not an EDEN backup.');
  if (head[8] > VERSION) throw new Error('This backup was made by a newer version of EDEN. Reload the app to update it, then try again.');
  const n = new DataView(head.buffer).getUint32(9, true);
  if (n <= 0 || n > 200e6) throw new Error('That backup file is damaged.');
  const json = await file.slice(13, 13 + n).text();
  return { header: JSON.parse(json), base: 13 + n };
}

/** Peek inside a backup without importing it. */
export async function inspectBackup(file) {
  const { header } = await readHeader(file);
  return { account: header.account, created: header.created, projects: header.projects.length, media: header.blobs.length, assets: header.assets.length, templates: (header.templates || []).length, hasBrand: !!header.brand };
}

/** Add a backup's contents to the signed-in account. Nothing already there is overwritten: clashes get new ids. */
export async function importBackup(file, { brand = true, onProgress = () => {} } = {}) {
  const user = Session.user;
  const { header, base } = await readHeader(file);
  const existingProjects = new Set((await idbAll('projects')).map((p) => p.id));
  const existingBlobs = new Set((await idbAll('blobs')).map((b) => b.id));
  const byPid = new Map();
  for (const b of header.blobs) { if (!byPid.has(b.pid)) byPid.set(b.pid, []); byPid.get(b.pid).push(b); }
  let nProj = 0, nMedia = 0;
  let k = 0;
  for (const rec of header.projects) {
    onProgress(`Restoring “${rec.name}”`, k++ / Math.max(1, header.projects.length));
    const blobs = byPid.get(rec.id) || [];
    const clash = existingProjects.has(rec.id) || blobs.some((b) => existingBlobs.has(b.id));
    let json = rec.data, pid = rec.id, name = rec.name;
    const idMap = new Map();
    if (clash) {
      pid = uid('prj'); json = json.split(rec.id).join(pid); name = (rec.name + ' (restored)').slice(0, 80);
      for (const b of blobs) { const nid = uid('med'); idMap.set(b.id, nid); json = json.split(b.id).join(nid); }
    }
    const data = JSON.parse(json); data.id = pid; data.name = name;
    await idbPut('projects', { ...rec, id: pid, name, data: JSON.stringify(data), uid: user.id });
    nProj++;
    for (const b of blobs) {
      const blob = file.slice(base + b.off, base + b.off + b.size, b.type || '');
      await idbPut('blobs', { id: idMap.get(b.id) || b.id, pid, blob, name: b.name, type: b.type });
      nMedia++;
    }
  }
  let nAssets = 0;
  for (const a of header.assets || []) {
    const { off, size, ...meta } = a;
    const blob = off >= 0 ? file.slice(base + off, base + off + size, meta.type || '') : null;
    const clash = await idbGet('assets', meta.id);
    await idbPut('assets', { ...meta, id: clash ? uid('ast') : meta.id, uid: user.id, blob }); nAssets++;
  }
  let nTpl = 0;
  for (const t of header.templates || []) { const clash = await idbGet('usertpl', t.id); await idbPut('usertpl', { ...t, id: clash ? uid('utpl') : t.id, uid: user.id }); nTpl++; }
  if (brand && header.brand) { const cur = loadBrand(); saveBrand({ ...cur, ...header.brand, pexelsKey: cur.pexelsKey, pixabayKey: cur.pixabayKey }); }
  onProgress('Done', 1);
  return { projects: nProj, media: nMedia, assets: nAssets, templates: nTpl, account: header.account };
}

void Storage;
