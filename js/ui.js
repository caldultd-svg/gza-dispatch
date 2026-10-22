// UI helpers: escaping, formatting, modal, forms, toast, photos
import { t, lang } from './i18n.js';
import { signedUrls, uploadPhoto, S } from './store.js';
import { toGEL, rate } from './calc.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const pad = (n) => String(n).padStart(2, '0');
export function todayStr(d = new Date()) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
export function addDays(ds, n) { const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + n); return todayStr(d); }
export function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }
export const locale = () => (lang() === 'ka' ? 'ka-GE' : lang() === 'ru' ? 'ru-RU' : 'en-GB');
export function fmtDate(ds, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  if (!ds) return ''; return new Date(ds.slice(0, 10) + 'T12:00:00').toLocaleDateString(locale(), opts);
}
export function fmtDT(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
export function timeAgo(iso) {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return t('now'); if (m < 60) return m + ' ' + t('min_ago');
  const h = Math.round(m / 60); if (h < 24) return h + ' ' + t('h_ago');
  return fmtDT(iso);
}
export const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
export const sym = (c) => (c === 'USD' ? '$' : c === 'EUR' ? '€' : '₾');
export function money(n, c = 'GEL') { return (Math.round(num(n) * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ' + sym(c); }
export const gel = (amount, cur) => toGEL(amount, cur, S.settings);
export const fx = (cur) => rate(S.settings, cur);
export function plate(p) { return p ? `<span class="plate"><i>GE</i><b>${esc(p)}</b></span>` : ''; }
export function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0] || '').join('').toUpperCase() || '?'; }
export function avatar(p, cls = '') {
  return `<span class="av ${cls}">${p?.photo_path ? `<img data-photo="${esc(p.photo_path)}" alt="">` : esc(initials(p?.name))}</span>`;
}
export function statusPill(s) { return `<span class="pill st-${esc(s || 'new')}">${esc(t('s_' + (s || 'new')))}</span>`; }
export function tourPill(s) {
  const m = { planned: 'new', confirmed: 'assigned', ongoing: 'onboard', done: 'done', cancelled: 'cancelled' };
  return `<span class="pill st-${m[s] || 'new'}">${esc(t('ts_' + (s || 'planned')))}</span>`;
}
export function accBadge(a) { return a && a !== 'none' ? `<span class="acc ${esc(a)}">${esc(t('acc_' + a))}</span>` : ''; }

// map links
export function gmapsDir(dest, origin, stops) {
  const p = new URLSearchParams({ api: '1', destination: dest, travelmode: 'driving' });
  if (origin) p.set('origin', origin);
  if (stops && stops.length) p.set('waypoints', stops.join('|'));
  return 'https://www.google.com/maps/dir/?' + p.toString();
}
export const gmapsSearch = (q) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
export const gmapsLL = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
export const waze = (q) => 'https://waze.com/ul?q=' + encodeURIComponent(q) + '&navigate=yes';
export const linesOf = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
export const semis = (s) => String(s || '').split(';').map((x) => x.trim()).filter(Boolean);

// ---------- toast ----------
let tt;
export function toast(msg, ms = 2800) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => { el.hidden = true; }, ms);
}
export function errText(e) {
  const m = String(e?.message || e || '');
  if (/JWT|session|sign in/i.test(m)) return t('err_session');
  if (/Failed to fetch|NetworkError|network/i.test(m)) return t('err_network');
  return t('err_save') + (m ? ' (' + m.slice(0, 120) + ')' : '');
}

