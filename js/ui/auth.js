// The sign-in screen: create an account, sign in, reset a password with the recovery code, or carry on as a guest.
// Everything here talks to accounts.js, which keeps all data in this browser. There is no server.
import { h } from '../util.js';
import { icon, logoMark } from './icons.js';
import { Accounts, passwordStrength } from '../accounts.js';

const STRENGTH = ['Too short', 'Weak', 'OK', 'Good', 'Strong'];

/** Show the recovery code once, and make the person confirm they kept it. Resolves when they continue. */
export function showRecovery(app, code, { title = 'Save your recovery code', claimed = 0 } = {}) {
  return new Promise((resolve) => {
    const ack = h('input', { type: 'checkbox', 'aria-label': 'I have saved my recovery code' });
    const cont = h('button.btn.primary', { disabled: true, on: { click: () => { m.close(); resolve(); } } }, 'Continue');
    ack.addEventListener('change', () => { cont.disabled = !ack.checked; });
    const copy = h('button.btn.sm', { type: 'button', on: { click: async () => { try { await navigator.clipboard.writeText(code); app.toast('Copied', 'ok'); } catch { app.toast('Select the code and copy it by hand', 'err'); } } } }, icon('copy', 15), 'Copy');
    const save = h('button.btn.sm', { type: 'button', on: { click: () => {
      const blob = new Blob([`EDEN Studio recovery code\nAccount: ${Accounts.user?.username || ''}\nCode: ${code}\n\nKeep this somewhere safe. It is the only way to reset your password, because your account lives only on your device.\n`], { type: 'text/plain' });
      const a = h('a', { href: URL.createObjectURL(blob), download: 'eden-recovery-code.txt' }); document.body.append(a); a.click(); a.remove();
    } } }, icon('download', 15), 'Download');
    const m = app.modal({ title, dismiss: false, lead: 'Your account lives only on this device, so there is no “email me a reset link”. This code is the only way back in if you forget your password.',
      body: h('div.au-rec', h('div.au-code', code), h('div.row', copy, save),
        claimed ? h('p.au-note.ok', `${claimed} existing project${claimed === 1 ? ' was' : 's were'} on this device and now belong to your account.`) : null,
        h('label.au-ack', ack, h('span', 'I saved it somewhere safe'))),
      actions: [] });
    m.box.append(h('div.foot', cont));
  });
}

