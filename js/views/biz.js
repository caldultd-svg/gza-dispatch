// Business: clients, price list, reports, settings
import { t } from '../i18n.js';
import { S, list, get, save, remove, saveSettings, api } from '../store.js';
import { esc, toast, errText, modal, armDelete, formHtml, readForm, todayStr, money, gel, downloadCSV, copy, num } from '../ui.js';
import { opt, CURS, CLASSES, CTYPES, TYPES, pname } from '../common.js';
import { orderCosts, tourCosts, round2 } from '../calc.js';
import { tgLink } from './team.js';
import { openOrder, openTour } from './ops.js';
import { BOT_USERNAME } from '../config.js';

// =====================================================================
// Clients
// =====================================================================
export const clients = {
  render() {
    const stat = {};
    for (const o of [...list('orders'), ...list('tours')]) {
      if (o.status === 'cancelled') continue;
      const k = o.client_id || (o.client_name || '').toLowerCase();
      if (!k) continue;
      stat[k] = stat[k] || { n: 0, g: 0, unpaid: 0 };
      stat[k].n++; stat[k].g += gel(o.price, o.currency);
      if (!o.paid) stat[k].unpaid += gel(o.price, o.currency);
    }
    const cs = list('clients').sort((a, b) => a.name.localeCompare(b.name));
    return `<div class="vhead"><h1>${esc(t('v_clients'))}</h1><span class="muted">${cs.length}</span><div class="grow"></div><button class="btn primary" data-add>＋ ${esc(t('add_client'))}</button></div>
      <div class="tbl"><table><thead><tr><th>${esc(t('name'))}</th><th>${esc(t('ctype'))}</th><th>${esc(t('contact_name'))}</th><th>${esc(t('phone'))}</th><th>${esc(t('email'))}</th><th class="num">${esc(t('trips'))}</th><th class="num">${esc(t('revenue'))}</th><th class="num">${esc(t('unpaid'))}</th></tr></thead><tbody>
      ${cs.map((c) => { const s = stat[c.id] || stat[c.name.toLowerCase()] || { n: 0, g: 0, unpaid: 0 }; return `<tr class="click" data-c="${esc(c.id)}"><td><b>${esc(c.name)}</b>${c.notes ? `<br><span class="muted small">${esc(c.notes)}</span>` : ''}</td><td>${esc(t('ct_' + c.ctype))}</td><td>${esc(c.contact_name)}</td><td class="mono">${esc(c.phone)}</td><td>${esc(c.email)}</td><td class="num">${s.n}</td><td class="num">${money(s.g)}</td><td class="num ${s.unpaid ? 'warnc' : ''}">${s.unpaid ? money(s.unpaid) : '—'}</td></tr>`; }).join('') || `<tr><td colspan="8" class="empty">—</td></tr>`}
      </tbody></table></div>`;
  },
  bind(root) {
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) return openClient(null);
      const r = e.target.closest('[data-c]'); if (r) openClient(r.dataset.c);
    });
  },
};
function openClient(id) {
  const c = id ? get('clients', id) : null;
  const fields = [{ k: 'name', wide: true }, { k: 'ctype', type: 'select', options: opt(CTYPES, 'ct_') }, { k: 'contact_name' }, { k: 'phone', type: 'tel' }, { k: 'email', type: 'email' }, { k: 'notes', type: 'textarea', wide: true }];
  modal({
    title: c ? c.name : t('add_client'), narrow: true, body: formHtml(fields, c || { ctype: 'hotel' }),
    footer: `${c ? `<button class="btn danger" data-del>${esc(t('delete'))}</button>` : ''}<span class="grow"></span><button class="btn" data-close>${esc(t('cancel'))}</button><button class="btn primary" data-save>${esc(t('save'))}</button>`,
    onMount(el, close) {
      const del = el.querySelector('[data-del]'); if (del) armDelete(del, async () => { await remove('clients', c.id); close(); });
      el.querySelector('[data-save]').addEventListener('click', async () => {
        const v = await readForm(el, fields); if (!v.name) return;
        try { await save('clients', { ...v, id: c?.id }); toast(t('saved')); close(); } catch (er) { toast(errText(er)); }
      });
    },
  });
}

