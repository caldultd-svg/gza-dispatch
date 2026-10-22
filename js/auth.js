// Sign in, sign up (drivers register themselves), waiting for approval, password reset
import { t } from './i18n.js';
import { sb, S } from './store.js';
import { esc, $, toast, modal } from './ui.js';

let tab = 'in';

export function authScreen(app, langSwitch) {
  const draw = () => {
    app.innerHTML = `<div class="auth"><form class="box" id="authForm" novalidate>
      <div class="road"></div>
      <div class="row"><div class="mark big"><i></i></div><div class="grow"><h1>Gza Dispatch</h1><div class="muted small">${esc(t('app_sub'))}</div></div></div>
      <div class="row">${langSwitch()}</div>
      <div class="seg" role="tablist"><button type="button" data-tab="in" aria-pressed="${tab === 'in'}">${esc(t('sign_in'))}</button><button type="button" data-tab="up" aria-pressed="${tab === 'up'}">${esc(t('register'))}</button></div>
      ${tab === 'up' ? `
        <label class="f"><span>${esc(t('full_name'))}</span><input id="a_name" autocomplete="name" required></label>
        <label class="f"><span>${esc(t('phone'))}</span><input id="a_phone" type="tel" autocomplete="tel" placeholder="+995 5__ __ __ __"></label>` : ''}
      <label class="f"><span>${esc(t('email'))}</span><input id="a_email" type="email" autocomplete="email" required></label>
      <label class="f"><span>${esc(t('password'))}</span><input id="a_pass" type="password" autocomplete="${tab === 'up' ? 'new-password' : 'current-password'}" minlength="6" required></label>
      <p class="small badc" id="a_err" hidden></p>
      <button class="btn primary big" type="submit">${esc(tab === 'up' ? t('register') : t('sign_in'))}</button>
      ${tab === 'in' ? `<button type="button" class="btn sm" data-forgot style="align-self:flex-start">${esc(t('forgot'))}</button>` : `<p class="muted small">${esc(t('register_hint'))}</p>`}
    </form></div>`;
    const f = $('#authForm');
    f.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) { tab = b.dataset.tab; draw(); }
      if (e.target.closest('[data-forgot]')) forgot();
      if (e.target.closest('[data-lang]')) setTimeout(draw, 0);
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#a_err'); err.hidden = true;
      const email = $('#a_email').value.trim(), password = $('#a_pass').value;
      if (!email || password.length < 6) { err.textContent = t('err_login_fields'); err.hidden = false; return; }
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      let res;
      if (tab === 'up') {
        const name = $('#a_name').value.trim();
        if (!name) { err.textContent = t('err_name'); err.hidden = false; btn.disabled = false; return; }
        res = await sb.auth.signUp({ email, password, options: { data: { name, phone: $('#a_phone').value.trim() }, emailRedirectTo: location.origin } });
        if (!res.error && !res.data.session) { err.textContent = t('check_email'); err.hidden = false; btn.disabled = false; return; }
      } else {
        res = await sb.auth.signInWithPassword({ email, password });
      }
      if (res.error) { err.textContent = /invalid/i.test(res.error.message) ? t('err_login') : res.error.message; err.hidden = false; btn.disabled = false; }
    });
  };
  draw();
}

async function forgot() {
  const email = $('#a_email')?.value.trim();
  if (!email) { toast(t('err_login_fields')); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  toast(error ? error.message : t('reset_sent'), 5000);
}

export function passwordRecovery() {
  modal({
    title: t('new_password'), narrow: true,
    body: `<label class="f"><span>${esc(t('password'))}</span><input id="np" type="password" minlength="6" autocomplete="new-password"></label>`,
    footer: `<span class="grow"></span><button class="btn primary" data-np>${esc(t('save'))}</button>`,
    onMount: (el, close) => el.querySelector('[data-np]').addEventListener('click', async () => {
      const p = el.querySelector('#np').value;
      if (p.length < 6) { toast(t('err_login_fields')); return; }
      const { error } = await sb.auth.updateUser({ password: p });
      if (error) toast(error.message); else { toast(t('saved')); close(); }
    }),
  });
}

export function waitingScreen(app, langSwitch) {
  const draw = () => {
    app.innerHTML = `<div class="auth"><div class="box">
      <div class="road"></div>
      <div class="row"><div class="mark big"><i></i></div><h1 class="grow">${esc(S.me.role === 'blocked' ? t('blocked_title') : t('wait_title'))}</h1></div>
      <div class="row">${langSwitch()}</div>
      <p>${esc(S.me.role === 'blocked' ? t('blocked_text') : t('wait_text'))}</p>
      <p class="muted small">${esc(S.me.name)} · ${esc(S.me.email)}</p>
      <div class="row"><button class="btn primary" onclick="location.reload()">${esc(t('check_again'))}</button><button class="btn" data-out>${esc(t('sign_out'))}</button></div>
    </div></div>`;
    app.querySelector('[data-out]').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
    app.querySelector('.lang').addEventListener('click', () => setTimeout(draw, 0));
  };
  draw();
}
