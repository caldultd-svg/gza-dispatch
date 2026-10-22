// Shared server helpers (files starting with "_" are not public routes on Vercel)
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { SUPABASE_URL, APP_NAME } from '../js/config.js';
import { toGEL, round2, payroll, tourCosts, orderCosts, fuelStats, inMonth, dayOf } from '../js/calc.js';

export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
export const WEBHOOK_SECRET = BOT_TOKEN ? createHash('sha256').update('gza:' + BOT_TOKEN).digest('hex').slice(0, 40) : '';

export function admin() {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set in Vercel');
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function json(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

// Who is calling? Returns {user, profile} or null
export async function caller(req, db) {
  const h = req.headers.authorization || '';
  const jwt = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data?.user) return null;
  const { data: profile } = await db.from('profiles').select('*').eq('id', data.user.id).single();
  if (!profile) return null;
  return { user: data.user, profile };
}
export const isStaff = (p) => p && (p.role === 'owner' || p.role === 'dispatcher');

// ---------- Telegram ----------
export async function tg(method, payload) {
  if (!BOT_TOKEN) return { ok: false, description: 'TELEGRAM_BOT_TOKEN is not set' };
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  try { return await r.json(); } catch { return { ok: false }; }
}
export const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export function send(chatId, text, extra = {}) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
}

// ---------- bot texts ----------
const BT = {
  ka: {
    new_order: '🆕 ახალი ტრანსფერი', new_tour: '🆕 ახალი ტური', accept: '✅ ვიღებ', decline: '❌ უარი',
    accepted: '✅ მიღებულია', declined: '❌ უარყოფილია', open: 'აპლიკაციის გახსნა',
    pax: 'მგზ.', flight: 'რეისი', sign: 'დაფა', contact: 'კონტაქტი', passenger: 'მგზავრი', days: 'დღე',
    your_days: 'თქვენი დღეები', remind2h: '⏰ 2 საათში ტრანსფერი', tomorrow: '📅 ხვალ', tour_starts: 'ტური იწყება',
    linked: 'Telegram დაკავშირებულია: ', unknown_code: 'კოდი ვერ მოიძებნა. გახსენით აპლიკაცია → პროფილი → „Telegram-ის დაკავშირება“.',
    hello: 'გამარჯობა! დასაკავშირებლად გახსენით აპლიკაცია → პროფილი → „Telegram-ის დაკავშირება“.',
    loc_ok: '📍 მდებარეობა მიღებულია. დისპეტჩერი ხედავს რუკაზე.', loc_live: '📍 ცოცხალი მდებარეობა ჩართულია. მადლობა!',
    not_linked: 'ეს Telegram არ არის დაკავშირებული პროფილთან.', no_jobs: 'უახლოეს დღეებში შეკვეთა არ გაქვთ.',
    cancelled: '🚫 გაუქმდა', collect: 'აიღეთ ნაღდი', jobs: 'თქვენი შეკვეთები',
  },
  en: {
    new_order: '🆕 New transfer', new_tour: '🆕 New tour', accept: '✅ Accept', decline: '❌ Decline',
    accepted: '✅ Accepted', declined: '❌ Declined', open: 'Open the app',
    pax: 'pax', flight: 'Flight', sign: 'Sign', contact: 'Contact', passenger: 'Passenger', days: 'days',
    your_days: 'Your days', remind2h: '⏰ Transfer in 2 hours', tomorrow: '📅 Tomorrow', tour_starts: 'Tour starts',
    linked: 'Telegram connected: ', unknown_code: 'Code not found. Open the app → Profile → “Connect Telegram”.',
    hello: 'Hello! To connect, open the app → Profile → “Connect Telegram”.',
    loc_ok: '📍 Location received. The dispatcher sees it on the map.', loc_live: '📍 Live location is on. Thank you!',
    not_linked: 'This Telegram is not linked to a profile.', no_jobs: 'You have no jobs in the next days.',
    cancelled: '🚫 Cancelled', collect: 'Collect cash', jobs: 'Your jobs',
  },
  ru: {
    new_order: '🆕 Новый трансфер', new_tour: '🆕 Новый тур', accept: '✅ Принять', decline: '❌ Отклонить',
    accepted: '✅ Принято', declined: '❌ Отклонено', open: 'Открыть приложение',
    pax: 'пасс.', flight: 'Рейс', sign: 'Табличка', contact: 'Контакт', passenger: 'Пассажир', days: 'дн.',
    your_days: 'Ваши дни', remind2h: '⏰ Через 2 часа трансфер', tomorrow: '📅 Завтра', tour_starts: 'Начинается тур',
    linked: 'Telegram подключён: ', unknown_code: 'Код не найден. Откройте приложение → Профиль → «Подключить Telegram».',
    hello: 'Здравствуйте! Чтобы подключиться, откройте приложение → Профиль → «Подключить Telegram».',
    loc_ok: '📍 Местоположение получено. Диспетчер видит его на карте.', loc_live: '📍 Трансляция геопозиции включена. Спасибо!',
    not_linked: 'Этот Telegram не привязан к профилю.', no_jobs: 'В ближайшие дни заказов нет.',
    cancelled: '🚫 Отменено', collect: 'Получить наличными', jobs: 'Ваши заказы',
  },
};
export const bt = (lang, k) => (BT[lang] || BT.ka)[k] || BT.en[k] || k;