// ---------- modal ----------
let modalStack = [];
export function modal({ title, body, footer = '', narrow = false, onMount }) {
  const root = document.getElementById('modalRoot');
  const wrap = document.createElement('div');
  wrap.className = 'ov';
  wrap.innerHTML = `<div class="modal ${narrow ? 'narrow' : ''}" role="dialog" aria-modal="true">
    <div class="mh"><h2>${esc(title)}</h2><button class="btn sm" data-close aria-label="${esc(t('close'))}">✕</button></div>
    <div class="mb">${body}</div>
    ${footer ? `<div class="mf">${footer}</div>` : ''}
  </div>`;
  root.appendChild(wrap);
  modalStack.push(wrap);
  const close = () => { wrap.remove(); modalStack = modalStack.filter((x) => x !== wrap); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  hydratePhotos(wrap);
  const first = wrap.querySelector('.mb input:not([type=hidden]),.mb select,.mb textarea');
  if (first && matchMedia('(pointer:fine)').matches) first.focus();
  if (onMount) onMount(wrap, close);
  return { el: wrap, close };
}
export function closeAllModals() { for (const m of modalStack) m.remove(); modalStack = []; }

// two-step delete button inside a modal footer
export function armDelete(btn, onConfirm) {
  btn.addEventListener('click', async () => {
    if (!btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = t('del_confirm'); return; }
    btn.disabled = true;
    try { await onConfirm(); } catch (e) { toast(errText(e)); btn.disabled = false; }
  });
}

// ---------- forms ----------
// field: {k, label?, type?, options?:[[v,label]], wide?, sec?, list?, step?, placeholder?, kind? (photo folder)}
export function fieldHtml(f, val) {
  if (f.sec) return `<div class="fsec">${esc(t(f.sec))}</div>`;
  const id = 'f_' + f.k;
  const label = esc(t(f.label || f.k));
  const cls = 'f' + (f.wide ? ' wide' : '');
  if (f.type === 'check') return `<label class="chk ${f.wide ? 'wide' : ''}"><input type="checkbox" id="${id}" ${val ? 'checked' : ''}> ${label}</label>`;
  if (f.type === 'select') return `<label class="${cls}"><span>${label}</span><select id="${id}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(val ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  if (f.type === 'textarea') return `<label class="${cls}"><span>${label}</span><textarea id="${id}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}>${esc(val || '')}</textarea></label>`;
  if (f.type === 'photo') return `<div class="${cls}"><span class="lbl">${label}</span><div class="photo-in"><label class="prev" for="${id}">${val ? `<img data-photo="${esc(val)}" alt="">` : esc(t('tap_photo'))}</label><input type="file" accept="image/*" capture="environment" id="${id}" data-kind="${esc(f.kind || 'misc')}" data-old="${esc(val || '')}" hidden><label for="${id}" class="btn sm">📷 ${esc(t('photo'))}</label></div></div>`;
  const isNum = f.type === 'number' || f.type === 'int';
  const type = isNum ? 'text' : (f.type || 'text');
  const extra = isNum ? `inputmode="${f.type === 'int' ? 'numeric' : 'decimal'}"` : '';
  return `<label class="${cls}"><span>${label}</span><input id="${id}" type="${type}" ${extra} ${f.list ? `list="${f.list}"` : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} value="${esc(val ?? '')}"></label>`;
}
export function formHtml(fields, data) { return `<div class="fgrid">${fields.map((f) => fieldHtml(f, data[f.k])).join('')}</div>`; }
export function bindPhotoPreviews(root) {
  for (const inp of $$('input[type=file][data-kind]', root)) {
    inp.addEventListener('change', () => {
      const f = inp.files[0]; if (!f) return;
      const prev = inp.parentElement.querySelector('.prev');
      prev.innerHTML = `<img src="${URL.createObjectURL(f)}" alt="">`;
    });
  }
}
// reads values; uploads chosen photos; returns object
export async function readForm(root, fields) {
  const o = {};
  for (const f of fields) {
    if (f.sec) continue;
    const el = root.querySelector('#f_' + f.k);
    if (!el) continue;
    if (f.type === 'check') o[f.k] = el.checked;
    else if (f.type === 'number') o[f.k] = el.value.trim() === '' ? (f.nullable ? null : 0) : num(el.value);
    else if (f.type === 'int') o[f.k] = el.value.trim() === '' ? null : Math.round(num(el.value));
    else if (f.type === 'photo') {
      if (el.files && el.files[0]) o[f.k] = await uploadPhoto(el.files[0], el.dataset.kind || 'misc');
      else o[f.k] = el.dataset.old || null;
    } else if (f.type === 'date') o[f.k] = el.value || null;
    else o[f.k] = el.value.trim();
  }
  return o;
}

// ---------- photos ----------
export async function hydratePhotos(root = document) {
  const imgs = $$('img[data-photo]', root).filter((i) => !i.src);
  if (!imgs.length) return;
  try {
    const urls = await signedUrls(imgs.map((i) => i.dataset.photo));
    for (const i of imgs) if (urls[i.dataset.photo]) i.src = urls[i.dataset.photo];
  } catch {}
}
export function thumbs(paths) {
  const ps = (paths || []).filter(Boolean);
  if (!ps.length) return '';
  return `<span class="thumbs">${ps.map((p) => `<a class="thumb" data-zoom="${esc(p)}"><img data-photo="${esc(p)}" alt=""></a>`).join('')}</span>`;
}
document.addEventListener('click', async (e) => {
  const z = e.target.closest('[data-zoom]');
  if (!z) return;
  e.preventDefault(); e.stopPropagation();
  const urls = await signedUrls([z.dataset.zoom]);
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<img src="${esc(urls[z.dataset.zoom] || '')}" alt="">`;
  lb.addEventListener('click', () => lb.remove());
  document.body.appendChild(lb);
}, true);

// copy helper
export async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast(t('copied')); } catch { toast(text); }
}

// download a CSV made in the browser
export function downloadCSV(name, rows) {
  const csv = rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

export const icons = {
  jobs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h-2v-6l2-5h9l4 5h3v6h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6"/></svg>',
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  fuel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10M14 8l3 3v6a1.5 1.5 0 0 0 3 0V9l-3-3"/></svg>',
  parking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M10 17V8h3a2.5 2.5 0 0 1 0 5h-3"/></svg>',
  odo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/><path d="M4 20h16"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
  off: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9 14l6 4M15 14l-6 4"/></svg>',
};
