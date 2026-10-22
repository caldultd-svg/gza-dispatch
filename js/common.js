// Domain helpers shared by the views
import { t } from './i18n.js';
import { S, list, get, api } from './store.js';
import { esc, toast, todayStr, fmtDate, linesOf, money } from './ui.js';
import { hm } from './calc.js';

export const TYPES = ['airport', 'transfer', 'vip', 'taxi', 'hotel', 'corporate', 'medical'];
export const STATUSES = ['new', 'assigned', 'en_route', 'arrived', 'onboard', 'done', 'cancelled'];
export const FLOW = { assigned: 'en_route', en_route: 'arrived', arrived: 'onboard', onboard: 'done' };
export const TSTAT = ['planned', 'confirmed', 'ongoing', 'done', 'cancelled'];
export const CLASSES = ['sedan', 'business', 'minivan', 'minibus', 'bus', 'suv', 'accessible'];
export const CURS = ['GEL', 'USD', 'EUR'];
export const PAYMENTS = ['cash', 'card', 'invoice', 'bank'];
export const CTYPES = ['person', 'company', 'hotel', 'agency', 'clinic'];
export const STATIONS = ['Gulf', 'Rompetrol', 'Wissol', 'SOCAR', 'Lukoil', 'Connect', 'Portal', 'other'];
export const EXP_CATS = ['parking', 'wash', 'repair', 'fine', 'toll', 'border', 'other'];
export const SERVICE_KINDS = ['oil', 'tires', 'brakes', 'belt', 'battery', 'other'];
export const DRV_COLORS = ['#2B67A6', '#1D7653', '#A86A0E', '#7449A8', '#B23838', '#1E5E55', '#8A5A2B', '#3F6A2A', '#6B3F8F', '#2F7F8F', '#9A4A6A', '#4A5A9A'];

export const opt = (arr, prefix) => arr.map((x) => [x, prefix ? t(prefix + x) : x]);

export function drivers() {
  return list('profiles').filter((p) => p.role === 'driver').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}
export const pname = (id) => get('profiles', id)?.name || '';
export function vlabel(id) { const v = get('vehicles', id); return v ? `${v.plate} · ${v.model}` : ''; }
export function driverColor(id) {
  const p = get('profiles', id);
  if (p?.color) return p.color;
  const ids = drivers().map((d) => d.id);
  const i = ids.indexOf(id);
  return DRV_COLORS[(i < 0 ? 0 : i) % DRV_COLORS.length];
}
export function driverOptions(sel, emptyLabel, date) {
  return `<option value="">${esc(emptyLabel)}</option>` + drivers().map((d) => {
    const off = d.duty === 'off' ? ' · ' + t('duty_off') : (date && isDayOff(d.id, date) ? ' · ' + t('day_off') : '');
    return `<option value="${esc(d.id)}" ${d.id === sel ? 'selected' : ''}>${esc(d.name)}${esc(off)}</option>`;
  }).join('');
}
export function vehicleOptions(sel, emptyLabel = '—') {
  return `<option value="">${esc(emptyLabel)}</option>` + list('vehicles').filter((v) => v.active || v.id === sel).sort((a, b) => a.plate.localeCompare(b.plate))
    .map((v) => `<option value="${esc(v.id)}" ${v.id === sel ? 'selected' : ''}>${esc(v.plate)} · ${esc(v.model)} (${v.seats})</option>`).join('');
}
export const driverSelectOpts = () => [['', '— ' + t('unassigned') + ' —'], ...drivers().map((d) => [d.id, d.name])];
export const vehicleSelectOpts = () => [['', '—'], ...list('vehicles').filter((v) => v.active).map((v) => [v.id, `${v.plate} · ${v.model}`])];

export function isDayOff(driverId, date) {
  return list('days_off').some((d) => d.driver_id === driverId && d.approved && date >= d.date_from && date <= d.date_to);
}
export function tourDaysOn(date) { return list('tour_days').filter((d) => d.date === date && tourLive(d.tour_id)); }
export function tourLive(tourId) { const tr = get('tours', tourId); return tr && tr.status !== 'cancelled'; }
export function tourDays(tourId) { return list('tour_days').filter((d) => d.tour_id === tourId).sort((a, b) => a.idx - b.idx || a.date.localeCompare(b.date)); }
export function onTour(driverId, date) { return list('tour_days').find((d) => d.driver_id === driverId && d.date === date && tourLive(d.tour_id)); }
export function driverBusy(id) { return list('orders').some((o) => o.driver_id === id && ['en_route', 'arrived', 'onboard'].includes(o.status)); }
export function driverState(d, date = todayStr()) {
  if (d.duty === 'off') return ['off', t('duty_off')];
  if (isDayOff(d.id, date)) return ['off', t('day_off')];
  if (onTour(d.id, date)) return ['tour', t('on_tour')];
  if (driverBusy(d.id)) return ['busy', t('busy')];
  return ['free', t('free')];
}

