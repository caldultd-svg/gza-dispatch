// Operations: dispatch board, calendar, transfers, tours (+ their editors)
import { t } from '../i18n.js';
import { S, list, get, save, remove, sb, api } from '../store.js';
import {
  esc, $, $$, toast, errText, modal, armDelete, formHtml, readForm, bindPhotoPreviews, todayStr, addDays, daysBetween, fmtDate,
  money, gel, plate, statusPill, tourPill, accBadge, linesOf, semis, gmapsDir, gmapsSearch, copy, downloadCSV, num, avatar,
} from '../ui.js';
import {
  TYPES, STATUSES, TSTAT, CLASSES, CURS, PAYMENTS, opt, drivers, pname, driverColor, driverOptions, vehicleOptions,
  driverSelectOpts, vehicleSelectOpts, isDayOff, tourDaysOn, tourDays, driverState, conflictSet, sendAssign, notifyCancelled,
  gsync, clientText, CLIENT_LANGS, waLink, priceCell,
} from '../common.js';
import { defaultOrderPay, defaultDayPay, tourCosts, orderCosts, hm } from '../calc.js';

let boardDate = todayStr();
export const setBoardDate = (d) => { boardDate = d; };

// =====================================================================
// Board
// =====================================================================
function orderCard(o, conf) {
  const v = get('vehicles', o.vehicle_id);
  const c = conf.get(o.id);
  const stops = linesOf(o.stops);
  return `<div class="card cl-${esc(o.status)}" data-order="${esc(o.id)}" tabindex="0">
    <div class="t"><span class="time">${esc(o.time || '--:--')}</span><span class="type">${esc(t('t_' + o.type))}</span><span style="margin-left:auto" class="row">${accBadge(o.accept)}${statusPill(o.status)}</span></div>
    <div class="route">${esc(o.pickup)}${stops.length ? ` <span class="muted">→ ${stops.length} ⋯</span>` : ''} <span class="muted">→</span> ${esc(o.dropoff)}</div>
    <div class="meta"><span>${esc(o.client_name || o.passenger_name)}</span>${o.flight ? `<span class="mono">✈ ${esc(o.flight)}</span>` : ''}<span>${esc(o.pax)} ${esc(t('pax_short'))}</span>${v ? plate(v.plate) : `<span class="tag">${esc(t('c_' + o.vclass))}</span>`}${o.wheelchair ? '<span>♿</span>' : ''}${o.partner_name ? `<span class="tag">↗ ${esc(o.partner_name)}</span>` : ''}</div>
    ${c ? `<div class="flag">⚠ ${esc(t(c))}</div>` : ''}
    <select data-assign-order="${esc(o.id)}" aria-label="${esc(t('driver'))}">${driverOptions(o.driver_id, t('assign'), o.date)}</select>
  </div>`;
}
function tourDayCard(d) {
  const tr = get('tours', d.tour_id);
  const n = daysBetween(tr.date_from, tr.date_to) + 1;
  const i = daysBetween(tr.date_from, d.date);
  const v = get('vehicles', d.vehicle_id);
  return `<div class="card tourcard" data-tour="${esc(tr.id)}" tabindex="0">
    <div class="t"><span class="type">${esc(t('t_tour'))} · ${esc(t('day'))} ${i + 1}/${n}</span><span style="margin-left:auto" class="row">${accBadge(d.accept)}${tourPill(tr.status)}</span></div>
    <div class="route"><b>${esc(tr.name)}</b></div>
    ${d.from_place || d.to_place ? `<div class="route">${i === 0 && tr.start_time ? `<span class="mono">${esc(tr.start_time)}</span> · ` : ''}${esc(d.from_place)} <span class="muted">→</span> ${esc(d.to_place)}</div>` : `<div class="flag">⚠ ${esc(t('no_route'))}</div>`}
    <div class="meta"><span>${esc(tr.client_name)}</span><span>${esc(tr.group_size)} ${esc(t('pax_short'))}</span>${v ? plate(v.plate) : `<span class="flag">${esc(t('no_car'))}</span>`}${d.hotel ? `<span>🛏 ${esc(d.hotel)}</span>` : ''}</div>
    <select data-assign-day="${esc(d.id)}" aria-label="${esc(t('driver'))}">${driverOptions(d.driver_id, t('assign'), d.date)}</select>
  </div>`;
}

