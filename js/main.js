import { t, lang, setLang, LANGS } from './i18n.js';
import { sb, S, loadMe, loadStaff, loadDriver, subscribeStaff, subscribeDriver, setOnChange, isStaff, refreshJobs, rpc, save, list } from './store.js';
import { esc, $, toast, hydratePhotos, icons, closeAllModals } from './ui.js';
import { SUPABASE_URL } from './config.js';
import { authScreen, waitingScreen, passwordRecovery } from './auth.js';
import * as ops from './views/ops.js';
import * as team from './views/team.js';
import * as cars from './views/cars.js';
import * as biz from './views/biz.js';
import * as drv from './driver.js';

const app = document.getElementById('app');

const STAFF_VIEWS = {
  board: ops.board, calendar: ops.calendar, orders: ops.orders, tours: ops.tours,
  map: team.map, drivers: team.drivers, payroll: team.payroll,
  fleet: cars.fleet, fuel: cars.fuel, parking: cars.parking, expenses: cars.expenses,
  clients: biz.clients, tariffs: biz.tariffs, reports: biz.reports, settings: biz.settings,
};
const GROUPS = [
  ['g_ops', ['board', 'calendar', 'orders', 'tours', 'map']],
  ['g_team', ['drivers', 'payroll']],
  ['g_cars', ['fleet', 'fuel', 'parking', 'expenses']],
  ['g_biz', ['clients', 'tariffs', 'reports', 'settings']],
];
const DRIVER_VIEWS = { jobs: drv.jobs, add: drv.add, records: drv.records, profile: drv.profile };

let mode = null;       // 'staff' | 'driver'
let view = null;

function langSwitch() {
  return `<div class="lang" role="group" aria-label="Language">${LANGS.map((l) => `<button type="button" data-lang="${l}" aria-pressed="${l === lang()}">${l === 'ka' ? 'ქარ' : l.toUpperCase()}</button>`).join('')}</div>`;
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b) return;
  setLang(b.dataset.lang);
  if (S.me && mode) { try { await sb.from('profiles').update({ lang: b.dataset.lang }).eq('id', S.me.id); } catch {} }
  render();
});

// ---------- staff shell ----------
function badge(v) {
  if (v === 'drivers') { const n = list('profiles').filter((p) => p.role === 'pending').length + list('days_off').filter((d) => !d.approved && d.date_to >= new Date().toISOString().slice(0, 10)).length; return n ? `<span class="ct">${n}</span>` : ''; }
  if (v === 'board') { const today = new Date().toISOString().slice(0, 10); const n = list('orders').filter((o) => !o.driver_id && o.status !== 'cancelled' && o.status !== 'done' && o.date >= today).length; return n ? `<span class="ct">${n}</span>` : ''; }
  return '';
}
function renderStaff() {
  if (!STAFF_VIEWS[view]) view = 'board';
  const V = STAFF_VIEWS[view];
  const shellOpen = $('.shell')?.classList.contains('open');
  const ae = document.activeElement, aid = ae && ae.id, sel = ae && ae.selectionStart;
  const company = S.settings.company || 'Gza Dispatch';
  app.innerHTML = `<div class="shell ${shellOpen ? 'open' : ''}">
    <aside class="side">
      <div class="brand"><div class="mark"><i></i></div><div><b>${esc(company)}</b><small>${esc(t('app_sub'))}</small></div></div>
      <div class="road"></div>
      <nav class="menu">${GROUPS.map(([g, vs]) => `<div class="grp">${esc(t(g))}</div>${vs.map((v) => `<button type="button" data-view="${v}" ${v === view ? 'aria-current="page"' : ''}>${esc(t('v_' + v))}${badge(v)}</button>`).join('')}`).join('')}</nav>
      <div class="foot">${langSwitch()}<div class="muted">${esc(S.me.name || S.me.email)} · ${esc(t('role_' + S.me.role))}</div><button class="btn sm" data-signout>${esc(t('sign_out'))}</button></div>
    </aside>
    <div class="scrim" data-scrim></div>
    <div style="min-width:0">
      <div class="topbar"><button class="iconbtn" data-burger aria-label="Menu">${icons.menu}</button><b>${esc(t('v_' + view))}</b><div class="mark"><i></i></div></div>
      <main class="page" id="page">${V.render()}</main>
    </div>
  </div>`;
  V.bind?.($('#page'));
  hydratePhotos(app);
  if (aid) { const n = document.getElementById(aid); if (n) { n.focus(); try { if (sel != null && n.setSelectionRange) n.setSelectionRange(sel, sel); } catch {} } }
}

