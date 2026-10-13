/**
 * Kiteboarding St. Petersburg: team dashboard API (dashboard-api.gs)
 *
 * Serves the "Lesson Requests" tab of your Google Sheet to the GitHub
 * dashboard as JSON. It never changes the Lesson Requests tab, so the
 * website form that writes there keeps working.
 *
 * Team notes and the "Jetski Needed" switch are saved on a separate tab,
 * "Dashboard Notes", which the script creates the first time someone saves.
 * One row per student: Request ID, Student, Jetski Needed, Notes, Updated,
 * Updated By. Newest notes are at the top of the Notes cell.
 *
 * Apps Script files share one global scope. Apart from doGet,
 * checkDashboard and the settings below, every global here starts with
 * "dash" or "DASH_" so nothing collides with other scripts in the project.
 * Saving goes through doGet too, so a form's own doPost is never touched.
 *
 * GET <exec url>?key=DASHBOARD_KEY returns
 *   { ok, updated, lessons: { headers: [...], rows: [{ header: value }] },
 *     team: { <request id>: { jetski, notes, updated, by } } }
 * GET ...&action=save&id=...&student=...&by=...[&jetski=yes|no][&note=...]
 *   saves to Dashboard Notes and returns { ok, id, record }
 */

// ---- Settings --------------------------------------------------------------

/** Shared team access key. Set it, and rotate it when someone leaves. */
const DASHBOARD_KEY = '';

/**
 * ID of your spreadsheet: the long part of its URL between /d/ and /edit.
 * Leave blank to use the spreadsheet this script is attached to.
 */
const SHEET_ID = '';

// ---- Internals -------------------------------------------------------------

const DASH_LESSONS_TAB = 'Lesson Requests';
const DASH_NOTES_TAB = 'Dashboard Notes';
const DASH_NOTES_HEADERS = ['Request ID', 'Student', 'Jetski Needed', 'Notes', 'Updated', 'Updated By'];
const DASH_NOTE_MAX = 2000;     // longest single note
const DASH_CELL_MAX = 45000;    // Sheets cells hold 50,000 characters

function doGet(e) {
  try {
    if (!String(DASHBOARD_KEY).trim()) {
      return dashJson_({ ok: false, error: 'DASHBOARD_KEY is not set in dashboard-api.gs' });
    }
    const key = (e && e.parameter && e.parameter.key) || '';
    if (key !== DASHBOARD_KEY) {
      return dashJson_({ ok: false, error: 'unauthorized' });
    }

    const ss = dashSpreadsheet_();
    const tz = ss.getSpreadsheetTimeZone();
    if (e.parameter.action === 'save') {
      return dashJson_(dashSave_(ss, tz, e.parameter));
    }
    return dashJson_({
      ok: true,
      updated: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss"),
      lessons: dashReadLessons_(ss, tz),
      team: dashReadTeam_(ss)
    });
  } catch (err) {
    return dashJson_({ ok: false, error: String((err && err.message) || err) });
  }
}

/**
 * Run once from the editor (select it in the toolbar, then Run). The first
 * run asks you to authorize access. The Execution log shows what the
 * dashboard will see.
 */
function checkDashboard() {
  const ss = dashSpreadsheet_();
  const lessons = dashReadLessons_(ss, ss.getSpreadsheetTimeZone());
  Logger.log('Spreadsheet: ' + ss.getName());
  Logger.log('Lesson Requests: ' + (lessons.error ? 'ERROR: ' + lessons.error : lessons.rows.length + ' rows'));
  Logger.log(ss.getSheetByName(DASH_NOTES_TAB)
    ? DASH_NOTES_TAB + ': ' + Object.keys(dashReadTeam_(ss)).length + ' students with notes or a Jetski setting'
    : DASH_NOTES_TAB + ': not created yet. It appears the first time someone saves a note or flips Jetski Needed.');
  Logger.log(String(DASHBOARD_KEY).trim() ? 'Key is set.' : 'Reminder: set DASHBOARD_KEY before deploying.');
}

/** The spreadsheet set in SHEET_ID, or the one this script is attached to. */
function dashSpreadsheet_() {
  const id = String(SHEET_ID).trim();
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      throw new Error('Could not open the spreadsheet in SHEET_ID. Check the ID, then run checkDashboard to grant access.');
    }
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Set SHEET_ID in dashboard-api.gs');
  return ss;
}

function dashReadLessons_(ss, tz) {
  const sheet = ss.getSheetByName(DASH_LESSONS_TAB);
  if (!sheet) {
    return { headers: [], rows: [], error: 'No "' + DASH_LESSONS_TAB + '" tab in "' + ss.getName() + '". Check SHEET_ID in dashboard-api.gs' };
  }
  return dashReadSheet_(sheet, tz);
}