export const board = {
  render() {
    const day = list('orders').filter((o) => o.date === boardDate).sort((a, b) => hm(a.time) - hm(b.time));
    const tdays = tourDaysOn(boardDate);
    const conf = conflictSet();
    const live = day.filter((o) => o.status !== 'cancelled');
    const unas = live.filter((o) => !o.driver_id);
    const unasDays = tdays.filter((d) => !d.driver_id);
    const ds = drivers().sort((a, b) => (driverState(a, boardDate)[0] === 'off') - (driverState(b, boardDate)[0] === 'off') || (a.name || '').localeCompare(b.name || ''));
    const nConf = day.filter((o) => conf.has(o.id)).length;
    let h = `<div class="vhead"><h1>${esc(t('v_board'))}</h1><span class="muted">${esc(fmtDate(boardDate, { weekday: 'long', day: 'numeric', month: 'long' }))}</span><div class="grow"></div>
      <div class="filters">
        <button class="btn sm" data-day="-1" aria-label="${esc(t('prev'))}">←</button>
        <input type="date" id="boardDate" value="${esc(boardDate)}">
        <button class="btn sm" data-day="1" aria-label="${esc(t('next'))}">→</button>
        <button class="btn sm" data-day="0">${esc(t('today'))}</button>
        <button class="btn" data-new-tour>＋ ${esc(t('new_tour'))}</button>
        <button class="btn primary" data-new-order>＋ ${esc(t('new_order'))}</button>
      </div></div>
    <div class="summary">
      <div><b>${live.length}</b>${esc(t('transfers'))}</div>
      <div><b>${new Set(tdays.map((d) => d.tour_id)).size}</b>${esc(t('tours_today'))}</div>
      <div><b class="${unas.length + unasDays.length ? 'warnc' : ''}">${unas.length + unasDays.length}</b>${esc(t('unassigned'))}</div>
      <div><b>${live.filter((o) => o.accept === 'pending').length + tdays.filter((d) => d.accept === 'pending').length}</b>${esc(t('waiting_answer'))}</div>
      <div><b>${live.filter((o) => o.status === 'done').length}</b>${esc(t('s_done'))}</div>
      <div><b class="${nConf ? 'badc' : ''}">${nConf}</b>${esc(t('conflicts'))}</div>
    </div>
    <div class="board">
      <section class="lane unassigned"><div class="lh"><b>${esc(t('unassigned'))}</b><span class="n">${unas.length + unasDays.length}</span></div>
        ${unasDays.map(tourDayCard).join('')}${unas.map((o) => orderCard(o, conf)).join('')}${unas.length + unasDays.length ? '' : `<div class="empty">—</div>`}</section>`;
    for (const d of ds) {
      const os = day.filter((o) => o.driver_id === d.id);
      const tds = tdays.filter((x) => x.driver_id === d.id);
      const v = get('vehicles', d.vehicle_id);
      const [st, stLabel] = driverState(d, boardDate);
      h += `<section class="lane"><div class="lh"><span class="dot" style="background:${driverColor(d.id)}"></span><b>${esc(d.name)}</b><span class="n">${os.length + tds.length}</span></div>
        <div class="lsub">${v ? plate(v.plate) : ''}<span class="${st === 'off' ? 'badc' : st === 'free' ? 'goodc' : ''}">${esc(stLabel)}</span>${d.tg_chat_id ? '' : `<span class="tag" title="${esc(t('no_telegram'))}">no TG</span>`}</div>
        ${tds.map(tourDayCard).join('')}${os.map((o) => orderCard(o, conf)).join('')}${os.length + tds.length ? '' : `<div class="empty">—</div>`}</section>`;
    }
    h += `</div>`;
    if (!ds.length) h += `<div class="notice">${esc(t('no_drivers_yet'))}</div>`;
    return h;
  },
  bind(root) {
    root.addEventListener('click', (e) => {
      if (e.target.closest('select')) return;
      const b = e.target.closest('[data-day]');
      if (b) { const n = +b.dataset.day; boardDate = n === 0 ? todayStr() : addDays(boardDate, n); window.gzaGo('board'); return; }
      if (e.target.closest('[data-new-order]')) return openOrder(null, { date: boardDate });
      if (e.target.closest('[data-new-tour]')) return openTour(null, { date_from: boardDate });
      const o = e.target.closest('[data-order]'); if (o) return openOrder(o.dataset.order);
      const tr = e.target.closest('[data-tour]'); if (tr) return openTour(tr.dataset.tour);
    });
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.target.matches('[data-order]')) openOrder(e.target.dataset.order);
      if (e.target.matches('[data-tour]')) openTour(e.target.dataset.tour);
    });
    root.addEventListener('change', async (e) => {
      const el = e.target;
      if (el.id === 'boardDate') { boardDate = el.value || todayStr(); window.gzaGo('board'); return; }
      if (el.dataset.assignOrder) await assignOrder(el.dataset.assignOrder, el.value);
      if (el.dataset.assignDay) await assignDay(el.dataset.assignDay, el.value);
    });
  },
};

async function assignOrder(id, driverId) {
  const o = get('orders', id);
  const d = get('profiles', driverId);
  const upd = { id, driver_id: driverId || null, accept: 'none' };
  if (driverId && o.status === 'new') upd.status = 'assigned';
  if (!driverId && o.status === 'assigned') upd.status = 'new';
  if (d?.vehicle_id && (!o.vehicle_id || o.driver_id !== driverId)) upd.vehicle_id = d.vehicle_id;
  if (!driverId) upd.vehicle_id = null;
  if (d && !Number(o.driver_pay)) upd.driver_pay = defaultOrderPay(d, o, S.settings);
  try {
    await save('orders', upd);
    if (o.driver_id && o.driver_id !== driverId) notifyCancelled([o.driver_id], `${o.date} ${o.time} · ${o.pickup} → ${o.dropoff}`);
    if (driverId) await sendAssign('order', id);
    gsync('order', id);
  } catch (e) { toast(errText(e)); }
}
async function assignDay(dayId, driverId) {
  const d = get('tour_days', dayId);
  const p = get('profiles', driverId);
  const upd = { id: dayId, driver_id: driverId || null, accept: 'none' };
  if (p) { if (!d.vehicle_id && p.vehicle_id) upd.vehicle_id = p.vehicle_id; const dp = defaultDayPay(p); if (!Number(d.driver_pay)) upd.driver_pay = dp.driver_pay; if (!Number(d.per_diem)) upd.per_diem = dp.per_diem; }
  try {
    await save('tour_days', upd);
    const tr = get('tours', d.tour_id);
    if (d.driver_id && d.driver_id !== driverId) notifyCancelled([d.driver_id], `${tr.name} · ${d.date}`);
    if (driverId) await sendAssign('tour', d.tour_id);
    gsync('tour', d.tour_id);
  } catch (e) { toast(errText(e)); }
}

