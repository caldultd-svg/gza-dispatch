// Cars: fleet (mileage, oil, documents), fuel, parking, other expenses. Record forms are shared with the driver app.
import { t } from '../i18n.js';
import { S, list, get, save, remove, isStaff } from '../store.js';
import {
  esc, $$, toast, errText, modal, armDelete, formHtml, readForm, bindPhotoPreviews, todayStr, fmtDT, money, gel, plate, thumbs, num, downloadCSV,
} from '../ui.js';
import { opt, CURS, CLASSES, STATIONS, EXP_CATS, SERVICE_KINDS, drivers, pname, vehicleSelectOpts } from '../common.js';
import { oilStatus, daysUntil, fuelStats, round2 } from '../calc.js';

const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const toIso = (v) => (v ? new Date(v).toISOString() : new Date().toISOString());

// jobs a record can be linked to (staff: recent orders/tours; driver: own jobs)
function jobOptions() {
  const today = todayStr();
  const from = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
  if (isStaff()) {
    const os = list('orders').filter((o) => o.date >= from && o.date <= today && o.status !== 'cancelled').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
    const ts = list('tours').filter((x) => x.date_to >= from && x.date_from <= today && x.status !== 'cancelled');
    return [['', '—'], ...ts.map((x) => ['t:' + x.id, '🚐 ' + x.name]), ...os.map((o) => ['o:' + o.id, `${o.date} ${o.time} ${o.pickup}`])];
  }
  const ts = (S.jobs.tours || []).filter((x) => x.date_to >= from && x.date_from <= today);
  const os = (S.jobs.orders || []).filter((o) => o.date >= from && o.date <= today);
  return [['', '—'], ...ts.map((x) => ['t:' + x.id, '🚐 ' + x.name]), ...os.map((o) => ['o:' + o.id, `${o.date} ${o.time} ${o.pickup}`])];
}
function splitJob(v) { return { order_id: v?.startsWith('o:') ? v.slice(2) : null, tour_id: v?.startsWith('t:') ? v.slice(2) : null }; }
function myVehicleDefault() { return S.me?.vehicle_id || ''; }
function driverField() { return isStaff() ? [{ k: 'driver_id', label: 'driver', type: 'select', options: [['', '—'], ...drivers().map((d) => [d.id, d.name])] }] : []; }
function finishDriver(v) { if (!isStaff()) v.driver_id = S.me.id; else v.driver_id = v.driver_id || null; return v; }

