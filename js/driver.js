// Driver app: my jobs (accept/decline, statuses, navigation), quick records, history and pay, profile
import { t } from './i18n.js';
import { S, list, get, save, remove, rpc, refreshJobs, api, sb } from './store.js';
import {
  esc, toast, errText, modal, formHtml, readForm, bindPhotoPreviews, todayStr, addDays, fmtDate, fmtDT, money, plate, avatar,
  gmapsDir, waze, linesOf, semis, copy, statusPill, tourPill, accBadge, icons, thumbs, gel, num, daysBetween,
} from './ui.js';
import { FLOW } from './common.js';
import { openFuelForm, openExpenseForm, openOdometerForm, openInspectionForm } from './views/cars.js';
import { BOT_USERNAME } from './config.js';
import { round2 } from './calc.js';

const tel = (p) => (p ? `<span class="mono">${esc(p)}</span> <button class="btn sm" data-copy="${esc(p)}">${esc(t('copy'))}</button>` : '');

async function respond(kind, id, accept) {
  try {
    await rpc('driver_respond', { p_kind: kind, p_id: id, p_accept: accept });
    api('notify', { event: 'response', kind, id, accept }).catch(() => {});
    toast(accept ? t('acc_accepted') : t('acc_declined'));
    await refreshJobs();
  } catch (e) { toast(errText(e)); }
}

function orderJob(o, current) {
  const st = o.status;
  const next = FLOW[st === 'new' ? 'assigned' : st];
  const stops = linesOf(o.stops);
  const before = ['new', 'assigned', 'en_route', 'arrived'].includes(st);
  const target = before ? o.pickup : o.dropoff;
  const v = get('vehicles', o.vehicle_id);
  const ask = o.accept === 'pending' || o.accept === 'none';
  return `<article class="job ${ask ? 'req' : current ? 'current' : ''}">
    <div class="when"><span class="time">${esc(o.time)}</span><span>${esc(o.date === todayStr() ? t('today') : fmtDate(o.date))}</span><span style="margin-left:auto" class="row">${accBadge(o.accept)}${statusPill(st)}</span></div>
    <div class="type">${esc(t('t_' + o.type))}</div>
    <div class="stopline"><span class="p"></span><div><div class="lbl">${esc(t('pickup'))}</div>${esc(o.pickup)}</div>${stops.map((s) => `<span class="p"></span><div>${esc(s)}</div>`).join('')}<span class="p end"></span><div><div class="lbl">${esc(t('dropoff'))}</div>${esc(o.dropoff)}</div></div>
    <dl class="kv">
      ${o.passenger_name || o.passenger_phone ? `<dt>${esc(t('passenger'))}</dt><dd>${esc(o.passenger_name)} ${tel(o.passenger_phone)}</dd>` : ''}
      ${o.contact_name || o.contact_phone || o.contact_org ? `<dt>${esc(t('contact_person'))}</dt><dd>${esc([o.contact_org, o.contact_name].filter(Boolean).join(', '))} ${tel(o.contact_phone)}</dd>` : ''}
      ${o.flight ? `<dt>${esc(t('flight'))}</dt><dd class="mono">${esc(o.flight)} <a href="https://www.google.com/search?q=${encodeURIComponent(o.flight + ' flight status')}" target="_blank" rel="noopener">${esc(t('status'))}</a></dd>` : ''}
      ${o.sign ? `<dt>${esc(t('sign'))}</dt><dd><b>${esc(o.sign)}</b></dd>` : ''}
      <dt>${esc(t('pax'))}</dt><dd>${esc(o.pax)}${o.luggage ? ` · ${esc(t('luggage'))} ${esc(o.luggage)}` : ''}${o.child_seats ? ` · ${esc(t('child_seats'))} ${esc(o.child_seats)}` : ''}${o.wheelchair ? ' · ♿' : ''}</dd>
      ${v ? `<dt>${esc(t('vehicle'))}</dt><dd>${plate(v.plate)} ${esc(v.model)}</dd>` : ''}
      ${o.notes ? `<dt>${esc(t('notes'))}</dt><dd>${esc(o.notes)}</dd>` : ''}
      ${o.special ? `<dt>⚠</dt><dd class="warnc">${esc(o.special)}</dd>` : ''}
      ${o.collect ? `<dt>💵 ${esc(t('collect_cash'))}</dt><dd class="mono"><b>${money(o.collect, o.currency)}</b></dd>` : ''}
      ${Number(o.driver_pay) ? `<dt>${esc(t('my_pay'))}</dt><dd class="mono">${money(o.driver_pay)}</dd>` : ''}
    </dl>
    ${ask ? `<div class="navs"><button class="btn big good" data-accept="order:${esc(o.id)}">✓ ${esc(t('accept'))}</button><button class="btn big danger" data-decline="order:${esc(o.id)}">✕ ${esc(t('decline'))}</button></div>` : `
    <div class="lbl">${esc(before ? t('nav_pickup') : t('nav_dropoff'))}</div>
    <div class="navs"><a class="btn big dark" href="${esc(gmapsDir(target, '', before ? [] : []))}" target="_blank" rel="noopener">Google Maps</a><a class="btn big" href="${esc(waze(target))}" target="_blank" rel="noopener">Waze</a></div>
    ${!before && stops.length ? `<a class="btn" href="${esc(gmapsDir(o.dropoff, o.pickup, stops))}" target="_blank" rel="noopener">${esc(t('full_route'))}</a>` : ''}
    ${next ? `<button class="btn big primary" data-status="${esc(o.id)}" data-to="${next}">${esc(t('next_' + next))}</button>` : ''}`}
  </article>`;
}