// conflicts: same driver, overlapping transfers, or a transfer on a tour day
export function conflictSet() {
  const out = new Map();
  const by = {};
  for (const o of list('orders')) {
    if (!o.driver_id || o.status === 'cancelled' || o.status === 'done') continue;
    (by[o.driver_id + '|' + o.date] = by[o.driver_id + '|' + o.date] || []).push(o);
    if (onTour(o.driver_id, o.date)) out.set(o.id, 'tour_conflict');
    if (isDayOff(o.driver_id, o.date)) out.set(o.id, 'dayoff_conflict');
  }
  for (const k in by) {
    const a = by[k].sort((x, y) => hm(x.time) - hm(y.time));
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
      if (hm(a[j].time) < hm(a[i].time) + (Number(a[i].duration) || 60)) { out.set(a[i].id, 'conflict'); out.set(a[j].id, 'conflict'); }
    }
  }
  return out;
}

// ---------- server calls ----------
export async function sendAssign(kind, id) {
  try {
    const r = await api('notify', { event: 'assign', kind, id });
    if (r.sent?.length) toast(t('request_sent') + ': ' + r.sent.join(', '));
    if (r.noTelegram?.length) toast(t('no_telegram') + ': ' + r.noTelegram.join(', '), 5000);
  } catch (e) { toast(t('request_failed') + ' ' + (e.message || '')); }
}
export function notifyCancelled(driverIds, text) {
  const ids = [...new Set(driverIds.filter(Boolean))];
  if (ids.length) api('notify', { event: 'cancelled', kind: 'order', id: 'x', driver_ids: ids, text }).catch(() => {});
}
export function gsync(kind, id, deleted = false) {
  if (!S.settings.gas_url) return;
  api('google', { action: 'sync', kind, id, deleted }).catch(() => {});
}

// ---------- message for the client ----------
const CT = {
  en: { hi: 'Hello', ok: 'Your transfer is confirmed.', tour: 'Your tour transport is confirmed.', date: 'Date', from: 'From', to: 'To', driver: 'Driver', car: 'Car', flight: 'Flight', meet: 'The driver will meet you at arrivals with a sign', pax: 'Passengers', bye: 'Have a good trip!' },
  ru: { hi: 'Здравствуйте', ok: 'Ваш трансфер подтверждён.', tour: 'Транспорт на ваш тур подтверждён.', date: 'Дата', from: 'Откуда', to: 'Куда', driver: 'Водитель', car: 'Машина', flight: 'Рейс', meet: 'Водитель встретит вас в зоне прилёта с табличкой', pax: 'Пассажиров', bye: 'Хорошей поездки!' },
  ka: { hi: 'გამარჯობა', ok: 'თქვენი ტრანსფერი დადასტურებულია.', tour: 'თქვენი ტურის ტრანსპორტი დადასტურებულია.', date: 'თარიღი', from: 'საიდან', to: 'სადამდე', driver: 'მძღოლი', car: 'ავტომობილი', flight: 'რეისი', meet: 'მძღოლი დაგხვდებათ ჩამოსვლის დარბაზში დაფით', pax: 'მგზავრები', bye: 'კარგ მგზავრობას!' },
  pl: { hi: 'Dzień dobry', ok: 'Państwa transfer jest potwierdzony.', tour: 'Transport na wycieczkę jest potwierdzony.', date: 'Data', from: 'Skąd', to: 'Dokąd', driver: 'Kierowca', car: 'Samochód', flight: 'Lot', meet: 'Kierowca będzie czekał w hali przylotów z tabliczką', pax: 'Pasażerowie', bye: 'Udanej podróży!' },
};
export const CLIENT_LANGS = Object.keys(CT);
export function clientText(o, L) {
  const c = CT[L] || CT.en;
  const d = get('profiles', o.driver_id);
  const v = get('vehicles', o.vehicle_id);
  const loc = L === 'ka' ? 'ka-GE' : L === 'ru' ? 'ru-RU' : L === 'pl' ? 'pl-PL' : 'en-GB';
  const date = new Date(o.date + 'T12:00:00').toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
  const lines = [`${c.hi}${o.passenger_name ? ', ' + o.passenger_name : ''}!`, c.ok, '',
    `${c.date}: ${date}, ${o.time}`, `${c.from}: ${o.pickup}`];
  for (const s of linesOf(o.stops)) lines.push(`→ ${s}`);
  lines.push(`${c.to}: ${o.dropoff}`, `${c.pax}: ${o.pax}`);
  if (d) lines.push(`${c.driver}: ${d.name}${d.phone ? ', ' + d.phone : ''}`);
  if (v) lines.push(`${c.car}: ${[v.model, v.color, v.plate].filter(Boolean).join(', ')}`);
  if (o.flight) lines.push(`${c.flight}: ${o.flight}`);
  if (o.type === 'airport' && o.sign) lines.push(`${c.meet}: "${o.sign}"`);
  lines.push('', c.bye, S.settings.company || '');
  return lines.join('\n').trim();
}
export function waLink(phone, text) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
export function orderShort(o) { return `${fmtDate(o.date)} ${o.time} · ${o.pickup} → ${o.dropoff}`; }
export function priceCell(price, cur, paid) {
  return `${Number(price) ? money(price, cur) : '—'}<br><span class="${paid ? 'goodc' : 'warnc'}" style="font-family:var(--f-body);font-size:12px">${esc(paid ? t('paid') : t('unpaid'))}</span>`;
}
