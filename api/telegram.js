// Telegram webhook: account linking, accept/decline buttons, live location, /jobs
import { admin, json, readBody, tg, send, bt, esc, WEBHOOK_SECRET, notifyStaff, orderText } from './_lib.js';
import { tbilisiNow, addDays } from '../js/calc.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 200, { ok: true, hint: 'Telegram webhook' });
  if (!WEBHOOK_SECRET || req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) return json(res, 401, { ok: false });
  const u = await readBody(req);
  const db = admin();
  try {
    if (u.callback_query) await onButton(db, u.callback_query);
    else if (u.message) await onMessage(db, u.message, false);
    else if (u.edited_message) await onMessage(db, u.edited_message, true);
  } catch (e) {
    console.error(e);
  }
  return json(res, 200, { ok: true });
}

async function profileByChat(db, chatId) {
  const { data } = await db.from('profiles').select('*').eq('tg_chat_id', chatId).maybeSingle();
  return data;
}

async function onMessage(db, m, edited) {
  const chatId = m.chat?.id;
  if (!chatId) return;
  // location (single or live; live updates arrive as edited messages)
  if (m.location) {
    const p = await profileByChat(db, chatId);
    if (!p) { if (!edited) await send(chatId, bt('ka', 'not_linked')); return; }
    await db.from('profiles').update({ loc_lat: m.location.latitude, loc_lng: m.location.longitude, loc_at: new Date().toISOString(), loc_src: m.location.live_period ? 'telegram-live' : 'telegram' }).eq('id', p.id);
    if (!edited) await send(chatId, bt(p.lang, m.location.live_period ? 'loc_live' : 'loc_ok'));
    return;
  }
  if (edited) return;
  const text = (m.text || '').trim();
  if (text.startsWith('/start')) {
    const code = text.split(/\s+/)[1];
    if (!code) { await send(chatId, `${bt('ka', 'hello')}\n\n${bt('en', 'hello')}`); return; }
    const { data: p } = await db.from('profiles').select('id,name,lang').eq('tg_code', code).maybeSingle();
    if (!p) { await send(chatId, bt('ka', 'unknown_code')); return; }
    // one Telegram per profile: unlink this chat from any other profile first
    await db.from('profiles').update({ tg_chat_id: null }).eq('tg_chat_id', chatId);
    await db.from('profiles').update({ tg_chat_id: chatId }).eq('id', p.id);
    await send(chatId, bt(p.lang, 'linked') + esc(p.name));
    return;
  }
  if (text.startsWith('/jobs') || text.startsWith('/today')) {
    const p = await profileByChat(db, chatId);
    if (!p) { await send(chatId, bt('ka', 'not_linked')); return; }
    const now = tbilisiNow();
    const until = addDays(now.date, 2);
    const { data: orders } = await db.from('orders').select('*').eq('driver_id', p.id).gte('date', now.date).lte('date', until).neq('status', 'cancelled').neq('status', 'done').order('date').order('time');
    const { data: days } = await db.from('tour_days').select('*, tours(name,status)').eq('driver_id', p.id).gte('date', now.date).lte('date', until).order('date');
    const parts = [];
    for (const o of orders || []) parts.push(orderText(o, p.lang, `${o.date} ${o.time}`));
    for (const d of (days || []).filter((x) => x.tours && x.tours.status !== 'cancelled')) parts.push(`<b>${esc(d.date)} · ${esc(d.tours.name)}</b>\n${esc(d.from_place)} → ${esc(d.to_place)}${d.hotel ? '\n🛏 ' + esc(d.hotel) : ''}`);
    await send(chatId, parts.length ? `<b>${bt(p.lang, 'jobs')}</b>\n\n` + parts.join('\n\n') : bt(p.lang, 'no_jobs'));
    return;
  }
}

async function onButton(db, q) {
  const chatId = q.message?.chat?.id;
  const [act, k, id] = String(q.data || '').split('|');
  if (act === 'noop') { await tg('answerCallbackQuery', { callback_query_id: q.id }); return; }
  const p = await profileByChat(db, chatId);
  if (!p || !id) { await tg('answerCallbackQuery', { callback_query_id: q.id, text: bt('ka', 'not_linked') }); return; }
  const accept = act === 'a';
  let ok = false, label = '';
  if (k === 'o') {
    const { data: o } = await db.from('orders').select('*').eq('id', id).maybeSingle();
    if (o && o.driver_id === p.id && o.status !== 'cancelled') {
      const upd = accept ? { accept: 'accepted' } : { accept: 'declined', driver_id: null, vehicle_id: null, status: o.status === 'assigned' ? 'new' : o.status };
      await db.from('orders').update(upd).eq('id', id);
      ok = true;
      label = `${o.date} ${o.time} · ${o.pickup} → ${o.dropoff}`;
    }
  } else if (k === 't') {
    const { data: t } = await db.from('tours').select('*').eq('id', id).maybeSingle();
    const { data: mine } = await db.from('tour_days').select('id').eq('tour_id', id).eq('driver_id', p.id);
    if (t && mine && mine.length) {
      const upd = accept ? { accept: 'accepted' } : { accept: 'declined', driver_id: null };
      await db.from('tour_days').update(upd).eq('tour_id', id).eq('driver_id', p.id);
      ok = true;
      label = `${t.name} · ${t.date_from} → ${t.date_to} (${mine.length})`;
    }
  }
  const result = ok ? bt(p.lang, accept ? 'accepted' : 'declined') : bt(p.lang, 'cancelled');
  await tg('answerCallbackQuery', { callback_query_id: q.id, text: result });
  // keep the original text, replace buttons with the result
  await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text: result, callback_data: 'noop|x|x' }]] } });
  if (ok) await notifyStaff(db, `${accept ? '✅' : '❌'} <b>${esc(p.name)}</b> — ${accept ? 'accepted / მიიღო' : 'declined / უარი თქვა'}\n${esc(label)}`);
}