function tourJob(x, today) {
  const mine = x.days.filter((d) => d.mine);
  const td = x.days.find((d) => d.date === today && d.mine);
  const ask = mine.some((d) => d.accept === 'pending' || d.accept === 'none');
  const n = daysBetween(x.date_from, x.date_to) + 1;
  const stops = td ? semis(td.stops) : [];
  const v = get('vehicles', (td || mine[0] || {}).vehicle_id);
  const pay = mine.reduce((s, d) => s + num(d.driver_pay) + num(d.per_diem), 0);
  return `<article class="job ${ask ? 'req' : td ? 'current' : ''}">
    <div class="when"><span class="type">${esc(t('t_tour'))}${td ? ` · ${esc(t('day'))} ${daysBetween(x.date_from, today) + 1}/${n}` : ''}</span><span style="margin-left:auto" class="row">${accBadge((mine[0] || {}).accept)}${tourPill(x.status)}</span></div>
    <div style="font-size:17px;font-weight:600">${esc(x.name)}</div>
    <div class="muted mono">${esc(x.date_from)} → ${esc(x.date_to)}${x.start_time ? ' · ' + esc(x.start_time) : ''} · ${mine.length}/${n} ${esc(t('days_short'))}</div>
    <dl class="kv">
      <dt>${esc(t('client'))}</dt><dd>${esc(x.client_name)} · ${esc(x.group_size)} ${esc(t('pax_short'))}</dd>
      ${x.guide ? `<dt>${esc(t('guide'))}</dt><dd>${esc(x.guide)} ${tel(x.guide_phone)}</dd>` : ''}
      ${x.contact_name || x.contact_phone ? `<dt>${esc(t('contact_person'))}</dt><dd>${esc([x.contact_org, x.contact_name].filter(Boolean).join(', '))} ${tel(x.contact_phone)}</dd>` : ''}
      ${v ? `<dt>${esc(t('vehicle'))}</dt><dd>${plate(v.plate)} ${esc(v.model)}</dd>` : ''}
      ${x.notes ? `<dt>${esc(t('notes'))}</dt><dd>${esc(x.notes)}</dd>` : ''}
      ${pay ? `<dt>${esc(t('my_pay'))}</dt><dd class="mono">${money(pay)}</dd>` : ''}
    </dl>
    ${td && (td.from_place || td.to_place) ? `<div class="lbl">${esc(t('today_route'))}</div>
      <div class="stopline"><span class="p"></span><div>${esc(td.from_place)}</div>${stops.map((s) => `<span class="p"></span><div>${esc(s)}</div>`).join('')}<span class="p end"></span><div>${esc(td.to_place)}</div></div>
      ${td.hotel ? `<div>🛏 ${esc(td.hotel)}</div>` : ''}${td.note ? `<div class="muted">${esc(td.note)}</div>` : ''}
      ${td.to_place && !ask ? `<div class="navs"><a class="btn big dark" href="${esc(gmapsDir(td.to_place, td.from_place, stops))}" target="_blank" rel="noopener">Google Maps</a><a class="btn big" href="${esc(waze(td.to_place))}" target="_blank" rel="noopener">Waze</a></div>` : ''}` : ''}
    <details><summary>${esc(t('all_days'))} (${n})</summary><div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
      ${x.days.map((d, i) => `<div class="small" style="${d.mine ? '' : 'opacity:.55'}"><b>${esc(t('day'))} ${i + 1}</b> <span class="mono muted">${esc(d.date)}</span>${d.mine ? '' : ' · ' + esc(t('other_driver'))}<br>${esc(d.from_place)} → ${esc(d.to_place)}${d.hotel ? ' · 🛏 ' + esc(d.hotel) : ''}${d.mine && d.to_place ? ` · <a href="${esc(gmapsDir(d.to_place, d.from_place, semis(d.stops)))}" target="_blank" rel="noopener">Google Maps</a>` : ''}</div>`).join('')}
    </div></details>
    ${ask ? `<div class="navs"><button class="btn big good" data-accept="tour:${esc(x.id)}">✓ ${esc(t('accept'))}</button><button class="btn big danger" data-decline="tour:${esc(x.id)}">✕ ${esc(t('decline'))}</button></div>`
      : x.status === 'ongoing' && today >= x.date_to ? `<button class="btn big primary" data-tourstat="${esc(x.id)}" data-to="done">${esc(t('end_tour'))}</button>`
      : x.status === 'confirmed' && today >= x.date_from ? `<button class="btn big primary" data-tourstat="${esc(x.id)}" data-to="ongoing">${esc(t('start_tour'))}</button>` : ''}
  </article>`;
}