// ---------- record forms ----------
export function openFuelForm(rec) {
  const fields = [
    { k: 'photo_path', type: 'photo', label: 'receipt_photo', kind: 'fuel', wide: true },
    { k: 'vehicle_id', label: 'vehicle', type: 'select', options: vehicleSelectOpts() },
    ...driverField(),
    { k: 'station', type: 'select', options: STATIONS.map((s) => [s, s === 'other' ? t('other') : s]) },
    { k: 'liters', type: 'number' }, { k: 'price_l', type: 'number' }, { k: 'total', type: 'number' }, { k: 'currency', type: 'select', options: opt(CURS) },
    { k: 'odometer', type: 'int' },
    { k: 'paid_by', type: 'select', options: [['driver', t('pb_driver')], ['company', t('pb_company')], ['card', t('pb_card')]] },
    { k: 'job', label: 'link_job', type: 'select', options: jobOptions() },
    { k: 'at', label: 'date_time', type: 'datetime-local' }, { k: 'note', wide: true },
  ];
  const data = rec ? { ...rec, at: rec.at.slice(0, 16), job: rec.order_id ? 'o:' + rec.order_id : rec.tour_id ? 't:' + rec.tour_id : '' } : { vehicle_id: myVehicleDefault(), station: 'Gulf', currency: 'GEL', paid_by: 'driver', at: nowLocal(), driver_id: isStaff() ? '' : S.me.id };
  recordModal(t('add_fuel'), 'fuel', fields, data, rec, (v, el) => {
    if (!v.total && v.liters && v.price_l) v.total = round2(v.liters * v.price_l);
    if (!v.price_l && v.liters && v.total) v.price_l = round2(v.total / v.liters);
    if (!v.liters && !v.total) { toast(t('err_fuel')); return null; }
    return v;
  }, (el) => {
    const L = el.querySelector('#f_liters'), P = el.querySelector('#f_price_l'), T = el.querySelector('#f_total');
    const upd = () => { if (num(L.value) && num(P.value)) T.value = round2(num(L.value) * num(P.value)); };
    L.addEventListener('input', upd); P.addEventListener('input', upd);
  });
}
export function openExpenseForm(rec, category = 'parking') {
  const fields = [
    { k: 'photo_path', type: 'photo', label: 'receipt_photo', kind: 'expenses', wide: true },
    { k: 'category', type: 'select', options: opt(EXP_CATS, 'cat_') },
    { k: 'place', label: category === 'parking' ? 'parking_place' : 'place' },
    { k: 'amount', type: 'number' }, { k: 'currency', type: 'select', options: opt(CURS) },
    { k: 'paid_by', type: 'select', options: [['driver', t('pb_driver')], ['company', t('pb_company')], ['client', t('pb_client')]] },
    { k: 'vehicle_id', label: 'vehicle', type: 'select', options: vehicleSelectOpts() },
    ...driverField(),
    ...(isStaff() ? [{ k: 'deduct', type: 'check', label: 'deduct_from_driver' }] : []),
    { k: 'job', label: 'link_job', type: 'select', options: jobOptions() },
    { k: 'at', label: 'date_time', type: 'datetime-local' }, { k: 'note', wide: true },
  ];
  const data = rec ? { ...rec, at: rec.at.slice(0, 16), job: rec.order_id ? 'o:' + rec.order_id : rec.tour_id ? 't:' + rec.tour_id : '' } : { category, currency: 'GEL', paid_by: 'driver', vehicle_id: myVehicleDefault(), at: nowLocal() };
  recordModal(category === 'parking' ? t('add_parking') : t('add_expense'), 'expenses', fields, data, rec, (v) => { if (!v.amount) { toast(t('err_amount')); return null; } return v; });
}
export function openOdometerForm(rec, vehicleId) {
  const fields = [
    { k: 'photo_path', type: 'photo', label: 'odometer_photo', kind: 'odometer', wide: true },
    { k: 'vehicle_id', label: 'vehicle', type: 'select', options: vehicleSelectOpts().filter((x) => x[0]) },
    { k: 'km', type: 'int', label: 'odometer_km' },
    ...driverField(),
    { k: 'job', label: 'link_job', type: 'select', options: jobOptions() },
    { k: 'at', label: 'date_time', type: 'datetime-local' }, { k: 'note', wide: true },
  ];
  const data = rec ? { ...rec, at: rec.at.slice(0, 16) } : { vehicle_id: vehicleId || myVehicleDefault(), at: nowLocal() };
  recordModal(t('add_odometer'), 'odometer', fields, data, rec, (v) => { if (!v.km || !v.vehicle_id) { toast(t('err_km')); return null; } return v; }, null, t('odometer_hint'));
}
export function openInspectionForm(rec) {
  const fields = [
    { k: 'kind', type: 'select', options: [['start', t('insp_start')], ['end', t('insp_end')], ['other', t('other')]] },
    { k: 'vehicle_id', label: 'vehicle', type: 'select', options: vehicleSelectOpts() },
    ...driverField(),
    { k: 'damage', type: 'check', label: 'damage_found' },
    { k: 'job', label: 'link_job', type: 'select', options: jobOptions() },
    { k: 'note', wide: true },
  ];
  const data = rec ? { ...rec } : { kind: 'start', vehicle_id: myVehicleDefault() };
  const extra = `<div style="margin-top:12px"><span class="lbl">${esc(t('photos'))}</span><div class="photo-in"><input type="file" accept="image/*" capture="environment" multiple id="insp_files"><span class="small muted">${esc(t('insp_hint'))}</span></div><div class="thumbs" id="insp_prev" style="margin-top:8px"></div></div>`;
  modal({
    title: t('add_inspection'),
    body: formHtml(fields, data) + extra,
    footer: `<span class="grow"></span><button class="btn" data-close>${esc(t('cancel'))}</button><button class="btn primary" data-save>${esc(t('save'))}</button>`,
    onMount(el, close) {
      const inp = el.querySelector('#insp_files');
      inp.addEventListener('change', () => { el.querySelector('#insp_prev').innerHTML = [...inp.files].map((f) => `<span class="thumb"><img src="${URL.createObjectURL(f)}" alt=""></span>`).join(''); });
      el.querySelector('[data-save]').addEventListener('click', async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try {
          const v = finishDriver(await readForm(el, fields));
          Object.assign(v, splitJob(v.job)); delete v.job;
          const { uploadPhoto } = await import('../store.js');
          const paths = [];
          for (const f of inp.files) paths.push(await uploadPhoto(f, 'inspections'));
          v.photos = [...(rec?.photos || []), ...paths];
          v.vehicle_id = v.vehicle_id || null;
          await save('inspections', { ...v, id: rec?.id });
          toast(t('saved')); close();
        } catch (er) { toast(errText(er)); b.disabled = false; }
      });
    },
  });
}