const money = (n, c) => `${round2(n)} ${c || 'GEL'}`;

export function orderText(o, lang, head) {
  const L = (k) => bt(lang, k);
  const lines = [`<b>${esc(head)}</b>`, `<b>${esc(o.date)} · ${esc(o.time || '--:--')}</b>`,
    `📍 ${esc(o.pickup)}`];
  if (o.stops) for (const s of String(o.stops).split('\n').filter(Boolean)) lines.push(`   ↳ ${esc(s)}`);
  lines.push(`🏁 ${esc(o.dropoff)}`);
  const meta = [`${o.pax || 1} ${L('pax')}`];
  if (o.flight) meta.push(`✈ ${esc(o.flight)}`);
  if (o.sign) meta.push(`${L('sign')}: ${esc(o.sign)}`);
  lines.push(meta.join(' · '));
  if (o.passenger_name || o.passenger_phone) lines.push(`${L('passenger')}: ${esc(o.passenger_name)} ${esc(o.passenger_phone)}`);
  if (o.contact_name || o.contact_phone) lines.push(`${L('contact')}: ${esc([o.contact_org, o.contact_name].filter(Boolean).join(', '))} ${esc(o.contact_phone)}`);
  if (o.notes) lines.push(`📝 ${esc(o.notes)}`);
  if (o.special) lines.push(`⚠️ ${esc(o.special)}`);
  if (o.payment === 'cash' && !o.paid && Number(o.price) > 0) lines.push(`💵 ${L('collect')}: ${money(o.price, o.currency)}`);
  return lines.join('\n');
}

export function tourText(t, days, driverId, lang, head) {
  const L = (k) => bt(lang, k);
  const mine = days.filter((d) => d.driver_id === driverId).sort((a, b) => a.idx - b.idx);
  const lines = [`<b>${esc(head)}</b>`, `<b>${esc(t.name)}</b>`, `${esc(t.date_from)} → ${esc(t.date_to)} · ${t.group_size || ''} ${L('pax')}`];
  if (t.guide) lines.push(`Guide: ${esc(t.guide)} ${esc(t.guide_phone)}`);
  if (t.contact_name || t.contact_phone) lines.push(`${L('contact')}: ${esc(t.contact_name)} ${esc(t.contact_phone)}`);
  lines.push('', `<b>${L('your_days')} (${mine.length}):</b>`);
  for (const d of mine) lines.push(`${esc(d.date)} · ${esc(d.from_place)} → ${esc(d.to_place)}${d.hotel ? ' · 🛏 ' + esc(d.hotel) : ''}`);
  return lines.join('\n');
}

export function appUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `https://${host}`;
}

export async function staffChats(db) {
  const { data } = await db.from('profiles').select('id,tg_chat_id,lang,name').in('role', ['owner', 'dispatcher']).not('tg_chat_id', 'is', null);
  return data || [];
}
export async function notifyStaff(db, text) {
  for (const s of await staffChats(db)) await send(s.tg_chat_id, text);
}

