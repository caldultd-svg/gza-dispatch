// Team: live map, driver cards (incl. sign-ups and days off), payroll
import { t } from '../i18n.js';
import { S, list, get, save, remove } from '../store.js';
import {
  esc, $$, toast, errText, modal, armDelete, formHtml, readForm, bindPhotoPreviews, hydratePhotos, todayStr, fmtDate, timeAgo,
  money, plate, avatar, gmapsLL, copy, downloadCSV, accBadge, statusPill, num,
} from '../ui.js';
import { drivers, driverState, driverColor, opt, CURS, vehicleSelectOpts, isDayOff, pname } from '../common.js';
import { payroll, round2, daysUntil } from '../calc.js';
import { BOT_USERNAME } from '../config.js';

// =====================================================================
// Map
// =====================================================================
let mapView = { center: [41.9, 44.0], zoom: 7 };
let mapObj = null;
export const map = {
  render() {
    const ds = drivers();
    return `<div class="vhead"><h1>${esc(t('v_map'))}</h1><span class="muted small">${esc(t('map_hint'))}</span></div>
      <div class="mapwrap"><div id="map" role="region" aria-label="${esc(t('v_map'))}"></div>
      <div style="display:flex;flex-direction:column;gap:10px">${ds.map((d) => {
        const [st, label] = driverState(d);
        const fresh = d.loc_at && Date.now() - new Date(d.loc_at) < 30 * 60e3;
        return `<div class="pcard" data-focus="${esc(d.id)}" style="cursor:pointer"><div class="top">${avatar(d)}<div class="grow"><b>${esc(d.name)}</b><div class="small ${st === 'free' ? 'goodc' : st === 'off' ? 'badc' : 'warnc'}">${esc(label)}</div></div><span class="dot" style="background:${driverColor(d.id)}"></span></div>
          <div class="small muted">${d.loc_at ? `📍 ${esc(timeAgo(d.loc_at))} · ${esc(d.loc_src === 'telegram-live' ? 'Telegram live' : d.loc_src === 'telegram' ? 'Telegram' : t('app'))} ${fresh ? '' : '· ' + esc(t('stale'))}` : esc(t('no_location'))}</div>
          <div class="row">${d.phone ? `<span class="mono small">${esc(d.phone)}</span>` : ''}${d.loc_lat ? `<a class="btn sm" href="${gmapsLL(d.loc_lat, d.loc_lng)}" target="_blank" rel="noopener">Google Maps</a>` : ''}</div></div>`;
      }).join('') || `<div class="notice">${esc(t('no_drivers_yet'))}</div>`}</div></div>`;
  },
  bind(root) {
    const init = () => {
      if (!window.L) { setTimeout(init, 150); return; }
      const el = root.querySelector('#map'); if (!el) return;
      if (mapObj) { try { mapObj.remove(); } catch {} }
      mapObj = L.map(el, { zoomControl: true }).setView(mapView.center, mapView.zoom);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapObj);
      mapObj.on('moveend', () => { mapView = { center: mapObj.getCenter(), zoom: mapObj.getZoom() }; });
      const markers = {};
      for (const d of drivers().filter((x) => x.loc_lat && x.loc_lng)) {
        const stale = !d.loc_at || Date.now() - new Date(d.loc_at) > 30 * 60e3;
        const inner = d.photo_path ? `<img data-photo="${esc(d.photo_path)}" alt="">` : esc((d.name || '?').slice(0, 1).toUpperCase());
        const icon = L.divIcon({ className: '', html: `<div class="pin ${stale ? 'stale' : ''}" style="border-color:${driverColor(d.id)}">${inner}</div>`, iconSize: [42, 42], iconAnchor: [21, 21] });
        markers[d.id] = L.marker([d.loc_lat, d.loc_lng], { icon }).addTo(mapObj)
          .bindPopup(`<b>${esc(d.name)}</b><br>${esc(driverState(d)[1])}<br>${esc(timeAgo(d.loc_at))}${d.phone ? '<br>' + esc(d.phone) : ''}`);
      }
      hydratePhotos(el);
      root.addEventListener('click', (e) => {
        const c = e.target.closest('[data-focus]');
        if (!c || e.target.closest('a')) return;
        const m = markers[c.dataset.focus];
        if (m) { mapObj.setView(m.getLatLng(), 13); m.openPopup(); } else toast(t('no_location'));
      });
    };
    init();
  },
};