export const jobs = {
  render() {
    const today = todayStr();
    const me = S.me;
    const os = (S.jobs.orders || []).filter((o) => o.date >= today && o.status !== 'done' && o.status !== 'cancelled');
    const ts = (S.jobs.tours || []).filter((x) => x.date_to >= today && x.status !== 'done');
    let h = `<div class="row"><h1 class="grow">${esc(t('d_jobs'))}</h1><div class="seg"><button data-duty="on" aria-pressed="${me.duty !== 'off'}">${esc(t('duty_on'))}</button><button data-duty="off" aria-pressed="${me.duty === 'off'}">${esc(t('duty_off'))}</button></div></div>`;
    if (!me.tg_chat_id) h += `<div class="notice warn">${esc(t('tg_driver_hint'))} <a class="btn sm primary" href="https://t.me/${BOT_USERNAME}?start=${esc(me.tg_code)}" target="_blank" rel="noopener">${esc(t('connect_telegram'))}</a></div>`;
    h += `<div class="row"><button class="btn sm" data-q="odo">${icons.odo.replace('<svg', '<svg width="16" height="16"')} ${esc(t('add_odometer'))}</button><button class="btn sm" data-q="insp">📷 ${esc(t('add_inspection'))}</button><button class="btn sm" data-q="fuel">⛽ ${esc(t('add_fuel'))}</button></div>`;
    const todays = ts.filter((x) => x.days.some((d) => d.date === today && d.mine));
    const rest = ts.filter((x) => !todays.includes(x));
    if (!os.length && !ts.length) h += `<div class="notice">${esc(t('no_jobs'))}</div>`;
    let first = true;
    for (const x of todays) { h += tourJob(x, today); first = false; }
    for (const o of os) { h += orderJob(o, first && o.date === today); first = false; }
    if (rest.length) h += `<h2 style="margin-top:8px">${esc(t('upcoming_tours'))}</h2>` + rest.map((x) => tourJob(x, today)).join('');
    return h;
  },
  bind(root) {
    root.addEventListener('click', async (e) => {
      const c = e.target.closest('[data-copy]'); if (c) return copy(c.dataset.copy);
      const a = e.target.closest('[data-accept]'); if (a) { a.disabled = true; const [k, id] = a.dataset.accept.split(':'); return respond(k, id, true); }
      const d = e.target.closest('[data-decline]');
      if (d) { if (!d.dataset.armed) { d.dataset.armed = '1'; d.textContent = t('decline_confirm'); return; } d.disabled = true; const [k, id] = d.dataset.decline.split(':'); return respond(k, id, false); }
      const s = e.target.closest('[data-status]');
      if (s) { s.disabled = true; try { await rpc('driver_order_status', { p_id: s.dataset.status, p_status: s.dataset.to }); await refreshJobs(); } catch (er) { toast(errText(er)); s.disabled = false; } return; }
      const ts = e.target.closest('[data-tourstat]');
      if (ts) { ts.disabled = true; try { await rpc('driver_tour_status', { p_id: ts.dataset.tourstat, p_status: ts.dataset.to }); await refreshJobs(); } catch (er) { toast(errText(er)); ts.disabled = false; } return; }
      const du = e.target.closest('[data-duty]');
      if (du) { try { await save('profiles', { id: S.me.id, duty: du.dataset.duty }); S.me.duty = du.dataset.duty; window.gzaGo('jobs'); } catch (er) { toast(errText(er)); } return; }
      const q = e.target.closest('[data-q]');
      if (q) { ({ odo: () => openOdometerForm(null), insp: () => openInspectionForm(null), fuel: () => openFuelForm(null) })[q.dataset.q](); }
    });
  },
};