// =====================================================================
// Price list
// =====================================================================
export const tariffs = {
  render() {
    const rows = list('tariffs').sort((a, b) => (a.name || a.from_place).localeCompare(b.name || b.from_place));
    return `<div class="vhead"><h1>${esc(t('v_tariffs'))}</h1><div class="grow"></div><button class="btn primary" data-add>＋ ${esc(t('add_tariff'))}</button></div>
      <p class="muted small">${esc(t('tariffs_hint'))}</p>
      <div class="tbl"><table><thead><tr><th>${esc(t('name'))}</th><th>${esc(t('route'))}</th><th>${esc(t('vclass'))}</th><th class="num">${esc(t('duration_min'))}</th><th class="num">${esc(t('price'))}</th></tr></thead><tbody>
      ${rows.map((x) => `<tr class="click" data-tr="${esc(x.id)}"><td><b>${esc(x.name)}</b></td><td>${esc(x.from_place)} → ${esc(x.to_place)}</td><td>${esc(t('c_' + x.vclass))}</td><td class="num">${esc(x.duration)}</td><td class="num">${money(x.price, x.currency)}</td></tr>`).join('') || `<tr><td colspan="5" class="empty">—</td></tr>`}
      </tbody></table></div>`;
  },
  bind(root) {
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) return openTariff(null);
      const r = e.target.closest('[data-tr]'); if (r) openTariff(r.dataset.tr);
    });
  },
};
function openTariff(id) {
  const x = id ? get('tariffs', id) : null;
  const fields = [{ k: 'name', wide: true }, { k: 'from_place' }, { k: 'to_place' }, { k: 'vclass', type: 'select', options: opt(CLASSES, 'c_') }, { k: 'duration', type: 'int', label: 'duration_min' }, { k: 'price', type: 'number' }, { k: 'currency', type: 'select', options: opt(CURS) }, { k: 'notes', wide: true }];
  modal({
    title: x ? x.name : t('add_tariff'), narrow: true, body: formHtml(fields, x || { vclass: 'sedan', duration: 60, currency: 'GEL' }),
    footer: `${x ? `<button class="btn danger" data-del>${esc(t('delete'))}</button>` : ''}<span class="grow"></span><button class="btn primary" data-save>${esc(t('save'))}</button>`,
    onMount(el, close) {
      const del = el.querySelector('[data-del]'); if (del) armDelete(del, async () => { await remove('tariffs', x.id); close(); });
      el.querySelector('[data-save]').addEventListener('click', async () => {
        const v = await readForm(el, fields);
        if (!v.name) v.name = `${v.from_place} → ${v.to_place}`;
        try { await save('tariffs', { ...v, id: x?.id }); toast(t('saved')); close(); } catch (er) { toast(errText(er)); }
      });
    },
  });
}

