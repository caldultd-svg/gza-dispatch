/**
 * Gza Dispatch — Google Calendar + Google Drive bridge.
 *
 * 1. Open https://script.google.com → New project → paste this whole file.
 * 2. Change SECRET below to any long word (the same word goes into the app → Settings → Google).
 * 3. Deploy → New deployment → type "Web app" → Execute as: Me → Who has access: Anyone → Deploy.
 *    Allow access when Google asks. Copy the "Web app URL" (ends with /exec) into the app.
 */
const SECRET = 'CHANGE-ME-to-a-long-secret-word';
const CALENDAR_NAME = 'Gza Dispatch';
const FOLDER_NAME = 'Gza Dispatch — reports';

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return out({ ok: false, error: 'bad json' }); }
  if (!body.secret || body.secret !== SECRET) return out({ ok: false, error: 'Wrong secret word' });
  try {
    switch (body.action) {
      case 'ping': return out({ ok: true, calendar: calendar().getName() });
      case 'upsert': upsert(body.event); return out({ ok: true, count: 1 });
      case 'upsertMany': (body.events || []).forEach(upsert); return out({ ok: true, count: (body.events || []).length });
      case 'delete': removeEvent(body.id); return out({ ok: true });
      case 'report': return out(report(body.title, body.sheets));
      default: return out({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}
function doGet() { return out({ ok: true, hint: 'Gza Dispatch bridge is running' }); }

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
const props = () => PropertiesService.getScriptProperties();

function calendar() {
  const id = props().getProperty('calendarId');
  if (id) { const c = CalendarApp.getCalendarById(id); if (c) return c; }
  const found = CalendarApp.getCalendarsByName(CALENDAR_NAME);
  const cal = found.length ? found[0] : CalendarApp.createCalendar(CALENDAR_NAME, { timeZone: 'Asia/Tbilisi' });
  props().setProperty('calendarId', cal.getId());
  return cal;
}

function ymd(s) { const p = String(s).slice(0, 10).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }

function upsert(ev) {
  if (!ev || !ev.id) return;
  const cal = calendar();
  const key = 'ev_' + ev.id;
  const old = props().getProperty(key);
  if (old) { try { const o = cal.getEventById(old); if (o) o.deleteEvent(); } catch (err) {} }
  let created;
  const opts = { location: ev.location || '', description: ev.description || '' };
  if (ev.allDay) {
    const end = ymd(ev.end); end.setDate(end.getDate() + 1); // Google's end date is exclusive
    created = cal.createAllDayEvent(ev.title, ymd(ev.start), end, opts);
  } else {
    created = cal.createEvent(ev.title, new Date(ev.start), new Date(ev.end), opts);
  }
  props().setProperty(key, created.getId());
}

function removeEvent(id) {
  const key = 'ev_' + id;
  const old = props().getProperty(key);
  if (!old) return;
  try { const o = calendar().getEventById(old); if (o) o.deleteEvent(); } catch (err) {}
  props().deleteProperty(key);
}

function folder() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function report(title, sheets) {
  const f = folder();
  const old = f.getFilesByName(title);
  while (old.hasNext()) old.next().setTrashed(true);
  const ss = SpreadsheetApp.create(title);
  const names = Object.keys(sheets || {});
  names.forEach(function (name, i) {
    const rows = sheets[name] || [];
    const sh = i === 0 ? ss.getSheets()[0].setName(name) : ss.insertSheet(name);
    if (!rows.length) return;
    const width = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    const data = rows.map(function (r) { const x = r.slice(); while (x.length < width) x.push(''); return x; });
    sh.getRange(1, 1, data.length, width).setValues(data);
    sh.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#18221E').setFontColor('#F0B53D');
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, width);
  });
  const file = DriveApp.getFileById(ss.getId());
  f.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  return { ok: true, url: ss.getUrl() };
}