export const add = {
  render() {
    return `<h1>${esc(t('d_add'))}</h1>
      <div class="bigadd">
        <button data-a="fuel">${icons.fuel}${esc(t('add_fuel'))}</button>
        <button data-a="parking">${icons.parking}${esc(t('add_parking'))}</button>
        <button data-a="odo">${icons.odo}${esc(t('add_odometer'))}</button>
        <button data-a="insp">${icons.camera}${esc(t('add_inspection'))}</button>
        <button data-a="exp">${icons.receipt}${esc(t('add_expense'))}</button>
        <button data-a="off">${icons.off}${esc(t('request_day_off'))}</button>
      </div>
      <p class="muted small">${esc(t('add_hint'))}</p>`;
  },
  bind(root) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      ({ fuel: () => openFuelForm(null), parking: () => openExpenseForm(null, 'parking'), odo: () => openOdometerForm(null), insp: () => openInspectionForm(null), exp: () => openExpenseForm(null, 'other'), off: openDayOffRequest })[b.dataset.a]();
    });
  },
};

function openDayOffRequest() {
  const fields = [{ k: 'date_from', type: 'date' }, { k: 'date_to', type: 'date' }, { k: 'reason', wide: true }];
  modal({
    title: t('request_day_off'), narrow: true, body: formHtml(fields, { date_from: addDays(todayStr(), 1), date_to: addDays(todayStr(), 1) }),
    footer: `<span class="grow"></span><button class="btn primary" data-save>${esc(t('send'))}</button>`,
    onMount(el, close) {
      el.querySelector('[data-save]').addEventListener('click', async () => {
        const v = await readForm(el, fields);
        if (!v.date_from) return;
        if (!v.date_to || v.date_to < v.date_from) v.date_to = v.date_from;
        try { await save('days_off', { ...v, driver_id: S.me.id }); toast(t('sent')); close(); } catch (er) { toast(errText(er)); }
      });
    },
  });
}