// =====================================================================
// Reports
// =====================================================================
let repMonth = todayStr().slice(0, 7);
export const reports = {
  render() {
    const inM = (d) => (d || '').slice(0, 7) === repMonth;
    const fuel = list('fuel'), exps = list('expenses');
    const doneO = list('orders').filter((o) => o.status === 'done' && inM(o.date));
    const doneT = list('tours').filter((x) => x.status === 'done' && inM(x.date_to));
    const revO = doneO.reduce((s, o) => s + gel(o.price, o.currency), 0);
    const revT = doneT.reduce((s, x) => s + gel(x.price, x.currency), 0);
    const costO = doneO.reduce((s, o) => s + orderCosts(o, fuel, exps, S.settings).total, 0);
    const costT = doneT.reduce((s, x) => s + tourCosts(x, list('tour_days').filter((d) => d.tour_id === x.id), fuel, exps, S.settings).total, 0);
    const otherFuel = fuel.filter((f) => inM(f.at) && !f.order_id && !f.tour_id).reduce((s, f) => s + gel(f.total, f.currency), 0);
    const otherExp = exps.filter((x) => inM(x.at) && !x.order_id && !x.tour_id && x.paid_by !== 'client' && !x.deduct).reduce((s, x) => s + gel(x.amount, x.currency), 0);
    const service = list('service_log').filter((x) => inM(x.at)).reduce((s, x) => s + gel(x.cost, x.currency), 0);
    const salaries = list('profiles').filter((p) => p.role === 'driver').reduce((s, p) => s + num(p.pay_monthly), 0);
    const revenue = revO + revT;
    const costs = costO + costT + otherFuel + otherExp + service + salaries;
    const byType = {};
    for (const o of doneO) { byType[o.type] = byType[o.type] || { n: 0, g: 0 }; byType[o.type].n++; byType[o.type].g += gel(o.price, o.currency); }
    if (doneT.length) byType.tour = { n: doneT.length, g: revT };
    const byClient = {};
    for (const o of [...doneO, ...doneT]) { const k = o.client_name || '—'; byClient[k] = byClient[k] || { n: 0, g: 0 }; byClient[k].n++; byClient[k].g += gel(o.price, o.currency); }
    const byDriver = {};
    for (const o of doneO) { const k = o.driver_id || '_'; byDriver[k] = byDriver[k] || { n: 0, g: 0 }; byDriver[k].n++; byDriver[k].g += gel(o.price, o.currency); }
    const today = todayStr();
    const unpaid = [...list('orders').filter((o) => o.status !== 'cancelled' && !o.paid && num(o.price) > 0 && o.date <= today).map((o) => ({ ...o, _k: 'o', _d: o.date })), ...list('tours').filter((x) => x.status !== 'cancelled' && !x.paid && num(x.price) > 0 && x.date_from <= today).map((x) => ({ ...x, _k: 't', _d: x.date_from }))].sort((a, b) => a._d.localeCompare(b._d));
    const bars = (obj, label) => { const arr = Object.entries(obj).sort((a, b) => b[1].g - a[1].g).slice(0, 12); const mx = Math.max(1, ...arr.map((a) => a[1].g)); return arr.map(([k, v]) => `<div class="brow"><span>${esc(label(k))} <span class="muted">· ${v.n}</span></span><span class="mono">${money(v.g)}</span><div class="bar"><i style="width:${(v.g / mx * 100).toFixed(1)}%"></i></div></div>`).join('') || '<p class="muted">—</p>'; };
    return `<div class="vhead"><h1>${esc(t('v_reports'))}</h1><div class="grow"></div><input type="month" id="repMonth" value="${esc(repMonth)}">
        <button class="btn" data-csv>CSV</button>${S.settings.gas_url ? `<button class="btn primary" data-drive>📊 ${esc(t('save_to_drive'))}</button>` : `<button class="btn" data-view="settings">${esc(t('connect_google'))}</button>`}</div>
      <div class="kpis">
        <div class="kpi"><small>${esc(t('revenue'))}</small><b>${money(revenue)}</b></div>
        <div class="kpi"><small>${esc(t('costs'))}</small><b>${money(costs)}</b></div>
        <div class="kpi"><small>${esc(t('profit'))}</small><b class="${revenue - costs < 0 ? 'badc' : 'goodc'}">${money(revenue - costs)}</b></div>
        <div class="kpi"><small>${esc(t('transfers'))}</small><b>${doneO.length}</b></div>
        <div class="kpi"><small>${esc(t('v_tours'))}</small><b>${doneT.length}</b></div>
        <div class="kpi"><small>${esc(t('unpaid'))}</small><b class="${unpaid.length ? 'warnc' : ''}">${money(unpaid.reduce((s, x) => s + gel(x.price, x.currency), 0))}</b></div>
      </div>
      <div class="grid2">
        <section class="panel"><h2>${esc(t('cost_breakdown'))}</h2>
          ${[[t('transfers'), costO], [t('v_tours'), costT], [t('fuel_unlinked'), otherFuel], [t('expenses_unlinked'), otherExp], [t('service'), service], [t('salaries'), salaries]].map(([l, v]) => `<div class="brow"><span>${esc(l)}</span><span class="mono">${money(v)}</span><div class="bar"><i style="width:${(v / (costs || 1) * 100).toFixed(1)}%"></i></div></div>`).join('')}</section>
        <section class="panel"><h2>${esc(t('by_type'))}</h2>${bars(byType, (k) => t('t_' + k))}</section>
        <section class="panel"><h2>${esc(t('by_client'))}</h2>${bars(byClient, (k) => k)}</section>
        <section class="panel"><h2>${esc(t('by_driver'))}</h2>${bars(byDriver, (k) => (k === '_' ? t('unassigned') : pname(k)))}</section>
        <section class="panel"><h2>${esc(t('unpaid_list'))} <span class="muted mono">${unpaid.length}</span></h2>${unpaid.slice(0, 40).map((x) => `<div class="brow" style="cursor:pointer" data-open="${x._k}:${esc(x.id)}"><span><span class="mono">${esc(x._d)}</span> · ${x._k === 't' ? '🚐 ' + esc(x.name) : esc(x.pickup)} · ${esc(x.client_name)}</span><span class="mono warnc">${money(x.price, x.currency)}</span></div>`).join('') || '<p class="muted">—</p>'}</section>
      </div>
      <p class="muted small">${esc(t('report_hint'))}</p>`;
  },
  bind(root) {
    root.addEventListener('change', (e) => { if (e.target.id === 'repMonth') { repMonth = e.target.value || repMonth; window.gzaGo('reports'); } });
    root.addEventListener('click', async (e) => {
      const o = e.target.closest('[data-open]');
      if (o) { const [k, id] = o.dataset.open.split(':'); return k === 't' ? openTour(id) : openOrder(id); }
      if (e.target.closest('[data-csv]')) {
        const inM = (d) => (d || '').slice(0, 7) === repMonth;
        return downloadCSV(`report-${repMonth}.csv`, [['kind', 'date', 'name', 'client', 'driver', 'status', 'price', 'currency', 'price_gel', 'paid'],
          ...list('orders').filter((x) => inM(x.date) && x.status !== 'cancelled').map((x) => ['transfer', x.date + ' ' + x.time, `${x.pickup} → ${x.dropoff}`, x.client_name, pname(x.driver_id), x.status, x.price, x.currency, round2(gel(x.price, x.currency)), x.paid]),
          ...list('tours').filter((x) => inM(x.date_from) && x.status !== 'cancelled').map((x) => ['tour', x.date_from + ' → ' + x.date_to, x.name, x.client_name, '', x.status, x.price, x.currency, round2(gel(x.price, x.currency)), x.paid])]);
      }
      const d = e.target.closest('[data-drive]');
      if (d) {
        d.disabled = true;
        try { const r = await api('google', { action: 'report', month: repMonth }); if (r.ok) { toast(t('report_saved'), 5000); if (r.url) window.open(r.url, '_blank'); } else toast(r.error || t('err_save')); }
        catch (er) { toast(errText(er)); }
        d.disabled = false;
      }
    });
  },
};