// =====================================================================
// Calendar
// =====================================================================
let calMonth = todayStr().slice(0, 7);
export const calendar = {
  render() {
    const [y, m] = calMonth.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday first
    const start = addDays(todayStr(first), -startOffset);
    const today = todayStr();
    const conf = conflictSet();
    const orders = list('orders').filter((o) => o.status !== 'cancelled');
    const tdays = list('tour_days');
    const tours = list('tours').filter((x) => x.status !== 'cancelled');
    const wd = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }));
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const ds = addDays(start, i);
      const os = orders.filter((o) => o.date === ds).sort((a, b) => hm(a.time) - hm(b.time));
      const ts = tours.filter((x) => ds >= x.date_from && ds <= x.date_to);
      const unas = os.filter((o) => !o.driver_id).length + tdays.filter((d) => d.date === ds && !d.driver_id && ts.some((x) => x.id === d.tour_id)).length;
      const warn = unas || os.some((o) => conf.has(o.id));
      cells += `<div class="d ${ds.slice(0, 7) !== calMonth ? 'out' : ''} ${ds === today ? 'today' : ''}" data-date="${ds}" tabindex="0">
        <span class="n">${+ds.slice(8)}</span>
        ${ts.slice(0, 2).map((x) => `<span class="ev tour">🚐 ${esc(x.name)}</span>`).join('')}${ts.length > 2 ? `<span class="ev tour">+${ts.length - 2}</span>` : ''}
        ${os.slice(0, 3).map((o) => `<span class="ev ${!o.driver_id ? 'warn' : ''}"><b class="mono">${esc(o.time)}</b> ${esc(o.pickup)}</span>`).join('')}${os.length > 3 ? `<span class="ev">+${os.length - 3}</span>` : ''}
        ${warn ? `<span class="ev warn">⚠ ${unas || ''}</span>` : ''}
        <span class="cnt">${os.length ? os.length + '🚗' : ''} ${ts.length ? ts.length + '🚐' : ''}</span>
      </div>`;
    }
    return `<div class="vhead"><h1>${esc(t('v_calendar'))}</h1><span class="muted">${esc(first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</span><div class="grow"></div>
      <div class="filters"><button class="btn sm" data-m="-1">←</button><input type="month" id="calMonth" value="${esc(calMonth)}"><button class="btn sm" data-m="1">→</button><button class="btn sm" data-m="0">${esc(t('today'))}</button>
      ${S.settings.gas_url ? `<button class="btn" data-gsync>↻ ${esc(t('sync_google'))}</button>` : `<button class="btn" data-view="settings">${esc(t('connect_google'))}</button>`}</div></div>
      <div class="cal">${wd.map((w) => `<div class="dh">${esc(w)}</div>`).join('')}${cells}</div>`;
  },
  bind(root) {
    root.addEventListener('click', async (e) => {
      const m = e.target.closest('[data-m]');
      if (m) { const n = +m.dataset.m; if (n === 0) calMonth = todayStr().slice(0, 7); else { const [y, mo] = calMonth.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); calMonth = todayStr(d).slice(0, 7); } window.gzaGo('calendar'); return; }
      const d = e.target.closest('[data-date]');
      if (d) { boardDate = d.dataset.date; window.gzaGo('board'); return; }
      const g = e.target.closest('[data-gsync]');
      if (g) { g.disabled = true; try { const r = await api('google', { action: 'syncAll' }); toast(r.ok ? t('synced') + ` (${r.count ?? ''})` : (r.error || t('err_save'))); } catch (er) { toast(errText(er)); } g.disabled = false; }
    });
    root.addEventListener('change', (e) => { if (e.target.id === 'calMonth') { calMonth = e.target.value || calMonth; window.gzaGo('calendar'); } });
  },
};

// =====================================================================
// Transfers list
// =====================================================================
const F = { q: '', status: '', type: '', from: '', to: '', driver: '' };
function filteredOrders() {
  const q = F.q.trim().toLowerCase();
  return list('orders').filter((o) => {
    if (F.status && o.status !== F.status) return false;
    if (F.type && o.type !== F.type) return false;
    if (F.driver && o.driver_id !== F.driver) return false;
    if (F.from && o.date < F.from) return false;
    if (F.to && o.date > F.to) return false;
    if (q) { const hay = [o.client_name, o.passenger_name, o.passenger_phone, o.contact_name, o.contact_org, o.contact_phone, o.pickup, o.dropoff, o.flight, o.notes, pname(o.driver_id)].join(' ').toLowerCase(); if (!hay.includes(q)) return false; }
    return true;
  }).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}
