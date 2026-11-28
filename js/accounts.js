// Local accounts. Everything stays in this browser (IndexedDB + localStorage): there is no server, no cloud user and nothing to sign up for.
//
//  - Passwords are never stored. Each account keeps a random salt and a PBKDF2-SHA256 hash (300,000 rounds, WebCrypto).
//  - A one-time recovery code (also hashed) lets someone reset a forgotten password. Without it a forgotten password cannot be recovered,
//    because there is no server that could do it.
//  - Projects, media, brand, version history, saved library and templates are all tagged with the account that owns them.
//
// Be honest with people about the limit of this: it keeps other people who share the device out of your projects inside EDEN,
// but the files sit in the browser's own storage and are not encrypted. The backup feature (backup.js) is how work moves between devices.
import { Session, userKey } from './session.js';
import { db, idbGet, idbPut, idbDel, idbAll, Storage } from './media.js';
import { uid } from './util.js';

const POINTER = 'eden.session.v2';
const ITER = 300000;
const AVATARS = ['#6FF2C6', '#5FD0FF', '#A393FF', '#FF7A59', '#FF5C8A', '#F5C451', '#34D399', '#F2F5FA'];
const enc = new TextEncoder();
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const b64 = (buf) => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const randBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

export const normUser = (u) => String(u || '').trim().toLowerCase();
export const validUsername = (u) => /^[a-z0-9][a-z0-9._-]{2,23}$/.test(u);
export const AVATAR_COLORS = AVATARS;

/** 0-4 rough strength score, used for the meter. Length matters most. */
export function passwordStrength(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  if (/^(.)\1+$/.test(pw) || /^(password|12345678|qwerty)/i.test(pw)) s = Math.min(s, 1);
  return Math.min(4, s);
}

async function derive(secret, saltB64, iter = ITER) {
  if (!crypto?.subtle) throw new Error('Accounts need a secure connection (https). Open the site from its https address.');
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(saltB64), iterations: iter, hash: 'SHA-256' }, key, 256);
  return b64(bits);
}
const sameHash = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