// =====================================================================
// Settings
// =====================================================================
export const settings = {
  render() {
    const s = S.settings;
    const me = S.me;
    return `<div class="vhead"><h1>${esc(t('v_settings'))}</h1></div>
      <div class="grid2">
        <section class="panel"><h2>${esc(t('company'))}</h2><div class="fgrid">
          <label class="f wide"><span>${esc(t('company_name'))}</span><input id="s_company" value="${esc(s.company || '')}" placeholder="Gza Dispatch"></label>
          <label class="f"><span>1 USD = GEL</span><input id="s_usd" inputmode="decimal" value="${esc(s.usd ?? 2.7)}"></label>
          <label class="f"><span>1 EUR = GEL</span><input id="s_eur" inputmode="decimal" value="${esc(s.eur ?? 3)}"></label>
          <label class="f"><span>${esc(t('def_cur'))}</span><select id="s_cur">${CURS.map((c) => `<option ${s.def_cur === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
          <label class="f"><span>${esc(t('digest_hour'))}</span><input id="s_hour" inputmode="numeric" value="${esc(s.digest_hour ?? 19)}"></label>
        </div><div class="row" style="margin-top:14px"><button class="btn primary" data-save-co>${esc(t('save'))}</button></div></section>

        <section class="panel"><h2>Telegram</h2>
          <p class="small">${esc(t('tg_staff_hint'))}</p>
          <p>${me.tg_chat_id ? `<b class="goodc">✓ ${esc(t('connected'))}</b>` : `<b class="warnc">${esc(t('not_connected'))}</b>`}</p>
          <div class="row"><a class="btn primary" href="${esc(tgLink(me))}" target="_blank" rel="noopener">${esc(t('connect_telegram'))}</a><a class="btn" href="/api/setup" target="_blank" rel="noopener">${esc(t('check_bot'))}</a></div>
          <p class="small muted">@${esc(BOT_USERNAME)}</p></section>

        <section class="panel"><h2>Google</h2>
          <p class="small">${esc(t('google_hint'))}</p>
          <div class="fgrid">
            <label class="f wide"><span>${esc(t('gas_url'))}</span><input id="s_gas" value="${esc(s.gas_url || '')}" placeholder="https://script.google.com/macros/s/…/exec"></label>
            <label class="f wide"><span>${esc(t('gas_secret'))}</span><input id="s_gsec" value="${esc(s.gas_secret || '')}"></label>
          </div>
          <div class="row" style="margin-top:14px"><button class="btn primary" data-save-g>${esc(t('save'))}</button><button class="btn" data-test-g ${s.gas_url ? '' : 'disabled'}>${esc(t('test'))}</button><button class="btn" data-sync-g ${s.gas_url ? '' : 'disabled'}>↻ ${esc(t('sync_google'))}</button></div></section>

        <section class="panel"><h2>${esc(t('install_title'))}</h2>
          <p class="small">${esc(t('install_ios'))}</p><p class="small">${esc(t('install_android'))}</p>
          <div class="row"><button class="btn" data-copy-url>🔗 ${esc(t('copy_app_link'))}</button></div></section>
      </div>`;
  },
  bind(root) {
    root.addEventListener('click', async (e) => {
      const v = (id) => root.querySelector('#' + id).value.trim();
      if (e.target.closest('[data-save-co]')) {
        try { await saveSettings({ company: v('s_company'), usd: num(v('s_usd')) || 2.7, eur: num(v('s_eur')) || 3, def_cur: v('s_cur'), digest_hour: Math.min(23, Math.max(0, Math.round(num(v('s_hour')) || 19))) }); toast(t('saved')); } catch (er) { toast(errText(er)); }
      }
      if (e.target.closest('[data-save-g]')) {
        try { await saveSettings({ gas_url: v('s_gas'), gas_secret: v('s_gsec') }); toast(t('saved')); } catch (er) { toast(errText(er)); }
      }
      const tb = e.target.closest('[data-test-g]');
      if (tb) { tb.disabled = true; try { const r = await api('google', { action: 'test' }); toast(r.ok ? t('google_ok') + (r.calendar ? ' · ' + r.calendar : '') : (r.error || t('err_save')), 5000); } catch (er) { toast(errText(er)); } tb.disabled = false; }
      const sb2 = e.target.closest('[data-sync-g]');
      if (sb2) { sb2.disabled = true; try { const r = await api('google', { action: 'syncAll' }); toast(r.ok ? `${t('synced')} (${r.count ?? 0})` : (r.error || t('err_save')), 5000); } catch (er) { toast(errText(er)); } sb2.disabled = false; }
      if (e.target.closest('[data-copy-url]')) copy(location.origin);
    });
  },
};