export const orders = {
  render() {
    const rows = filteredOrders();
    let h = `<div class="vhead"><h1>${esc(t('v_orders'))}</h1><span class="muted">${rows.length}</span><div class="grow"></div><button class="btn" data-csv>CSV</button><button class="btn primary" data-new-order>＋ ${esc(t('new_order'))}</button></div>
    <div class="filters" style="margin-bottom:14px">
      <input type="search" id="fq" placeholder="${esc(t('search_orders'))}" value="${esc(F.q)}">
      <select id="fs"><option value="">${esc(t('all_statuses'))}</option>${STATUSES.map((s) => `<option value="${s}" ${F.status === s ? 'selected' : ''}>${esc(t('s_' + s))}</option>`).join('')}</select>
      <select id="ft"><option value="">${esc(t('all_types'))}</option>${TYPES.map((s) => `<option value="${s}" ${F.type === s ? 'selected' : ''}>${esc(t('t_' + s))}</option>`).join('')}</select>
      <select id="fd">${driverOptions(F.driver, t('all_drivers'))}</select>
      <input type="date" id="ffrom" value="${esc(F.from)}" aria-label="${esc(t('from'))}"><input type="date" id="fto" value="${esc(F.to)}" aria-label="${esc(t('to'))}">
    </div>
    <div class="tbl"><table><thead><tr><th>${esc(t('date'))}</th><th>${esc(t('type'))}</th><th>${esc(t('route'))}</th><th>${esc(t('client'))}</th><th>${esc(t('driver'))}</th><th>${esc(t('status'))}</th><th class="num">${esc(t('price'))}</th></tr></thead><tbody>`;
    for (const o of rows.slice(0, 500)) {
      h += `<tr class="click" data-order="${esc(o.id)}"><td class="mono" style="white-space:nowrap">${esc(o.date)}<br>${esc(o.time)}</td>
        <td><span class="type">${esc(t('t_' + o.type))}</span>${o.flight ? `<br><span class="mono muted">✈ ${esc(o.flight)}</span>` : ''}</td>
        <td style="max-width:320px">${esc(o.pickup)} <span class="muted">→</span> ${esc(o.dropoff)}</td>
        <td>${esc(o.client_name || o.passenger_name)}${o.contact_name ? `<br><span class="muted small">${esc(o.contact_org)} ${esc(o.contact_name)}</span>` : ''}</td>
        <td>${o.driver_id ? esc(pname(o.driver_id)) + ' ' + accBadge(o.accept) : `<span class="warnc">${esc(t('unassigned'))}</span>`}</td>
        <td>${statusPill(o.status)}</td><td class="num">${priceCell(o.price, o.currency, o.paid)}</td></tr>`;
    }
    if (!rows.length) h += `<tr><td colspan="7" class="empty">${esc(t('nothing_found'))}</td></tr>`;
    return h + `</tbody></table></div>`;
  },
  bind(root) {
    let qt;
    root.addEventListener('input', (e) => { if (e.target.id === 'fq') { F.q = e.target.value; clearTimeout(qt); qt = setTimeout(() => window.gzaGo('orders'), 250); } });
    root.addEventListener('change', (e) => {
      const m = { fs: 'status', ft: 'type', fd: 'driver', ffrom: 'from', fto: 'to' }[e.target.id];
      if (m) { F[m] = e.target.value; window.gzaGo('orders'); }
    });
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-new-order]')) return openOrder(null, {});
      if (e.target.closest('[data-csv]')) return downloadCSV('transfers.csv', [['date', 'time', 'type', 'status', 'client', 'contact', 'pickup', 'dropoff', 'driver', 'price', 'currency', 'paid'], ...filteredOrders().map((o) => [o.date, o.time, o.type, o.status, o.client_name, `${o.contact_org} ${o.contact_name} ${o.contact_phone}`.trim(), o.pickup, o.dropoff, pname(o.driver_id), o.price, o.currency, o.paid ? 'yes' : 'no'])]);
      const r = e.target.closest('[data-order]'); if (r) openOrder(r.dataset.order);
    });
  },
};