/** Reads a tab generically: the header row gives the keys, blank rows are skipped. */
function dashReadSheet_(sheet, tz) {
  const out = { headers: [], rows: [] };
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return out;

  const range = sheet.getRange(1, 1, lastRow, lastCol);
  const values = range.getValues();
  const display = range.getDisplayValues();

  // Columns with a header. Duplicate headers get " (2)", " (3)", ...
  const cols = [];
  const seen = {};
  values[0].forEach(function (h, i) {
    const base = String(h).trim();
    if (!base) return;
    let name = base;
    let n = 2;
    while (seen[name]) name = base + ' (' + n++ + ')';
    seen[name] = true;
    cols.push({ index: i, name: name });
  });
  out.headers = cols.map(function (c) { return c.name; });

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const blank = cols.every(function (c) {
      const v = row[c.index];
      return v === null || v === '' || (typeof v === 'string' && v.trim() === '');
    });
    if (blank) continue;
    const obj = {};
    cols.forEach(function (c) {
      obj[c.name] = dashCell_(row[c.index], display[r][c.index], tz);
    });
    out.rows.push(obj);
  }
  return out;
}

/** Dates become yyyy-MM-dd, or yyyy-MM-ddTHH:mm:ss when the cell has a time. */
function dashCell_(value, displayValue, tz) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    const day = Utilities.formatDate(value, tz, 'yyyy-MM-dd');
    // Time-only cells (e.g. "9:00 AM") sit on Sheets' 1899-12-30 epoch;
    // show them the way the sheet does instead of as a date.
    if (day === '1899-12-30' || day === '1899-12-29') return displayValue;
    const time = Utilities.formatDate(value, tz, 'HH:mm:ss');
    return time === '00:00:00' ? day : day + 'T' + time;
  }
  if (typeof value === 'string') return value.trim();
  return value;
}

// ---- Team notes and Jetski Needed (the "Dashboard Notes" tab) ------------

/** { <request id>: { jetski: true|false|null, notes, updated, by } } */
function dashReadTeam_(ss) {
  const out = {};
  const sheet = ss.getSheetByName(DASH_NOTES_TAB);
  if (!sheet || sheet.getLastRow() < 2) return out;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, DASH_NOTES_HEADERS.length).getDisplayValues();
  values.forEach(function (r) {
    const id = String(r[0]).trim();
    if (!id) return;
    out[id] = { jetski: dashYesNo_(r[2]), notes: r[3], updated: r[4], by: r[5] };
  });
  return out;
}

/** Saves one student's Jetski setting and/or a new note. */
function dashSave_(ss, tz, p) {
  const id = dashClean_(p.id, 300);
  if (!id) return { ok: false, error: 'Missing request id.' };
  const by = dashClean_(p.by, 60);
  if (!by) return { ok: false, error: 'Enter your name before saving.' };
  const note = dashClean_(p.note, DASH_NOTE_MAX);
  const jetski = p.jetski === undefined ? null : dashYesNo_(p.jetski);
  if (!note && jetski === null) return { ok: false, error: 'Nothing to save.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    let sheet = ss.getSheetByName(DASH_NOTES_TAB);
    if (!sheet) {
      sheet = ss.insertSheet(DASH_NOTES_TAB);
      sheet.getRange(1, 1, 1, DASH_NOTES_HEADERS.length).setValues([DASH_NOTES_HEADERS]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(4, 420);
    }
    const last = sheet.getLastRow();
    const ids = last > 1 ? sheet.getRange(2, 1, last - 1, 1).getDisplayValues() : [];
    let rowNum = 0;
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === id) { rowNum = i + 2; break; }
    }
    const range = rowNum ? sheet.getRange(rowNum, 1, 1, DASH_NOTES_HEADERS.length) : null;
    const row = range ? range.getDisplayValues()[0] : [id, '', '', '', '', ''];

    const stamp = Utilities.formatDate(new Date(), tz, 'MMM d, h:mm a');
    const student = dashClean_(p.student, 120);
    if (student) row[1] = student;
    if (jetski !== null) row[2] = jetski ? 'Yes' : 'No';
    if (note) {
      let notes = stamp + ' · ' + by + ': ' + note + (row[3] ? '\n' + row[3] : '');
      if (notes.length > DASH_CELL_MAX) notes = notes.slice(0, DASH_CELL_MAX);
      row[3] = notes;
    }
    row[4] = new Date();
    row[5] = by;

    const target = range || sheet.getRange(last + 1, 1, 1, DASH_NOTES_HEADERS.length);
    target.setValues([row.map(function (v) { return v instanceof Date ? v : dashText_(v); })]).setWrap(true);
    target.getCell(1, 5).setNumberFormat('mmm d, h:mm am/pm');
    return { ok: true, id: id, record: { jetski: dashYesNo_(row[2]), notes: row[3], updated: stamp, by: by } };
  } finally {
    lock.releaseLock();
  }
}

function dashYesNo_(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (s === 'yes' || s === 'true' || s === 'y') return true;
  if (s === 'no' || s === 'false' || s === 'n') return false;
  return null;
}

/** A leading ' keeps typed text like "=..." from becoming a formula. */
function dashText_(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function dashClean_(v, max) {
  return String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function dashJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