function newRecovery() {
  const raw = Array.from(randBytes(20), (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join('');
  return raw.match(/.{5}/g).join('-');
}
const cleanRecovery = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The part of an account that is safe to hold in memory and show in the UI. */
const publicUser = (a) => ({ id: a.id, username: a.username, display: a.display || a.username, color: a.color, guest: !!a.guest, created: a.created, lastLogin: a.lastLogin, prefs: { autoVersions: true, ...(a.prefs || {}) } });

/* ---- failed sign-in throttle: five wrong passwords in a row lock that account for a short while ---- */
const failKey = (u) => 'eden.fail.' + u;
function lockLeft(u) {
  try { const f = JSON.parse(localStorage.getItem(failKey(u)) || 'null'); if (f && f.until > Date.now()) return Math.ceil((f.until - Date.now()) / 1000); } catch { /* ignore */ }
  return 0;
}
function noteFail(u) {
  let f = { n: 0, until: 0 }; try { f = JSON.parse(localStorage.getItem(failKey(u)) || '') || f; } catch { /* ignore */ }
  f.n = (f.n || 0) + 1; if (f.n >= 5) { f.until = Date.now() + Math.min(300, 15 * 2 ** (f.n - 5)) * 1000; }
  try { localStorage.setItem(failKey(u), JSON.stringify(f)); } catch { /* ignore */ }
}
const clearFail = (u) => { try { localStorage.removeItem(failKey(u)); } catch { /* ignore */ } };

const all = async () => (await idbAll('accounts')).sort((a, b) => (b.lastLogin || 0) - (a.lastLogin || 0));
const byName = async (u) => (await all()).find((a) => a.username === u && !a.guest);

export const Accounts = {
  get user() { return Session.user; },
  avatarColors: AVATARS,

  /** Accounts on this device, newest sign-in first (no secrets). */
  async list() { return (await all()).filter((a) => !a.guest).map(publicUser); },
  async hasAny() { return (await all()).length > 0; },

  async create({ username, password, display, remember = true }) {
    const u = normUser(username);
    if (!validUsername(u)) throw new Error('Use 3 to 24 letters, numbers, dots, dashes or underscores for the username.');
    if (String(password || '').length < 8) throw new Error('Use a password of at least 8 characters.');
    if (await byName(u)) throw new Error('That username is already taken on this device.');
    const salt = b64(randBytes(16)), rsalt = b64(randBytes(16));
    const recovery = newRecovery();
    const firstEver = !(await all()).length;
    const acc = {
      id: uid('acc'), username: u, display: (display || '').trim().slice(0, 40) || u, color: AVATARS[Math.floor(Math.random() * AVATARS.length)], guest: false,
      created: Date.now(), lastLogin: Date.now(), iter: ITER, salt, hash: await derive(password, salt), rsalt, rhash: await derive(cleanRecovery(recovery), rsalt), prefs: { autoVersions: true },
    };
    await idbPut('accounts', acc);
    let claimed = 0;
    if (firstEver) claimed = await Storage.claimLegacyProjects(acc.id);
    this._begin(acc, remember);
    return { user: Session.user, recovery, claimed };
  },

  async signIn(username, password, remember = true) {
    const u = normUser(username);
    const wait = lockLeft(u);
    if (wait) throw new Error(`Too many tries. Wait ${wait} seconds and try again.`);
    const acc = await byName(u);
    // always do the slow hash so a wrong username and a wrong password take the same time
    const probe = acc ? acc.salt : b64(randBytes(16));
    const h = await derive(password || '', probe, acc?.iter || ITER);
    if (!acc || !sameHash(h, acc.hash)) { noteFail(u); throw new Error('That username and password do not match.'); }
    clearFail(u);
    acc.lastLogin = Date.now(); await idbPut('accounts', acc);
    this._begin(acc, remember);
    return Session.user;
  },

  /** A guest keeps projects on this device without a password, and can turn into a real account later. */
  async guest() {
    const existing = (await all()).find((a) => a.guest);
    const firstEver = !(await all()).length;
    const acc = existing || { id: uid('acc'), username: 'guest', display: 'Guest', color: AVATARS[1], guest: true, created: Date.now(), prefs: { autoVersions: true } };
    acc.lastLogin = Date.now(); await idbPut('accounts', acc);
    if (firstEver) await Storage.claimLegacyProjects(acc.id);
    this._begin(acc, true);
    return Session.user;
  },
  async upgradeGuest({ username, password, display }) {
    const cur = Session.user; if (!cur?.guest) throw new Error('This is already a full account.');
    const u = normUser(username);
    if (!validUsername(u)) throw new Error('Use 3 to 24 letters, numbers, dots, dashes or underscores for the username.');
    if (String(password || '').length < 8) throw new Error('Use a password of at least 8 characters.');
    if (await byName(u)) throw new Error('That username is already taken on this device.');
    const acc = await idbGet('accounts', cur.id);
    const salt = b64(randBytes(16)), rsalt = b64(randBytes(16)); const recovery = newRecovery();
    Object.assign(acc, { username: u, display: (display || '').trim().slice(0, 40) || u, guest: false, iter: ITER, salt, hash: await derive(password, salt), rsalt, rhash: await derive(cleanRecovery(recovery), rsalt) });
    await idbPut('accounts', acc);
    Session.user = publicUser(acc);
    return { user: Session.user, recovery };
  },

  /** Restore the previous session (if the person chose to stay signed in). */
  async resume() {
    let id = null;
    try { id = sessionStorage.getItem(POINTER) || localStorage.getItem(POINTER); } catch { /* ignore */ }
    if (!id) return null;
    const acc = await idbGet('accounts', id);
    if (!acc) { this._forget(); return null; }
    Session.user = publicUser(acc);
    return Session.user;
  },

  signOut() { Session.user = null; this._forget(); },

  _begin(acc, remember) {
    Session.user = publicUser(acc);
    try { sessionStorage.removeItem(POINTER); localStorage.removeItem(POINTER); (remember ? localStorage : sessionStorage).setItem(POINTER, acc.id); } catch { /* storage blocked: stay signed in for this tab only */ }
  },
  _forget() { try { sessionStorage.removeItem(POINTER); localStorage.removeItem(POINTER); } catch { /* ignore */ } },

  async updateProfile({ display, color }) {
    const acc = await idbGet('accounts', Session.user.id);
    if (display != null) acc.display = String(display).trim().slice(0, 40) || acc.username;
    if (color) acc.color = color;
    await idbPut('accounts', acc); Session.user = publicUser(acc); return Session.user;
  },
  async setPrefs(patch) {
    const acc = await idbGet('accounts', Session.user.id);
    acc.prefs = { ...(acc.prefs || {}), ...patch }; await idbPut('accounts', acc); Session.user = publicUser(acc); return Session.user.prefs;
  },

  async verify(password) {
    const acc = await idbGet('accounts', Session.user.id);
    if (acc.guest) return true;
    return sameHash(await derive(password || '', acc.salt, acc.iter || ITER), acc.hash);
  },
  async changePassword(oldPw, newPw) {
    if (String(newPw || '').length < 8) throw new Error('Use a password of at least 8 characters.');
    if (!(await this.verify(oldPw))) throw new Error('Your current password is not right.');
    const acc = await idbGet('accounts', Session.user.id);
    acc.salt = b64(randBytes(16)); acc.iter = ITER; acc.hash = await derive(newPw, acc.salt); await idbPut('accounts', acc);
  },
  /** Make a fresh recovery code (the old one stops working). */
  async newRecoveryCode(password) {
    if (!(await this.verify(password))) throw new Error('Your password is not right.');
    const acc = await idbGet('accounts', Session.user.id); const code = newRecovery();
    acc.rsalt = b64(randBytes(16)); acc.rhash = await derive(cleanRecovery(code), acc.rsalt); await idbPut('accounts', acc); return code;
  },
  /** Forgot the password: username + recovery code set a new password and give back a new code. */
  async resetWithRecovery(username, code, newPw) {
    const u = normUser(username);
    const wait = lockLeft('rec:' + u); if (wait) throw new Error(`Too many tries. Wait ${wait} seconds and try again.`);
    if (String(newPw || '').length < 8) throw new Error('Use a new password of at least 8 characters.');
    const acc = await byName(u);
    const h = await derive(cleanRecovery(code), acc?.rsalt || b64(randBytes(16)));
    if (!acc || !acc.rhash || !sameHash(h, acc.rhash)) { noteFail('rec:' + u); throw new Error('That username and recovery code do not match.'); }
    clearFail('rec:' + u);
    const fresh = newRecovery();
    acc.salt = b64(randBytes(16)); acc.iter = ITER; acc.hash = await derive(newPw, acc.salt);
    acc.rsalt = b64(randBytes(16)); acc.rhash = await derive(cleanRecovery(fresh), acc.rsalt);
    await idbPut('accounts', acc);
    return fresh;
  },

  /** Remove the account and everything it owns from this device. */
  async remove(password) {
    if (!(await this.verify(password))) throw new Error('Your password is not right.');
    const id = Session.user.id;
    for (const p of await Storage.listProjects()) await Storage.deleteProject(p.id);
    for (const store of ['assets', 'usertpl']) for (const r of await idbAll(store)) if (r.uid === id) await idbDel(store, r.id);
    try { for (const k of Object.keys(localStorage)) if (k.startsWith(`eden.u.${id}.`)) localStorage.removeItem(k); } catch { /* ignore */ }
    await idbDel('accounts', id);
    this.signOut();
  },

  /** How much this account has stored (for the Account page). */
  async usage() {
    const projects = await Storage.listProjects();
    const assets = (await idbAll('assets')).filter((a) => a.uid === Session.user.id);
    let bytes = 0;
    const blobs = await idbAll('blobs');
    const owned = new Set(projects.map((p) => p.id));
    for (const b of blobs) if (owned.has(b.pid) && b.blob) bytes += b.blob.size || 0;
    for (const a of assets) bytes += a.blob?.size || 0;
    return { projects: projects.length, assets: assets.length, bytes };
  },
};

void db; void userKey;