// =====================================================================
// Transfer editor
// =====================================================================
function orderFields() {
  return [
    { k: 'type', type: 'select', options: opt(TYPES, 't_') },
    { k: 'status', type: 'select', options: opt(STATUSES, 's_') },
    { k: 'date', type: 'date' }, { k: 'time', type: 'time' },
    { sec: 'sec_route' },
    { k: 'pickup', wide: true }, { k: 'stops', type: 'textarea', wide: true, label: 'stops_lines' }, { k: 'dropoff', wide: true },
    { k: 'flight' }, { k: 'sign' }, { k: 'duration', type: 'int', label: 'duration_min' },
    { sec: 'sec_passenger' },
    { k: 'passenger_name' }, { k: 'passenger_phone', type: 'tel' },
    { k: 'pax', type: 'int' }, { k: 'luggage', type: 'int' }, { k: 'child_seats', type: 'int' },
    { k: 'wheelchair', type: 'check', wide: true },
    { sec: 'sec_contact' },
    { k: 'client_name', label: 'client', list: 'clientList' }, { k: 'contact_org' }, { k: 'contact_name' }, { k: 'contact_phone', type: 'tel' }, { k: 'cost_center' },
    { sec: 'sec_assign' },
    { k: 'vclass', type: 'select', options: opt(CLASSES, 'c_') },
    { k: 'driver_id', label: 'driver', type: 'select', options: driverSelectOpts() },
    { k: 'vehicle_id', label: 'vehicle', type: 'select', options: vehicleSelectOpts() },
    { k: 'partner_name' }, { k: 'partner_cost', type: 'number' },
    { sec: 'sec_money' },
    { k: 'price', type: 'number' }, { k: 'currency', type: 'select', options: opt(CURS) },
    { k: 'payment', type: 'select', options: opt(PAYMENTS, 'pay_') }, { k: 'paid', type: 'check' },
    { k: 'driver_pay', type: 'number', label: 'driver_pay_gel' },
    { sec: 'sec_extra' },
    { k: 'notes', type: 'textarea', wide: true, label: 'notes_driver' }, { k: 'special', type: 'textarea', wide: true },
  ];
}
export function openOrder(id, defaults = {}) {
  const o = id ? get('orders', id) : null;
  const data = o ? { ...o } : { type: 'airport', status: 'new', date: todayStr(), time: '', pax: 1, duration: 60, currency: S.settings.def_cur || 'GEL', payment: 'cash', vclass: 'sedan', luggage: 0, child_seats: 0, ...defaults };
  const fields = orderFields();
  const tariffs = list('tariffs');
  const top = `<datalist id="clientList">${list('clients').map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist>
    <div class="filters" style="margin-bottom:12px">
      ${tariffs.length ? `<select id="tariffPick" style="max-width:320px"><option value="">${esc(t('use_tariff'))}</option>${tariffs.map((x) => `<option value="${esc(x.id)}">${esc(x.name || x.from_place + ' → ' + x.to_place)} · ${esc(t('c_' + x.vclass))} · ${money(x.price, x.currency)}</option>`).join('')}</select>` : ''}
      ${o ? `<a class="btn sm" href="${esc(gmapsDir(o.dropoff || o.pickup, o.dropoff ? o.pickup : '', linesOf(o.stops)))}" target="_blank" rel="noopener">🗺 ${esc(t('route'))}</a>
      ${o.flight ? `<a class="btn sm" href="https://www.google.com/search?q=${encodeURIComponent(o.flight + ' flight status')}" target="_blank" rel="noopener">✈ ${esc(o.flight)}</a>` : ''}
      <button class="btn sm" type="button" data-client-text>✉ ${esc(t('client_text'))}</button>
      ${o.driver_id ? `<span class="row small">${esc(pname(o.driver_id))} ${accBadge(o.accept)}</span>` : ''}` : ''}
    </div>`;
  const costs = o ? orderCosts(o, list('fuel'), list('expenses'), S.settings) : null;
  const profitLine = o && Number(o.price) ? `<p class="small muted" style="margin:10px 0 0">${esc(t('profit'))}: <b class="mono">${money(gel(o.price, o.currency) - costs.total)}</b> (${esc(t('costs'))} ${money(costs.total)})</p>` : '';
  modal({
    title: o ? `${t('transfer')} · ${o.date} ${o.time}` : t('new_order'),
    body: top + formHtml(fields, data) + profitLine,
    footer: `${o ? `<button class="btn danger" data-del>${esc(t('delete'))}</button><button class="btn" data-dup>${esc(t('duplicate'))}</button>` : ''}<span class="grow"></span><button class="btn" data-close>${esc(t('cancel'))}</button><button class="btn primary" data-save>${esc(t('save'))}</button>`,
    onMount(el, close) {
      bindPhotoPreviews(el);
      el.querySelector('#tariffPick')?.addEventListener('change', (e) => {
        const x = get('tariffs', e.target.value); if (!x) return;
        const set = (k, v) => { const i = el.querySelector('#f_' + k); if (i) i.value = v; };
        set('pickup', x.from_place); set('dropoff', x.to_place); set('vclass', x.vclass); set('price', x.price); set('currency', x.currency); set('duration', x.duration);
      });
      el.querySelector('#f_driver_id').addEventListener('change', (e) => {
        const p = get('profiles', e.target.value);
        const vs = el.querySelector('#f_vehicle_id');
        if (p?.vehicle_id && vs && !vs.value) vs.value = p.vehicle_id;
      });
      el.querySelector('[data-client-text]')?.addEventListener('click', () => openClientText(o));
      el.querySelector('[data-dup]')?.addEventListener('click', () => { close(); const c = { ...o }; delete c.id; openOrder(null, { ...c, status: 'new', driver_id: null, accept: 'none', paid: false, log: {} }); });
      const del = el.querySelector('[data-del]');
      if (del) armDelete(del, async () => { await remove('orders', o.id); if (o.driver_id && o.status !== 'done') notifyCancelled([o.driver_id], `${o.date} ${o.time} · ${o.pickup} → ${o.dropoff}`); gsync('order', o.id, true); toast(t('deleted')); close(); });
      el.querySelector('[data-save]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const vals = await readForm(el, fields);
        if (!vals.date || !vals.time || !vals.pickup) { toast(t('err_order_required')); return; }
        btn.disabled = true;
        try { await saveOrder(o, vals); toast(t('saved')); close(); } catch (er) { toast(errText(er)); btn.disabled = false; }
      });
    },
  });
}

async function ensureClient(name, phone, ctype) {
  if (!name) return null;
  const c = list('clients').find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (c) return c.id;
  try { return (await save('clients', { name, phone: phone || '', ctype })).id; } catch { return null; }
}

async function saveOrder(old, vals) {
  vals.driver_id = vals.driver_id || null;
  vals.vehicle_id = vals.vehicle_id || null;
  if (!old || old.driver_id !== vals.driver_id) vals.accept = 'none';
  if (vals.driver_id && vals.status === 'new') vals.status = 'assigned';
  if (!vals.driver_id && vals.status === 'assigned') vals.status = 'new';
  const p = get('profiles', vals.driver_id);
  if (p && !vals.vehicle_id && p.vehicle_id) vals.vehicle_id = p.vehicle_id;
  if (p && !Number(vals.driver_pay)) vals.driver_pay = defaultOrderPay(p, vals, S.settings);
  vals.client_id = await ensureClient(vals.client_name, vals.contact_phone || vals.passenger_phone, vals.contact_org ? 'company' : 'person');
  const row = await save('orders', { ...vals, id: old?.id });
  if (old?.driver_id && (old.driver_id !== row.driver_id || (row.status === 'cancelled' && old.status !== 'cancelled'))) notifyCancelled([old.driver_id], `${old.date} ${old.time} · ${old.pickup} → ${old.dropoff}`);
  if (row.driver_id && row.accept === 'none' && row.status !== 'cancelled') await sendAssign('order', row.id);
  gsync('order', row.id);
  return row;
}