let recMonth = todayStr().slice(0, 7);
export const records = {
  render() {
    const inM = (d) => (d || '').slice(0, 7) === recMonth;
    const os = (S.jobs.orders || []).filter((o) => o.status === 'done' && inM(o.date));
    const days = (S.jobs.tours || []).filter((x) => x.status !== 'cancelled' && x.status !== 'planned').flatMap((x) => x.days.filter((d) => d.mine && inM(d.date)).map((d) => ({ ...d, tour: x.name })));
    const fuel = list('fuel').filter((x) => inM(x.at));
    const exps = list('expenses').filter((x) => inM(x.at));
    const odo = list('odometer').filter((x) => inM(x.at));
    const adv = list('advances').filter((x) => inM(x.at));
    const trips = os.reduce((s, o) => s + num(o.driver_pay), 0);
    const dayPay = days.reduce((s, d) => s + num(d.driver_pay) + num(d.per_diem), 0);
    const reimb = fuel.filter((x) => x.paid_by === 'driver' && !x.reimbursed).reduce((s, x) => s + gel(x.total, x.currency), 0) + exps.filter((x) => x.paid_by === 'driver' && !x.reimbursed && !x.deduct).reduce((s, x) => s + gel(x.amount, x.currency), 0);
    const ded = exps.filter((x) => x.deduct).reduce((s, x) => s + gel(x.amount, x.currency), 0);
    const sumAdv = (k) => adv.filter((x) => x.kind === k).reduce((s, x) => s + gel(x.amount, x.currency), 0);
    const fixed = num(S.me.pay_monthly);
    const total = fixed + trips + dayPay + sumAdv('bonus') + reimb - ded - sumAdv('advance');
    const canDel = (x) => Date.now() - new Date(x.created_at) < 24 * 3600e3;
    const row = (x, table, what, amount) => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><div class="grow"><b>${esc(what)}</b><div class="small muted">${esc(fmtDT(x.at))}</div></div>${thumbs([x.photo_path])}<span class="mono">${amount}</span>${canDel(x) ? `<button class="btn sm danger" data-del="${table}:${esc(x.id)}">✕</button>` : ''}</div>`;
    return `<div class="row"><h1 class="grow">${esc(t('d_records'))}</h1><input type="month" id="recMonth" value="${esc(recMonth)}" style="width:auto"></div>
      <section class="panel"><h2>${esc(t('my_earnings'))}</h2>
        <div class="brow"><span>${esc(t('fixed'))}</span><span class="mono">${money(fixed)}</span></div>
        <div class="brow"><span>${esc(t('transfers'))} · ${os.length}</span><span class="mono">${money(trips)}</span></div>
        <div class="brow"><span>${esc(t('tour_days'))} · ${days.length}</span><span class="mono">${money(dayPay)}</span></div>
        <div class="brow"><span>${esc(t('reimburse'))}</span><span class="mono">${money(reimb)}</span></div>
        ${sumAdv('bonus') ? `<div class="brow"><span>${esc(t('adv_bonus'))}</span><span class="mono">${money(sumAdv('bonus'))}</span></div>` : ''}
        ${ded ? `<div class="brow"><span>${esc(t('deduct'))}</span><span class="mono badc">−${money(ded)}</span></div>` : ''}
        ${sumAdv('advance') ? `<div class="brow"><span>${esc(t('advances'))}</span><span class="mono">−${money(sumAdv('advance'))}</span></div>` : ''}
        <div class="brow" style="border-top:1px solid var(--line);padding-top:8px"><b>${esc(t('to_pay'))}</b><b class="mono">${money(total)}</b></div>
        ${sumAdv('payout') ? `<div class="brow"><span>${esc(t('paid_out'))}</span><span class="mono goodc">${money(sumAdv('payout'))}</span></div>` : ''}
        <p class="small muted" style="margin:6px 0 0">${esc(t('earnings_hint'))}</p></section>
      <section class="panel"><h2>${esc(t('fuel'))} · ${fuel.length}</h2>${fuel.map((x) => row(x, 'fuel', `${x.station} · ${x.liters} L${x.odometer ? ' · ' + x.odometer + ' km' : ''}`, money(x.total, x.currency))).join('') || '<p class="muted">—</p>'}</section>
      <section class="panel"><h2>${esc(t('v_parking'))} / ${esc(t('v_expenses'))} · ${exps.length}</h2>${exps.map((x) => row(x, 'expenses', `${t('cat_' + x.category)}${x.place ? ' · ' + x.place : ''}`, money(x.amount, x.currency))).join('') || '<p class="muted">—</p>'}</section>
      <section class="panel"><h2>${esc(t('odometer'))} · ${odo.length}</h2>${odo.map((x) => row(x, 'odometer', `${get('vehicles', x.vehicle_id)?.plate || ''} · ${x.km} km`, '')).join('') || '<p class="muted">—</p>'}</section>
      <section class="panel"><h2>${esc(t('days_off'))}</h2>${list('days_off').sort((a, b) => b.date_from.localeCompare(a.date_from)).slice(0, 10).map((d) => `<div class="row small" style="padding:4px 0"><span class="mono">${esc(d.date_from)} → ${esc(d.date_to)}</span><span class="grow muted">${esc(d.reason)}</span><span class="${d.approved ? 'goodc' : 'warnc'}">${esc(d.approved ? t('approved') : t('waiting'))}</span></div>`).join('') || '<p class="muted">—</p>'}</section>`;
  },
  bind(root) {
    root.addEventListener('change', (e) => { if (e.target.id === 'recMonth') { recMonth = e.target.value || recMonth; window.gzaGo('records'); } });
    root.addEventListener('click', async (e) => {
      const d = e.target.closest('[data-del]');
      if (d) { if (!d.dataset.armed) { d.dataset.armed = '1'; d.textContent = t('del_confirm'); return; } const [tb, id] = d.dataset.del.split(':'); try { await remove(tb, id); toast(t('deleted')); } catch (er) { toast(errText(er)); } }
    });
  },
};

export const profile = {
  render() {
    const me = S.me;
    const fields = profileFields();
    return `<h1>${esc(t('d_profile'))}</h1>
      <section class="panel"><div class="row">${avatar(me, 'lg')}<div class="grow"><b>${esc(me.name)}</b><div class="small muted">${esc(me.email)}</div></div></div></section>
      <section class="panel"><h2>Telegram</h2>
        ${me.tg_chat_id ? `<p class="goodc"><b>✓ ${esc(t('connected'))}</b></p>` : `<p>${esc(t('tg_driver_hint'))}</p>`}
        <a class="btn ${me.tg_chat_id ? '' : 'primary'}" href="https://t.me/${BOT_USERNAME}?start=${esc(me.tg_code)}" target="_blank" rel="noopener">${esc(me.tg_chat_id ? t('reconnect_telegram') : t('connect_telegram'))}</a>
        <h3 style="margin-top:14px">📍 ${esc(t('live_location'))}</h3><p class="small">${esc(t('live_location_hint'))}</p></section>
      <section class="panel"><h2>${esc(t('my_data'))}</h2>${formHtml(fields, me)}<div class="row" style="margin-top:12px"><button class="btn primary" data-save>${esc(t('save'))}</button></div></section>
      <section class="panel"><h2>${esc(t('install_title'))}</h2><p class="small">${esc(t('install_ios'))}</p><p class="small">${esc(t('install_android'))}</p></section>
      <button class="btn" data-signout>${esc(t('sign_out'))}</button>`;
  },
  bind(root) {
    bindPhotoPreviews(root);
    root.querySelector('[data-save]').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { const v = await readForm(root, profileFields()); const row = await save('profiles', { ...v, id: S.me.id }); S.me = row; toast(t('saved')); window.gzaGo('profile'); }
      catch (er) { toast(errText(er)); b.disabled = false; }
    });
  },
};
function profileFields() {
  return [
    { k: 'photo_path', type: 'photo', label: 'photo', kind: 'avatars', wide: true },
    { k: 'name', label: 'full_name' }, { k: 'phone', type: 'tel' }, { k: 'languages' }, { k: 'license_until', type: 'date' },
    { sec: 'sec_legal' },
    { k: 'legal_type', type: 'select', options: [['individual', t('lt_individual')], ['ie', t('lt_ie')], ['llc', t('lt_llc')]] },
    { k: 'legal_name' }, { k: 'legal_id' }, { k: 'iban', label: 'IBAN' }, { k: 'bank' },
  ];
}
