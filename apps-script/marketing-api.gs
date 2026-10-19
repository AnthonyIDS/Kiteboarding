/**
 * Kiteboarding St. Petersburg: marketing dashboard API (marketing-api.gs)
 *
 * Lives in the marketing spreadsheet ("2025/ 26 KSP - Marketing") and serves
 * its tabs to marketing.html as JSON. It is a separate Apps Script project
 * from the team dashboard's dashboard-api.gs, with its own URL and key.
 *
 * It only reads the marketing tabs. The one thing it writes is the
 * "Completed" switch on content calendar rows, which it saves on its own
 * tab, "Marketing Completed", created the first time someone flips one.
 *
 * GET <exec url>?key=MARKETING_KEY returns
 *   { ok, updated, file, sheets: [tab names],
 *     analytics: { tab, headers, rows } | { tab, error },
 *     content:   { tab, headers, rows } | { tab, error },
 *     goals:     { tab, headers, rows } | { tab, error },
 *     done: { <row id>: { done, updated, by } } }
 * GET ...&action=mark&id=...&item=...&done=yes|no[&by=...]
 *   saves one Completed switch and returns { ok, id, record }
 *
 * Apart from doGet, checkMarketing and the settings below, every global here
 * starts with "mkt" or "MKT_" so nothing collides with other scripts.
 */

// ---- Settings --------------------------------------------------------------

/** Access key for the marketing dashboard. Set it, and change it when someone leaves. */
const MARKETING_KEY = '';

/**
 * ID of the marketing spreadsheet: the long part of its URL between /d/ and
 * /edit. Leave blank when this script is attached to that spreadsheet.
 */
const MARKETING_SHEET_ID = '';

/** Tab names. Each must match the tab at the bottom of the sheet. */
const ANALYTICS_TAB = 'Monthly Numbers';    // numbers: one row per month (and channel)
const CONTENT_TAB = 'Content Calendar';     // content calendar: one row per post
const GOALS_TAB = 'Goals';                  // optional: one row per month with targets

// ---- Internals -------------------------------------------------------------

const MKT_DONE_TAB = 'Marketing Completed';
const MKT_DONE_HEADERS = ['Row ID', 'Item', 'Completed', 'Updated', 'Updated By'];

function doGet(e) {
  try {
    if (!String(MARKETING_KEY).trim()) {
      return mktJson_({ ok: false, error: 'MARKETING_KEY is not set in marketing-api.gs' });
    }
    const p = (e && e.parameter) || {};
    if ((p.key || '') !== MARKETING_KEY) {
      return mktJson_({ ok: false, error: 'unauthorized' });
    }
    const ss = mktSpreadsheet_();
    const tz = ss.getSpreadsheetTimeZone();
    if (p.action === 'mark') {
      return mktJson_(mktMark_(ss, tz, p));
    }
    return mktJson_({
      ok: true,
      updated: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss"),
      file: ss.getName(),
      sheets: ss.getSheets().map(function (sh) { return sh.getName(); }),
      analytics: mktReadTab_(ss, ANALYTICS_TAB),
      content: mktReadTab_(ss, CONTENT_TAB),
      goals: mktReadTab_(ss, GOALS_TAB),
      done: mktReadDone_(ss)
    });
  } catch (err) {
    return mktJson_({ ok: false, error: String((err && err.message) || err) });
  }
}

/**
 * Run once from the editor (pick it in the toolbar, then Run). The first run
 * asks you to authorize access. The Execution log shows what the dashboard
 * will see in each tab.
 */
function checkMarketing() {
  const ss = mktSpreadsheet_();
  Logger.log('Spreadsheet: ' + ss.getName());
  Logger.log('Tabs: ' + ss.getSheets().map(function (sh) { return sh.getName(); }).join(', '));
  [['Analytics', ANALYTICS_TAB], ['Content calendar', CONTENT_TAB], ['Goals', GOALS_TAB]].forEach(function (t) {
    const r = mktReadTab_(ss, t[1]);
    Logger.log(t[0] + ' ("' + t[1] + '"): ' + (r.error ? r.error
      : r.rows.length + ' rows. Columns: ' + r.headers.join(', ')));
  });
  Logger.log(String(MARKETING_KEY).trim() ? 'Key is set.' : 'Reminder: set MARKETING_KEY before deploying.');
}

function mktSpreadsheet_() {
  const id = String(MARKETING_SHEET_ID).trim();
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      throw new Error('Could not open the spreadsheet in MARKETING_SHEET_ID. Check the ID, then run checkMarketing to grant access.');
    }
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Set MARKETING_SHEET_ID in marketing-api.gs');
  return ss;
}

/** One tab by name (spaces and capitals don't matter), or an error saying which tabs exist. */
function mktReadTab_(ss, name) {
  const want = String(name || '').trim();
  if (!want) return { tab: '', error: 'Not set.' };
  const squash = function (s) { return String(s).toLowerCase().replace(/\s+/g, ''); };
  const sheet = ss.getSheetByName(want) ||
    ss.getSheets().filter(function (sh) { return squash(sh.getName()) === squash(want); })[0];
  if (!sheet) return { tab: want, error: 'No "' + want + '" tab.' };
  const out = mktReadSheet_(sheet, ss.getSpreadsheetTimeZone());
  out.tab = sheet.getName();
  return out;
}