function openClientText(o) {
  let L = 'en';
  const phone = o.passenger_phone || o.contact_phone;
  modal({
    title: t('client_text'), narrow: true,
    body: `<div class="seg" style="margin-bottom:10px">${CLIENT_LANGS.map((l) => `<button type="button" data-cl="${l}" aria-pressed="${l === L}">${l.toUpperCase()}</button>`).join('')}</div><textarea id="ctext" style="min-height:240px">${esc(clientText(o, L))}</textarea>`,
    footer: `<span class="grow"></span><button class="btn" data-copy>${esc(t('copy'))}</button>${phone ? `<a class="btn good" id="wa" target="_blank" rel="noopener" href="${esc(waLink(phone, clientText(o, L)))}">WhatsApp</a>` : ''}`,
    onMount(el) {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cl]');
        if (b) { L = b.dataset.cl; el.querySelector('#ctext').value = clientText(o, L); $$('[data-cl]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); const wa = el.querySelector('#wa'); if (wa) wa.href = waLink(phone, el.querySelector('#ctext').value); }
        if (e.target.closest('[data-copy]')) copy(el.querySelector('#ctext').value);
      });
      el.querySelector('#ctext').addEventListener('input', (e) => { const wa = el.querySelector('#wa'); if (wa) wa.href = waLink(phone, e.target.value); });
    },
  });
}

// =====================================================================
// Tours list
// =====================================================================
export const tours = {
  render() {
    const today = todayStr();
    const all = list('tours');
    const cur = all.filter((x) => x.date_to >= today).sort((a, b) => a.date_from.localeCompare(b.date_from));
    const past = all.filter((x) => x.date_to < today).sort((a, b) => b.date_from.localeCompare(a.date_from));
    const table = (rows) => {
      let h = `<div class="tbl" style="margin-bottom:22px"><table><thead><tr><th>${esc(t('dates'))}</th><th>${esc(t('tour_name'))}</th><th>${esc(t('client'))}</th><th>${esc(t('drivers'))}</th><th>${esc(t('status'))}</th><th class="num">${esc(t('price'))}</th><th class="num">${esc(t('costs'))}</th><th class="num">${esc(t('profit'))}</th></tr></thead><tbody>`;
      for (const x of rows) {
        const days = tourDays(x.id);
        const c = tourCosts(x, days, list('fuel'), list('expenses'), S.settings);
        const rev = gel(x.price, x.currency);
        const ds = [...new Set(days.map((d) => d.driver_id).filter(Boolean))];
        const missing = days.filter((d) => !d.driver_id).length;
        h += `<tr class="click" data-tour="${esc(x.id)}"><td class="mono" style="white-space:nowrap">${esc(x.date_from)}<br><span class="muted">${daysBetween(x.date_from, x.date_to) + 1} ${esc(t('days_short'))}</span></td>
          <td style="max-width:300px"><b>${esc(x.name)}</b><br><span class="muted small">${esc(days.map((d) => d.to_place).filter(Boolean).join(' · '))}</span></td>
          <td>${esc(x.client_name)}<br><span class="muted small">${esc(x.group_size)} ${esc(t('pax_short'))}</span></td>
          <td>${ds.map((id) => esc(pname(id))).join(', ') || ''}${missing ? `<br><span class="warnc small">${missing} ${esc(t('days_without_driver'))}</span>` : ''}</td>
          <td>${tourPill(x.status)}</td><td class="num">${priceCell(x.price, x.currency, x.paid)}</td><td class="num">${money(c.total)}</td><td class="num ${rev - c.total < 0 ? 'badc' : ''}">${Number(x.price) ? money(rev - c.total) : '—'}</td></tr>`;
      }
      if (!rows.length) h += `<tr><td colspan="8" class="empty">—</td></tr>`;
      return h + '</tbody></table></div>';
    };
    return `<div class="vhead"><h1>${esc(t('v_tours'))}</h1><span class="muted">${all.length}</span><div class="grow"></div><button class="btn primary" data-new-tour>＋ ${esc(t('new_tour'))}</button></div>
      <h2>${esc(t('current_upcoming'))}</h2>${table(cur)}<h2>${esc(t('past'))}</h2>${table(past)}`;
  },
  bind(root) {
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-new-tour]')) return openTour(null, {});
      const r = e.target.closest('[data-tour]'); if (r) openTour(r.dataset.tour);
    });
  },
};