function recordModal(title, table, fields, data, rec, validate, onMount, hint) {
  modal({
    title, narrow: true,
    body: (hint ? `<p class="small muted" style="margin:0 0 10px">${esc(hint)}</p>` : '') + formHtml(fields, data),
    footer: `${rec ? `<button class="btn danger" data-del>${esc(t('delete'))}</button>` : ''}<span class="grow"></span><button class="btn" data-close>${esc(t('cancel'))}</button><button class="btn primary" data-save>${esc(t('save'))}</button>`,
    onMount(el, close) {
      bindPhotoPreviews(el);
      onMount?.(el);
      const del = el.querySelector('[data-del]');
      if (del) armDelete(del, async () => { await remove(table, rec.id); toast(t('deleted')); close(); });
      el.querySelector('[data-save]').addEventListener('click', async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try {
          let v = finishDriver(await readForm(el, fields));
          if ('job' in v) { Object.assign(v, splitJob(v.job)); delete v.job; }
          if ('at' in v) v.at = toIso(v.at);
          if ('vehicle_id' in v) v.vehicle_id = v.vehicle_id || null;
          v = validate(v, el);
          if (!v) { b.disabled = false; return; }
          await save(table, { ...v, id: rec?.id });
          toast(t('saved')); close();
        } catch (er) { toast(errText(er)); b.disabled = false; }
      });
    },
  });
}

