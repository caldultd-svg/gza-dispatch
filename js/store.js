// Data layer: Supabase client, in-memory store for staff, live updates, server calls
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const TABLES = ['profiles', 'vehicles', 'clients', 'tariffs', 'orders', 'tours', 'tour_days', 'fuel', 'expenses', 'odometer', 'inspections', 'days_off', 'service_log', 'advances'];

export const S = { me: null, settings: {}, jobs: { orders: [], tours: [] } };
for (const t of TABLES) S[t] = new Map();

let onChange = () => {};
export function setOnChange(fn) { onChange = fn; }
let timer;
function changed() { clearTimeout(timer); timer = setTimeout(() => onChange(), 120); }

export const list = (t) => [...S[t].values()];
export const get = (t, id) => (id ? S[t].get(id) : undefined);

export async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { S.me = null; return null; }
  const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  S.me = data || null;
  return S.me;
}

export const isStaff = () => S.me && (S.me.role === 'owner' || S.me.role === 'dispatcher');

function since(days) { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); }

async function fetchAll(table, build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select('*');
    if (build) q = build(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export async function loadStaff() {
  const old = since(400);
  const filters = {
    orders: (q) => q.gte('date', old),
    tours: (q) => q.gte('date_to', old),
    tour_days: (q) => q.gte('date', old),
    fuel: (q) => q.gte('at', old),
    expenses: (q) => q.gte('at', old),
    odometer: (q) => q.gte('at', old),
    inspections: (q) => q.gte('at', old),
  };
  await Promise.all(TABLES.map(async (t) => {
    const rows = await fetchAll(t, filters[t]);
    S[t] = new Map(rows.map((r) => [r.id, r]));
  }));
  const { data: s } = await sb.from('settings').select('*').eq('id', 1).maybeSingle();
  S.settings = s || {};
}

export async function loadDriver() {
  const [{ data: jobs }, vehicles, fuel, expenses, odometer, days_off, advances, inspections, info] = await Promise.all([
    sb.rpc('my_jobs'),
    fetchAll('vehicles'),
    fetchAll('fuel', (q) => q.gte('at', since(120)).order('at', { ascending: false })),
    fetchAll('expenses', (q) => q.gte('at', since(120)).order('at', { ascending: false })),
    fetchAll('odometer', (q) => q.gte('at', since(120)).order('at', { ascending: false })),
    fetchAll('days_off'),
    fetchAll('advances', (q) => q.gte('at', since(120))),
    fetchAll('inspections', (q) => q.gte('at', since(60))),
    sb.rpc('app_info'),
  ]);
  S.jobs = jobs || { orders: [], tours: [] };
  S.vehicles = new Map(vehicles.map((r) => [r.id, r]));
  S.fuel = new Map(fuel.map((r) => [r.id, r]));
  S.expenses = new Map(expenses.map((r) => [r.id, r]));
  S.odometer = new Map(odometer.map((r) => [r.id, r]));
  S.days_off = new Map(days_off.map((r) => [r.id, r]));
  S.advances = new Map(advances.map((r) => [r.id, r]));
  S.inspections = new Map(inspections.map((r) => [r.id, r]));
  S.settings = info.data || {};
}

export async function refreshJobs() {
  const { data } = await sb.rpc('my_jobs');
  if (data) { S.jobs = data; changed(); }
}

let channel;
export function subscribeStaff() {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('gza-live');
  for (const t of [...TABLES, 'settings']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, (p) => {
      if (t === 'settings') { if (p.new) S.settings = p.new; changed(); return; }
      if (p.eventType === 'DELETE') S[t].delete(p.old.id);
      else S[t].set(p.new.id, p.new);
      if (t === 'profiles' && p.new && S.me && p.new.id === S.me.id) S.me = p.new;
      changed();
    });
  }
  channel.subscribe();
}
export function subscribeDriver() {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('gza-driver');
  for (const t of ['fuel', 'expenses', 'odometer', 'days_off', 'advances', 'profiles', 'vehicles']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, (p) => {
      if (t === 'profiles') { if (p.new && S.me && p.new.id === S.me.id) S.me = p.new; changed(); return; }
      if (p.eventType === 'DELETE') S[t].delete(p.old.id); else S[t].set(p.new.id, p.new);
      changed();
    });
  }
  channel.subscribe();
}

// ---------- writes ----------
export async function save(table, row) {
  const clean = { ...row };
  for (const k of Object.keys(clean)) if (clean[k] === undefined) delete clean[k];
  let res;
  if (clean.id) {
    const id = clean.id; delete clean.id;
    res = await sb.from(table).update(clean).eq('id', id).select().single();
  } else {
    res = await sb.from(table).insert(clean).select().single();
  }
  if (res.error) throw res.error;
  if (S[table] instanceof Map) S[table].set(res.data.id, res.data);
  changed();
  return res.data;
}
export async function remove(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) throw error;
  if (S[table] instanceof Map) S[table].delete(id);
  changed();
}
export async function saveSettings(patch) {
  const { data, error } = await sb.from('settings').update(patch).eq('id', 1).select().single();
  if (error) throw error;
  S.settings = data; changed();
}
export async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw error;
  return data;
}

// server routes on Vercel
export async function api(path, body) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch('/api/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (session?.access_token || '') },
    body: JSON.stringify(body || {}),
  });
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) throw new Error(j.error || 'Server error ' + r.status);
  return j;
}

// ---------- photos ----------
export async function compress(file, max = 1400, q = 0.72) {
  if (!file || !file.type.startsWith('image/')) return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((ok) => c.toBlob((b) => ok(b || file), 'image/jpeg', q));
}
export async function uploadPhoto(file, kind) {
  const blob = await compress(file);
  const path = `${S.me.id}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}
const urlCache = new Map();
export async function signedUrls(paths) {
  const need = [...new Set(paths.filter((p) => p && !(urlCache.has(p) && urlCache.get(p).exp > Date.now())))];
  if (need.length) {
    const { data } = await sb.storage.from('photos').createSignedUrls(need, 3600);
    for (const r of data || []) if (r.signedUrl) urlCache.set(r.path, { url: r.signedUrl, exp: Date.now() + 3500e3 });
  }
  const out = {};
  for (const p of paths) if (urlCache.has(p)) out[p] = urlCache.get(p).url;
  return out;
}
