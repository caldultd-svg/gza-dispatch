// Runs every 10 minutes (Supabase pg_cron) and once a day (Vercel cron).
// Safe to call any number of times: every message is sent only once (notif_log).
import { admin, json, send, bt, esc, once, notifyStaff, orderText, loadAll, gas, buildReport } from './_lib.js';
import { tbilisiNow, addDays, hm, daysUntil, oilStatus, prevMonth } from '../js/calc.js';

export default async function handler(req, res) {
  const db = admin();
  const now = tbilisiNow();
  const D = await loadAll(db);
  const S = D.settings;
  const out = { reminders: 0, evening: 0, digest: false, report: null };
  const prof = (id) => D.profiles.find((p) => p.id === id);
  const live = (o) => o.status !== 'cancelled' && o.status !== 'done';

  // 1) 2-hour reminders for transfers
  for (const o of D.orders.filter((x) => x.driver_id && live(x) && x.date === now.date && x.time)) {
    const diff = hm(o.time) - now.minutes;
    if (diff > 0 && diff <= 130) {
      const d = prof(o.driver_id);
      if (d?.tg_chat_id && (await once(db, `r2h:${o.id}:${o.date}:${o.time}:${o.driver_id}`))) {
        await send(d.tg_chat_id, orderText(o, d.lang, bt(d.lang, 'remind2h')));
        out.reminders++;
      }
    }
  }

  const digestHour = Number(S.digest_hour ?? 19);
  if (now.hour >= digestHour) {
    const tomorrow = addDays(now.date, 1);

    // 2) evening message to each driver: tomorrow's work
    for (const d of D.profiles.filter((p) => p.role === 'driver' && p.tg_chat_id)) {
      const os = D.orders.filter((o) => o.driver_id === d.id && o.date === tomorrow && live(o)).sort((a, b) => hm(a.time) - hm(b.time));
      const ds = D.tour_days.filter((x) => x.driver_id === d.id && x.date === tomorrow).filter((x) => {
        const t = D.tours.find((tt) => tt.id === x.tour_id);
        return t && t.status !== 'cancelled';
      });
      if (!os.length && !ds.length) continue;
      if (!(await once(db, `eve:${d.id}:${tomorrow}`))) continue;
      const parts = [`<b>${bt(d.lang, 'tomorrow')} · ${tomorrow}</b>`];
      for (const o of os) parts.push(orderText(o, d.lang, `${o.time} · ${o.type}`));
      for (const x of ds) {
        const t = D.tours.find((tt) => tt.id === x.tour_id);
        const first = t.date_from === x.date;
        parts.push(`<b>${first ? bt(d.lang, 'tour_starts') + ': ' : ''}${esc(t.name)}</b>${first && t.start_time ? ' · ' + esc(t.start_time) : ''}\n${esc(x.from_place)} → ${esc(x.to_place)}${x.hotel ? '\n🛏 ' + esc(x.hotel) : ''}`);
      }
      await send(d.tg_chat_id, parts.join('\n\n'));
      out.evening++;
    }

    // 3) dispatcher digest: what is missing, what is coming
    if (await once(db, `dig:${now.date}`)) {
      const week = addDays(now.date, 7);
      const lines = [`<b>📋 Gza Dispatch · ${now.date}</b>`];
      const add = (title, arr) => { if (arr.length) lines.push('', `<b>${title}</b>`, ...arr.slice(0, 15), arr.length > 15 ? `… +${arr.length - 15}` : ''); };

      add('⚠️ Without driver / მძღოლის გარეშე', [
        ...D.orders.filter((o) => live(o) && !o.driver_id && o.date >= now.date && o.date <= week).map((o) => `• ${o.date} ${o.time} ${esc(o.pickup)} → ${esc(o.dropoff)}`),
        ...D.tours.filter((t) => t.status !== 'cancelled' && t.date_to >= now.date && t.date_from <= week).flatMap((t) => {
          const miss = D.tour_days.filter((x) => x.tour_id === t.id && !x.driver_id && x.date >= now.date);
          return miss.length ? [`• 🚐 ${esc(t.name)}: ${miss.map((x) => x.date.slice(5)).join(', ')}`] : [];
        }),
      ]);
      add('🚗 Without car / ავტომობილის გარეშე', D.orders.filter((o) => live(o) && o.driver_id && !o.vehicle_id && o.date >= now.date && o.date <= week).map((o) => `• ${o.date} ${o.time} ${esc(o.pickup)}`));
      add('📝 Unfinished tours / შეუვსებელი ტურები', D.tours.filter((t) => t.status !== 'cancelled' && t.date_to >= now.date).flatMap((t) => {
        const ds = D.tour_days.filter((x) => x.tour_id === t.id);
        const why = [];
        const len = daysUntil(t.date_to, t.date_from) + 1;
        if (ds.length < len) why.push(`days ${ds.length}/${len}`);
        if (ds.some((x) => !x.to_place)) why.push('route');
        if (ds.some((x) => !x.vehicle_id)) why.push('car');
        if (!(Number(t.price) > 0)) why.push('price');
        return why.length ? [`• ${t.date_from} ${esc(t.name)}: ${why.join(', ')}`] : [];
      }));
      add('⏳ Not answered yet / პასუხის მოლოდინში', [
        ...D.orders.filter((o) => live(o) && o.accept === 'pending' && o.date >= now.date).map((o) => `• ${o.date} ${o.time} · ${esc(prof(o.driver_id)?.name || '')}`),
        ...[...new Set(D.tour_days.filter((x) => x.accept === 'pending' && x.date >= now.date).map((x) => x.tour_id + '|' + x.driver_id))].map((k) => {
          const [tid, did] = k.split('|'); const t = D.tours.find((x) => x.id === tid);
          return `• 🚐 ${esc(t?.name || '')} · ${esc(prof(did)?.name || '')}`;
        }),
      ]);
      add('🗓 Tours starting in 3 days / ტურები 3 დღეში', D.tours.filter((t) => t.status !== 'cancelled' && t.date_from >= now.date && t.date_from <= addDays(now.date, 3)).map((t) => `• ${t.date_from} ${esc(t.name)} (${t.group_size} pax)`));
      const docs = [];
      for (const v of D.vehicles.filter((x) => x.active)) {
        for (const [k, label] of [['insurance_until', 'insurance'], ['inspection_until', 'inspection']]) {
          const n = daysUntil(v[k], now.date);
          if (n !== null && n <= 14) docs.push(`• ${esc(v.plate)} ${label}: ${v[k]}${n < 0 ? ' ❗' : ''}`);
        }
        const oil = oilStatus(v);
        if (oil.known && (oil.due || oil.soon)) docs.push(`• ${esc(v.plate)} oil: ${oil.left} km${oil.due ? ' ❗' : ''}`);
      }
      for (const p of D.profiles.filter((x) => x.role === 'driver')) {
        const n = daysUntil(p.license_until, now.date);
        if (n !== null && n <= 30) docs.push(`• ${esc(p.name)} license: ${p.license_until}${n < 0 ? ' ❗' : ''}`);
      }
      add('🔧 Cars and documents / ავტომობილები და საბუთები', docs);
      const pend = D.profiles.filter((p) => p.role === 'pending');
      add('👤 New sign-ups / ახალი რეგისტრაცია', pend.map((p) => `• ${esc(p.name)} ${esc(p.phone)}`));
      if (lines.length > 1) await notifyStaff(db, lines.filter((x) => x !== '').join('\n'));
      out.digest = true;
    }
  }

  // 4) monthly report to Google Drive (1st of the month, after 09:00)
  if (now.day === 1 && now.hour >= 9 && S.gas_url) {
    const month = prevMonth(now.date.slice(0, 7));
    if (await once(db, `rep:${month}`)) {
      const r = await gas(S, { action: 'report', ...buildReport(month, D) });
      out.report = r.ok ? r.url : r.error;
      if (r.ok) await notifyStaff(db, `📊 Report ${month}: ${r.url}`);
    }
  }

  return json(res, 200, { ok: true, at: `${now.date} ${now.time}`, ...out });
}