/**
 * Reads a tab generically. The header row is the first of the top 10 rows
 * that is at least half as full as the fullest, so a title row above the
 * headers is skipped. Blank rows are skipped too.
 */
function mktReadSheet_(sheet, tz) {
  const out = { headers: [], rows: [] };
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return out;

  const range = sheet.getRange(1, 1, lastRow, lastCol);
  const values = range.getValues();
  const display = range.getDisplayValues();

  const counts = display.slice(0, 10).map(function (r) {
    return r.filter(function (v) { return String(v).trim(); }).length;
  });
  const most = Math.max.apply(null, counts);
  let head = 0;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] >= Math.max(2, most / 2)) { head = i; break; }
  }

  // Columns with a header. Duplicate headers get " (2)", " (3)", ...
  const cols = [];
  const seen = {};
  display[head].forEach(function (h, i) {
    const base = String(h).trim();
    if (!base) return;
    let name = base;
    let n = 2;
    while (seen[name]) name = base + ' (' + n++ + ')';
    seen[name] = true;
    cols.push({ index: i, name: name });
  });
  out.headers = cols.map(function (c) { return c.name; });

  for (let r = head + 1; r < values.length; r++) {
    const row = values[r];
    const blank = cols.every(function (c) {
      const v = row[c.index];
      return v === null || v === '' || (typeof v === 'string' && v.trim() === '');
    });
    if (blank) continue;
    const obj = {};
    cols.forEach(function (c) {
      obj[c.name] = mktCell_(row[c.index], display[r][c.index], tz);
    });
    out.rows.push(obj);
  }
  return out;
}

/** Dates become yyyy-MM-dd; percents keep their % sign; text is trimmed. */
function mktCell_(value, displayValue, tz) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    const day = Utilities.formatDate(value, tz, 'yyyy-MM-dd');
    if (day === '1899-12-30' || day === '1899-12-29') return displayValue; // time-only cells
    return day;
  }
  if (typeof value === 'number' && /%\s*$/.test(displayValue)) return displayValue.trim();
  if (typeof value === 'string') return value.trim();
  return value;
}

// ---- "Completed" switches (the "Marketing Completed" tab) ------------------

/** { <row id>: { done: true|false|null, updated, by } } */
function mktReadDone_(ss) {
  const out = {};
  const sheet = ss.getSheetByName(MKT_DONE_TAB);
  if (!sheet || sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, MKT_DONE_HEADERS.length).getDisplayValues().forEach(function (r) {
    const id = String(r[0]).trim();
    if (id) out[id] = { done: mktYesNo_(r[2]), updated: r[3], by: r[4] };
  });
  return out;
}

/** Saves one row's Completed switch. */
function mktMark_(ss, tz, p) {
  const id = mktClean_(p.id, 300);
  if (!id) return { ok: false, error: 'Missing row id.' };
  const done = mktYesNo_(p.done);
  if (done === null) return { ok: false, error: 'Nothing to save.' };
  const by = mktClean_(p.by, 60);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let sheet = ss.getSheetByName(MKT_DONE_TAB);
    if (!sheet) {
      sheet = ss.insertSheet(MKT_DONE_TAB);
      sheet.getRange(1, 1, 1, MKT_DONE_HEADERS.length).setValues([MKT_DONE_HEADERS]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(2, 320);
    }
    const last = sheet.getLastRow();
    const ids = last > 1 ? sheet.getRange(2, 1, last - 1, 1).getDisplayValues() : [];
    let rowNum = 0;
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === id) { rowNum = i + 2; break; }
    }
    const item = mktClean_(p.item, 200);
    const row = rowNum ? sheet.getRange(rowNum, 1, 1, MKT_DONE_HEADERS.length).getDisplayValues()[0] : [id, '', '', '', ''];
    if (item) row[1] = item;
    row[2] = done ? 'Yes' : 'No';
    row[3] = new Date();
    row[4] = by;
    const target = sheet.getRange(rowNum || last + 1, 1, 1, MKT_DONE_HEADERS.length);
    target.setValues([row.map(function (v) { return v instanceof Date ? v : mktText_(v); })]);
    target.getCell(1, 4).setNumberFormat('mmm d, h:mm am/pm');
    const stamp = Utilities.formatDate(new Date(), tz, 'MMM d, h:mm a');
    return { ok: true, id: id, record: { done: done, updated: stamp, by: by } };
  } finally {
    lock.releaseLock();
  }
}

function mktYesNo_(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (s === 'yes' || s === 'true' || s === 'y') return true;
  if (s === 'no' || s === 'false' || s === 'n') return false;
  return null;
}

/** A leading ' keeps typed text like "=..." from becoming a formula. */
function mktText_(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function mktClean_(v, max) {
  return String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function mktJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
