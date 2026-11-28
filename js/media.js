// Media library + persistence (IndexedDB): imported files, projects, thumbnails.
import { uid, clamp } from './util.js';
import { currentUid } from './session.js';

const DB_NAME = 'eden-studio';
const DB_VER = 2;
let dbp = null;
export function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('blobs')) { const s = d.createObjectStore('blobs', { keyPath: 'id' }); s.createIndex('pid', 'pid'); }
      if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' });
      // v2: local accounts, per-project version history, each account's saved media library and its own templates
      if (!d.objectStoreNames.contains('accounts')) d.createObjectStore('accounts', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('versions')) { const s = d.createObjectStore('versions', { keyPath: 'id' }); s.createIndex('pid', 'pid'); }
      if (!d.objectStoreNames.contains('assets')) { const s = d.createObjectStore('assets', { keyPath: 'id' }); s.createIndex('uid', 'uid'); }
      if (!d.objectStoreNames.contains('usertpl')) { const s = d.createObjectStore('usertpl', { keyPath: 'id' }); s.createIndex('uid', 'uid'); }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('EDEN is open in another tab. Close it and reload.'));
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    try { out = fn(s); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
export const idbGet = (store, key) => tx(store, 'readonly', (s) => s.get(key));
export const idbPut = (store, val) => tx(store, 'readwrite', (s) => s.put(val));
export const idbDel = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));
export const idbAll = (store) => tx(store, 'readonly', (s) => s.getAll());

/** Does this stored record belong to the signed-in account? Records with no owner are treated as visible only when nobody is signed in. */
const mine = (r) => (r.uid ? r.uid === currentUid() : !currentUid());

export const Storage = {
  /** Projects belong to the signed-in account. A project saved before accounts existed has no owner and is visible only until it is claimed. */
  async saveProject(p, extra = {}) {
    const prev = await idbGet('projects', p.id);
    const uidv = prev?.uid ?? currentUid();
    return idbPut('projects', { ...(prev ? { thumb: prev.thumb, duration: prev.duration } : {}), id: p.id, name: p.name, updated: p.updated, ratio: p.canvas.ratio, data: JSON.stringify(p), uid: uidv, ...extra });
  },
  async loadProject(id) { const r = await idbGet('projects', id); return r && mine(r) ? JSON.parse(r.data) : null; },
  async listProjects() { const all = await idbAll('projects'); return all.filter(mine).map(({ data, ...m }) => m).sort((a, b) => b.updated - a.updated); },
  async listLegacyProjects() { const all = await idbAll('projects'); return all.filter((r) => !r.uid).map(({ data, ...m }) => m); },
  async claimLegacyProjects(uidv) { const all = await idbAll('projects'); let n = 0; for (const r of all) if (!r.uid) { r.uid = uidv; await idbPut('projects', r); n++; } return n; },
  async setThumb(id, thumb, duration) { const r = await idbGet('projects', id); if (r) { r.thumb = thumb; r.duration = duration; await idbPut('projects', r); } },
  async deleteProject(id) {
    const r = await idbGet('projects', id);
    if (r && !mine(r)) return;
    await idbDel('projects', id);
    const d = await db();
    for (const store of ['blobs', 'versions']) {
      await new Promise((res) => {
        const t = d.transaction(store, 'readwrite'); const s = t.objectStore(store); const idx = s.index('pid');
        const rq = idx.openKeyCursor(IDBKeyRange.only(id));
        rq.onsuccess = () => { const c = rq.result; if (c) { s.delete(c.primaryKey); c.continue(); } };
        t.oncomplete = res; t.onerror = res;
      });
    }
  },
  async putBlob(id, pid, blob, name) { return idbPut('blobs', { id, pid, blob, name, type: blob.type }); },
  async getBlob(id) { const r = await idbGet('blobs', id); return r ? r.blob : null; },
  async getMeta(id) { const r = await idbGet('meta', id); return r ? r.value : null; },
  async setMeta(id, value) { return idbPut('meta', { id, value }); },
  async estimate() { try { return await navigator.storage.estimate(); } catch { return null; } },
  async persist() { try { return await navigator.storage.persist(); } catch { return false; } },
};

function readVideoMeta(url, isAudio = false) {
  return new Promise((resolve, reject) => {
    const v = document.createElement(isAudio ? 'audio' : 'video');
    v.preload = 'metadata'; v.muted = true; v.playsInline = true;
    const done = () => { resolve({ duration: v.duration, w: v.videoWidth || 0, h: v.videoHeight || 0 }); v.removeAttribute('src'); v.load(); };
    v.onloadedmetadata = () => { if (isFinite(v.duration)) done(); else { v.currentTime = 1e6; v.ontimeupdate = () => { v.ontimeupdate = null; done(); }; } };
    v.onerror = () => reject(new Error('This file could not be read. Try an MP4 (H.264) or MOV file.'));
    v.src = url;
  });
}