// ---------- vehicle editor + history ----------
function openVehicle(id) {
  const v = id ? get('vehicles', id) : null;
  const fields = [
    { k: 'photo_path', type: 'photo', label: 'photo', kind: 'vehicles' },
    { k: 'plate' }, { k: 'model' }, { k: 'vclass', type: 'select', options: opt(CLASSES, 'c_') }, { k: 'seats', type: 'int' }, { k: 'year', type: 'int' }, { k: 'color', label: 'car_color' },
    { k: 'insurance_until', type: 'date' }, { k: 'inspection_until', type: 'date' }, { k: 'owner', label: 'owner_partner' },
    { sec: 'sec_mileage' },
    { k: 'odometer', type: 'int', label: 'odometer_km' }, { k: 'oil_km', type: 'int' }, { k: 'oil_date', type: 'date' }, { k: 'oil_interval', type: 'int' },
    { k: 'active', type: 'check' }, { k: 'notes', type: 'textarea', wide: true },
  ];
  modal({
    title: v ? v.plate : t('add_vehicle'), narrow: true,
    body: formHtml(fields, v || { vclass: 'sedan', seats: 4, oil_interval: 10000, active: true }),
    footer: `${v ? `<button class="btn danger" data-del>${esc(t('delete'))}</button>` : ''}<span class="grow"></span><button class="btn" data-close>${esc(t('cancel'))}</button><button class="btn primary" data-save>${esc(t('save'))}</button>`,
    onMount(el, close) {
      bindPhotoPreviews(el);
      const del = el.querySelector('[data-del]');
      if (del) armDelete(del, async () => { await remove('vehicles', v.id); toast(t('deleted')); close(); });
      el.querySelector('[data-save]').addEventListener('click', async (e) => {
        const b = e.currentTarget;
        const x = await readForm(el, fields);
        if (!x.plate) { toast(t('err_plate')); return; }
        x.plate = x.plate.toUpperCase(); x.odometer = x.odometer || 0; x.oil_interval = x.oil_interval || 10000; x.seats = x.seats || 4;
        b.disabled = true;
        try { await save('vehicles', { ...x, id: v?.id }); toast(t('saved')); close(); } catch (er) { toast(errText(er)); b.disabled = false; }
      });
    },
  });
}
function openService(vehicleId) {
  const v = get('vehicles', vehicleId);
  const fields = [{ k: 'kind', type: 'select', options: opt(SERVICE_KINDS, 'svc_') }, { k: 'km', type: 'int', label: 'odometer_km' }, { k: 'at', label: 'date', type: 'date' }, { k: 'cost', type: 'number' }, { k: 'currency', type: 'select', options: opt(CURS) }, { k: 'photo_path', type: 'photo', label: 'receipt_photo', kind: 'service' }, { k: 'note', wide: true }];
  modal({
    title: `${t('add_service')} · ${v.plate}`, narrow: true,
    body: formHtml(fields, { kind: 'oil', km: v.odometer || '', at: todayStr(), currency: 'GEL' }),
    footer: `<span class="grow"></span><button class="btn primary" data-save>${esc(t('save'))}</button>`,
    onMount(el, close) {
      bindPhotoPreviews(el);
      el.querySelector('[data-save]').addEventListener('click', async () => {
        try { const x = await readForm(el, fields); await save('service_log', { ...x, vehicle_id: v.id }); if (x.kind === 'oil' || x.km) { const fresh = { ...get('vehicles', v.id) }; if (x.kind === 'oil') { fresh.oil_km = x.km ?? fresh.oil_km; fresh.oil_date = x.at; } if (x.km) fresh.odometer = Math.max(fresh.odometer || 0, x.km); S.vehicles.set(v.id, fresh); } toast(t('saved')); close(); }
        catch (er) { toast(errText(er)); }
      });
    },
  });
}
function openVehicleHistory(id) {
  const v = get('vehicles', id);
  const odo = list('odometer').filter((x) => x.vehicle_id === id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
  const fu = list('fuel').filter((x) => x.vehicle_id === id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
  const sv = list('service_log').filter((x) => x.vehicle_id === id).sort((a, b) => b.at.localeCompare(a.at));
  const ins = list('inspections').filter((x) => x.vehicle_id === id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
  modal({
    title: `${v.plate} · ${v.model}`,
    body: `<div class="row" style="margin-bottom:12px"><button class="btn sm" data-odo>＋ ${esc(t('add_odometer'))}</button><button class="btn sm" data-svc>＋ ${esc(t('add_service'))}</button><button class="btn sm" data-edit>${esc(t('edit'))}</button></div>
      <h3>${esc(t('service'))}</h3><div class="tbl" style="margin-bottom:12px"><table style="min-width:0"><tbody>${sv.map((x) => `<tr><td class="mono">${esc(x.at)}</td><td>${esc(t('svc_' + x.kind))}</td><td class="mono">${x.km ? esc(x.km) + ' km' : ''}</td><td>${esc(x.note)}</td><td class="num">${x.cost ? money(x.cost, x.currency) : ''}</td><td>${thumbs([x.photo_path])}</td><td class="num"><button class="btn sm danger" data-svcdel="${esc(x.id)}">✕</button></td></tr>`).join('') || '<tr><td class="empty">—</td></tr>'}</tbody></table></div>
      <h3>${esc(t('odometer'))}</h3><div class="tbl" style="margin-bottom:12px"><table style="min-width:0"><tbody>${odo.map((x) => `<tr class="click" data-odoedit="${esc(x.id)}"><td>${esc(fmtDT(x.at))}</td><td class="mono">${esc(x.km)} km</td><td>${esc(pname(x.driver_id))}</td><td>${thumbs([x.photo_path])}</td></tr>`).join('') || '<tr><td class="empty">—</td></tr>'}</tbody></table></div>
      <h3>${esc(t('fuel'))}</h3><div class="tbl" style="margin-bottom:12px"><table style="min-width:0"><tbody>${fu.map((x) => `<tr><td>${esc(fmtDT(x.at))}</td><td>${esc(x.station)}</td><td class="num">${esc(x.liters)} L</td><td class="num">${money(x.total, x.currency)}</td><td class="mono">${x.odometer ? esc(x.odometer) + ' km' : ''}</td><td>${thumbs([x.photo_path])}</td></tr>`).join('') || '<tr><td class="empty">—</td></tr>'}</tbody></table></div>
      <h3>${esc(t('inspections'))}</h3><div class="tbl"><table style="min-width:0"><tbody>${ins.map((x) => `<tr><td>${esc(fmtDT(x.at))}</td><td>${esc(t('insp_' + x.kind) || x.kind)}</td><td>${esc(pname(x.driver_id))}</td><td>${x.damage ? `<span class="badc">⚠ ${esc(t('damage_found'))}</span>` : ''} ${esc(x.note)}</td><td>${thumbs(x.photos)}</td></tr>`).join('') || '<tr><td class="empty">—</td></tr>'}</tbody></table></div>`,
    onMount(el, close) {
      el.addEventListener('click', async (e) => {
        if (e.target.closest('[data-odo]')) { close(); openOdometerForm(null, id); }
        if (e.target.closest('[data-svc]')) { close(); openService(id); }
        if (e.target.closest('[data-edit]')) { close(); openVehicle(id); }
        const sd = e.target.closest('[data-svcdel]'); if (sd) { try { await remove('service_log', sd.dataset.svcdel); close(); openVehicleHistory(id); } catch (er) { toast(errText(er)); } }
        const oe = e.target.closest('[data-odoedit]'); if (oe && !e.target.closest('[data-zoom]')) { close(); openOdometerForm(get('odometer', oe.dataset.odoedit)); }
      });
    },
  });
}

// =====================================================================
// Fleet
// =====================================================================
export const fleet = {
  render() {
    const vs = list('vehicles').sort((a, b) => (b.active - a.active) || a.plate.localeCompare(b.plate));
    const today = todayStr();
    const doc = (d) => { const n = daysUntil(d, today); if (n === null) return '<span class="muted">—</span>'; return `<span class="${n < 0 ? 'badc' : n <= 30 ? 'warnc' : ''}">${esc(d)}${n < 0 ? ' · ' + esc(t('expired')) : n <= 30 ? ` · ${n} ${esc(t('days_left'))}` : ''}</span>`; };
    return `<div class="vhead"><h1>${esc(t('v_fleet'))}</h1><span class="muted">${vs.length}</span><div class="grow"></div><button class="btn" data-insp>📷 ${esc(t('add_inspection'))}</button><button class="btn primary" data-addv>＋ ${esc(t('add_vehicle'))}</button></div>
      <div class="cards">${vs.map((v) => {
        const oil = oilStatus(v);
        const pct = oil.known ? Math.max(0, Math.min(100, 100 - (oil.left / (v.oil_interval || 10000)) * 100)) : 0;
        const users = drivers().filter((d) => d.vehicle_id === v.id).map((d) => d.name).join(', ');
        const lastFuel = list('fuel').filter((x) => x.vehicle_id === v.id).sort((a, b) => b.at.localeCompare(a.at))[0];
        return `<article class="pcard ${v.active ? '' : 'muted'}" data-veh="${esc(v.id)}" style="cursor:pointer">
          <div class="top">${v.photo_path ? `<span class="av lg" style="border-radius:10px"><img data-photo="${esc(v.photo_path)}" alt=""></span>` : ''}<div class="grow">${plate(v.plate)}<div style="margin-top:4px"><b>${esc(v.model)}</b></div><div class="small muted">${esc(t('c_' + v.vclass))} · ${esc(v.seats)} ${esc(t('seats'))}${v.color ? ' · ' + esc(v.color) : ''}${v.owner ? ' · ↗ ' + esc(v.owner) : ''}</div></div></div>
          <div><div class="row small"><span class="lbl">${esc(t('odometer'))}</span><span class="grow"></span><b class="mono">${(v.odometer || 0).toLocaleString('en-US')} km</b></div></div>
          <div><div class="row small"><span class="lbl">${esc(t('oil'))}</span><span class="grow"></span>${oil.known ? `<span class="mono ${oil.due ? 'badc' : oil.soon ? 'warnc' : ''}">${oil.due ? esc(t('oil_due')) : oil.left.toLocaleString('en-US') + ' km ' + esc(t('left'))}</span>` : `<span class="muted">${esc(t('oil_unknown'))}</span>`}</div>${oil.known ? `<div class="bar ${oil.due ? 'bad' : oil.soon ? 'warn' : 'good'}"><i style="width:${pct.toFixed(0)}%"></i></div>` : ''}</div>
          <dl class="kv small"><dt>${esc(t('insurance_until'))}</dt><dd>${doc(v.insurance_until)}</dd><dt>${esc(t('inspection_until'))}</dt><dd>${doc(v.inspection_until)}</dd><dt>${esc(t('drivers'))}</dt><dd>${esc(users || '—')}</dd><dt>${esc(t('last_fuel'))}</dt><dd>${lastFuel ? esc(fmtDT(lastFuel.at)) + ' · ' + esc(lastFuel.liters) + ' L' : '—'}</dd></dl>
          <div class="row"><button class="btn sm" data-odo="${esc(v.id)}">＋ km</button><button class="btn sm" data-svc="${esc(v.id)}">🔧 ${esc(t('add_service'))}</button></div>
        </article>`;
      }).join('') || `<div class="notice">${esc(t('no_vehicles'))}</div>`}</div>`;
  },
  bind(root) {
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-addv]')) return openVehicle(null);
      if (e.target.closest('[data-insp]')) return openInspectionForm(null);
      const o = e.target.closest('[data-odo]'); if (o) return openOdometerForm(null, o.dataset.odo);
      const s = e.target.closest('[data-svc]'); if (s) return openService(s.dataset.svc);
      const v = e.target.closest('[data-veh]'); if (v) openVehicleHistory(v.dataset.veh);
    });
  },
};

