// Shared calculations — used by the app (browser) and the server (reports, digest).
// All driver pay and all report totals are in GEL.

export function rate(settings, cur) {
  const s = settings || {};
  if (cur === 'USD') return Number(s.usd) || 2.7;
  if (cur === 'EUR') return Number(s.eur) || 3.0;
  return 1;
}
export function toGEL(amount, cur, settings) {
  return (Number(amount) || 0) * rate(settings, cur || 'GEL');
}
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function inMonth(dateLike, month) {
  return typeof dateLike === 'string' && dateLike.slice(0, 7) === month;
}
export function dayOf(ts) { return typeof ts === 'string' ? ts.slice(0, 10) : ''; }

// Suggested pay for a transfer, from the driver's pay rules
export function defaultOrderPay(profile, order, settings) {
  if (!profile) return 0;
  if (Number(profile.pay_trip) > 0) return Number(profile.pay_trip);
  if (Number(profile.pay_percent) > 0) return round2(toGEL(order.price, order.currency, settings) * Number(profile.pay_percent) / 100);
  return 0;
}
// Suggested pay for one tour day
export function defaultDayPay(profile) {
  return {
    driver_pay: profile ? Number(profile.pay_day) || 0 : 0,
    per_diem: profile ? Number(profile.per_diem) || 0 : 0,
  };
}

// Costs of one tour (GEL): fuel and expenses linked to it, driver pay, per diem, driver hotel, other
export function tourCosts(tour, days, fuel, expenses, settings) {
  const f = fuel.filter((x) => x.tour_id === tour.id).reduce((s, x) => s + toGEL(x.total, x.currency, settings), 0);
  const e = expenses.filter((x) => x.tour_id === tour.id && x.paid_by !== 'client').reduce((s, x) => s + toGEL(x.amount, x.currency, settings), 0);
  const d = days.filter((x) => x.tour_id === tour.id);
  const pay = d.reduce((s, x) => s + (Number(x.driver_pay) || 0), 0);
  const pd = d.reduce((s, x) => s + (Number(x.per_diem) || 0), 0);
  const hotel = toGEL(tour.driver_hotel, tour.currency, settings);
  const other = toGEL(tour.other_cost, tour.currency, settings);
  const total = f + e + pay + pd + hotel + other;
  return { fuel: f, expenses: e, pay, perDiem: pd, hotel, other, total };
}

// Costs of one transfer (GEL): driver pay, partner cost, linked fuel/expenses
export function orderCosts(order, fuel, expenses, settings) {
  const f = fuel.filter((x) => x.order_id === order.id).reduce((s, x) => s + toGEL(x.total, x.currency, settings), 0);
  const e = expenses.filter((x) => x.order_id === order.id && x.paid_by !== 'client').reduce((s, x) => s + toGEL(x.amount, x.currency, settings), 0);
  const partner = toGEL(order.partner_cost, order.currency, settings);
  const pay = Number(order.driver_pay) || 0;
  return { fuel: f, expenses: e, partner, pay, total: f + e + partner + pay };
}

/**
 * Monthly pay sheet per driver.
 * data: {profiles, orders, tours, tourDays, fuel, expenses, advances, settings}
 */
export function payroll(month, data) {
  const { profiles, orders, tours, tourDays, fuel, expenses, advances, settings } = data;
  const tourStatus = new Map(tours.map((t) => [t.id, t.status]));
  const rows = [];
  for (const p of profiles.filter((x) => x.role === 'driver')) {
    const trips = orders.filter((o) => o.driver_id === p.id && o.status === 'done' && inMonth(o.date, month));
    const days = tourDays.filter((d) => d.driver_id === p.id && inMonth(d.date, month) && tourStatus.get(d.tour_id) && tourStatus.get(d.tour_id) !== 'cancelled' && tourStatus.get(d.tour_id) !== 'planned');
    const fuelR = fuel.filter((x) => x.driver_id === p.id && x.paid_by === 'driver' && !x.reimbursed && inMonth(dayOf(x.at), month));
    const expR = expenses.filter((x) => x.driver_id === p.id && x.paid_by === 'driver' && !x.reimbursed && !x.deduct && inMonth(dayOf(x.at), month));
    const ded = expenses.filter((x) => x.driver_id === p.id && x.deduct && inMonth(dayOf(x.at), month));
    const adv = advances.filter((x) => x.driver_id === p.id && inMonth(x.at, month));
    const sumAdv = (k) => adv.filter((x) => x.kind === k).reduce((s, x) => s + toGEL(x.amount, x.currency, settings), 0);
    const r = {
      driver: p,
      fixed: Number(p.pay_monthly) || 0,
      tripsN: trips.length,
      trips: trips.reduce((s, o) => s + (Number(o.driver_pay) || 0), 0),
      daysN: days.length,
      days: days.reduce((s, d) => s + (Number(d.driver_pay) || 0), 0),
      perDiem: days.reduce((s, d) => s + (Number(d.per_diem) || 0), 0),
      reimburse: fuelR.reduce((s, x) => s + toGEL(x.total, x.currency, settings), 0) + expR.reduce((s, x) => s + toGEL(x.amount, x.currency, settings), 0),
      deduct: ded.reduce((s, x) => s + toGEL(x.amount, x.currency, settings), 0),
      bonus: sumAdv('bonus'),
      advance: sumAdv('advance'),
      paidOut: sumAdv('payout'),
    };
    r.earned = r.fixed + r.trips + r.days + r.perDiem + r.bonus;
    r.total = r.earned + r.reimburse - r.deduct - r.advance;
    r.balance = r.total - r.paidOut;
    rows.push(r);
  }
  return rows;
}

// Fuel consumption per vehicle for a month (needs odometer readings at fill-ups)
export function fuelStats(month, vehicles, fuel, odometer, settings) {
  return vehicles.map((v) => {
    const fills = fuel.filter((x) => x.vehicle_id === v.id && inMonth(dayOf(x.at), month));
    const liters = fills.reduce((s, x) => s + (Number(x.liters) || 0), 0);
    const cost = fills.reduce((s, x) => s + toGEL(x.total, x.currency, settings), 0);
    const kms = [...fills.map((x) => x.odometer), ...odometer.filter((x) => x.vehicle_id === v.id && inMonth(dayOf(x.at), month)).map((x) => x.km)]
      .filter((k) => Number(k) > 0).map(Number);
    const km = kms.length > 1 ? Math.max(...kms) - Math.min(...kms) : 0;
    const per100 = km > 0 && liters > 0 ? (liters / km) * 100 : null;
    return { vehicle: v, fills: fills.length, liters, cost, km, per100 };
  });
}

// Oil status for one vehicle
export function oilStatus(v) {
  if (!v || v.oil_km == null) return { known: false };
  const next = Number(v.oil_km) + (Number(v.oil_interval) || 10000);
  const left = next - (Number(v.odometer) || 0);
  return { known: true, next, left, due: left <= 0, soon: left > 0 && left <= 1000 };
}

// Days until a date (Tbilisi calendar day)
export function daysUntil(dateStr, today) {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr + 'T12:00:00Z') - new Date(today + 'T12:00:00Z')) / 864e5);
}

// Today's date / time in Tbilisi (UTC+4, no daylight saving)
export function tbilisiNow(d = new Date()) {
  const t = new Date(d.getTime() + 4 * 3600e3);
  const iso = t.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), hour: t.getUTCHours(), minutes: t.getUTCHours() * 60 + t.getUTCMinutes(), day: t.getUTCDate() };
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function prevMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 15));
  return d.toISOString().slice(0, 7);
}
export function hm(t) { if (!t) return 0; const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); }
