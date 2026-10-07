/**
 * Kiteboarding St. Petersburg: team dashboard API (dashboard-api.gs)
 *
 * Serves the "Lesson Requests" tab of your Google Sheet to the GitHub
 * dashboard as JSON. It only reads: it never changes the spreadsheet, so the
 * website form that writes there keeps working.
 *
 * Apps Script files share one global scope. Apart from doGet,
 * checkDashboard and the settings below, every global here starts with
 * "dash" or "DASH_" so nothing collides with other scripts in the project.
 *
 * GET <exec url>?key=DASHBOARD_KEY returns
 *   { ok, updated, lessons: { headers: [...], rows: [{ header: value }] } }
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
    return dashJson_({
      ok: true,
      updated: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss"),
      lessons: dashReadLessons_(ss, tz)
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

function dashJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