// =====================================================================
// Fuel
// =====================================================================
const FF = { month: todayStr().slice(0, 7), vehicle: '', driver: '', station: '' };
export const fuel = {
  render() {
    const rows = list('fuel').filter((x) => x.at.slice(0, 7) === FF.month && (!FF.vehicle || x.vehicle_id === FF.vehicle) && (!FF.driver || x.driver_id === FF.driver) && (!FF.station || x.station === FF.station)).sort((a, b) => b.at.localeCompare(a.at));
    const liters = rows.reduce((s, x) => s + num(x.liters), 0);
    const cost = rows.reduce((s, x) => s + gel(x.total, x.currency), 0);
    const byStation = {};
    for (const x of rows) { byStation[x.station] = byStation[x.station] || { l: 0, g: 0, n: 0 }; byStation[x.station].l += num(x.liters); byStation[x.station].g += gel(x.total, x.currency); byStation[x.station].n++; }
    const stats = fuelStats(FF.month, list('vehicles'), list('fuel'), list('odometer'), S.settings).filter((r) => r.fills);
    // flag: more liters than a sensible tank or two fill-ups within 3 hours
    const flags = new Set();
    for (const x of rows) {
      if (num(x.liters) > 90) flags.add(x.id);
      const near = rows.find((y) => y.id !== x.id && y.vehicle_id === x.vehicle_id && Math.abs(new Date(y.at) - new Date(x.at)) < 3 * 3600e3);
      if (near) flags.add(x.id);
    }
    let h = `<div class="vhead"><h1>${esc(t('v_fuel'))}</h1><div class="grow"></div><button class="btn" data-csv>CSV</button><button class="btn primary" data-add>＋ ${esc(t('add_fuel'))}</button></div>
      <div class="filters" style="margin-bottom:14px"><input type="month" id="ff_month" value="${esc(FF.month)}">
        <select id="ff_vehicle">${[['', t('all_cars')], ...list('vehicles').map((v) => [v.id, v.plate])].map(([v, l]) => `<option value="${esc(v)}" ${FF.vehicle === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <select id="ff_driver">${[['', t('all_drivers')], ...drivers().map((d) => [d.id, d.name])].map(([v, l]) => `<option value="${esc(v)}" ${FF.driver === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <select id="ff_station">${[['', t('all_stations')], ...STATIONS.map((s) => [s, s])].map(([v, l]) => `<option value="${esc(v)}" ${FF.station === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="kpis"><div class="kpi"><small>${esc(t('liters'))}</small><b>${round2(liters)}</b></div><div class="kpi"><small>${esc(t('spent'))}</small><b>${money(cost)}</b></div><div class="kpi"><small>${esc(t('avg_price'))}</small><b>${liters ? money(cost / liters) : '—'}</b></div><div class="kpi"><small>${esc(t('fillups'))}</small><b>${rows.length}</b></div></div>
      <div class="grid2" style="margin-bottom:16px">
        <section class="panel"><h2>${esc(t('by_station'))}</h2>${Object.entries(byStation).sort((a, b) => b[1].g - a[1].g).map(([k, v]) => `<div class="brow"><span>${esc(k)} <span class="muted">· ${v.n} · ${round2(v.l)} L · ${money(v.g / (v.l || 1))}/L</span></span><span class="mono">${money(v.g)}</span><div class="bar"><i style="width:${(v.g / (cost || 1) * 100).toFixed(1)}%"></i></div></div>`).join('') || '<p class="muted">—</p>'}</section>
        <section class="panel"><h2>${esc(t('consumption'))}</h2>${stats.map((r) => `<div class="brow"><span>${plate(r.vehicle.plate)} <span class="muted small">${r.km ? r.km + ' km' : esc(t('need_odometer'))}</span></span><span class="mono">${r.per100 ? round2(r.per100) + ' L/100' : '—'}</span></div>`).join('') || '<p class="muted">—</p>'}</section>
      </div>
      <div class="tbl"><table><thead><tr><th>${esc(t('date'))}</th><th>${esc(t('vehicle'))}</th><th>${esc(t('driver'))}</th><th>${esc(t('station'))}</th><th class="num">${esc(t('liters'))}</th><th class="num">${esc(t('price_l'))}</th><th class="num">${esc(t('total'))}</th><th>${esc(t('odometer'))}</th><th>${esc(t('paid_by'))}</th><th>${esc(t('receipt'))}</th></tr></thead><tbody>
      ${rows.map((x) => `<tr class="click" data-rec="${esc(x.id)}"><td>${esc(fmtDT(x.at))}${flags.has(x.id) ? ` <span class="flag" title="${esc(t('fuel_flag'))}">⚠</span>` : ''}</td><td>${plate(get('vehicles', x.vehicle_id)?.plate)}</td><td>${esc(pname(x.driver_id))}</td><td>${esc(x.station)}</td><td class="num">${esc(x.liters)}</td><td class="num">${esc(x.price_l)}</td><td class="num">${money(x.total, x.currency)}</td><td class="mono">${x.odometer ? esc(x.odometer) : ''}</td>
        <td>${esc(t('pb_' + x.paid_by))}${x.paid_by === 'driver' ? `<br><label class="chk small" onclick="event.stopPropagation()"><input type="checkbox" data-reimb="${esc(x.id)}" ${x.reimbursed ? 'checked' : ''}> ${esc(t('reimbursed'))}</label>` : ''}</td><td>${thumbs([x.photo_path])}</td></tr>`).join('') || `<tr><td colspan="10" class="empty">—</td></tr>`}
      </tbody></table></div>`;
    return h;
  },
  bind(root) {
    root.addEventListener('change', async (e) => {
      const m = { ff_month: 'month', ff_vehicle: 'vehicle', ff_driver: 'driver', ff_station: 'station' }[e.target.id];
      if (m) { FF[m] = e.target.value; window.gzaGo('fuel'); return; }
      if (e.target.dataset.reimb) { try { await save('fuel', { id: e.target.dataset.reimb, reimbursed: e.target.checked }); } catch (er) { toast(errText(er)); } }
    });
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) return openFuelForm(null);
      if (e.target.closest('[data-csv]')) return downloadCSV(`fuel-${FF.month}.csv`, [['date', 'car', 'driver', 'station', 'liters', 'price_l', 'total', 'currency', 'odometer', 'paid_by', 'reimbursed'], ...list('fuel').filter((x) => x.at.slice(0, 7) === FF.month).map((x) => [x.at.slice(0, 16).replace('T', ' '), get('vehicles', x.vehicle_id)?.plate, pname(x.driver_id), x.station, x.liters, x.price_l, x.total, x.currency, x.odometer, x.paid_by, x.reimbursed])]);
      const r = e.target.closest('[data-rec]'); if (r && !e.target.closest('[data-zoom],label')) openFuelForm(get('fuel', r.dataset.rec));
    });
  },
};

// =====================================================================
// Parking + other expenses (same table, different filters)
// =====================================================================
function expenseView(name, isParking) {
  const FE = { month: todayStr().slice(0, 7), driver: '', cat: '' };
  return {
    render() {
      const rows = list('expenses').filter((x) => (isParking ? x.category === 'parking' : x.category !== 'parking') && x.at.slice(0, 7) === FE.month && (!FE.driver || x.driver_id === FE.driver) && (!FE.cat || x.category === FE.cat)).sort((a, b) => b.at.localeCompare(a.at));
      const total = rows.reduce((s, x) => s + gel(x.amount, x.currency), 0);
      const byWho = { driver: 0, company: 0, client: 0 };
      for (const x of rows) byWho[x.paid_by] += gel(x.amount, x.currency);
      const owed = rows.filter((x) => x.paid_by === 'driver' && !x.reimbursed && !x.deduct).reduce((s, x) => s + gel(x.amount, x.currency), 0);
      const byPlace = {};
      if (isParking) for (const x of rows) { const k = x.place || '—'; byPlace[k] = byPlace[k] || { n: 0, g: 0 }; byPlace[k].n++; byPlace[k].g += gel(x.amount, x.currency); }
      return `<div class="vhead"><h1>${esc(t('v_' + name))}</h1><div class="grow"></div><button class="btn primary" data-add>＋ ${esc(isParking ? t('add_parking') : t('add_expense'))}</button></div>
        <div class="filters" style="margin-bottom:14px"><input type="month" id="fe_month" value="${esc(FE.month)}">
          <select id="fe_driver">${[['', t('all_drivers')], ...drivers().map((d) => [d.id, d.name])].map(([v, l]) => `<option value="${esc(v)}" ${FE.driver === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
          ${isParking ? '' : `<select id="fe_cat">${[['', t('all_categories')], ...EXP_CATS.filter((c) => c !== 'parking').map((c) => [c, t('cat_' + c)])].map(([v, l]) => `<option value="${esc(v)}" ${FE.cat === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`}</div>
        <div class="kpis"><div class="kpi"><small>${esc(t('total'))}</small><b>${money(total)}</b></div><div class="kpi"><small>${esc(t('pb_driver'))}</small><b>${money(byWho.driver)}</b></div><div class="kpi"><small>${esc(t('pb_company'))}</small><b>${money(byWho.company)}</b></div><div class="kpi"><small>${esc(t('pb_client'))}</small><b>${money(byWho.client)}</b></div><div class="kpi"><small>${esc(t('owed_drivers'))}</small><b class="${owed ? 'warnc' : ''}">${money(owed)}</b></div></div>
        ${isParking && Object.keys(byPlace).length ? `<section class="panel" style="margin-bottom:16px"><h2>${esc(t('by_place'))}</h2>${Object.entries(byPlace).sort((a, b) => b[1].g - a[1].g).slice(0, 12).map(([k, v]) => `<div class="brow"><span>${esc(k)} <span class="muted">· ${v.n}</span></span><span class="mono">${money(v.g)}</span></div>`).join('')}</section>` : ''}
        <div class="tbl"><table><thead><tr><th>${esc(t('date'))}</th>${isParking ? '' : `<th>${esc(t('category'))}</th>`}<th>${esc(t('place'))}</th><th>${esc(t('driver'))}</th><th>${esc(t('vehicle'))}</th><th>${esc(t('link_job'))}</th><th>${esc(t('paid_by'))}</th><th class="num">${esc(t('amount'))}</th><th>${esc(t('receipt'))}</th></tr></thead><tbody>
        ${rows.map((x) => `<tr class="click" data-rec="${esc(x.id)}"><td>${esc(fmtDT(x.at))}</td>${isParking ? '' : `<td>${esc(t('cat_' + x.category))}${x.deduct ? ` <span class="badc small">${esc(t('deduct'))}</span>` : ''}</td>`}<td>${esc(x.place)}${x.note ? `<br><span class="muted small">${esc(x.note)}</span>` : ''}</td><td>${esc(pname(x.driver_id))}</td><td>${plate(get('vehicles', x.vehicle_id)?.plate)}</td>
          <td class="small">${x.tour_id ? '🚐 ' + esc(get('tours', x.tour_id)?.name || '') : x.order_id ? esc(get('orders', x.order_id)?.date || '') + ' ' + esc(get('orders', x.order_id)?.pickup || '') : ''}</td>
          <td>${esc(t('pb_' + x.paid_by))}${x.paid_by === 'driver' && !x.deduct ? `<br><label class="chk small" onclick="event.stopPropagation()"><input type="checkbox" data-reimb="${esc(x.id)}" ${x.reimbursed ? 'checked' : ''}> ${esc(t('reimbursed'))}</label>` : ''}</td>
          <td class="num">${money(x.amount, x.currency)}</td><td>${thumbs([x.photo_path])}</td></tr>`).join('') || `<tr><td colspan="9" class="empty">—</td></tr>`}
        </tbody></table></div>`;
    },
    bind(root) {
      root.addEventListener('change', async (e) => {
        const m = { fe_month: 'month', fe_driver: 'driver', fe_cat: 'cat' }[e.target.id];
        if (m) { FE[m] = e.target.value; window.gzaGo(name); return; }
        if (e.target.dataset.reimb) { try { await save('expenses', { id: e.target.dataset.reimb, reimbursed: e.target.checked }); } catch (er) { toast(errText(er)); } }
      });
      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-add]')) return openExpenseForm(null, isParking ? 'parking' : 'other');
        const r = e.target.closest('[data-rec]'); if (r && !e.target.closest('[data-zoom],label')) openExpenseForm(get('expenses', r.dataset.rec));
      });
    },
  };
}
export const parking = expenseView('parking', true);
export const expenses = expenseView('expenses', false);