// Send a "please accept" message for an order or for a driver's days in a tour
export async function sendRequest(db, req, kind, record, days, driver) {
  const lang = driver.lang || 'ka';
  const url = appUrl(req);
  const text = kind === 'order' ? orderText(record, lang, bt(lang, 'new_order')) : tourText(record, days, driver.id, lang, bt(lang, 'new_tour'));
  const k = kind === 'order' ? 'o' : 't';
  return send(driver.tg_chat_id, text, {
    reply_markup: { inline_keyboard: [
      [{ text: bt(lang, 'accept'), callback_data: `a|${k}|${record.id}` }, { text: bt(lang, 'decline'), callback_data: `d|${k}|${record.id}` }],
      [{ text: bt(lang, 'open'), url }],
    ] },
  });
}

// once-only guard for reminders
export async function once(db, key) {
  const { error } = await db.from('notif_log').insert({ key });
  return !error;
}

// ---------- Google (Apps Script bridge) ----------
export async function gas(settings, payload) {
  if (!settings?.gas_url) return { ok: false, error: 'Google is not connected' };
  const r = await fetch(settings.gas_url, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: settings.gas_secret, ...payload }), redirect: 'follow',
  });
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { return { ok: false, error: 'Unexpected answer from Google: ' + txt.slice(0, 120) }; }
}

export async function loadAll(db) {
  const tables = ['profiles', 'vehicles', 'orders', 'tours', 'tour_days', 'fuel', 'expenses', 'odometer', 'advances', 'clients'];
  const out = {};
  await Promise.all(tables.map(async (t) => {
    const { data } = await db.from(t).select('*').limit(10000);
    out[t] = data || [];
  }));
  const { data: s } = await db.from('settings').select('*').eq('id', 1).single();
  out.settings = s || {};
  return out;
}

// Build the monthly report as sheets of rows (first row = headers)
export function buildReport(month, D) {
  const S = D.settings;
  const pname = (id) => (D.profiles.find((p) => p.id === id) || {}).name || '';
  const plate = (id) => (D.vehicles.find((v) => v.id === id) || {}).plate || '';
  const orders = D.orders.filter((o) => inMonth(o.date, month) && o.status !== 'cancelled').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const tours = D.tours.filter((t) => (inMonth(t.date_from, month) || inMonth(t.date_to, month)) && t.status !== 'cancelled');
  const transfers = [['Date', 'Time', 'Type', 'Status', 'Client', 'Contact', 'Pickup', 'Drop-off', 'Driver', 'Car', 'Price', 'Currency', 'Price GEL', 'Paid', 'Driver pay GEL', 'Partner cost GEL', 'Profit GEL']];
  for (const o of orders) {
    const c = orderCosts(o, D.fuel, D.expenses, S);
    const p = toGEL(o.price, o.currency, S);
    transfers.push([o.date, o.time, o.type, o.status, o.client_name, [o.contact_org, o.contact_name, o.contact_phone].filter(Boolean).join(' '), o.pickup, o.dropoff, pname(o.driver_id), plate(o.vehicle_id), Number(o.price) || 0, o.currency, round2(p), o.paid ? 'yes' : 'no', round2(c.pay), round2(c.partner), round2(p - c.total)]);
  }
  const tourRows = [['Start', 'End', 'Tour', 'Status', 'Client', 'Group', 'Drivers', 'Price', 'Currency', 'Price GEL', 'Paid', 'Costs GEL', 'Profit GEL']];
  for (const t of tours) {
    const days = D.tour_days.filter((d) => d.tour_id === t.id);
    const c = tourCosts(t, days, D.fuel, D.expenses, S);
    const p = toGEL(t.price, t.currency, S);
    const drivers = [...new Set(days.map((d) => pname(d.driver_id)).filter(Boolean))].join(', ');
    tourRows.push([t.date_from, t.date_to, t.name, t.status, t.client_name, t.group_size, drivers, Number(t.price) || 0, t.currency, round2(p), t.paid ? 'yes' : 'no', round2(c.total), round2(p - c.total)]);
  }
  const fuelRows = [['Date', 'Car', 'Driver', 'Station', 'Liters', 'Price/L', 'Total', 'Currency', 'Odometer', 'Paid by', 'Reimbursed']];
  for (const f of D.fuel.filter((x) => inMonth(dayOf(x.at), month))) fuelRows.push([dayOf(f.at), plate(f.vehicle_id), pname(f.driver_id), f.station, Number(f.liters) || 0, Number(f.price_l) || 0, Number(f.total) || 0, f.currency, f.odometer || '', f.paid_by, f.reimbursed ? 'yes' : 'no']);
  const expRows = [['Date', 'Category', 'Place', 'Driver', 'Car', 'Amount', 'Currency', 'Paid by', 'Charged to driver', 'Reimbursed', 'Note']];
  for (const e of D.expenses.filter((x) => inMonth(dayOf(x.at), month))) expRows.push([dayOf(e.at), e.category, e.place, pname(e.driver_id), plate(e.vehicle_id), Number(e.amount) || 0, e.currency, e.paid_by, e.deduct ? 'yes' : 'no', e.reimbursed ? 'yes' : 'no', e.note]);
  const pay = payroll(month, { profiles: D.profiles, orders: D.orders, tours: D.tours, tourDays: D.tour_days, fuel: D.fuel, expenses: D.expenses, advances: D.advances, settings: S });
  const payRows = [['Driver', 'Legal', 'IBAN', 'Monthly fixed', 'Transfers', 'Transfer pay', 'Tour days', 'Day pay', 'Per diem', 'Bonus', 'Reimburse', 'Deductions', 'Advances', 'To pay', 'Paid out', 'Balance']];
  for (const r of pay) payRows.push([r.driver.name, [r.driver.legal_name, r.driver.legal_id].filter(Boolean).join(' '), r.driver.iban, round2(r.fixed), r.tripsN, round2(r.trips), r.daysN, round2(r.days), round2(r.perDiem), round2(r.bonus), round2(r.reimburse), round2(r.deduct), round2(r.advance), round2(r.total), round2(r.paidOut), round2(r.balance)]);
  const fs = fuelStats(month, D.vehicles, D.fuel, D.odometer, S);
  const carRows = [['Car', 'Model', 'Odometer', 'Fill-ups', 'Liters', 'Fuel GEL', 'Km (from readings)', 'L/100 km']];
  for (const r of fs) carRows.push([r.vehicle.plate, r.vehicle.model, r.vehicle.odometer, r.fills, round2(r.liters), round2(r.cost), r.km, r.per100 ? round2(r.per100) : '']);
  return { title: `${S.company || APP_NAME} — ${month}`, sheets: { Transfers: transfers, Tours: tourRows, Payroll: payRows, Fuel: fuelRows, Expenses: expRows, Cars: carRows } };
}