// =====================================================================
// Drivers & staff
// =====================================================================
export function tgLink(p) { return `https://t.me/${BOT_USERNAME}?start=${p.tg_code}`; }


const driversViewImpl = {
  render() {
    const all = list('profiles');
    const pending = all.filter((p) => p.role === 'pending');
    const ds = drivers();
    const staff = all.filter((p) => p.role === 'owner' || p.role === 'dispatcher');
    const blocked = all.filter((p) => p.role === 'blocked');
    const today = todayStr();
    const offReq = list('days_off').filter((d) => !d.approved && d.date_to >= today);
    const offAll = list('days_off').filter((d) => d.approved && d.date_to >= today).sort((a, b) => a.date_from.localeCompare(b.date_from));
    let h = `<div class="vhead"><h1>${esc(t('v_drivers'))}</h1><span class="muted">${ds.length}</span><div class="grow"></div><button class="btn" data-invite>🔗 ${esc(t('invite_link'))}</button><button class="btn" data-dayoff>＋ ${esc(t('day_off'))}</button></div>`;
    if (pending.length) {
      h += `<div class="panel" style="margin-bottom:16px;border-color:var(--accent)"><h2>${esc(t('new_signups'))}</h2>${pending.map((p) => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)">${avatar(p)}<div class="grow"><b>${esc(p.name)}</b><div class="small muted">${esc(p.phone)} · ${esc(p.email)}</div></div>
        <button class="btn good sm" data-approve="${esc(p.id)}" data-role="driver">${esc(t('approve_driver'))}</button><button class="btn sm" data-approve="${esc(p.id)}" data-role="dispatcher">${esc(t('approve_dispatcher'))}</button><button class="btn sm danger" data-approve="${esc(p.id)}" data-role="blocked">${esc(t('reject'))}</button></div>`).join('')}</div>`;
    }
    if (offReq.length) {
      h += `<div class="panel" style="margin-bottom:16px"><h2>${esc(t('dayoff_requests'))}</h2>${offReq.map((d) => `<div class="row" style="padding:6px 0"><b>${esc(pname(d.driver_id))}</b><span class="mono">${esc(d.date_from)} → ${esc(d.date_to)}</span><span class="muted grow">${esc(d.reason)}</span><button class="btn good sm" data-offok="${esc(d.id)}">${esc(t('approve'))}</button><button class="btn sm danger" data-offno="${esc(d.id)}">${esc(t('reject'))}</button></div>`).join('')}</div>`;
    }
    h += `<div class="cards">${ds.map((d) => {
      const [st, label] = driverState(d);
      const v = get('vehicles', d.vehicle_id);
      const lic = daysUntil(d.license_until, today);
      return `<article class="pcard" data-person="${esc(d.id)}" style="cursor:pointer">
        <div class="top">${avatar(d, 'lg')}<div class="grow" style="min-width:0"><b>${esc(d.name)}</b><div class="small ${st === 'free' ? 'goodc' : st === 'off' ? 'badc' : 'warnc'}">${esc(label)}</div><div class="mono small">${esc(d.phone)}</div></div><span class="dot" style="background:${driverColor(d.id)}"></span></div>
        <dl class="kv small">
          <dt>${esc(t('vehicle'))}</dt><dd>${v ? plate(v.plate) + ' ' + esc(v.model) : '—'}</dd>
          <dt>${esc(t('languages'))}</dt><dd>${esc(d.languages || '—')}</dd>
          <dt>${esc(t('license_until'))}</dt><dd class="${lic !== null && lic < 0 ? 'badc' : lic !== null && lic < 30 ? 'warnc' : ''}">${esc(d.license_until || '—')}</dd>
          <dt>${esc(t('legal'))}</dt><dd>${esc(t('lt_' + d.legal_type))}${d.legal_name ? ' · ' + esc(d.legal_name) : ''}${d.legal_id ? ' · ' + esc(d.legal_id) : ''}</dd>
          <dt>IBAN</dt><dd class="mono">${esc(d.iban || '—')}</dd>
          <dt>${esc(t('pay_rules'))}</dt><dd>${esc(payRuleText(d))}</dd>
          <dt>Telegram</dt><dd>${d.tg_chat_id ? `<span class="goodc">✓ ${esc(t('connected'))}</span>` : `<span class="warnc">${esc(t('not_connected'))}</span>`}</dd>
          <dt>📍</dt><dd>${d.loc_at ? esc(timeAgo(d.loc_at)) : '—'}</dd>
        </dl></article>`;
    }).join('') || `<div class="notice">${esc(t('no_drivers_yet'))}</div>`}</div>`;
    if (offAll.length) h += `<h2 style="margin-top:22px">${esc(t('days_off'))}</h2><div class="tbl"><table style="min-width:0"><tbody>${offAll.map((d) => `<tr><td>${esc(pname(d.driver_id))}</td><td class="mono">${esc(d.date_from)} → ${esc(d.date_to)}</td><td class="muted">${esc(d.reason)}</td><td class="num"><button class="btn sm danger" data-offno="${esc(d.id)}">${esc(t('delete'))}</button></td></tr>`).join('')}</tbody></table></div>`;
    h += `<h2 style="margin-top:22px">${esc(t('staff'))}</h2><div class="tbl"><table style="min-width:0"><tbody>${[...staff, ...blocked].map((p) => `<tr class="click" data-person="${esc(p.id)}"><td>${avatar(p)}</td><td><b>${esc(p.name)}</b><br><span class="muted small">${esc(p.email)}</span></td><td>${esc(t('role_' + p.role))}</td><td>${p.tg_chat_id ? '✓ Telegram' : ''}</td></tr>`).join('')}</tbody></table></div>`;
    return h;
  },
  bind(root) {
    root.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-approve]');
      if (a) { try { await save('profiles', { id: a.dataset.approve, role: a.dataset.role }); toast(t('saved')); } catch (er) { toast(errText(er)); } return; }
      const ok = e.target.closest('[data-offok]');
      if (ok) { try { await save('days_off', { id: ok.dataset.offok, approved: true }); } catch (er) { toast(errText(er)); } return; }
      const no = e.target.closest('[data-offno]');
      if (no) { try { await remove('days_off', no.dataset.offno); } catch (er) { toast(errText(er)); } return; }
      if (e.target.closest('[data-invite]')) { copy(`${t('invite_text')}\n${location.origin}`); return; }
      if (e.target.closest('[data-dayoff]')) return openDayOff();
      const p = e.target.closest('[data-person]');
      if (p) openPerson(p.dataset.person);
    });
  },
};

export { driversViewImpl as drivers };

function payRuleText(d) {
  const parts = [];
  if (Number(d.pay_monthly)) parts.push(`${money(d.pay_monthly)}/${t('month_short')}`);
  if (Number(d.pay_trip)) parts.push(`${money(d.pay_trip)}/${t('trip_short')}`);
  if (Number(d.pay_percent)) parts.push(`${d.pay_percent}%`);
  if (Number(d.pay_day)) parts.push(`${money(d.pay_day)}/${t('day_short')}`);
  if (Number(d.per_diem)) parts.push(`+${money(d.per_diem)} ${t('per_diem')}`);
  return parts.join(' · ') || t('pay_manual');
}

export function openPerson(id) {
  const p = get('profiles', id);
  const isOwner = S.me.role === 'owner';
  const roleOpts = p.role === 'owner' ? [['owner', t('role_owner')]] : [['driver', t('role_driver')], ['dispatcher', t('role_dispatcher')], ['pending', t('role_pending')], ['blocked', t('role_blocked')]];
  const fields = [
    { k: 'photo_path', type: 'photo', label: 'photo', kind: 'avatars' },
    { k: 'name', label: 'full_name' }, { k: 'phone', type: 'tel' },
    { k: 'role', type: 'select', options: roleOpts },
    { k: 'duty', type: 'select', options: [['on', t('duty_on')], ['off', t('duty_off')]] },
    { k: 'vehicle_id', label: 'default_vehicle', type: 'select', options: vehicleSelectOpts() },
    { k: 'languages' }, { k: 'license_until', type: 'date' }, { k: 'color', type: 'color' },
    { sec: 'sec_legal' },
    { k: 'legal_type', type: 'select', options: [['individual', t('lt_individual')], ['ie', t('lt_ie')], ['llc', t('lt_llc')]] },
    { k: 'legal_name' }, { k: 'legal_id' }, { k: 'iban', label: 'IBAN' }, { k: 'bank' },
    { sec: 'sec_pay' },
    { k: 'pay_trip', type: 'number' }, { k: 'pay_percent', type: 'number' }, { k: 'pay_day', type: 'number' }, { k: 'per_diem', type: 'number' }, { k: 'pay_monthly', type: 'number' },
    { sec: 'sec_extra' }, { k: 'notes', type: 'textarea', wide: true },
  ];
  const data = { ...p, color: p.color || driverColor(p.id) };
  modal({
    title: p.name || p.email,
    body: `<p class="small muted" style="margin:0 0 12px">${esc(p.email)} · ${esc(t('pay_hint'))}</p>
      ${p.role === 'driver' || p.role === 'dispatcher' || p.role === 'owner' ? `<div class="notice small">Telegram: ${p.tg_chat_id ? `<b class="goodc">✓ ${esc(t('connected'))}</b>` : `<b class="warnc">${esc(t('not_connected'))}</b>`} · <button class="btn sm" data-tglink>${esc(t('copy_tg_link'))}</button></div>` : ''}
      ${formHtml(fields, data)}`,
    footer: `${isOwner && p.role !== 'owner' ? `<button class="btn danger" data-del>${esc(t('delete'))}</button>` : ''}<span class="grow"></span><button class="btn" data-close>${esc(t('cancel'))}</button><button class="btn primary" data-save>${esc(t('save'))}</button>`,
    onMount(el, close) {
      bindPhotoPreviews(el);
      el.querySelector('[data-tglink]')?.addEventListener('click', () => copy(tgLink(p)));
      const del = el.querySelector('[data-del]');
      if (del) armDelete(del, async () => { await remove('profiles', p.id); toast(t('deleted')); close(); });
      el.querySelector('[data-save]').addEventListener('click', async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try { const v = await readForm(el, fields); v.vehicle_id = v.vehicle_id || null; await save('profiles', { ...v, id: p.id }); toast(t('saved')); close(); }
        catch (er) { toast(errText(er)); b.disabled = false; }
      });
    },
  });
}

function openDayOff() {
  const fields = [
    { k: 'driver_id', label: 'driver', type: 'select', options: drivers().map((d) => [d.id, d.name]) },
    { k: 'date_from', type: 'date' }, { k: 'date_to', type: 'date' }, { k: 'reason', wide: true },
  ];
  modal({
    title: t('day_off'), narrow: true, body: formHtml(fields, { date_from: todayStr(), date_to: todayStr() }),
    footer: `<span class="grow"></span><button class="btn primary" data-save>${esc(t('save'))}</button>`,
    onMount(el, close) {
      el.querySelector('[data-save]').addEventListener('click', async () => {
        const v = await readForm(el, fields);
        if (!v.driver_id || !v.date_from) return;
        if (!v.date_to || v.date_to < v.date_from) v.date_to = v.date_from;
        try { await save('days_off', { ...v, approved: true }); toast(t('saved')); close(); } catch (er) { toast(errText(er)); }
      });
    },
  });
}

// =====================================================================
// Payroll
// =====================================================================
let payMonth = todayStr().slice(0, 7);
function payData() {
  return payroll(payMonth, { profiles: list('profiles'), orders: list('orders'), tours: list('tours'), tourDays: list('tour_days'), fuel: list('fuel'), expenses: list('expenses'), advances: list('advances'), settings: S.settings });
}
export const payrollView = {
  render() {
    const rows = payData();
    const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
    let h = `<div class="vhead"><h1>${esc(t('v_payroll'))}</h1><div class="grow"></div><input type="month" id="payMonth" value="${esc(payMonth)}"><button class="btn" data-csv>CSV</button></div>
      <div class="kpis"><div class="kpi"><small>${esc(t('earned'))}</small><b>${money(sum('earned'))}</b></div><div class="kpi"><small>${esc(t('reimburse'))}</small><b>${money(sum('reimburse'))}</b></div><div class="kpi"><small>${esc(t('to_pay'))}</small><b>${money(sum('total'))}</b></div><div class="kpi"><small>${esc(t('balance'))}</small><b class="${sum('balance') > 0 ? 'warnc' : 'goodc'}">${money(sum('balance'))}</b></div></div>
      <div class="tbl"><table><thead><tr><th>${esc(t('driver'))}</th><th class="num">${esc(t('fixed'))}</th><th class="num">${esc(t('transfers'))}</th><th class="num">${esc(t('tour_days'))}</th><th class="num">${esc(t('per_diem'))}</th><th class="num">${esc(t('reimburse'))}</th><th class="num">${esc(t('deduct'))}</th><th class="num">${esc(t('advances'))}</th><th class="num">${esc(t('to_pay'))}</th><th class="num">${esc(t('paid_out'))}</th><th class="num">${esc(t('balance'))}</th></tr></thead><tbody>`;
    for (const r of rows) {
      h += `<tr class="click" data-pay="${esc(r.driver.id)}"><td><b>${esc(r.driver.name)}</b><br><span class="muted small mono">${esc(r.driver.iban || '')}</span></td>
        <td class="num">${money(r.fixed)}</td><td class="num">${r.tripsN} · ${money(r.trips)}</td><td class="num">${r.daysN} · ${money(r.days)}</td><td class="num">${money(r.perDiem)}</td>
        <td class="num">${money(r.reimburse)}</td><td class="num">${r.deduct ? '−' + money(r.deduct) : '—'}</td><td class="num">${r.advance ? '−' + money(r.advance) : '—'}</td>
        <td class="num"><b>${money(r.total)}</b></td><td class="num">${money(r.paidOut)}</td><td class="num ${r.balance > 0.009 ? 'warnc' : 'goodc'}"><b>${money(r.balance)}</b></td></tr>`;
    }
    if (!rows.length) h += `<tr><td colspan="11" class="empty">${esc(t('no_drivers_yet'))}</td></tr>`;
    return h + `</tbody></table></div><p class="muted small">${esc(t('payroll_hint'))}</p>`;
  },
  bind(root) {
    root.addEventListener('change', (e) => { if (e.target.id === 'payMonth') { payMonth = e.target.value || payMonth; window.gzaGo('payroll'); } });
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-csv]')) {
        const rows = payData();
        return downloadCSV(`payroll-${payMonth}.csv`, [['driver', 'legal', 'legal_id', 'iban', 'fixed', 'transfers', 'transfer_pay', 'tour_days', 'day_pay', 'per_diem', 'bonus', 'reimburse', 'deduct', 'advances', 'to_pay', 'paid_out', 'balance'],
          ...rows.map((r) => [r.driver.name, r.driver.legal_name, r.driver.legal_id, r.driver.iban, round2(r.fixed), r.tripsN, round2(r.trips), r.daysN, round2(r.days), round2(r.perDiem), round2(r.bonus), round2(r.reimburse), round2(r.deduct), round2(r.advance), round2(r.total), round2(r.paidOut), round2(r.balance)])]);
      }
      const p = e.target.closest('[data-pay]'); if (p) openPayDetail(p.dataset.pay);
    });
  },
};
export { payrollView as payroll };

function openPayDetail(driverId) {
  const r = payData().find((x) => x.driver.id === driverId);
  if (!r) return;
  const d = r.driver;
  const inM = (s) => (s || '').slice(0, 7) === payMonth;
  const trips = list('orders').filter((o) => o.driver_id === d.id && o.status === 'done' && inM(o.date)).sort((a, b) => a.date.localeCompare(b.date));
  const days = list('tour_days').filter((x) => x.driver_id === d.id && inM(x.date)).sort((a, b) => a.date.localeCompare(b.date));
  const adv = list('advances').filter((x) => x.driver_id === d.id && inM(x.at));
  const exp = [...list('fuel').map((x) => ({ ...x, _k: 'fuel', amount: x.total })), ...list('expenses').map((x) => ({ ...x, _k: x.category }))]
    .filter((x) => x.driver_id === d.id && inM(x.at) && (x.paid_by === 'driver' || x.deduct));
  const fields = [{ k: 'kind', type: 'select', options: [['advance', t('adv_advance')], ['payout', t('adv_payout')], ['bonus', t('adv_bonus')]] }, { k: 'amount', type: 'number' }, { k: 'currency', type: 'select', options: opt(CURS) }, { k: 'at', label: 'date', type: 'date' }, { k: 'note', wide: true }];
  modal({
    title: `${d.name} · ${payMonth}`,
    body: `<div class="kpis"><div class="kpi"><small>${esc(t('to_pay'))}</small><b>${money(r.total)}</b></div><div class="kpi"><small>${esc(t('paid_out'))}</small><b>${money(r.paidOut)}</b></div><div class="kpi"><small>${esc(t('balance'))}</small><b class="${r.balance > 0 ? 'warnc' : 'goodc'}">${money(r.balance)}</b></div></div>
      <p class="small muted">${esc(t('legal'))}: ${esc(t('lt_' + d.legal_type))} ${esc(d.legal_name)} ${esc(d.legal_id)} · IBAN <span class="mono">${esc(d.iban || '—')}</span> ${esc(d.bank)}</p>
      <h3>${esc(t('transfers'))} (${trips.length})</h3><div class="tbl" style="margin-bottom:12px"><table style="min-width:0"><tbody>${trips.map((o) => `<tr><td class="mono">${esc(o.date)} ${esc(o.time)}</td><td>${esc(o.pickup)} → ${esc(o.dropoff)}</td><td class="num">${money(o.driver_pay)}</td></tr>`).join('') || '<tr><td class="empty">—</td></tr>'}</tbody></table></div>
      <h3>${esc(t('tour_days'))} (${days.length})</h3><div class="tbl" style="margin-bottom:12px"><table style="min-width:0"><tbody>${days.map((x) => `<tr><td class="mono">${esc(x.date)}</td><td>${esc(get('tours', x.tour_id)?.name || '')}</td><td class="num">${money(x.driver_pay)} + ${money(x.per_diem)}</td></tr>`).join('') || '<tr><td class="empty">—</td></tr>'}</tbody></table></div>
      <h3>${esc(t('reimburse'))} / ${esc(t('deduct'))}</h3><div class="tbl" style="margin-bottom:12px"><table style="min-width:0"><tbody>${exp.map((x) => `<tr><td class="mono">${esc(x.at.slice(0, 10))}</td><td>${esc(t('cat_' + x._k))} ${esc(x.station || x.place || '')}</td><td>${x.deduct ? `<span class="badc">${esc(t('deduct'))}</span>` : x.reimbursed ? `<span class="goodc">${esc(t('reimbursed'))}</span>` : ''}</td><td class="num">${money(x.amount, x.currency)}</td></tr>`).join('') || '<tr><td class="empty">—</td></tr>'}</tbody></table></div>
      <h3>${esc(t('advances'))} / ${esc(t('adv_payout'))}</h3><div class="tbl" style="margin-bottom:12px"><table style="min-width:0"><tbody>${adv.map((x) => `<tr><td class="mono">${esc(x.at)}</td><td>${esc(t('adv_' + x.kind))}</td><td class="muted">${esc(x.note)}</td><td class="num">${money(x.amount, x.currency)}</td><td class="num"><button class="btn sm danger" data-advdel="${esc(x.id)}">✕</button></td></tr>`).join('') || '<tr><td class="empty">—</td></tr>'}</tbody></table></div>
      <div class="panel"><h3>${esc(t('add_payment'))}</h3>${formHtml(fields, { kind: r.balance > 0 ? 'payout' : 'advance', amount: r.balance > 0 ? round2(r.balance) : '', currency: 'GEL', at: todayStr() })}<div class="row" style="margin-top:10px"><button class="btn primary" data-addadv>${esc(t('save'))}</button></div></div>`,
    onMount(el, close) {
      el.addEventListener('click', async (e) => {
        const del = e.target.closest('[data-advdel]');
        if (del) { try { await remove('advances', del.dataset.advdel); close(); openPayDetail(driverId); } catch (er) { toast(errText(er)); } }
        if (e.target.closest('[data-addadv]')) {
          const v = await readForm(el, fields);
          if (!num(v.amount)) return;
          try { await save('advances', { ...v, driver_id: d.id }); toast(t('saved')); close(); openPayDetail(driverId); } catch (er) { toast(errText(er)); }
        }
      });
    },
  });
}