// =====================================================================
// Tour editor (each day can have its own driver and car)
// =====================================================================
function dayRow(d, i) {
  return `<div class="dayrow" data-id="${esc(d.id || '')}" data-orig-driver="${esc(d.driver_id || '')}" data-accept="${esc(d.accept || 'none')}">
    <div class="dh"><b>${esc(t('day'))} <span class="dn">${i + 1}</span></b><input type="date" data-f="date" value="${esc(d.date || '')}" aria-label="${esc(t('date'))}">${accBadge(d.accept)}<span class="grow"></span><button type="button" class="btn sm danger" data-rmday>${esc(t('remove'))}</button></div>
    <div class="fgrid">
      <label class="f"><span>${esc(t('from_place'))}</span><input data-f="from_place" value="${esc(d.from_place || '')}"></label>
      <label class="f"><span>${esc(t('to_place'))}</span><input data-f="to_place" value="${esc(d.to_place || '')}"></label>
      <label class="f wide"><span>${esc(t('stops_semi'))}</span><input data-f="stops" value="${esc(d.stops || '')}"></label>
      <label class="f"><span>${esc(t('overnight'))}</span><input data-f="hotel" value="${esc(d.hotel || '')}"></label>
      <label class="f"><span>${esc(t('day_program'))}</span><input data-f="note" value="${esc(d.note || '')}"></label>
      <label class="f"><span>${esc(t('driver'))}</span><select data-f="driver_id">${driverOptions(d.driver_id, '— ' + t('unassigned') + ' —', d.date)}</select></label>
      <label class="f"><span>${esc(t('vehicle'))}</span><select data-f="vehicle_id">${vehicleOptions(d.vehicle_id)}</select></label>
      <label class="f"><span>${esc(t('day_pay'))}</span><input data-f="driver_pay" inputmode="decimal" value="${esc(d.driver_pay ?? '')}"></label>
      <label class="f"><span>${esc(t('per_diem'))}</span><input data-f="per_diem" inputmode="decimal" value="${esc(d.per_diem ?? '')}"></label>
    </div></div>`;
}
function readDays(el) {
  return $$('#dayRows .dayrow', el).map((r, i) => {
    const o = { idx: i, id: r.dataset.id || null, _orig: r.dataset.origDriver || null, _accept: r.dataset.accept };
    $$('[data-f]', r).forEach((x) => { o[x.dataset.f] = x.value.trim(); });
    o.driver_id = o.driver_id || null; o.vehicle_id = o.vehicle_id || null;
    o.driver_pay = num(o.driver_pay); o.per_diem = num(o.per_diem);
    return o;
  });
}
function tourFields() {
  return [
    { k: 'name', label: 'tour_name', wide: true },
    { k: 'status', type: 'select', options: opt(TSTAT, 'ts_') },
    { k: 'date_from', type: 'date' }, { k: 'date_to', type: 'date' }, { k: 'start_time', type: 'time' },
    { k: 'group_size', type: 'int' },
    { sec: 'sec_contact' },
    { k: 'client_name', label: 'client', list: 'clientList' }, { k: 'contact_org' }, { k: 'contact_name' }, { k: 'contact_phone', type: 'tel' },
    { k: 'guide' }, { k: 'guide_phone', type: 'tel' },
    { sec: 'sec_money' },
    { k: 'price', type: 'number' }, { k: 'currency', type: 'select', options: opt(CURS) },
    { k: 'payment', type: 'select', options: opt(PAYMENTS, 'pay_') }, { k: 'paid', type: 'check' },
    { sec: 'sec_tour_costs' },
    { k: 'km', type: 'int', label: 'km_planned' }, { k: 'driver_hotel', type: 'number' }, { k: 'other_cost', type: 'number' },
    { sec: 'sec_extra' }, { k: 'notes', type: 'textarea', wide: true },
  ];
}
export function openTour(id, defaults = {}) {
  const x = id ? get('tours', id) : null;
  const df = defaults.date_from || todayStr();
  const data = x ? { ...x } : { status: 'confirmed', date_from: df, date_to: addDays(df, 4), currency: S.settings.def_cur || 'GEL', payment: 'invoice', group_size: 10, start_time: '09:00', ...defaults };
  const days = x ? tourDays(x.id) : [];
  const fields = tourFields();
  const c = x ? tourCosts(x, days, list('fuel'), list('expenses'), S.settings) : null;
  const costLine = x ? `<div class="notice small" style="margin-top:12px">${esc(t('costs'))}: <b class="mono">${money(c.total)}</b> — ${esc(t('fuel'))} ${money(c.fuel)}, ${esc(t('expenses'))} ${money(c.expenses)}, ${esc(t('day_pay'))} ${money(c.pay)}, ${esc(t('per_diem'))} ${money(c.perDiem)}, ${esc(t('driver_hotel'))} ${money(c.hotel)}, ${esc(t('other_cost'))} ${money(c.other)}. ${Number(x.price) ? `${esc(t('profit'))}: <b class="mono">${money(gel(x.price, x.currency) - c.total)}</b>` : ''}</div>` : '';
  const after = `<div class="fsec" style="display:block;margin-top:16px">${esc(t('days_plan'))}</div>
    <div class="filters" style="margin:8px 0 10px"><span class="small muted">${esc(t('all_days'))}:</span><select id="allDriver">${driverOptions('', t('driver'))}</select><select id="allVehicle">${vehicleOptions('', t('vehicle'))}</select><button type="button" class="btn sm" data-apply-all>${esc(t('apply_all_days'))}</button></div>
    <div id="dayRows" class="dayrows">${days.map(dayRow).join('')}</div>
    <div class="filters" style="margin-top:10px"><button type="button" class="btn sm" data-genday>${esc(t('fill_days'))}</button><button type="button" class="btn sm" data-addday>＋ ${esc(t('add_day'))}</button></div>${costLine}`;
  modal({
    title: x ? x.name : t('new_tour'),
    body: `<datalist id="clientList">${list('clients').map((cl) => `<option value="${esc(cl.name)}">`).join('')}</datalist>` + formHtml(fields, data) + after,
    footer: `${x ? `<button class="btn danger" data-del>${esc(t('delete'))}</button><button class="btn" data-dup>${esc(t('duplicate'))}</button>` : ''}<span class="grow"></span><button class="btn" data-close>${esc(t('cancel'))}</button><button class="btn primary" data-save>${esc(t('save'))}</button>`,
    onMount(el, close) {
      const box = el.querySelector('#dayRows');
      const renumber = () => $$('.dn', box).forEach((s, i) => { s.textContent = i + 1; });
      const gen = () => {
        const f = el.querySelector('#f_date_from').value, to = el.querySelector('#f_date_to').value || f;
        if (!f) return;
        const old = readDays(el);
        const n = Math.max(1, Math.min(60, daysBetween(f, to) + 1));
        let h = '';
        for (let i = 0; i < n; i++) { const d = { ...(old[i] || {}) }; d.date = addDays(f, i); if (!d.from_place && i > 0) d.from_place = (old[i - 1] || {}).to_place || ''; h += dayRow(d, i); }
        box.innerHTML = h;
      };
      if (!days.length) gen();
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-genday]')) gen();
        if (e.target.closest('[data-addday]')) { const rows = readDays(el); const last = rows[rows.length - 1] || {}; box.insertAdjacentHTML('beforeend', dayRow({ date: last.date ? addDays(last.date, 1) : el.querySelector('#f_date_from').value, from_place: last.to_place || '', driver_id: last.driver_id, vehicle_id: last.vehicle_id }, rows.length)); }
        const rm = e.target.closest('[data-rmday]'); if (rm) { rm.closest('.dayrow').remove(); renumber(); }
        if (e.target.closest('[data-apply-all]')) {
          const dv = el.querySelector('#allDriver').value, vv = el.querySelector('#allVehicle').value;
          for (const r of $$('.dayrow', box)) {
            if (dv) r.querySelector('[data-f=driver_id]').value = dv;
            if (vv) r.querySelector('[data-f=vehicle_id]').value = vv;
            else if (dv && get('profiles', dv)?.vehicle_id && !r.querySelector('[data-f=vehicle_id]').value) r.querySelector('[data-f=vehicle_id]').value = get('profiles', dv).vehicle_id;
          }
        }
      });
      el.querySelector('[data-dup]')?.addEventListener('click', () => { close(); const c2 = { ...x }; delete c2.id; openTour(null, { ...c2, status: 'planned', paid: false }); });
      const del = el.querySelector('[data-del]');
      if (del) armDelete(del, async () => { const ds = tourDays(x.id).map((d) => d.driver_id); await remove('tours', x.id); for (const d of tourDays(x.id)) S.tour_days.delete(d.id); notifyCancelled(ds, x.name); gsync('tour', x.id, true); toast(t('deleted')); close(); });
      el.querySelector('[data-save]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const vals = await readForm(el, fields);
        if (!vals.name || !vals.date_from) { toast(t('err_tour_required')); return; }
        if (!vals.date_to || vals.date_to < vals.date_from) vals.date_to = vals.date_from;
        btn.disabled = true;
        try { await saveTour(x, vals, readDays(el)); toast(t('saved')); close(); } catch (er) { toast(errText(er)); btn.disabled = false; }
      });
    },
  });
}