// Calendar event payloads
export function orderEvent(o, D) {
  const d = D.profiles.find((p) => p.id === o.driver_id);
  const v = D.vehicles.find((x) => x.id === o.vehicle_id);
  const start = `${o.date}T${o.time || '09:00'}:00+04:00`;
  const end = new Date(new Date(start).getTime() + (Number(o.duration) || 60) * 60000).toISOString();
  return {
    id: 'o_' + o.id,
    title: `${o.time || ''} ${o.pickup} → ${o.dropoff}${d ? ' · ' + d.name : ' · ⚠ no driver'}`.trim(),
    start, end, allDay: false, location: o.pickup,
    description: [`Type: ${o.type}`, `Status: ${o.status}`, `Client: ${o.client_name}`, o.contact_name || o.contact_phone ? `Contact: ${o.contact_org} ${o.contact_name} ${o.contact_phone}` : '', o.flight ? `Flight: ${o.flight}` : '', `Pax: ${o.pax}`, d ? `Driver: ${d.name} ${d.phone}` : '', v ? `Car: ${v.plate} ${v.model}` : '', o.notes].filter(Boolean).join('\n'),
  };
}
export function tourEvent(t, D) {
  const days = D.tour_days.filter((d) => d.tour_id === t.id).sort((a, b) => a.idx - b.idx);
  const pname = (id) => (D.profiles.find((p) => p.id === id) || {}).name || '—';
  const drivers = [...new Set(days.map((d) => pname(d.driver_id)))].join(', ');
  return {
    id: 't_' + t.id,
    title: `🚐 ${t.name} · ${drivers}`,
    start: t.date_from, end: t.date_to, allDay: true, location: days[0]?.from_place || '',
    description: [`Client: ${t.client_name}`, `Group: ${t.group_size}`, t.guide ? `Guide: ${t.guide} ${t.guide_phone}` : '', '',
      ...days.map((d, i) => `Day ${i + 1} ${d.date}: ${d.from_place} → ${d.to_place}${d.hotel ? ' | hotel ' + d.hotel : ''} | ${pname(d.driver_id)}`), '', t.notes].filter((x) => x !== undefined).join('\n'),
  };
}