/** Resolves with the signed-in user. Removes itself when done. */
export function requireAccount(app, { first = false } = {}) {
  return new Promise(async (resolve) => {
    const accounts = await Accounts.list().catch(() => []);
    const root = h('div.auth', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sign in to EDEN Studio' });
    document.body.append(root);
    const done = (user) => { root.classList.add('out'); setTimeout(() => root.remove(), 380); resolve(user); };
    let view = accounts.length ? 'pick' : 'create';
    let prefill = '';

    const field = (label, props, extra) => h('label.fld', h('span', label), h('input.field', { 'aria-label': label, ...props }), extra || null);
    const pw = (label, props) => {
      const input = h('input.field', { type: 'password', 'aria-label': label, ...props });
      const eye = h('button.au-eye', { type: 'button', 'aria-label': 'Show password', title: 'Show or hide', on: { click: () => { const s = input.type === 'password'; input.type = s ? 'text' : 'password'; eye.classList.toggle('on', s); } } }, icon('eye', 17));
      return { input, el: h('label.fld', h('span', label), h('div.au-pw', input, eye)) };
    };
    const msg = () => h('div.au-msg', { role: 'alert', 'aria-live': 'assertive' });
    const busy = async (btn, out, fn) => {
      btn.disabled = true; const t = btn.textContent; btn.textContent = 'One moment…'; out.textContent = '';
      try { await fn(); } catch (e) { out.textContent = e.message || String(e); btn.disabled = false; btn.textContent = t; }
    };

    const draw = () => {
      const card = view === 'pick' ? vPick() : view === 'signin' ? vSignIn() : view === 'forgot' ? vForgot() : vCreate();
      root.replaceChildren(
        h('div.au-art', h('div.au-brand', logoMark(44), h('div', h('b', 'EDEN'), h('span', 'STUDIO'))),
          h('h1', 'Your studio.', h('br'), h('em', 'Your account.')),
          h('p', 'Make an account to keep your projects, media, brand and templates together. It lives on this device. Nothing is uploaded, and there is no cloud login.'),
          h('ul.au-pts', ['Projects and footage saved to your account', 'Your brand, templates and library follow you', 'Back up to a file any time, restore anywhere', 'Free, private, no watermark'].map((t) => h('li', icon('check', 16), t)))),
        h('div.au-side', card));
      setTimeout(() => card.querySelector('input:not([type=checkbox])')?.focus({ preventScroll: true }), 60);
    };

    /* ---- welcome back */
    function vPick() {
      return h('div.au-card',
        h('h2', 'Welcome back'), h('p.au-sub', 'Choose your account.'),
        h('div.au-list', accounts.map((a) => h('button.au-acc', { type: 'button', on: { click: () => { prefill = a.username; view = 'signin'; draw(); } } },
          h('i.au-av', { style: { background: a.color } }, (a.display || a.username)[0].toUpperCase()), h('div', h('b', a.display), h('small', '@' + a.username)), icon('chevron', 16)))),
        h('div.au-links', h('button.au-link', { type: 'button', on: { click: () => { prefill = ''; view = 'signin'; draw(); } } }, 'Use another account'), h('button.au-link', { type: 'button', on: { click: () => { view = 'create'; draw(); } } }, 'Create a new account')),
        guestBtn());
    }

    /* ---- sign in */
    function vSignIn() {
      const user = field('Username', { value: prefill, autocomplete: 'username', autocapitalize: 'off', spellcheck: false, required: true });
      const p = pw('Password', { autocomplete: 'current-password', required: true });
      const remember = h('input', { type: 'checkbox', checked: true });
      const out = msg(); const go = h('button.btn.primary.lg.block', { type: 'submit' }, 'Sign in');
      const f = h('form.au-form', { novalidate: true, on: { submit: (e) => { e.preventDefault(); busy(go, out, async () => { done(await Accounts.signIn(user.querySelector('input').value, p.input.value, remember.checked)); }); } } },
        user, p.el, h('label.au-check', remember, h('span', 'Keep me signed in on this device')), out, go);
      if (prefill) setTimeout(() => p.input.focus(), 80);
      return h('div.au-card', h('h2', 'Sign in'), h('p.au-sub', 'Use the account you made on this device.'), f,
        h('div.au-links', h('button.au-link', { type: 'button', on: { click: () => { view = 'forgot'; draw(); } } }, 'Forgot password?'), h('button.au-link', { type: 'button', on: { click: () => { view = 'create'; draw(); } } }, 'Create an account')),
        accounts.length ? h('div.au-links', h('button.au-link', { type: 'button', on: { click: () => { view = 'pick'; draw(); } } }, '← All accounts on this device')) : null, guestBtn());
    }

    /* ---- create */
    function vCreate() {
      const name = field('Your name', { placeholder: 'e.g. Owen', maxLength: 40, autocomplete: 'name' });
      const user = field('Username', { placeholder: 'letters and numbers', maxLength: 24, autocomplete: 'username', autocapitalize: 'off', spellcheck: false, required: true });
      const p = pw('Password', { placeholder: 'At least 8 characters', autocomplete: 'new-password', required: true });
      const p2 = pw('Confirm password', { autocomplete: 'new-password', required: true });
      const meter = h('div.au-meter', h('i'), h('i'), h('i'), h('i')); const mlabel = h('small.au-ml', '');
      p.input.addEventListener('input', () => { const s = passwordStrength(p.input.value); meter.dataset.s = s; mlabel.textContent = p.input.value ? STRENGTH[s] : ''; });
      const remember = h('input', { type: 'checkbox', checked: true });
      const out = msg(); const go = h('button.btn.primary.lg.block', { type: 'submit' }, 'Create account');
      const f = h('form.au-form', { novalidate: true, on: { submit: (e) => { e.preventDefault(); busy(go, out, async () => {
        if (p.input.value !== p2.input.value) throw new Error('The two passwords do not match.');
        const r = await Accounts.create({ username: user.querySelector('input').value, password: p.input.value, display: name.querySelector('input').value, remember: remember.checked });
        await showRecovery(app, r.recovery, { claimed: r.claimed });
        done(r.user);
      }); } } }, name, user, p.el, h('div.au-mrow', meter, mlabel), p2.el, h('label.au-check', remember, h('span', 'Keep me signed in on this device')), out, go);
      return h('div.au-card', h('h2', 'Create your account'), h('p.au-sub', 'Takes ten seconds. Stored only on this device.'), f,
        h('div.au-links', accounts.length ? h('button.au-link', { type: 'button', on: { click: () => { view = 'pick'; draw(); } } }, '← Sign in instead') : h('span', ''), h('button.au-link', { type: 'button', on: { click: () => { view = 'signin'; draw(); } } }, 'I already have an account')),
        guestBtn());
    }

    /* ---- forgot password */
    function vForgot() {
      const user = field('Username', { autocomplete: 'username', autocapitalize: 'off', spellcheck: false, required: true });
      const code = field('Recovery code', { placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX', autocomplete: 'off', spellcheck: false, required: true });
      const p = pw('New password', { autocomplete: 'new-password', placeholder: 'At least 8 characters', required: true });
      const out = msg(); const go = h('button.btn.primary.lg.block', { type: 'submit' }, 'Reset password');
      const f = h('form.au-form', { novalidate: true, on: { submit: (e) => { e.preventDefault(); busy(go, out, async () => {
        const u = user.querySelector('input').value;
        const fresh = await Accounts.resetWithRecovery(u, code.querySelector('input').value, p.input.value);
        const me = await Accounts.signIn(u, p.input.value, true);
        await showRecovery(app, fresh, { title: 'Your new recovery code' });
        done(me);
      }); } } }, user, code, p.el, out, go);
      return h('div.au-card', h('h2', 'Reset your password'), h('p.au-sub', 'Enter your username and the recovery code you saved when you made the account.'), f,
        h('div.au-links', h('button.au-link', { type: 'button', on: { click: () => { view = 'signin'; draw(); } } }, '← Back to sign in')),
        h('p.au-note', 'No recovery code? Because nothing is stored on a server, a forgotten password can’t be reset. You can still make a new account, and any backup file you saved can be restored into it.'));
    }

    function guestBtn() {
      const out = msg(); const b = h('button.btn.block.au-guest', { type: 'button', on: { click: () => busy(b, out, async () => { done(await Accounts.guest()); }) } }, 'Continue as guest');
      return h('div.au-guestwrap', b, out, h('small', 'A guest keeps projects on this device without a password. You can turn it into a full account later.'));
    }

    draw();
    void first;
  });
}