async function saveTour(old, vals, dayRows) {
  vals.client_id = await ensureClient(vals.client_name, vals.contact_phone, 'agency');
  const tour = await save('tours', { ...vals, id: old?.id });
  const existing = old ? tourDays(old.id) : [];
  const rows = dayRows.filter((d) => d.date).map((d, i) => {
    const p = get('profiles', d.driver_id);
    const changed = (d._orig || null) !== d.driver_id;
    const r = { id: d.id || crypto.randomUUID(), tour_id: tour.id, idx: i, date: d.date, from_place: d.from_place, to_place: d.to_place, stops: d.stops, hotel: d.hotel, note: d.note,
      driver_id: d.driver_id, vehicle_id: d.vehicle_id || (p?.vehicle_id ?? null), accept: changed ? 'none' : (d._accept || 'none'), driver_pay: d.driver_pay, per_diem: d.per_diem };
    if (p && changed && !r.driver_pay && !r.per_diem) { const dp = defaultDayPay(p); r.driver_pay = dp.driver_pay; r.per_diem = dp.per_diem; }
    if (!r.driver_id) r.accept = 'none';
    return r;
  });
  if (rows.length) {
    const { data, error } = await sb.from('tour_days').upsert(rows).select();
    if (error) throw error;
    for (const r of data) S.tour_days.set(r.id, r);
  }
  const keep = new Set(rows.map((r) => r.id));
  const gone = existing.filter((d) => !keep.has(d.id));
  if (gone.length) {
    const { error } = await sb.from('tour_days').delete().in('id', gone.map((d) => d.id));
    if (error) throw error;
    for (const d of gone) S.tour_days.delete(d.id);
  }
  // drivers who lost all their days in this tour get a cancellation
  const before = new Set(existing.map((d) => d.driver_id).filter(Boolean));
  const after = new Set(rows.map((d) => d.driver_id).filter(Boolean));
  const lost = [...before].filter((d) => !after.has(d));
  if (tour.status === 'cancelled') notifyCancelled([...before], tour.name);
  else notifyCancelled(lost, tour.name);
  if (tour.status !== 'cancelled' && rows.some((r) => r.driver_id && r.accept === 'none')) await sendAssign('tour', tour.id);
  gsync('tour', tour.id);
}