export class MediaLibrary {
  constructor(bank) {
    this.bank = bank;
    this.urls = new Map();
    this.blobs = new Map();
    this.images = new Map();
    this.thumbCache = new Map();
    this.pid = null;
  }

  setProject(pid) { this.pid = pid; }
  forget() { for (const u of this.urls.values()) URL.revokeObjectURL(u); this.urls.clear(); this.blobs.clear(); this.images.clear(); this.thumbCache.clear(); }

  async importFile(file) {
    const type = file.type || '';
    let kind = type.startsWith('video/') ? 'video' : type.startsWith('image/') ? 'image' : type.startsWith('audio/') ? 'audio' : null;
    if (!kind) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (['mp4', 'mov', 'm4v', 'webm', 'mkv'].includes(ext)) kind = 'video';
      else if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'avif'].includes(ext)) kind = 'image';
      else if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus'].includes(ext)) kind = 'audio';
    }
    if (!kind) throw new Error(`"${file.name}" is not a video, image or audio file.`);
    const id = uid('med');
    const url = URL.createObjectURL(file);
    const m = { id, name: file.name.replace(/\.[^.]+$/, ''), kind, size: file.size, duration: 0, w: 0, h: 0, hasAudio: false };
    try {
      if (kind === 'video' || kind === 'audio') {
        const meta = await readVideoMeta(url, kind === 'audio');
        m.duration = meta.duration; m.w = meta.w; m.h = meta.h;
      } else {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('This image could not be read.')); i.src = url; });
        m.w = img.naturalWidth; m.h = img.naturalHeight; m.duration = 5;
        this.images.set(id, Promise.resolve(img));
      }
    } catch (e) { URL.revokeObjectURL(url); throw e; }
    this.urls.set(id, url); this.blobs.set(id, file);
    if (this.pid) Storage.putBlob(id, this.pid, file, file.name).catch(() => {});
    if (kind !== 'image' && file.size < 700e6) {
      const buf = await this.bank.decodeBlob(id, file);
      m.hasAudio = !!buf;
    }
    return m;
  }

  async ensure(media) {
    if (media.builtin) { await this.bank.ensureBuiltin(media.id); return; }
    if (!this.urls.has(media.id)) {
      const blob = await Storage.getBlob(media.id);
      if (!blob) { media.missing = true; return; }
      this.blobs.set(media.id, blob);
      this.urls.set(media.id, URL.createObjectURL(blob));
    }
    if (media.kind !== 'image' && !this.bank.has(media.id) && media.hasAudio !== false) {
      const blob = this.blobs.get(media.id);
      if (blob && blob.size < 700e6) this.bank.decodeBlob(media.id, blob);
    }
  }

  url(id) { return this.urls.get(id) || null; }

  image(id) {
    if (this.images.has(id)) return this.images.get(id);
    const url = this.url(id);
    if (!url) return Promise.resolve(null);
    const p = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
    this.images.set(id, p);
    return p;
  }

  /** Thumbnail frames for a video: returns [{t, canvas}] */
  async thumbs(media, count = 12, height = 64) {
    const key = media.id + ':' + count;
    if (this.thumbCache.has(key)) return this.thumbCache.get(key);
    const p = (async () => {
      const out = [];
      if (media.kind === 'image') {
        const img = await this.image(media.id);
        if (!img) return out;
        const c = document.createElement('canvas'); c.height = height; c.width = Math.round((img.naturalWidth / img.naturalHeight) * height);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return [{ t: 0, canvas: c }];
      }
      const url = this.url(media.id);
      if (!url) return out;
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
      await new Promise((res) => { v.onloadeddata = res; v.onerror = res; setTimeout(res, 6000); });
      const aspect = (v.videoWidth || 16) / (v.videoHeight || 9);
      for (let i = 0; i < count; i++) {
        const t = clamp((media.duration * (i + 0.5)) / count, 0, Math.max(0, media.duration - 0.05));
        await new Promise((res) => { v.onseeked = res; v.onerror = res; v.currentTime = t; setTimeout(res, 2500); });
        const c = document.createElement('canvas'); c.height = height; c.width = Math.max(8, Math.round(aspect * height));
        try { c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); } catch {}
        out.push({ t, canvas: c });
      }
      v.removeAttribute('src'); v.load();
      return out;
    })();
    this.thumbCache.set(key, p);
    return p;
  }
}