// ---------- driver shell ----------
function renderDriver() {
  if (!DRIVER_VIEWS[view]) view = 'jobs';
  const V = DRIVER_VIEWS[view];
  const ae = document.activeElement, aid = ae && ae.id;
  app.innerHTML = `<div class="dshell">
    <div class="topbar"><div class="mark"><i></i></div><b>${esc(S.settings.company || 'Gza Dispatch')}</b>${langSwitch()}</div>
    <main class="dmain" id="page">${V.render()}</main>
    <nav class="tabbar">${Object.keys(DRIVER_VIEWS).map((v) => `<button type="button" data-view="${v}" ${v === view ? 'aria-current="page"' : ''}>${icons[v === 'jobs' ? 'jobs' : v === 'add' ? 'add' : v === 'records' ? 'list' : 'me']}<span>${esc(t('d_' + v))}</span></button>`).join('')}</nav>
  </div>`;
  V.bind?.($('#page'));
  hydratePhotos(app);
  if (aid) { const n = document.getElementById(aid); if (n && n.tagName !== 'BUTTON') n.focus(); }
}

export function render() {
  document.documentElement.lang = lang();
  if (mode === 'staff') renderStaff();
  else if (mode === 'driver') renderDriver();
}
export function go(v) { view = v; try { localStorage.setItem('gza.view.' + mode, v); } catch {} closeAllModals(); render(); window.scrollTo(0, 0); }
window.gzaGo = go;

app.addEventListener('click', async (e) => {
  const v = e.target.closest('[data-view]');
  if (v) { $('.shell')?.classList.remove('open'); go(v.dataset.view); return; }
  if (e.target.closest('[data-burger]')) { $('.shell').classList.toggle('open'); return; }
  if (e.target.closest('[data-scrim]')) { $('.shell').classList.remove('open'); return; }
  if (e.target.closest('[data-signout]')) { await sb.auth.signOut(); location.reload(); }
});

// ---------- location from the driver's phone (while the app is open) ----------
let watchId = null, lastSent = 0;
function startLocation() {
  if (!('geolocation' in navigator) || watchId !== null) return;
  watchId = navigator.geolocation.watchPosition(async (pos) => {
    if (S.me?.duty === 'off') return;
    if (Date.now() - lastSent < 90e3) return;
    lastSent = Date.now();
    try { await rpc('report_location', { p_lat: pos.coords.latitude, p_lng: pos.coords.longitude }); } catch {}
  }, () => {}, { enableHighAccuracy: true, maximumAge: 60e3, timeout: 30e3 });
}

// ---------- boot ----------
let started = false;
async function start() {
  if (started) return;
  started = true;
  if (SUPABASE_URL.startsWith('PASTE')) {
    app.innerHTML = `<div class="auth"><div class="box"><h1>Gza Dispatch</h1><p>${esc(t('not_configured'))}</p></div></div>`;
    return;
  }
  const me = await loadMe();
  if (!me) {
    const { data: { session } } = await sb.auth.getSession();
    if (session) { // profile row is created by a trigger; give it a moment
      await new Promise((r) => setTimeout(r, 1200));
      if (!(await loadMe())) { app.innerHTML = `<div class="auth"><div class="box"><p>${esc(t('err_profile'))}</p><button class="btn" data-signout>${esc(t('sign_out'))}</button></div></div>`; return; }
    } else { mode = null; started = false; authScreen(app, langSwitch); return; }
  }
  if (S.me.lang && S.me.lang !== lang()) setLang(S.me.lang);
  if (S.me.role === 'pending' || S.me.role === 'blocked') { waitingScreen(app, langSwitch); return; }
  setOnChange(render);
  try {
    if (isStaff()) {
      mode = 'staff';
      app.innerHTML = `<div class="boot"><div class="mark big"><i></i></div><p>${esc(t('loading'))}</p></div>`;
      await loadStaff();
      subscribeStaff();
    } else {
      mode = 'driver';
      await loadDriver();
      subscribeDriver();
      setInterval(() => { if (document.visibilityState === 'visible') refreshJobs(); }, 45e3);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshJobs(); });
      startLocation();
    }
  } catch (e) {
    app.innerHTML = `<div class="auth"><div class="box"><p>${esc(t('err_network'))}</p><p class="muted small">${esc(e.message || e)}</p><button class="btn" onclick="location.reload()">${esc(t('retry'))}</button></div></div>`;
    return;
  }
  try { view = localStorage.getItem('gza.view.' + mode); } catch {}
  render();
}

sb.auth.onAuthStateChange((ev) => {
  if (ev === 'SIGNED_IN' && !mode) start();
  if (ev === 'SIGNED_OUT') location.reload();
  if (ev === 'PASSWORD_RECOVERY') passwordRecovery();
});
start();
