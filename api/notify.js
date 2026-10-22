// Called by the app: send requests to drivers, tell drivers about cancellations, tell staff about answers
import { admin, json, readBody, caller, isStaff, sendRequest, send, bt, esc, notifyStaff } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
  const db = admin();
  const who = await caller(req, db);
  if (!who) return json(res, 401, { error: 'Sign in again' });
  const body = await readBody(req);
  const { event, kind, id } = body;
  if (!['order', 'tour'].includes(kind) || !id) return json(res, 400, { error: 'bad request' });

  // driver answered inside the app → tell the dispatchers
  if (event === 'response') {
    const accept = !!body.accept;
    const label = kind === 'order'
      ? await db.from('orders').select('date,time,pickup,dropoff').eq('id', id).maybeSingle().then((r) => r.data && `${r.data.date} ${r.data.time} · ${r.data.pickup} → ${r.data.dropoff}`)
      : await db.from('tours').select('name,date_from').eq('id', id).maybeSingle().then((r) => r.data && `${r.data.name} · ${r.data.date_from}`);
    await notifyStaff(db, `${accept ? '✅' : '❌'} <b>${esc(who.profile.name)}</b> — ${accept ? 'accepted / მიიღო' : 'declined / უარი თქვა'}\n${esc(label || '')}`);
    return json(res, 200, { ok: true });
  }

  if (!isStaff(who.profile)) return json(res, 403, { error: 'Only dispatchers can send requests' });

  if (event === 'assign') {
    const sent = [], noTelegram = [];
    if (kind === 'order') {
      const { data: o } = await db.from('orders').select('*').eq('id', id).single();
      if (!o?.driver_id || o.status === 'cancelled' || o.accept !== 'none') return json(res, 200, { sent, noTelegram });
      const { data: d } = await db.from('profiles').select('*').eq('id', o.driver_id).single();
      if (d?.tg_chat_id) {
        const r = await sendRequest(db, req, 'order', o, null, d);
        if (r.ok) { sent.push(d.name); await db.from('orders').update({ accept: 'pending' }).eq('id', id); }
        else noTelegram.push(d.name);
      } else if (d) noTelegram.push(d.name);
    } else {
      const { data: t } = await db.from('tours').select('*').eq('id', id).single();
      const { data: days } = await db.from('tour_days').select('*').eq('tour_id', id);
      if (!t || t.status === 'cancelled') return json(res, 200, { sent, noTelegram });
      const driverIds = [...new Set((days || []).filter((d) => d.driver_id && d.accept === 'none').map((d) => d.driver_id))];
      for (const did of driverIds) {
        const { data: d } = await db.from('profiles').select('*').eq('id', did).single();
        if (d?.tg_chat_id) {
          const r = await sendRequest(db, req, 'tour', t, days, d);
          if (r.ok) { sent.push(d.name); await db.from('tour_days').update({ accept: 'pending' }).eq('tour_id', id).eq('driver_id', did).eq('accept', 'none'); }
          else noTelegram.push(d.name);
        } else if (d) noTelegram.push(d.name);
      }
    }
    return json(res, 200, { sent, noTelegram });
  }

  if (event === 'cancelled') {
    const ids = Array.isArray(body.driver_ids) ? body.driver_ids : [];
    const text = String(body.text || '');
    for (const did of ids) {
      const { data: d } = await db.from('profiles').select('tg_chat_id,lang').eq('id', did).maybeSingle();
      if (d?.tg_chat_id) await send(d.tg_chat_id, `<b>${bt(d.lang, 'cancelled')}</b>\n${esc(text)}`);
    }
    return json(res, 200, { ok: true });
  }

  return json(res, 400, { error: 'unknown event' });
}
