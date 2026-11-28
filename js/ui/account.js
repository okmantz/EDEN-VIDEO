// The Account tab: profile, storage, backup and restore, security, and the other accounts on this device.
import { h, fmtBytes, downloadBlob } from '../util.js';
import { icon } from './icons.js';
import { Accounts, passwordStrength, AVATAR_COLORS } from '../accounts.js';
import { exportAccount, importBackup, inspectBackup } from '../backup.js';
import { showRecovery } from './auth.js';

const when = (t) => (t ? new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
const pickFile = (accept, cb) => { const i = h('input', { type: 'file', accept, hidden: true, on: { change: () => { const f = i.files[0]; i.remove(); if (f) cb(f); } } }); document.body.append(i); i.click(); };

export const avatar = (u, size = 40) => h('i.av', { style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.44) + 'px', background: u.color } }, (u.display || u.username || '?')[0].toUpperCase());

/** Ask for the password before something that can't be undone. Resolves with the password, or null if cancelled. */
function askPassword(app, { title, lead, action = 'Continue', danger = false }) {
  return new Promise((resolve) => {
    const input = h('input.field', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Password', placeholder: 'Your password' });
    const out = h('div.au-msg', { role: 'alert' });
    const m = app.modal({ title, lead, body: h('div', input, out), onClose: () => resolve(null),
      actions: [{ label: 'Cancel', ghost: true }, { label: action, primary: true, danger, keep: true, onClick: async () => {
        if (!(await Accounts.verify(input.value))) { out.textContent = 'That password is not right.'; return false; }
        const v = input.value; m.back.remove(); resolve(v);
      } }] });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') m.box.querySelector('.btn.primary')?.click(); });
  });
}

function changePassword(app) {
  const cur = h('input.field', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Current password' });
  const nw = h('input.field', { type: 'password', autocomplete: 'new-password', 'aria-label': 'New password', placeholder: 'At least 8 characters' });
  const out = h('div.au-msg', { role: 'alert' });
  const m = app.modal({ title: 'Change password', body: h('div.au-form', h('label.fld', h('span', 'Current password'), cur), h('label.fld', h('span', 'New password'), nw), out),
    actions: [{ label: 'Cancel', ghost: true }, { label: 'Change password', primary: true, keep: true, onClick: async () => {
      try { await Accounts.changePassword(cur.value, nw.value); m.close(); app.toast('Password changed', 'ok'); } catch (e) { out.textContent = e.message; return false; }
    } }] });
}

function upgradeGuest(app, rerender) {
  const name = h('input.field', { 'aria-label': 'Your name', maxLength: 40, placeholder: 'Your name' });
  const user = h('input.field', { 'aria-label': 'Username', maxLength: 24, autocapitalize: 'off', spellcheck: false, autocomplete: 'username', placeholder: 'Username' });
  const pw = h('input.field', { type: 'password', 'aria-label': 'Password', autocomplete: 'new-password', placeholder: 'Password, at least 8 characters' });
  const out = h('div.au-msg', { role: 'alert' });
  const m = app.modal({ title: 'Save your work to an account', lead: 'Everything you have made as a guest stays exactly where it is and becomes part of your account.', body: h('div.au-form', name, user, pw, out),
    actions: [{ label: 'Not now', ghost: true }, { label: 'Create account', primary: true, keep: true, onClick: async () => {
      try { const r = await Accounts.upgradeGuest({ username: user.value, password: pw.value, display: name.value }); m.close(); await showRecovery(app, r.recovery); rerender(); } catch (e) { out.textContent = e.message; return false; }
    } }] });
}

async function backupNow(app, btn) {
  btn.disabled = true; const label = btn.lastChild.textContent;
  try {
    const { blob, counts } = await exportAccount((l, f) => { btn.lastChild.textContent = ` ${l}…`; void f; });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `eden-backup-${Accounts.user.username}-${stamp}.edenpack`);
    app.toast(`Backup saved: ${counts.projects} project${counts.projects === 1 ? '' : 's'}, ${fmtBytes(blob.size)}`, 'ok', 4000);
  } catch (e) { console.error(e); app.toast('Could not make the backup: ' + (e.message || e), 'err', 5000); }
  btn.disabled = false; btn.lastChild.textContent = label;
}

async function restore(app, file, rerender) {
  try {
    const info = await inspectBackup(file);
    const m = app.modal({ title: 'Restore this backup?', lead: `From “${info.account?.display || 'an EDEN account'}”, saved ${when(info.created)}.`,
      body: h('div', h('p.au-note', `${info.projects} project${info.projects === 1 ? '' : 's'}, ${info.media} media file${info.media === 1 ? '' : 's'}${info.assets ? `, ${info.assets} library item${info.assets === 1 ? '' : 's'}` : ''}${info.templates ? `, ${info.templates} template${info.templates === 1 ? '' : 's'}` : ''}. They are added to your account. Nothing you already have is replaced.`)),
      actions: [{ label: 'Cancel', ghost: true }, { label: 'Restore', primary: true, keep: true, onClick: async () => {
        m.box.querySelector('.foot').replaceChildren(h('small', 'Restoring…'));
        try { const r = await importBackup(file); m.close(); app.toast(`Restored ${r.projects} project${r.projects === 1 ? '' : 's'}`, 'ok'); rerender(); } catch (e) { m.close(); app.toast(e.message || 'Restore failed', 'err', 5000); }
        return false;
      } }] });
  } catch (e) { app.toast(e.message || 'That file could not be read', 'err', 5000); }
}

export async function viewAccount(app, go) {
  const u = Accounts.user;
  const [usage, others] = await Promise.all([Accounts.usage().catch(() => ({ projects: 0, assets: 0, bytes: 0 })), Accounts.list().catch(() => [])]);
  const rerender = () => go('account');

  const nameIn = h('input.field', { value: u.display, maxLength: 40, 'aria-label': 'Display name', on: { change: async (e) => { await Accounts.updateProfile({ display: e.target.value }); rerender(); } } });
  const colors = h('div.au-colors', AVATAR_COLORS.map((c) => h('button' + (c === u.color ? '.on' : ''), { type: 'button', 'aria-label': 'Avatar color ' + c, style: { background: c }, on: { click: async () => { await Accounts.updateProfile({ color: c }); rerender(); } } })));
  const backBtn = h('button.btn.primary', { type: 'button', on: { click: () => backupNow(app, backBtn) } }, icon('download', 16), h('span', ' Download backup'));

  const sw = (on, fn) => { const b = h('button.switch' + (on ? '.on' : ''), { role: 'switch', 'aria-checked': on, on: { click: () => { const v = !b.classList.contains('on'); b.classList.toggle('on', v); b.setAttribute('aria-checked', v); fn(v); } } }); return b; };

  return h('div.view.v-acct',
    h('header.vh', h('div', h('h1', 'Account'), h('p', u.guest ? 'You are using EDEN as a guest.' : 'Everything below belongs to you and lives on this device.'))),

    h('section.acct-card.me', avatar(u, 64),
      h('div.ac-main', u.guest ? h('b.ac-name', 'Guest') : h('label.ac-edit', h('span', 'Name'), nameIn), h('small', u.guest ? 'No password. Projects stay on this device.' : `@${u.username} · member since ${when(u.created)}`), u.guest ? null : colors)),

    u.guest ? h('section.acct-card.cta', h('div', h('b', 'Turn this into an account'), h('small', 'Add a username and password so your projects are protected and you can back them up under your name.')), h('button.btn.primary', { type: 'button', on: { click: () => upgradeGuest(app, rerender) } }, 'Create account')) : null,

    h('section.acct-card',
      h('h3', 'Saved to your account'),
      h('div.stats', h('div', h('b', String(usage.projects)), h('small', usage.projects === 1 ? 'project' : 'projects')), h('div', h('b', String(usage.assets)), h('small', 'library items')), h('div', h('b', fmtBytes(usage.bytes)), h('small', 'footage and media'))),
      h('p.au-note', 'Projects, footage, your brand, version history, templates and library are kept in this browser, tied to this account.')),

    h('section.acct-card',
      h('h3', 'Back up and restore'),
      h('p.au-note', 'Your account is stored on this device only. A backup file is how you move to a new phone or computer, or protect yourself if browser data is cleared.'),
      h('div.row', backBtn, h('button.btn', { type: 'button', on: { click: () => pickFile('.edenpack,application/octet-stream', (f) => restore(app, f, rerender)) } }, icon('upload', 16), ' Restore from backup'))),

    h('section.acct-card',
      h('h3', 'Preferences'),
      h('div.pref', h('div', h('b', 'Keep version history'), h('small', 'Saves a restorable snapshot of each project every few minutes while you edit.')), sw(u.prefs.autoVersions !== false, (v) => Accounts.setPrefs({ autoVersions: v })))),

    u.guest ? null : h('section.acct-card',
      h('h3', 'Security'),
      h('div.row.wrap',
        h('button.btn', { type: 'button', on: { click: () => changePassword(app) } }, icon('lock', 16), ' Change password'),
        h('button.btn', { type: 'button', on: { click: async () => { const pw = await askPassword(app, { title: 'New recovery code', lead: 'Your old recovery code stops working.' }); if (pw == null) return; try { await showRecovery(app, await Accounts.newRecoveryCode(pw), { title: 'Your new recovery code' }); } catch (e) { app.toast(e.message, 'err'); } } } }, icon('shield', 16), ' New recovery code')),
      h('p.au-note', 'This keeps other people on a shared device out of your projects inside EDEN. The files are stored in the browser itself and are not encrypted, so keep your device locked too.')),

    h('section.acct-card',
      h('h3', 'This device'),
      others.filter((o) => o.id !== u.id).length ? h('div.au-list.sm', others.filter((o) => o.id !== u.id).map((o) => h('div.au-acc.static', avatar(o, 34), h('div', h('b', o.display), h('small', '@' + o.username))))) : null,
      h('div.row.wrap',
        h('button.btn', { type: 'button', on: { click: () => { Accounts.signOut(); location.reload(); } } }, icon('back', 16), ' Sign out / switch account'),
        u.guest ? null : h('button.btn.danger', { type: 'button', on: { click: async () => {
          const pw = await askPassword(app, { title: 'Delete this account?', lead: 'Every project, file, template and setting in this account is removed from this device. This can’t be undone. Download a backup first if you want to keep anything.', action: 'Delete everything', danger: true });
          if (pw == null) return; try { await Accounts.remove(pw); location.reload(); } catch (e) { app.toast(e.message, 'err'); }
        } } }, icon('trash', 16), ' Delete account'))),
    h('footer.foot-note', 'Free and private. Your files never leave your device.'));
}

void passwordStrength;
