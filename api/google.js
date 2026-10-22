// Google Calendar + Drive through the owner's Apps Script.
// actions: sync (one order/tour), syncAll (next 60 days), report (month → Google Sheet in Drive), test
import { admin, json, readBody, caller, isStaff, gas, loadAll, buildReport, orderEvent, tourEvent } from './_lib.js';
import { tbilisiNow, addDays } from '../js/calc.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
  const db = admin();
  const who = await caller(req, db);
  if (!who || !isStaff(who.profile)) return json(res, 403, { error: 'Only dispatchers' });
  const body = await readBody(req);
  const { data: S } = await db.from('settings').select('*').eq('id', 1).single();
  if (!S?.gas_url) return json(res, 200, { ok: false, error: 'not_connected' });

  if (body.action === 'test') return json(res, 200, await gas(S, { action: 'ping' }));

  if (body.action === 'sync') {
    const { kind, id, deleted } = body;
    const key = (kind === 'order' ? 'o_' : 't_') + id;
    if (deleted) return json(res, 200, await gas(S, { action: 'delete', id: key }));
    const D = await loadAll(db);
    const rec = (kind === 'order' ? D.orders : D.tours).find((x) => x.id === id);
    if (!rec || rec.status === 'cancelled') return json(res, 200, await gas(S, { action: 'delete', id: key }));
    return json(res, 200, await gas(S, { action: 'upsert', event: kind === 'order' ? orderEvent(rec, D) : tourEvent(rec, D) }));
  }

  if (body.action === 'syncAll') {
    const D = await loadAll(db);
    const now = tbilisiNow();
    const until = addDays(now.date, 60);
    const events = [
      ...D.orders.filter((o) => o.status !== 'cancelled' && o.date >= now.date && o.date <= until).map((o) => orderEvent(o, D)),
      ...D.tours.filter((t) => t.status !== 'cancelled' && t.date_to >= now.date && t.date_from <= until).map((t) => tourEvent(t, D)),
    ];
    return json(res, 200, await gas(S, { action: 'upsertMany', events }));
  }

  if (body.action === 'report') {
    const month = /^\d{4}-\d{2}$/.test(body.month || '') ? body.month : tbilisiNow().date.slice(0, 7);
    const D = await loadAll(db);
    return json(res, 200, await gas(S, { action: 'report', ...buildReport(month, D) }));
  }

  return json(res, 400, { error: 'unknown action' });
}
